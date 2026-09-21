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
import { getPlatformPublicKey, getPlatformSecretKey } from "./platform-key";
import { getQuote } from "./quotes";
import { explorerClusterQuery, getDirectRpcUrl, type SolanaNetwork } from "./solana-config";
import { executeSplTokenBuyback } from "./spl-buyback";

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

  return { creatorDisburse, buyback };
}
