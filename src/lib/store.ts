import { getCollectionsCol } from "./db";
import type { Collection } from "./types";
import {
  isExpirableReservation,
  isTokenReservationActive,
  stripExpiredReservations,
  TOKEN_RESERVATION_TTL_MS,
  tokenIsCommitted,
} from "./public-collection";
import { isHiddenFromMarket } from "./hidden-from-market";

function asCollection(doc: Collection & { _id?: unknown }): Collection {
  const { _id, ...rest } = doc;
  void _id;
  return rest;
}

export async function listCollections(): Promise<Collection[]> {
  const col = await getCollectionsCol();
  const docs = await col.find({}, { projection: { _id: 0 } }).toArray();
  return docs.map(asCollection).map((c) => stripExpiredReservations(c).collection);
}

/** Header “Dashboard” link — tiny projection, no tokens. */
export async function listCollectionNav(): Promise<
  {
    id: string;
    slug?: string;
    name?: string;
    status: Collection["status"];
    payments: { creatorWallet?: string };
  }[]
> {
  const col = await getCollectionsCol();
  const docs = await col
    .find(
      {},
      {
        projection: {
          _id: 0,
          id: 1,
          slug: 1,
          name: 1,
          status: 1,
          "payments.creatorWallet": 1,
        },
      },
    )
    .toArray();
  return docs.map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    name: doc.name,
    status: doc.status,
    payments: { creatorWallet: doc.payments?.creatorWallet },
  }));
}

/**
 * Live market listing docs without layers / trait payloads.
 * Token attributes are the bulk of a 600-piece collection.
 */
export async function listCollectionsForMarket(): Promise<Collection[]> {
  const col = await getCollectionsCol();
  const docs = await col
    .find(
      { status: { $in: ["live", "sold_out"] } },
      {
        projection: {
          _id: 0,
          layers: 0,
          pendingMint: 0,
          pendingCoreCollection: 0,
          pendingZipUrl: 0,
          launchDraft: 0,
          holderSnapshots: 0,
          importProgress: 0,
          "tokens.attributes": 0,
          "tokens.sidecar": 0,
          "tokens.metadataUri": 0,
          "tokens.metadataRelPath": 0,
        },
      },
    )
    .toArray();
  return docs.map(asCollection).filter((c) => !isHiddenFromMarket(c)).map((c) => {
    return stripExpiredReservations(c).collection;
  });
}

export async function getCollection(id: string): Promise<Collection | null> {
  const col = await getCollectionsCol();
  const doc = await col.findOne(
    { $or: [{ id }, { slug: id }] },
    { projection: { _id: 0 } },
  );
  if (!doc) return null;
  return persistExpiredReservations(asCollection(doc));
}

/** Write expired unpaid holds back to sale so another buyer can take them. */
async function persistExpiredReservations(collection: Collection): Promise<Collection> {
  const { collection: next, changed } = stripExpiredReservations(collection);
  if (!changed) return collection;

  const expiredIds = collection.tokens
    .filter(
      (t) => isExpirableReservation(t, collection) && !isTokenReservationActive(t, collection),
    )
    .map((t) => t.tokenId);

  for (const tokenId of expiredIds) {
    await clearTokenReservation(collection.id, tokenId);
  }

  const col = await getCollectionsCol();
  const now = new Date().toISOString();
  if (
    collection.pendingMint?.paymentLamports &&
    collection.pendingMint.tokenId != null &&
    expiredIds.includes(collection.pendingMint.tokenId)
  ) {
    await col.updateOne(
      { id: collection.id, "pendingMint.tokenId": collection.pendingMint.tokenId },
      { $unset: { pendingMint: "" }, $set: { updatedAt: now } },
    );
  }
  if (collection.status === "sold_out" && next.status === "live") {
    await col.updateOne(
      { id: collection.id, status: "sold_out" },
      { $set: { status: "live", mintedCount: next.mintedCount, updatedAt: now } },
    );
  }

  const fresh = await col.findOne({ id: collection.id }, { projection: { _id: 0 } });
  return fresh ? stripExpiredReservations(asCollection(fresh)).collection : next;
}

export async function saveCollection(collection: Collection): Promise<Collection> {
  const col = await getCollectionsCol();
  collection.updatedAt = new Date().toISOString();
  await col.replaceOne({ id: collection.id }, collection, { upsert: true });
  return collection;
}

export async function deleteCollection(id: string): Promise<boolean> {
  const col = await getCollectionsCol();
  const result = await col.deleteOne({ id });
  return result.deletedCount > 0;
}

export async function updateCollection(
  id: string,
  fn: (current: Collection) => Collection | Promise<Collection>,
): Promise<Collection | null> {
  const col = await getCollectionsCol();
  const doc = await col.findOne(
    { $or: [{ id }, { slug: id }] },
    { projection: { _id: 0 } },
  );
  if (!doc) return null;
  const current = asCollection(doc);
  const next = await fn(current);
  next.updatedAt = new Date().toISOString();
  await col.replaceOne({ id: next.id }, next, { upsert: true });
  return next;
}

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "collection"
  );
}

export function newId() {
  return crypto.randomUUID();
}

export function committedCount(collection: Collection): number {
  return collection.tokens.filter((t) => tokenIsCommitted(t, collection)).length;
}

function reservationCutoffIso(now = Date.now()): string {
  return new Date(now - TOKEN_RESERVATION_TTL_MS).toISOString();
}

/** Token has no owner and is free or past the unpaid-hold TTL. */
function availableTokenElemMatch(tokenId: number, cutoffIso: string) {
  return {
    tokenId,
    $nor: [{ owner: { $type: "string" } }],
    $or: [
      { reservedBy: { $exists: false } },
      { reservedBy: null },
      { reservedAt: { $exists: false } },
      { reservedAt: null },
      { reservedAt: { $lt: cutoffIso } },
    ],
  };
}

/** Atomically reserve a token that is not owned or has an expired unpaid hold. */
export async function tryReserveToken(
  id: string,
  tokenId: number,
  reservedBy: string,
): Promise<Collection | null> {
  const col = await getCollectionsCol();
  const now = new Date().toISOString();
  const cutoffIso = reservationCutoffIso();
  const result = await col.findOneAndUpdate(
    {
      $or: [{ id }, { slug: id }],
      tokens: { $elemMatch: availableTokenElemMatch(tokenId, cutoffIso) },
      // Do not steal a paid SlicePay/gift hold (pending mint without SOL payment).
      $nor: [
        {
          "pendingMint.tokenId": tokenId,
          $or: [
            { "pendingMint.paymentLamports": { $exists: false } },
            { "pendingMint.paymentLamports": null },
            { "pendingMint.paymentLamports": 0 },
          ],
        },
      ],
    },
    {
      $set: {
        "tokens.$.reservedBy": reservedBy,
        "tokens.$.reservedAt": now,
        updatedAt: now,
      },
    },
    { returnDocument: "after", projection: { _id: 0 } },
  );
  return result ? asCollection(result) : null;
}

/** Atomically assign ownership to an available (or already reserved-by) token. */
export async function tryAssignTokenOwner(
  id: string,
  tokenId: number,
  owner: string,
  opts: { requireReservedBy?: string } = {},
): Promise<Collection | null> {
  const col = await getCollectionsCol();
  const now = new Date().toISOString();
  const elemMatch: Record<string, unknown> = { tokenId };
  if (opts.requireReservedBy) {
    elemMatch.reservedBy = opts.requireReservedBy;
    elemMatch.$nor = [{ owner: { $type: "string" } }];
  } else {
    Object.assign(elemMatch, availableTokenElemMatch(tokenId, reservationCutoffIso()));
  }
  const result = await col.findOneAndUpdate(
    {
      $or: [{ id }, { slug: id }],
      tokens: { $elemMatch: elemMatch },
    },
    {
      $set: { "tokens.$.owner": owner, updatedAt: now },
      $unset: { "tokens.$.reservedBy": "", "tokens.$.reservedAt": "" },
    },
    { returnDocument: "after", projection: { _id: 0 } },
  );
  return result ? asCollection(result) : null;
}

export async function clearTokenReservation(
  id: string,
  tokenId: number,
): Promise<Collection | null> {
  const col = await getCollectionsCol();
  const now = new Date().toISOString();
  const result = await col.findOneAndUpdate(
    {
      $or: [{ id }, { slug: id }],
      tokens: { $elemMatch: { tokenId, reservedBy: { $type: "string" } } },
    },
    {
      $unset: { "tokens.$.reservedBy": "", "tokens.$.reservedAt": "" },
      $set: { updatedAt: now },
    },
    { returnDocument: "after", projection: { _id: 0 } },
  );
  return result ? asCollection(result) : null;
}

export async function tryClearTokenOwner(
  id: string,
  tokenId: number,
  expectedOwner: string,
): Promise<Collection | null> {
  const col = await getCollectionsCol();
  const now = new Date().toISOString();
  const result = await col.findOneAndUpdate(
    {
      $or: [{ id }, { slug: id }],
      tokens: { $elemMatch: { tokenId, owner: expectedOwner } },
    },
    {
      $unset: { "tokens.$.owner": "", "tokens.$.reservedBy": "", "tokens.$.reservedAt": "" },
      $set: { updatedAt: now },
    },
    { returnDocument: "after", projection: { _id: 0 } },
  );
  return result ? asCollection(result) : null;
}
