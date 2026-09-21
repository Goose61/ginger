/**
 * Route mint SOL through the platform wallet, pay the creator share, then fund SPL buyback.
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import type { SaleFeeBreakdown } from "./fee-distribution";
import {
  applyRoundPayouts,
  getLatestUndistributedRound,
  getUndistributedRounds,
  holderPayoutsForRound,
} from "./fee-distribution";
import { getPlatformPublicKey, getPlatformSecretKey } from "./platform-key";
import { getQuote } from "./quotes";
import { explorerClusterQuery, getDirectRpcUrl, type SolanaNetwork } from "./solana-config";
import { executeSplTokenBuyback } from "./spl-buyback";
import { getCollection, updateCollection } from "./store";
import type { Collection } from "./types";

function roundUsd(n: number) {
  return Math.round(n * 100) / 100;
}

/** Mint SOL payments land here before creator payout and buyback swap. */
export function getMintPaymentRecipient(): string | null {
  return getPlatformPublicKey();
}

async function confirmSig(connection: Connection, signature: string) {
  const latest = await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
    "confirmed",
  );
}

/** Send the creator's owner share from the platform wallet after a primary mint. */
export async function transferCreatorShareFromPlatform(params: {
  to: string;
  usd: number;
  network: SolanaNetwork;
}): Promise<{ ok: boolean; signature?: string; txUrl?: string; error?: string }> {
  if (params.usd <= 0.009) return { ok: true };
  const secret = getPlatformSecretKey();
  if (!secret) return { ok: false, error: "Platform wallet not configured" };

  const payer = Keypair.fromSecretKey(secret);
  const quote = await getQuote(params.usd);
  const lamports = Math.max(1, Math.floor(quote.sol * LAMPORTS_PER_SOL));
  const connection = new Connection(getDirectRpcUrl(params.network), "confirmed");
  const balance = await connection.getBalance(payer.publicKey);
  if (balance < lamports + 50_000) {
    return {
      ok: false,
      error: `Platform balance too low to pay creator ($${params.usd.toFixed(2)})`,
    };
  }

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const ix = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: new PublicKey(params.to),
    lamports,
  });
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  const sig = await connection.sendTransaction(tx, { skipPreflight: false });
  await confirmSig(connection, sig);
  return {
    ok: true,
    signature: sig,
    txUrl: `https://explorer.solana.com/tx/${sig}${explorerClusterQuery(params.network)}`,
  };
}

const HOLDERS_PER_TX = 12;
/** Conservative v0 multi-transfer fee per batch — deducted from the holder pool. */
const HOLDER_DIST_FEE_LAMPORTS_PER_BATCH = 8_000;
/** Platform wallet must stay rent-exempt after paying holders. */
const PLATFORM_RENT_RESERVE_LAMPORTS = 890_880 + 50_000;

export type HolderDistributionResult = {
  ok: boolean;
  roundId?: string;
  payouts?: { wallet: string; amountUsd: number; txSignature: string; txUrl?: string }[];
  collection?: Collection | null;
  error?: string;
};

/** Send a holder round's SOL pool to every wallet in the snapshot (pro-rata by NFT count). */
export async function distributeHolderRoundFromPlatform(params: {
  collectionId: string;
  network: SolanaNetwork;
  round: NonNullable<ReturnType<typeof getLatestUndistributedRound>>;
}): Promise<HolderDistributionResult> {
  const secret = getPlatformSecretKey();
  if (!secret) return { ok: false, error: "Platform wallet not configured" };

  const owed = holderPayoutsForRound(params.round);
  if (owed.length === 0) return { ok: true, roundId: params.round.id, payouts: [] };

  const payer = Keypair.fromSecretKey(secret);
  const connection = new Connection(getDirectRpcUrl(params.network), "confirmed");
  const quoteCache = new Map<number, number>();

  async function usdToLamports(usd: number) {
    const key = Math.round(usd * 100);
    if (!quoteCache.has(key)) {
      const q = await getQuote(usd);
      quoteCache.set(key, Math.max(1, Math.floor(q.sol * LAMPORTS_PER_SOL)));
    }
    return quoteCache.get(key)!;
  }

  const gross: { wallet: string; amountUsd: number; lamports: number }[] = [];
  for (const row of owed) {
    gross.push({
      wallet: row.wallet,
      amountUsd: row.amountUsd,
      lamports: await usdToLamports(row.amountUsd),
    });
  }

  const grossLamports = gross.reduce((s, t) => s + t.lamports, 0);
  const batchCount = Math.ceil(gross.length / HOLDERS_PER_TX);
  const feeLamports = batchCount * HOLDER_DIST_FEE_LAMPORTS_PER_BATCH;
  if (grossLamports <= feeLamports) {
    return {
      ok: false,
      error: `Holder pool too small to cover distribution gas ($${params.round.poolUsd.toFixed(2)})`,
    };
  }

  const netLamportsTotal = grossLamports - feeLamports;
  const transfers: { wallet: string; grossUsd: number; netUsd: number; lamports: number }[] = [];
  let assignedNet = 0;
  for (let i = 0; i < gross.length; i++) {
    const row = gross[i];
    const netLamports =
      i === gross.length - 1
        ? netLamportsTotal - assignedNet
        : Math.floor((netLamportsTotal * row.lamports) / grossLamports);
    assignedNet += netLamports;
    if (netLamports <= 0) continue;
    const netUsd = roundUsd(row.amountUsd * (netLamports / row.lamports));
    transfers.push({
      wallet: row.wallet,
      grossUsd: row.amountUsd,
      netUsd,
      lamports: netLamports,
    });
  }
  if (transfers.length === 0) {
    return { ok: false, error: "No holder payouts after gas deduction" };
  }

  const balance = await connection.getBalance(payer.publicKey);
  const required = grossLamports + PLATFORM_RENT_RESERVE_LAMPORTS;
  if (balance < required) {
    const have = (balance / LAMPORTS_PER_SOL).toFixed(4);
    const need = (required / LAMPORTS_PER_SOL).toFixed(4);
    return {
      ok: false,
      error: `Platform wallet needs ~${need} SOL to pay holders (has ${have}); fund ${payer.publicKey.toBase58()} and retry`,
    };
  }

  const payouts: {
    wallet: string;
    amountUsd: number;
    grossAmountUsd: number;
    feeUsd: number;
    txSignature: string;
    txUrl?: string;
  }[] = [];
  for (let i = 0; i < transfers.length; i += HOLDERS_PER_TX) {
    const chunk = transfers.slice(i, i + HOLDERS_PER_TX);
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const instructions = chunk.map((t) =>
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: new PublicKey(t.wallet),
        lamports: t.lamports,
      }),
    );
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);
    tx.sign([payer]);
    const sig = await connection.sendTransaction(tx, { skipPreflight: false });
    await confirmSig(connection, sig);
    const txUrl = `https://explorer.solana.com/tx/${sig}${explorerClusterQuery(params.network)}`;
    for (const t of chunk) {
      payouts.push({
        wallet: t.wallet,
        amountUsd: t.netUsd,
        grossAmountUsd: t.grossUsd,
        feeUsd: roundUsd(t.grossUsd - t.netUsd),
        txSignature: sig,
        txUrl,
      });
    }
  }

  const saved = await updateCollection(params.collectionId, (current) =>
    applyRoundPayouts(current, params.round.id, payouts),
  );

  return { ok: true, roundId: params.round.id, payouts, collection: saved };
}

/** Pay the latest undistributed holder round after a sale. */
export async function processLatestHolderDistribution(params: {
  collectionId: string;
  network: SolanaNetwork;
}): Promise<HolderDistributionResult | null> {
  const existing = await getCollection(params.collectionId);
  if (!existing?.feeClaimsOpen) return null;
  const round = getLatestUndistributedRound(existing);
  if (!round) return null;
  return distributeHolderRoundFromPlatform({
    collectionId: params.collectionId,
    network: params.network,
    round,
  });
}

/** Pay every undistributed holder round (oldest first). Used for backfill / confirm-mint retry. */
export async function processAllPendingHolderDistributions(params: {
  collectionId: string;
  network: SolanaNetwork;
}): Promise<{ results: HolderDistributionResult[]; collection: Collection | null }> {
  const results: HolderDistributionResult[] = [];
  let collection = await getCollection(params.collectionId);
  if (!collection?.feeClaimsOpen) return { results, collection };

  while (collection) {
    const [next] = getUndistributedRounds(collection);
    if (!next) break;
    const result = await distributeHolderRoundFromPlatform({
      collectionId: params.collectionId,
      network: params.network,
      round: next,
    });
    results.push(result);
    if (!result.ok) break;
    collection = result.collection ?? (await getCollection(params.collectionId));
  }

  return { results, collection };
}

/** Swap this sale's buyback USD slice into the creator treasury SPL wallet. */
export async function processSaleBuyback(params: {
  collectionId: string;
  network: SolanaNetwork;
  buybackUsd: number;
}) {
  if (params.buybackUsd <= 0.009) return null;
  return executeSplTokenBuyback(params.collectionId, params.network, {
    usdToSpend: params.buybackUsd,
  });
}

/** After a primary SOL mint: pay creator share, then Jupiter/direct SPL buyback. */
export async function processPrimaryMintProceeds(params: {
  collectionId: string;
  network: SolanaNetwork;
  creatorWallet: string;
  breakdowns: SaleFeeBreakdown[];
}) {
  const ownerUsd = roundUsd(params.breakdowns.reduce((s, b) => s + b.ownerUsd, 0));
  const buybackUsd = roundUsd(params.breakdowns.reduce((s, b) => s + b.buybackUsd, 0));

  const creatorDisburse =
    ownerUsd > 0 && params.creatorWallet
      ? await transferCreatorShareFromPlatform({
          to: params.creatorWallet,
          usd: ownerUsd,
          network: params.network,
        })
      : undefined;

  const buyback =
    buybackUsd > 0
      ? await processSaleBuyback({
          collectionId: params.collectionId,
          network: params.network,
          buybackUsd,
        })
      : null;

  const holderDistribution = await processLatestHolderDistribution({
    collectionId: params.collectionId,
    network: params.network,
  });

  return { creatorDisburse, buyback, holderDistribution };
}
