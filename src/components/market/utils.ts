import type { MarketCard } from "@/lib/market-card";

export type SortKey = "volume" | "floor" | "minted" | "newest";

export function collectionHref(collection: Pick<MarketCard, "slug" | "id">) {
  return `/collection/${collection.slug || collection.id}`;
}

export function mintedPct(collection: Pick<MarketCard, "supply" | "mintedCount">) {
  if (!collection.supply) return 0;
  return Math.min(100, Math.floor((collection.mintedCount / collection.supply) * 100));
}

export function isLiveFeatured(collection: Pick<MarketCard, "featuredUntil">) {
  return Boolean(
    collection.featuredUntil && new Date(collection.featuredUntil).getTime() > Date.now(),
  );
}

export function sortCards(cards: MarketCard[], sort: SortKey) {
  return [...cards].sort((a, b) => {
    if (sort === "floor") return b.stats.floorUsd - a.stats.floorUsd;
    if (sort === "minted") return mintedPct(b) - mintedPct(a);
    if (sort === "newest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    // "volume": volume first, then mint progress as a tiebreaker
    const dv = b.stats.volumeUsd - a.stats.volumeUsd;
    return dv !== 0 ? dv : mintedPct(b) - mintedPct(a);
  });
}

export function matchesQuery(collection: MarketCard, query: string) {
  if (!query) return true;
  const haystack = `${collection.name} ${collection.description}`.toLowerCase();
  return haystack.includes(query);
}

/** Compact number for stat tiles: 1.2K, 3.4M. */
export function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}
