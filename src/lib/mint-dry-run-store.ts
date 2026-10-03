import type { ActiveMintQuote, Collection, MintDestination } from "./types";

export type MintDryRunRecord = ActiveMintQuote;

const store = new Map<string, MintDryRunRecord>();
const TTL_MS = 15 * 60 * 1000;

function prune(now = Date.now()) {
  for (const [id, rec] of store) {
    if (now - rec.createdAt > TTL_MS) store.delete(id);
  }
}

function isFresh(rec: MintDryRunRecord, now = Date.now()): boolean {
  return now - rec.createdAt <= TTL_MS;
}

export function rememberDryRun(rec: Omit<MintDryRunRecord, "createdAt"> & { createdAt?: number }) {
  prune();
  store.set(rec.dryRunId, { ...rec, createdAt: rec.createdAt ?? Date.now() });
}

export function getDryRun(id: string): MintDryRunRecord | undefined {
  prune();
  const rec = store.get(id);
  if (!rec) return undefined;
  if (!isFresh(rec)) {
    store.delete(id);
    return undefined;
  }
  return rec;
}

export function dryRunFromCollection(
  collection: Pick<Collection, "activeMintQuote"> | null | undefined,
  dryRunId: string,
): MintDryRunRecord | undefined {
  const rec = collection?.activeMintQuote;
  if (!rec || rec.dryRunId !== dryRunId) return undefined;
  if (!isFresh(rec)) return undefined;
  return rec;
}

export function resolveDryRun(
  dryRunId: string,
  collection?: Pick<Collection, "activeMintQuote"> | null,
): MintDryRunRecord | undefined {
  const mem = getDryRun(dryRunId);
  if (mem) return mem;
  return dryRunFromCollection(collection, dryRunId);
}

export function markDryRunSimulated(id: string) {
  const rec = store.get(id);
  if (rec) rec.simulated = true;
}

export function consumeDryRun(id: string) {
  store.delete(id);
}

export function requireSimulatedDryRun(params: {
  dryRunId: string;
  collectionId: string;
  tokenId?: number;
  destination?: string;
  recipient?: string;
  collection?: Pick<Collection, "activeMintQuote" | "id"> | null;
}): MintDryRunRecord {
  const rec = resolveDryRun(params.dryRunId, params.collection);
  if (!rec || rec.collectionId !== params.collectionId) {
    throw new Error("Quote expired. Request a new mint quote.");
  }
  if (!rec.simulated) {
    throw new Error("Dry-run required before mint");
  }
  if (params.tokenId != null && rec.tokenId !== params.tokenId) {
    throw new Error("Dry-run does not match this token");
  }
  if (params.destination && rec.destination !== params.destination) {
    throw new Error("Dry-run does not match this destination");
  }
  if (params.recipient) {
    const a = rec.recipient.startsWith("0x") ? rec.recipient.toLowerCase() : rec.recipient;
    const b = params.recipient.startsWith("0x") ? params.recipient.toLowerCase() : params.recipient;
    if (a !== b) throw new Error("Dry-run does not match this wallet");
  }
  return rec;
}

export function withClearedMintQuote(collection: Collection, dryRunId?: string): Collection {
  if (!collection.activeMintQuote) return collection;
  if (dryRunId && collection.activeMintQuote.dryRunId !== dryRunId) return collection;
  const { activeMintQuote: _cleared, ...rest } = collection;
  void _cleared;
  return rest;
}
