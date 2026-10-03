/**
 * Bubblegum V2 compressed gift mints.
 *
 * Official flow (https://www.metaplex.com/docs/smart-contracts/bubblegum-v2/mint-cnfts):
 *   mintV2 into a createTreeV2 merkle tree, optionally with an MPL-Core collection
 *   that has the BubblegumV2 plugin. Tree is private; tree creator + collection
 *   authority (platform) co-sign. The collector is the fee payer (noop signer).
 *
 * Paid marketplace collections still use Metaplex Core (`mint-nft.ts`).
 */

import {
  keypairIdentity,
  createNoopSigner,
  createSignerFromKeypair,
  publicKey as umiPublicKey,
  none,
  some,
  lamports as umiLamports,
} from "@metaplex-foundation/umi";
import {
  mintV2,
  findLeafAssetIdPda,
  fetchTreeConfigFromSeeds,
} from "@metaplex-foundation/mpl-bubblegum";
import { transferSol } from "@metaplex-foundation/mpl-toolbox";
import { base64 } from "@metaplex-foundation/umi/serializers";
import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getDirectRpcUrl, getSolanaNetwork, type SolanaNetwork } from "./solana-config";
import { createMintUmi, fetchLatestBlockhash } from "./mint-umi";
import { getPlatformSecretKey } from "./platform-key";
import {
  formatInsufficientBalanceMessage,
  getCnftMintStepMinLamports,
  lamportsToSol,
} from "./gift-fees";
import { GIFT_SYMBOL } from "./gift-metadata";
import {
  getBubblegumCollectionAddress,
  requireBubblegumTree,
} from "./bubblegum-config";
import type { PendingMint } from "./types";
import type { BuildTxResult, PrepareSignResult } from "./mint-nft";

function signatureIsPresent(sig: Uint8Array | null | undefined): boolean {
  return Boolean(sig && sig.length > 0 && !sig.every((b) => b === 0));
}

export function isCnftPendingMint(pending: PendingMint): boolean {
  return pending.standard === "cnft" || Boolean(pending.merkleTree);
}

async function fetchWalletBalanceLamports(rpcUrl: string, wallet: string): Promise<bigint> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: [wallet, { commitment: "confirmed" }],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { result?: { value: number }; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return BigInt(json.result?.value ?? 0);
}

async function assertPayerCanAffordCnftMint(params: {
  payer: string;
  network: SolanaNetwork;
  extraLamports?: number;
}): Promise<void> {
  const rpcUrl = getDirectRpcUrl(params.network);
  const balanceLamports = await fetchWalletBalanceLamports(rpcUrl, params.payer);
  const requiredLamports =
    getCnftMintStepMinLamports() + BigInt(Math.max(0, Math.floor(params.extraLamports ?? 0)));
  if (balanceLamports >= requiredLamports) return;
  throw new Error(
    formatInsufficientBalanceMessage({
      balanceSol: lamportsToSol(balanceLamports),
      requiredSol: lamportsToSol(requiredLamports),
      mintOnly: true,
      includeSalePrice: (params.extraLamports ?? 0) > 0,
      cnft: true,
    }),
  );
}

async function buildUnsignedCnftTx(params: {
  name: string;
  metadataUri: string;
  recipient: string;
  payer: string;
  network: SolanaNetwork;
  recentBlockhash?: string;
  payment?: { recipient: string; lamports: number };
}): Promise<{
  txBase64: string;
  assetAddress: string;
  merkleTree: string;
  leafIndex: number;
  coreCollectionAddress?: string;
}> {
  const platformSecret = getPlatformSecretKey();
  if (!platformSecret) throw new Error("Server mint key not configured.");

  const rpcUrl = getDirectRpcUrl(params.network);
  const umi = createMintUmi(params.network);
  const authorityKeypair = umi.eddsa.createKeypairFromSecretKey(platformSecret);
  const authoritySigner = createSignerFromKeypair(umi, authorityKeypair);
  umi.use(keypairIdentity(authorityKeypair, false));

  const merkleTree = umiPublicKey(requireBubblegumTree(params.network));
  const treeConfig = await fetchTreeConfigFromSeeds(umi, { merkleTree });
  const capacity = Number(treeConfig.totalMintCapacity);
  const numMinted = Number(treeConfig.numMinted);
  if (numMinted >= capacity) {
    throw new Error("Gift merkle tree is full. Create a new Bubblegum V2 tree.");
  }

  const collectionAddress = getBubblegumCollectionAddress(params.network);
  const coreCollection = collectionAddress ? umiPublicKey(collectionAddress) : undefined;
  const payerNoop = createNoopSigner(umiPublicKey(params.payer));
  const leafOwner = umiPublicKey(params.recipient);
  const blockhash = params.recentBlockhash ?? (await fetchLatestBlockhash(rpcUrl));

  const baseAccounts = {
    payer: payerNoop,
    treeCreatorOrDelegate: authoritySigner,
    leafOwner,
    merkleTree,
  };

  let builder = coreCollection
    ? mintV2(umi, {
        ...baseAccounts,
        coreCollection,
        collectionAuthority: authoritySigner,
        metadata: {
          name: params.name,
          symbol: GIFT_SYMBOL,
          uri: params.metadataUri,
          collection: some(coreCollection),
          creators: [],
          isMutable: false,
        },
      })
    : mintV2(umi, {
        ...baseAccounts,
        metadata: {
          name: params.name,
          symbol: GIFT_SYMBOL,
          uri: params.metadataUri,
          sellerFeeBasisPoints: 0,
          collection: none<typeof merkleTree>(),
          creators: [
            {
              address: authoritySigner.publicKey,
              verified: true,
              share: 100,
            },
          ],
          isMutable: false,
        },
      });

  if (params.payment && params.payment.lamports > 0) {
    builder = builder.add(
      transferSol(umi, {
        source: payerNoop,
        destination: umiPublicKey(params.payment.recipient),
        amount: umiLamports(BigInt(Math.floor(params.payment.lamports))),
      }),
    );
  }

  const tx = await builder.useV0().setFeePayer(payerNoop).setBlockhash(blockhash).build(umi);
  const serialized = umi.transactions.serialize(tx);
  const txBase64 = base64.deserialize(serialized)[0];
  const [assetId] = findLeafAssetIdPda(umi, { merkleTree, leafIndex: numMinted });

  return {
    txBase64,
    assetAddress: assetId.toString(),
    merkleTree: merkleTree.toString(),
    leafIndex: numMinted,
    coreCollectionAddress: collectionAddress ?? undefined,
  };
}

export async function buildCnftGiftTransaction(params: {
  name: string;
  metadataUri: string;
  recipient: string;
  payer: string;
  network?: SolanaNetwork;
  payment?: { recipient: string; lamports: number };
  saleUsd?: number;
}): Promise<BuildTxResult | null> {
  if (!getPlatformSecretKey()) return null;
  const network = params.network ?? getSolanaNetwork();
  const built = await buildUnsignedCnftTx({
    name: params.name,
    metadataUri: params.metadataUri,
    recipient: params.recipient,
    payer: params.payer,
    network,
    payment: params.payment,
  });

  const pendingMint: PendingMint = {
    assetAddress: built.assetAddress,
    name: params.name,
    metadataUri: params.metadataUri,
    recipient: params.recipient,
    payer: params.payer,
    standard: "cnft",
    merkleTree: built.merkleTree,
    leafIndex: built.leafIndex,
    ...(built.coreCollectionAddress ? { coreCollectionAddress: built.coreCollectionAddress } : {}),
    ...(params.payment
      ? {
          paymentLamports: params.payment.lamports,
          paymentRecipient: params.payment.recipient,
        }
      : {}),
    ...(params.saleUsd != null ? { saleUsd: params.saleUsd } : {}),
  };

  return {
    txBase64: built.txBase64,
    assetAddress: built.assetAddress,
    coreCollectionAddress: built.coreCollectionAddress,
    pendingMint,
  };
}

export async function prepareCnftGiftTransactionForSigning(params: {
  pendingMint: PendingMint;
  payer: string;
  network?: SolanaNetwork;
}): Promise<PrepareSignResult> {
  if (params.payer !== params.pendingMint.payer) {
    throw new Error("Connected wallet does not match the mint payer.");
  }
  const network = params.network ?? getSolanaNetwork();
  const payment =
    params.pendingMint.paymentRecipient && params.pendingMint.paymentLamports
      ? {
          recipient: params.pendingMint.paymentRecipient,
          lamports: params.pendingMint.paymentLamports,
        }
      : undefined;

  await assertPayerCanAffordCnftMint({
    payer: params.payer,
    network,
    extraLamports: payment?.lamports,
  });

  const { simulateUnsignedTransaction } = await import("./mint-nft");
  const first = await buildUnsignedCnftTx({
    name: params.pendingMint.name,
    metadataUri: params.pendingMint.metadataUri,
    recipient: params.pendingMint.recipient,
    payer: params.pendingMint.payer,
    network,
    payment,
  });
  await simulateUnsignedTransaction(first.txBase64, network);

  const rpcUrl = getDirectRpcUrl(network);
  const latest = await fetchLatestBlockhash(rpcUrl);
  const fresh = await buildUnsignedCnftTx({
    name: params.pendingMint.name,
    metadataUri: params.pendingMint.metadataUri,
    recipient: params.pendingMint.recipient,
    payer: params.pendingMint.payer,
    network,
    recentBlockhash: latest.blockhash,
    payment,
  });
  return {
    txBase64: fresh.txBase64,
    assetAddress: fresh.assetAddress,
    merkleTree: fresh.merkleTree,
    leafIndex: fresh.leafIndex,
  };
}

function assertUserSignedCnftMintTx(tx: VersionedTransaction, pendingMint: PendingMint): void {
  const keys = tx.message.staticAccountKeys;
  if (keys.length === 0) throw new Error("Signed transaction has no accounts.");
  if (keys[0].toBase58() !== pendingMint.payer) {
    throw new Error("Transaction fee payer does not match the wallet that started this mint.");
  }
  const tree = pendingMint.merkleTree;
  if (tree && !keys.some((k) => k.toBase58() === tree)) {
    throw new Error("Transaction does not include the gift merkle tree.");
  }
  const recipientPk = new PublicKey(pendingMint.recipient);
  if (!keys.some((k) => k.equals(recipientPk))) {
    throw new Error("Transaction does not include the expected gift recipient.");
  }
  if (!signatureIsPresent(tx.signatures[0])) {
    throw new Error("Transaction is missing the payer signature.");
  }
}

export async function cosignAndSubmitCnftGiftTransaction(params: {
  userSignedTxBase64: string;
  pendingMint: PendingMint;
  network?: SolanaNetwork;
}): Promise<string> {
  const platformSecret = getPlatformSecretKey();
  if (!platformSecret) {
    throw new Error("Server mint key not configured (ARWEAVE_SOLANA_KEY).");
  }
  const network = params.network ?? getSolanaNetwork();
  const rpcUrl = getDirectRpcUrl(network);
  const tx = VersionedTransaction.deserialize(Buffer.from(params.userSignedTxBase64, "base64"));
  assertUserSignedCnftMintTx(tx, params.pendingMint);
  tx.sign([Keypair.fromSecretKey(platformSecret)]);

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [
        Buffer.from(tx.serialize()).toString("base64"),
        { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  if (!json.result) throw new Error("sendTransaction returned no signature");
  return json.result;
}
