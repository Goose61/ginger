import type { MarketCard } from "@/lib/market-card";

export type SortKey = "volume" | "floor" | "minted" | "newest";

export function collectionHref(collection: Pick<MarketCard, "slug" | "id">) {
  return `/collection/${collection.slug || collection.id}`;
}

/** Display percent. Small mints stay visible (0.3) instead of rounding down to 0. */
export function mintedPct(collection: Pick<MarketCard, "supply" | "mintedCount">) {
  const supply = collection.supply;
  const minted = collection.mintedCount;
  if (!supply || minted <= 0) return 0;
  const raw = (minted / supply) * 100;
  if (raw >= 100) return 100;
  if (raw >= 10) return Math.round(raw);
  const tenth = Math.round(raw * 10) / 10;
  return tenth > 0 ? tenth : 0.1;
}

/** Bar width. Any real mint is at least 2% wide so the track is not an empty line. */
export function mintedBarPct(collection: Pick<MarketCard, "supply" | "mintedCount">) {
  const pct = mintedPct(collection);
  if (pct <= 0) return 0;
  return Math.min(100, Math.max(pct, 2));
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
