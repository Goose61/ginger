import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { getDb } from "./db";
import { getDirectRpcUrl, type SolanaNetwork } from "./solana-config";

type SpentSolSignature = {
  signature: string;
  spentAt: Date;
};

const MAX_PAYMENT_AGE_SEC = 20 * 60;

type ParsedIx = {
  program?: string;
  parsed?: { type?: string; info?: { destination?: string; lamports?: number | string } };
};

function transferLamportsTo(ix: ParsedIx, recipient: string): number {
  if (ix.program !== "system") return 0;
  const type = ix.parsed?.type;
  if (type !== "transfer" && type !== "transferWithSeed") return 0;
  if (ix.parsed?.info?.destination !== recipient) return 0;
  return Number(ix.parsed.info?.lamports ?? 0);
}

/** Verify a recent SOL transfer instruction to the expected recipient. */
export async function verifySolPayment(
  signature: string,
  recipient: string,
  minSol: number,
  network: SolanaNetwork,
): Promise<{ ok: boolean; error?: string }> {
  if (!signature || !recipient) return { ok: false, error: "Missing payment proof" };
  const minLamports = Math.floor(minSol * LAMPORTS_PER_SOL * 0.98); // 2% slippage tolerance

  try {
    const connection = new Connection(getDirectRpcUrl(network), "confirmed");
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx?.meta || tx.meta.err) {
      return { ok: false, error: "Transaction failed or not found" };
    }

    const nowSec = Date.now() / 1000;
    if (!tx.blockTime || nowSec - tx.blockTime > MAX_PAYMENT_AGE_SEC) {
      return { ok: false, error: "Payment is too old" };
    }

    const dest = new PublicKey(recipient).toBase58();
    let transferred = 0;
    for (const ix of tx.transaction.message.instructions) {
      transferred += transferLamportsTo(ix as ParsedIx, dest);
    }
    for (const inner of tx.meta.innerInstructions ?? []) {
      for (const ix of inner.instructions) {
        transferred += transferLamportsTo(ix as ParsedIx, dest);
      }
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
