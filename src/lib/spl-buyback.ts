/**
 * Buy the collection's SPL token into the creator-attached treasury wallet.
 *
 * Production (mainnet): mint SOL lands on the platform wallet first; this module
 * swaps the buyback slice via Jupiter (WSOL → token) into buybackTreasuryWallet.
 *
 * Devnet tests: Jupiter has no reliable book, so if the platform is mint authority
 * of the configured token we mint the purchased amount into the treasury ATA instead.
 */

import {
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { applyLedgerBuyback, type BuybackResult } from "./fee-distribution";
import { getPlatformSecretKey } from "./platform-key";
import { platformSpendableLamports } from "./platform-treasury-reserve";
import { getQuote } from "./quotes";
import { explorerClusterQuery, getDirectRpcUrl, type SolanaNetwork } from "./solana-config";
import { getCollection, updateCollection } from "./store";
import type { Collection } from "./types";

const WSOL = "So11111111111111111111111111111111111111112";
const JUPITER_QUOTE = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_SWAP = "https://lite-api.jup.ag/swap/v1/swap";
/** Devnet test-mint price when the platform is mint authority (no AMM). */
const DEVNET_TEST_TOKEN_USD = 0.001;
/** Skip Jupiter when the buyback slice is too small to route reliably on mainnet. */
const MIN_JUPITER_BUYBACK_USD = 0.05;

function roundUsd(n: number) {
  return Math.round(n * 100) / 100;
}

async function confirmSig(connection: Connection, signature: string) {
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
}

async function ensureAta(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey,
) {
  const ata = await getAssociatedTokenAddress(mint, owner);
  try {
    await getAccount(connection, ata);
    return ata;
  } catch {
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const ix = createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint);
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([payer]);
    const sig = await connection.sendTransaction(tx, { skipPreflight: false });
    await confirmSig(connection, sig);
    return ata;
  }
}

async function tryJupiterBuy(params: {
  connection: Connection;
  payer: Keypair;
  tokenMint: string;
  treasury: string;
  lamports: number;
  network: SolanaNetwork;
}): Promise<{ ok: true; signature: string; outAmountRaw: bigint } | { ok: false; reason: string }> {
  if (params.network !== "mainnet") {
    return { ok: false, reason: "Jupiter routes are mainnet-only" };
  }
  if (params.lamports < 50_000) {
    return { ok: false, reason: "Buyback SOL amount too small for Jupiter routing" };
  }
  const quoteUrl =
    `${JUPITER_QUOTE}?inputMint=${WSOL}&outputMint=${params.tokenMint}` +
    `&amount=${params.lamports}&slippageBps=100`;
  const quoteRes = await fetch(quoteUrl, { signal: AbortSignal.timeout(15_000) });
  if (!quoteRes.ok) {
    return { ok: false, reason: `Jupiter quote HTTP ${quoteRes.status}` };
  }
  const quote = (await quoteRes.json()) as { outAmount?: string; error?: string };
  if (!quote.outAmount) {
    return { ok: false, reason: quote.error || "No Jupiter route for this token" };
  }

  const treasury = new PublicKey(params.treasury);
  const mint = new PublicKey(params.tokenMint);
  const ata = await getAssociatedTokenAddress(mint, treasury);
  try {
    await getAccount(params.connection, ata);
  } catch {
    const created = await ensureAta(params.connection, params.payer, mint, treasury);
    void created;
  }

  const swapRes = await fetch(JUPITER_SWAP, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: params.payer.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      destinationTokenAccount: ata.toBase58(),
    }),
  });
  if (!swapRes.ok) {
    return { ok: false, reason: `Jupiter swap HTTP ${swapRes.status}` };
  }
  const swap = (await swapRes.json()) as { swapTransaction?: string; error?: string };
  if (!swap.swapTransaction) {
    return { ok: false, reason: swap.error || "Jupiter did not return a swap transaction" };
  }
  const tx = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, "base64"));
  tx.sign([params.payer]);
  const sig = await params.connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  await confirmSig(params.connection, sig);
  return { ok: true, signature: sig, outAmountRaw: BigInt(quote.outAmount) };
}

async function mintAsTestBuy(params: {
  connection: Connection;
  payer: Keypair;
  tokenMint: string;
  treasury: string;
  usdSpent: number;
}): Promise<{ ok: true; signature: string; outAmountRaw: bigint; decimals: number } | { ok: false; reason: string }> {
  const mintPk = new PublicKey(params.tokenMint);
  const mintInfo = await getMint(params.connection, mintPk);
  if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(params.payer.publicKey)) {
    return {
      ok: false,
      reason: "No Jupiter market for this token, and the platform is not its mint authority",
    };
  }
  const tokens = params.usdSpent / DEVNET_TEST_TOKEN_USD;
  const raw = BigInt(Math.max(1, Math.round(tokens * 10 ** mintInfo.decimals)));
  const treasury = new PublicKey(params.treasury);
  const ata = await getAssociatedTokenAddress(mintPk, treasury);
  const ixs = [];
  try {
    await getAccount(params.connection, ata);
  } catch {
    ixs.push(createAssociatedTokenAccountInstruction(params.payer.publicKey, ata, treasury, mintPk));
  }
  ixs.push(createMintToInstruction(mintPk, ata, params.payer.publicKey, raw, [], TOKEN_PROGRAM_ID));
  const { blockhash } = await params.connection.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: params.payer.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([params.payer]);
  const sig = await params.connection.sendTransaction(tx, { skipPreflight: false });
  await confirmSig(params.connection, sig);
  return { ok: true, signature: sig, outAmountRaw: raw, decimals: mintInfo.decimals };
}

export type SplBuybackOptions = {
  /** Spend this USD slice (defaults to the full accrued pool for manual execute). */
  usdToSpend?: number;
};

/** Spend buyback pool USD to deliver SPL tokens into the creator treasury wallet. */
export async function executeSplTokenBuyback(
  collectionId: string,
  network: SolanaNetwork,
  opts?: SplBuybackOptions,
): Promise<Omit<BuybackResult, "collection"> & { collection: Collection | null }> {
  const existing = await getCollection(collectionId);
  if (!existing) return { collection: null, purchased: false, reason: "Collection not found" };
  if (!existing.treasuryBuybackActive) {
    return { collection: existing, purchased: false, reason: "Treasury buyback not active" };
  }
  const pool = existing.feeLedger?.buybackTreasuryUsd ?? 0;
  const requested = opts?.usdToSpend != null ? roundUsd(opts.usdToSpend) : pool;
  const usd = roundUsd(Math.min(requested, pool));
  if (usd <= 0.009) {
    return { collection: existing, purchased: false, reason: "Buyback treasury empty" };
  }
  const tokenCa = existing.buybackTokenCa?.trim();
  const treasury = existing.buybackTreasuryWallet?.trim() || existing.payments.creatorWallet;
  if (!tokenCa) {
    return { collection: existing, purchased: false, reason: "No buyback token CA set" };
  }
  if (!treasury) {
    return { collection: existing, purchased: false, reason: "No buyback treasury wallet set" };
  }

  const secret = getPlatformSecretKey();
  if (!secret) {
    return { collection: existing, purchased: false, reason: "Platform wallet not configured" };
  }
  const payer = Keypair.fromSecretKey(secret);
  const connection = new Connection(getDirectRpcUrl(network), "confirmed");
  const balance = await connection.getBalance(payer.publicKey);

  let lamports = 0;
  let solSpent = 0;
  if (network === "mainnet") {
    if (usd < MIN_JUPITER_BUYBACK_USD) {
      return {
        collection: existing,
        purchased: false,
        reason: `Buyback slice ($${usd}) below Jupiter minimum ($${MIN_JUPITER_BUYBACK_USD})`,
      };
    }
    const quote = await getQuote(usd);
    lamports = Math.max(1, Math.floor(quote.sol * LAMPORTS_PER_SOL));
    solSpent = quote.sol;
    if (platformSpendableLamports(balance) < lamports) {
      return {
        collection: existing,
        purchased: false,
        reason: `Platform wallet needs ~${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL to buy the token (treasury floor reserved)`,
      };
    }
  } else if (platformSpendableLamports(balance) < 15_000_000) {
    return {
      collection: existing,
      purchased: false,
      reason: "Platform wallet needs ~0.015 SOL to deliver tokens to the treasury",
    };
  }

  let signature = "";
  let outRaw = 0n;
  let decimals = 0;
  let route: "jupiter" | "direct_mint" = "jupiter";

  const jup = await tryJupiterBuy({
    connection,
    payer,
    tokenMint: tokenCa,
    treasury,
    lamports,
    network,
  }).catch((e) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }));

  if (jup.ok) {
    signature = jup.signature;
    outRaw = jup.outAmountRaw;
    const mintInfo = await getMint(connection, new PublicKey(tokenCa));
    decimals = mintInfo.decimals;
    route = "jupiter";
  } else if (network === "mainnet") {
    return {
      collection: existing,
      purchased: false,
      reason: jup.reason || "Jupiter buyback failed on mainnet",
    };
  } else {
    const minted = await mintAsTestBuy({
      connection,
      payer,
      tokenMint: tokenCa,
      treasury,
      usdSpent: usd,
    }).catch((e) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }));
    if (!minted.ok) {
      return { collection: existing, purchased: false, reason: minted.reason || jup.reason };
    }
    signature = minted.signature;
    outRaw = minted.outAmountRaw;
    decimals = minted.decimals;
    route = "direct_mint";
  }

  const tokenAmount = Number(outRaw) / 10 ** decimals;
  const txUrl = `https://explorer.solana.com/tx/${signature}${explorerClusterQuery(network)}`;
  let applied: BuybackResult = { collection: existing, purchased: false };
  const saved = await updateCollection(collectionId, (current) => {
    applied = applyLedgerBuyback(current, {
      usdSpent: roundUsd(usd),
      solSpent: route === "jupiter" ? solSpent : 0,
      tokenAmount,
      tokenAmountRaw: outRaw.toString(),
      txSignature: signature,
      txUrl,
      route,
    });
    return applied.collection;
  });
  return {
    ...applied,
    collection: saved,
    txSignature: signature,
    tokenAmount,
    txUrl,
    treasuryWallet: treasury,
  };
}
