import type { Collection, PendingCoreCollection, PendingMint } from "./types";
import { isHiddenFromMarket } from "./hidden-from-market";

/** Unpaid checkout holds (SOL pay-and-mint) return to sale after this. */
export const TOKEN_RESERVATION_TTL_MS = 15 * 60 * 1000;

export function isListedPublicly(collection: Collection): boolean {
  if (isHiddenFromMarket(collection)) return false;
  return collection.status === "live" || collection.status === "sold_out";
}

type ReservationToken = {
  tokenId?: number;
  owner?: string | null;
  reservedBy?: string | null;
  reservedAt?: string | null;
};

/** SlicePay/gift holds have pendingMint without a SOL payment — keep them until minted. */
export function isExpirableReservation(
  token: ReservationToken,
  collection?: Pick<Collection, "pendingMint"> | null,
): boolean {
  if (token.owner || !token.reservedBy) return false;
  const pm = collection?.pendingMint;
  if (pm && pm.tokenId === token.tokenId && !(pm.paymentLamports && pm.paymentLamports > 0)) {
    return false;
  }
  return true;
}

export function isTokenReservationActive(
  token: ReservationToken,
  collection?: Pick<Collection, "pendingMint"> | null,
  now = Date.now(),
): boolean {
  if (!token.reservedBy || token.owner) return false;
  if (!isExpirableReservation(token, collection)) return true;
  if (!token.reservedAt) return false;
  const at = new Date(token.reservedAt).getTime();
  if (!Number.isFinite(at)) return false;
  return now - at < TOKEN_RESERVATION_TTL_MS;
}

export function tokenIsCommitted(
  token: ReservationToken,
  collection?: Pick<Collection, "pendingMint"> | null,
): boolean {
  return Boolean(token.owner) || isTokenReservationActive(token, collection);
}

/** Drop unpaid holds older than the TTL (in memory). Does not touch paid SlicePay/gift holds. */
export function stripExpiredReservations(
  collection: Collection,
  now = Date.now(),
): { collection: Collection; changed: boolean } {
  let changed = false;
  const tokens = collection.tokens.map((token) => {
    if (!isExpirableReservation(token, collection)) return token;
    if (isTokenReservationActive(token, collection, now)) return token;
    changed = true;
    const next = { ...token };
    delete next.reservedBy;
    delete next.reservedAt;
    return next;
  });

  let pendingMint = collection.pendingMint;
  if (pendingMint?.tokenId != null && pendingMint.paymentLamports) {
    const tok = tokens.find((t) => t.tokenId === pendingMint!.tokenId);
    if (tok && !tok.reservedBy && !tok.owner) {
      pendingMint = undefined;
      changed = true;
    }
  }

  if (!changed) return { collection, changed: false };

  const next: Collection = { ...collection, tokens };
  if (pendingMint) next.pendingMint = pendingMint;
  else delete next.pendingMint;

  next.mintedCount = next.tokens.filter((t) => tokenIsCommitted(t, next)).length;
  if (next.status === "sold_out" && next.mintedCount < next.supply) {
    next.status = "live";
  }
  return { collection: next, changed: true };
}

/** Clear abandoned on-chain prep fields and sync mintedCount to committed tokens. */
export function reconcileCollectionMintState(
  collection: Collection,
  now = Date.now(),
): { collection: Collection; changed: boolean } {
  const stripped = stripExpiredReservations(collection, now);
  let changed = stripped.changed;
  let next = stripped.collection;

  const tokens = next.tokens.map((token) => {
    if (tokenIsCommitted(token, next)) return token;
    if (!token.assetAddress && !token.mintTxUrl) return token;
    changed = true;
    const cleaned = { ...token };
    delete cleaned.assetAddress;
    delete cleaned.mintTxUrl;
    return cleaned;
  });

  let pendingMint = next.pendingMint;
  if (pendingMint?.tokenId != null) {
    const tok = tokens.find((t) => t.tokenId === pendingMint!.tokenId);
    if (tok && !tokenIsCommitted(tok, next)) {
      pendingMint = undefined;
      changed = true;
    }
  }

  const committed = tokens.filter((t) => tokenIsCommitted(t, next)).length;
  if (next.mintedCount !== committed) changed = true;

  next = { ...next, tokens, mintedCount: committed };
  if (pendingMint) next.pendingMint = pendingMint;
  else delete next.pendingMint;

  if (next.status === "sold_out" && committed < next.supply) {
    next.status = "live";
    changed = true;
  }

  return { collection: next, changed };
}

function toPublicPendingMint(pendingMint: PendingMint): PendingMint {
  const { assetSecretKeyB64: _secret, ...rest } = pendingMint;
  void _secret;
  return rest;
}

function toPublicPendingCoreCollection(pending: PendingCoreCollection): PendingCoreCollection {
  const { collectionSecretKeyB64: _secret, ...rest } = pending;
  void _secret;
  return rest;
}

/** Strip server-only fields before any collection leaves the process. */
export function toPublicCollection(collection: Collection): Collection {
  const { collection: reconciled } = reconcileCollectionMintState(collection);
  const {
    pendingZipUrl: _zip,
    pendingMint,
    pendingCoreCollection,
    activeMintQuote: _quote,
    ...rest
  } = reconciled;
  void _quote;
  void _zip;
  return {
    ...rest,
    ...(pendingMint ? { pendingMint: toPublicPendingMint(pendingMint) } : {}),
    ...(pendingCoreCollection
      ? { pendingCoreCollection: toPublicPendingCoreCollection(pendingCoreCollection) }
      : {}),
  };
}

/** List rows for dashboard/market APIs — omit token/layer payloads unless a draft needs them. */
export function toPublicListCollection(
  collection: Collection,
  opts?: { includeArt?: boolean },
): Collection {
  const pub = toPublicCollection(collection);
  if (opts?.includeArt) return pub;
  return { ...pub, tokens: [], layers: [] };
}

export function filterCollectionsForViewer(
  collections: Collection[],
  wallet?: string,
): Collection[] {
  return collections
    .filter((c) => {
      if (isListedPublicly(c)) return true;
      if (!wallet) return false;
      return (
        c.payments.creatorWallet === wallet &&
        (c.status === "draft" || c.status === "importing")
      );
    })
    .map(toPublicCollection);
}
