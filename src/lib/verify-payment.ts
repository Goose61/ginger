import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getDb } from "./db";
import { getDirectRpcUrl, type SolanaNetwork } from "./solana-config";

type SpentSolSignature = {
  signature: string;
  spentAt: Date;
};

const MAX_PAYMENT_AGE_SEC = 20 * 60;

const PARSED_TX_ATTEMPTS = 10;
const PARSED_TX_DELAY_MS = 1_500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ParsedIx = {
  program?: string;
  parsed?: {
    type?: string;
    info?: { source?: string; destination?: string; lamports?: number | string };
  };
};

function pubkeyStr(key: unknown): string {
  if (!key) return "";
  if (typeof key === "string") return key;
  if (typeof key === "object") {
    const o = key as { pubkey?: unknown; toBase58?: () => string };
    if (typeof o.toBase58 === "function") return o.toBase58();
    if (o.pubkey != null) return pubkeyStr(o.pubkey);
  }
  return "";
}

/** Lamports credited to `recipient` (pre → post balances), including v0 address-lookup keys. */
function recipientBalanceDelta(
  tx: NonNullable<Awaited<ReturnType<Connection["getParsedTransaction"]>>>,
  recipient: string,
): number {
  const message = tx.transaction.message as {
    accountKeys?: unknown[];
  };
  const loaded = tx.meta?.loadedAddresses;
  const keys = [
    ...(message.accountKeys ?? []).map(pubkeyStr),
    ...(loaded?.writable ?? []).map(pubkeyStr),
    ...(loaded?.readonly ?? []).map(pubkeyStr),
  ];
  const idx = keys.findIndex((k) => k === recipient);
  if (idx < 0) return 0;
  const pre = tx.meta?.preBalances[idx] ?? 0;
  const post = tx.meta?.postBalances[idx] ?? 0;
  return Math.max(0, post - pre);
}

function transferLamportsTo(
  ix: ParsedIx,
  recipient: string,
  sender?: string,
): number {
  if (ix.program !== "system") return 0;
  const type = ix.parsed?.type;
  if (type !== "transfer" && type !== "transferWithSeed") return 0;
  if (ix.parsed?.info?.destination !== recipient) return 0;
  if (sender && ix.parsed?.info?.source !== sender) return 0;
  return Number(ix.parsed.info?.lamports ?? 0);
}

/** Verify a recent SOL transfer instruction to the expected recipient. */
export async function verifySolPayment(
  signature: string,
  recipient: string,
  minSol: number,
  network: SolanaNetwork,
  expectedSender?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!signature || !recipient) return { ok: false, error: "Missing payment proof" };
  const minLamports = Math.floor(minSol * LAMPORTS_PER_SOL * 0.98); // 2% slippage tolerance

  try {
    const connection = new Connection(getDirectRpcUrl(network), "confirmed");
    let tx: Awaited<ReturnType<Connection["getParsedTransaction"]>> = null;
    for (let attempt = 0; attempt < PARSED_TX_ATTEMPTS; attempt++) {
      tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (tx?.meta && !tx.meta.err) break;
      if (attempt < PARSED_TX_ATTEMPTS - 1) {
        await sleep(PARSED_TX_DELAY_MS);
      }
    }
    if (!tx?.meta || tx.meta.err) {
      return {
        ok: false,
        error: "Transaction failed or not found yet — wait a few seconds and contact support if SOL left your wallet",
      };
    }

    const nowSec = Date.now() / 1000;
    if (!tx.blockTime || nowSec - tx.blockTime > MAX_PAYMENT_AGE_SEC) {
      return { ok: false, error: "Payment is too old" };
    }

    const dest = new PublicKey(recipient).toBase58();
    const sender = expectedSender ? new PublicKey(expectedSender).toBase58() : undefined;
    let transferred = 0;
    for (const ix of tx.transaction.message.instructions) {
      transferred += transferLamportsTo(ix as ParsedIx, dest, sender);
    }
    for (const inner of tx.meta.innerInstructions ?? []) {
      for (const ix of inner.instructions) {
        transferred += transferLamportsTo(ix as ParsedIx, dest, sender);
      }
    }
    // v0 mint+pay txs sometimes leave System transfers as unparsed compiled
    // instructions. Recipient balance delta still proves the payment landed.
    if (transferred < minLamports) {
      transferred = Math.max(transferred, recipientBalanceDelta(tx, dest));
    }
    if (transferred < minLamports) {
      return { ok: false, error: "No matching SOL transfer to platform wallet" };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payment verification failed";
    return { ok: false, error: msg };
  }
}

/** Record a SOL payment signature as spent. Returns false if it was already used. */
export async function consumeSolSignature(
  signature: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!signature) return { ok: false, error: "Missing payment proof" };
  const db = await getDb();
  const col = db.collection<SpentSolSignature>("spent_sol_signatures");
  await col.createIndex({ signature: 1 }, { unique: true, background: true });
  try {
    await col.insertOne({ signature, spentAt: new Date() });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("E11000") || msg.toLowerCase().includes("duplicate")) {
      return { ok: false, error: "SOL payment already used" };
    }
    throw e;
  }
}
