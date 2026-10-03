/**
 * Server-side Metaplex Core NFT transaction builder.
 *
 * Gift mints use Metaplex Core (single create() into CORE_COLLECTION_ADDRESS)
 * for reliable Phantom Collectibles grouping.
 *
 * @see https://www.metaplex.com/docs/smart-contracts/core/collections
 * @see https://www.metaplex.com/docs/smart-contracts/core/create-asset
 */

import {
  keypairIdentity,
  generateSigner,
  createNoopSigner,
  createSignerFromKeypair,
  lamports as umiLamports,
  publicKey as umiPublicKey,
} from "@metaplex-foundation/umi";
import { create } from "@metaplex-foundation/mpl-core";
import { transferSol } from "@metaplex-foundation/mpl-toolbox";
import { base64 } from "@metaplex-foundation/umi/serializers";
import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getDirectRpcUrl, getSolanaNetwork, type SolanaNetwork } from "./solana-config";
import { createMintUmi, fetchLatestBlockhash } from "./mint-umi";
import { fetchCoreCollection, getCoreCollectionAddress } from "./core-collection";
import { getPlatformSecretKey } from "./platform-key";
import {
  formatInsufficientBalanceMessage,
  getMintStepMinLamports,
  lamportsToSol,
} from "./gift-fees";
import type { PendingMint } from "./types";
import {
  cosignAndSubmitCnftGiftTransaction,
  isCnftPendingMint,
  prepareCnftGiftTransactionForSigning,
} from "./mint-cnft";

/** Metaplex Core assets are locked at mint unless explicitly disabled. */
export const DEFAULT_IMMUTABLE_METADATA = true;

export function coreImmutableMetadataPlugins(enabled = DEFAULT_IMMUTABLE_METADATA) {
  if (!enabled) return undefined;
  return [{ type: "ImmutableMetadata" as const }];
}

export type BuildTxResult = {
  txBase64: string;
  assetAddress: string;
  pendingMint: PendingMint;
  coreCollectionAddress?: string;
};

export type PrepareSignResult = {
  txBase64: string;
  assetAddress: string;
  merkleTree?: string;
  leafIndex?: number;
};

export function isValidSolanaAddress(addr: string): boolean {
  if (!addr || addr.length < 32 || addr.length > 44) return false;
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(addr)) return false;
  try {
    const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const bytes: number[] = [0];
    for (const char of addr) {
      const idx = ALPHA.indexOf(char);
      if (idx < 0) return false;
      let carry = idx;
      for (let i = 0; i < bytes.length; i++) {
        carry += bytes[i] * 58;
        bytes[i] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    bytes.reverse();
    return bytes.length === 32;
  } catch {
    return false;
  }
}

function secretKeyFromB64(b64: string): Uint8Array {
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length !== 64) {
    throw new Error(`Invalid pending asset secret key length: ${bytes.length}`);
  }
  return new Uint8Array(bytes);
}

function secretKeyToB64(secretKey: Uint8Array): string {
  return Buffer.from(secretKey).toString("base64");
}

async function serverRpcCall<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs = 30_000,
): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`Solana RPC returned empty body (HTTP ${res.status}, ${method})`);
  }
  const json = JSON.parse(text) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

async function fetchWalletBalanceLamports(
  rpcUrl: string,
  wallet: string,
): Promise<bigint> {
  const result = await serverRpcCall<{ value: number }>(rpcUrl, "getBalance", [
    wallet,
    { commitment: "confirmed" },
  ]);
  return BigInt(result?.value ?? 0);
}

async function assertPayerCanAffordMintStep(params: {
  payer: string;
  network: SolanaNetwork;
  extraLamports?: number;
}): Promise<void> {
  const rpcUrl = getDirectRpcUrl(params.network);
  const balanceLamports = await fetchWalletBalanceLamports(rpcUrl, params.payer);
  const requiredLamports =
    getMintStepMinLamports() + BigInt(Math.max(0, Math.floor(params.extraLamports ?? 0)));
  if (balanceLamports >= requiredLamports) return;

  throw new Error(
    formatInsufficientBalanceMessage({
      balanceSol: lamportsToSol(balanceLamports),
      requiredSol: lamportsToSol(requiredLamports),
      mintOnly: true,
      includeSalePrice: (params.extraLamports ?? 0) > 0,
    }),
  );
}

async function buildUnsignedGiftTx(params: {
  name: string;
  metadataUri: string;
  recipient: string;
  payer: string;
  network: SolanaNetwork;
  assetSecretKey?: Uint8Array;
  coreCollectionAddress?: string | null;
  recentBlockhash?: string;
  immutableMetadata?: boolean;
  /** Atomic pay-and-mint: add a SOL transfer (payer → recipient) to the mint tx. */
  payment?: { recipient: string; lamports: number };
}): Promise<{
  txBase64: string;
  assetAddress: string;
  assetSecretKey: Uint8Array;
  coreCollectionAddress?: string;
}> {
  const platformSecret = getPlatformSecretKey();
  if (!platformSecret) throw new Error("Server mint key not configured.");

  const rpcUrl = getDirectRpcUrl(params.network);
  const umi = createMintUmi(params.network);

  const authorityKeypair = umi.eddsa.createKeypairFromSecretKey(platformSecret);
  const authoritySigner = createSignerFromKeypair(umi, authorityKeypair);
  umi.use(keypairIdentity(authorityKeypair, false));

  const assetSigner = params.assetSecretKey
    ? createSignerFromKeypair(
        umi,
        umi.eddsa.createKeypairFromSecretKey(params.assetSecretKey),
      )
    : generateSigner(umi);

  const payerNoop = createNoopSigner(umiPublicKey(params.payer));
  const blockhash = params.recentBlockhash ?? (await fetchLatestBlockhash(rpcUrl));

  const collectionAddress =
    params.coreCollectionAddress === undefined
      ? getCoreCollectionAddress(params.network)
      : params.coreCollectionAddress;

  let coreCollectionAddress: string | undefined;
  const immutablePlugins = coreImmutableMetadataPlugins(
    params.immutableMetadata ?? DEFAULT_IMMUTABLE_METADATA,
  );
  const createArgs: Parameters<typeof create>[1] = {
    asset: assetSigner,
    name: params.name,
    uri: params.metadataUri,
    owner: umiPublicKey(params.recipient),
    payer: payerNoop,
    ...(immutablePlugins ? { plugins: immutablePlugins } : {}),
  };

  if (collectionAddress) {
    try {
      const collection = await fetchCoreCollection(umi, collectionAddress, params.network);
      createArgs.collection = collection;
      createArgs.authority = authoritySigner;
      coreCollectionAddress = collectionAddress;
    } catch (err) {
      console.warn(
        `[mint] Core collection ${collectionAddress} is not on ${params.network}; minting a standalone asset.`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  let builder = create(umi, createArgs);

  // Atomic pay-and-mint: Core create first (same as warning-free gift mints), then
  // the sale-price transfer. Phantom/Blowfish then simulates a fair swap (receive NFT
  // + pay) instead of a bare SOL outflow that looks like a drainer.
  if (params.payment && params.payment.lamports > 0) {
    builder = builder.add(
      transferSol(umi, {
        source: payerNoop,
        destination: umiPublicKey(params.payment.recipient),
        amount: umiLamports(BigInt(Math.floor(params.payment.lamports))),
      }),
    );
  }

  const tx = await builder
    .useV0()
    .setFeePayer(payerNoop)
    .setBlockhash(blockhash)
    .build(umi);

  const serialized = umi.transactions.serialize(tx);
  const txBase64 = base64.deserialize(serialized)[0];
  const assetAddress = assetSigner.publicKey.toString();

  return { txBase64, assetAddress, assetSecretKey: assetSigner.secretKey, coreCollectionAddress };
}

function describeSimulationError(err: unknown, logs?: string[] | null): string {
  const logText = logs?.join("\n") ?? "";
  const insufficient = logText.match(/insufficient lamports (\d+), need (\d+)/i);
  if (insufficient) {
    const have = Number(insufficient[1]) / 1e9;
    const need = Number(insufficient[2]) / 1e9;
    return (
      `Not enough SOL in your wallet for the mint step. ` +
      `You have ~${have.toFixed(4)} SOL but need ~${need.toFixed(4)} SOL for account rent ` +
      `(plus tx fees). Storage is charged separately first.`
    );
  }
  return `Transaction would fail on-chain: ${JSON.stringify(err)}`;
}

export async function simulateUnsignedTransaction(
  txBase64: string,
  network?: SolanaNetwork,
): Promise<void> {
  const net = network ?? getSolanaNetwork();
  const rpcUrl = getDirectRpcUrl(net);
  const result = await serverRpcCall<{
    value?: { err?: unknown; logs?: string[] | null };
  }>(
    rpcUrl,
    "simulateTransaction",
    [txBase64, { encoding: "base64", sigVerify: false, commitment: "confirmed" }],
    15_000,
  );
  const err = result?.value?.err;
  if (err) {
    throw new Error(describeSimulationError(err, result?.value?.logs ?? null));
  }
}

function signatureIsPresent(sig: Uint8Array | null | undefined): boolean {
  return Boolean(sig && sig.length > 0 && !sig.every((b) => b === 0));
}

const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

/**
 * Sum lamports transferred to `destination` by System Program transfer instructions
 * in a compiled (versioned) message. Used to prove the atomic pay-and-mint payment
 * survived any wallet-injected instructions before we co-sign and broadcast.
 */
function sumSolTransferredTo(tx: VersionedTransaction, destination: PublicKey): bigint {
  const keys = tx.message.staticAccountKeys;
  let total = 0n;
  for (const ix of tx.message.compiledInstructions) {
    if (!keys[ix.programIdIndex]?.equals(SYSTEM_PROGRAM_ID)) continue;
    const data = ix.data;
    // System Transfer: u32 discriminator (2) + u64 lamports (little-endian).
    if (data.length < 12) continue;
    if (data[0] !== 2 || data[1] !== 0 || data[2] !== 0 || data[3] !== 0) continue;
    const destIndex = ix.accountKeyIndexes[1];
    if (destIndex == null || !keys[destIndex]?.equals(destination)) continue;
    total += Buffer.from(data.buffer, data.byteOffset, data.length).readBigUInt64LE(4);
  }
  return total;
}

/** Wallets may inject priority-fee instructions; verify payer + asset instead of byte equality. */
function assertUserSignedGiftMintTx(
  tx: VersionedTransaction,
  pendingMint: PendingMint,
): void {
  const keys = tx.message.staticAccountKeys;
  if (keys.length === 0) {
    throw new Error("Signed transaction has no accounts.");
  }

  const feePayer = keys[0];
  if (feePayer.toBase58() !== pendingMint.payer) {
    throw new Error("Transaction fee payer does not match the wallet that started this mint.");
  }

  const assetPk = new PublicKey(pendingMint.assetAddress);
  if (!keys.some((k) => k.equals(assetPk))) {
    throw new Error("Transaction does not include the expected NFT mint address.");
  }

  const recipientPk = new PublicKey(pendingMint.recipient);
  if (!keys.some((k) => k.equals(recipientPk))) {
    throw new Error("Transaction does not include the expected gift recipient.");
  }

  if (!signatureIsPresent(tx.signatures[0])) {
    throw new Error("Transaction is missing the payer signature.");
  }

  // Atomic pay-and-mint: the wallet must not have stripped the sale-price transfer.
  if (pendingMint.paymentRecipient && pendingMint.paymentLamports) {
    const paid = sumSolTransferredTo(tx, new PublicKey(pendingMint.paymentRecipient));
    // 2% slippage tolerance to mirror verifySolPayment.
    const minLamports = BigInt(Math.floor(pendingMint.paymentLamports * 0.98));
    if (paid < minLamports) {
      throw new Error("Transaction is missing the required mint payment.");
    }
  }

  const preparedTxBase64 = pendingMint.preparedTxBase64?.trim();
  if (!preparedTxBase64) return;

  try {
    const preparedTx = VersionedTransaction.deserialize(
      Buffer.from(preparedTxBase64, "base64"),
    );
    const preparedMessage = Buffer.from(preparedTx.message.serialize());
    const userMessage = Buffer.from(tx.message.serialize());
    if (preparedMessage.equals(userMessage)) return;
  } catch {
    return;
  }

  // Wallet modified the tx (e.g. compute budget) — relaxed checks above are sufficient.
}

export async function simulateSignedTransaction(
  tx: VersionedTransaction,
  network: SolanaNetwork,
): Promise<void> {
  const rpcUrl = getDirectRpcUrl(network);
  const txBase64 = Buffer.from(tx.serialize()).toString("base64");
  const result = await serverRpcCall<{
    value?: { err?: unknown; logs?: string[] | null };
  }>(
    rpcUrl,
    "simulateTransaction",
    [txBase64, { encoding: "base64", sigVerify: true, commitment: "confirmed" }],
    15_000,
  );
  const err = result?.value?.err;
  if (err) {
    throw new Error(describeSimulationError(err, result?.value?.logs ?? null));
  }
}

export async function prepareGiftTransactionForSigning(params: {
  pendingMint: PendingMint;
  payer: string;
  network?: SolanaNetwork;
}): Promise<PrepareSignResult> {
  if (isCnftPendingMint(params.pendingMint)) {
    return prepareCnftGiftTransactionForSigning(params);
  }
  if (params.payer !== params.pendingMint.payer) {
    throw new Error("Connected wallet does not match the mint payer.");
  }

  const network = params.network ?? getSolanaNetwork();
  if (!params.pendingMint.assetSecretKeyB64) {
    throw new Error("Pending mint is missing the asset key.");
  }
  const assetSecret = secretKeyFromB64(params.pendingMint.assetSecretKeyB64);

  // Preserve the atomic pay-and-mint transfer across the blockhash refresh.
  const payment =
    params.pendingMint.paymentRecipient && params.pendingMint.paymentLamports
      ? {
          recipient: params.pendingMint.paymentRecipient,
          lamports: params.pendingMint.paymentLamports,
        }
      : undefined;

  const { txBase64, assetAddress } = await buildUnsignedGiftTx({
    name: params.pendingMint.name,
    metadataUri: params.pendingMint.metadataUri,
    recipient: params.pendingMint.recipient,
    payer: params.pendingMint.payer,
    network,
    assetSecretKey: assetSecret,
    coreCollectionAddress: params.pendingMint.coreCollectionAddress ?? null,
    payment,
  });

  if (assetAddress !== params.pendingMint.assetAddress) {
    throw new Error("Asset address mismatch when refreshing transaction.");
  }

  await assertPayerCanAffordMintStep({
    payer: params.payer,
    network,
    extraLamports: payment?.lamports,
  });
  await simulateUnsignedTransaction(txBase64, network);

  // Re-bake with a fresh blockhash after slow simulate/RPC so Phantom/cosign
  // still has a valid hash (Mongo + public devnet RPC can eat 30s+).
  const rpcUrl = getDirectRpcUrl(network);
  const latest = await fetchLatestBlockhash(rpcUrl);
  const fresh = await buildUnsignedGiftTx({
    name: params.pendingMint.name,
    metadataUri: params.pendingMint.metadataUri,
    recipient: params.pendingMint.recipient,
    payer: params.pendingMint.payer,
    network,
    assetSecretKey: assetSecret,
    coreCollectionAddress: params.pendingMint.coreCollectionAddress ?? null,
    recentBlockhash: latest.blockhash,
    payment,
  });
  if (fresh.assetAddress !== params.pendingMint.assetAddress) {
    throw new Error("Asset address mismatch when refreshing transaction.");
  }

  return { txBase64: fresh.txBase64, assetAddress: fresh.assetAddress };
}

export async function buildGiftTransaction(params: {
  name: string;
  metadataUri: string;
  recipient: string;
  payer: string;
  network?: SolanaNetwork;
  coreCollectionAddress?: string | null;
  immutableMetadata?: boolean;
  /** Atomic pay-and-mint: fold the sale price + a USD snapshot into the mint tx. */
  payment?: { recipient: string; lamports: number };
  saleUsd?: number;
}): Promise<BuildTxResult | null> {
  if (!getPlatformSecretKey()) return null;

  const network = params.network ?? getSolanaNetwork();
  const coreCollectionAddress =
    params.coreCollectionAddress === undefined
      ? getCoreCollectionAddress(network)
      : params.coreCollectionAddress;
  const { txBase64, assetAddress, assetSecretKey, coreCollectionAddress: resolvedCore } =
    await buildUnsignedGiftTx({
      name: params.name,
      metadataUri: params.metadataUri,
      recipient: params.recipient,
      payer: params.payer,
      network,
      coreCollectionAddress,
      immutableMetadata: params.immutableMetadata,
      payment: params.payment,
    });

  return {
    txBase64,
    assetAddress,
    coreCollectionAddress: resolvedCore,
    pendingMint: {
      assetSecretKeyB64: secretKeyToB64(assetSecretKey),
      assetAddress,
      name: params.name,
      metadataUri: params.metadataUri,
      recipient: params.recipient,
      payer: params.payer,
      ...(resolvedCore ? { coreCollectionAddress: resolvedCore } : {}),
      ...(params.payment
        ? {
            paymentLamports: params.payment.lamports,
            paymentRecipient: params.payment.recipient,
          }
        : {}),
      ...(params.saleUsd != null ? { saleUsd: params.saleUsd } : {}),
    },
  };
}

export async function cosignAndSubmitGiftTransaction(params: {
  userSignedTxBase64: string;
  pendingMint: PendingMint;
  network?: SolanaNetwork;
}): Promise<string> {
  if (isCnftPendingMint(params.pendingMint)) {
    return cosignAndSubmitCnftGiftTransaction(params);
  }
  const platformSecret = getPlatformSecretKey();
  if (!platformSecret) {
    throw new Error("Server mint key not configured (ARWEAVE_SOLANA_KEY).");
  }
  if (!params.pendingMint.assetSecretKeyB64) {
    throw new Error("Pending mint is missing the asset key.");
  }

  const network = params.network ?? getSolanaNetwork();
  const rpcUrl = getDirectRpcUrl(network);

  const tx = VersionedTransaction.deserialize(
    Buffer.from(params.userSignedTxBase64, "base64"),
  );

  const assetSecret = secretKeyFromB64(params.pendingMint.assetSecretKeyB64);
  const assetKp = Keypair.fromSecretKey(assetSecret);
  const platformKp = Keypair.fromSecretKey(platformSecret);

  if (assetKp.publicKey.toBase58() !== params.pendingMint.assetAddress) {
    throw new Error("Pending mint asset key does not match stored address.");
  }

  assertUserSignedGiftMintTx(tx, params.pendingMint);

  const cosigners = [assetKp];
  if (params.pendingMint.coreCollectionAddress) {
    cosigners.unshift(platformKp);
  }
  tx.sign(cosigners);

  // Unsigned tx was already simulated in prepare-sign. Simulating again on a
  // different public RPC node often returns BlockhashNotFound after Mongo delay.
  return serverRpcCall<string>(rpcUrl, "sendTransaction", [
    Buffer.from(tx.serialize()).toString("base64"),
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]);
}
