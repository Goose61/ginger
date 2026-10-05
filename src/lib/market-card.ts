import type { ChainKey, Collection, CollectionKind } from "./types";
import { coverImageSrc, tokenName, tokenThumbSrc } from "./collection-ui";
import { collectionMarketStats, type CollectionMarketStats } from "./collection-stats";
import { isStandaloneGiftRecord } from "./gift-bundle";
import { isHiddenFromMarket } from "./hidden-from-market";

/** Collection fields the Market grid needs — never the full token array. */
export type MarketCard = {
  id: string;
  slug: string;
  name: string;
  description: string;
  chain: ChainKey;
  kind?: CollectionKind;
  mintedCount: number;
  supply: number;
  coverSrc: string;
  stats: CollectionMarketStats;
  hasListings: boolean;
  featuredUntil?: string | null;
  createdAt: string;
};

export function toMarketCard(collection: Collection): MarketCard {
  const tokens = collection.tokens ?? [];
  const stats = collectionMarketStats(collection);
  return {
    id: collection.id,
    slug: collection.slug,
    name: collection.name,
    description: collection.description,
    chain: collection.chain,
    kind: collection.kind,
    mintedCount: stats.sold,
    supply: collection.supply,
    coverSrc: coverImageSrc(collection),
    stats,
    hasListings: tokens.some((t) => Boolean(t.listing)),
    featuredUntil: collection.featuredUntil ?? null,
    createdAt: collection.createdAt ?? "",
  };
}

/** One NFT currently listed for resale. Same `token.listing` the collection filter uses. */
export type MarketListing = {
  id: string;
  collectionId: string;
  slug: string;
  collectionName: string;
  chain: ChainKey;
  tokenId: number;
  name: string;
  imageSrc: string;
  priceUsd: number;
  listedAt: string;
};

export function toMarketListings(collections: Collection[]): MarketListing[] {
  const listings: MarketListing[] = [];
  for (const collection of collections) {
    try {
      if (!isMarketLiveCard(collection) || collection.kind === "gift_bundle") continue;
      for (const token of collection.tokens ?? []) {
        const priceUsd = token.listing?.priceUsd ?? 0;
        if (!token.listing || priceUsd <= 0) continue;
        listings.push({
          id: `${collection.id}:${token.tokenId}`,
          collectionId: collection.id,
          slug: collection.slug,
          collectionName: collection.name,
          chain: collection.chain,
          tokenId: token.tokenId,
          name: tokenName(collection, token),
          imageSrc: tokenThumbSrc(collection, token, 480),
          priceUsd,
          listedAt: token.listing.listedAt ?? "",
        });
      }
    } catch (err) {
      console.error("[market-card] skipped listings", collection.id, err);
    }
  }
  listings.sort(
    (a, b) => (b.listedAt || "").localeCompare(a.listedAt || "") || a.priceUsd - b.priceUsd,
  );
  return listings;
}

export function isMarketLiveCard(collection: Collection): boolean {
  if (isHiddenFromMarket(collection)) return false;
  if (collection.status !== "live" && collection.status !== "sold_out") return false;
  if (isStandaloneGiftRecord(collection)) return false;
  return true;
}

export function partitionMarketCards(collections: Collection[]): {
  live: MarketCard[];
  secondary: MarketCard[];
  listings: MarketListing[];
  giftBundle?: MarketCard;
} {
  const live: MarketCard[] = [];
  for (const collection of collections) {
    try {
      if (!isMarketLiveCard(collection)) continue;
      live.push(toMarketCard(collection));
    } catch (err) {
      console.error("[market-card] skipped collection", collection.id, err);
    }
  }
  const secondary = live.filter((card) => card.hasListings);
  const listings = toMarketListings(collections);
  const now = Date.now();
  live.sort((a, b) => {
    const aFeat = a.featuredUntil && new Date(a.featuredUntil).getTime() > now ? 1 : 0;
    const bFeat = b.featuredUntil && new Date(b.featuredUntil).getTime() > now ? 1 : 0;
    return bFeat - aFeat;
  });
  const giftBundle = live.find((card) => card.kind === "gift_bundle");
  return { live, secondary, listings, giftBundle };
}
