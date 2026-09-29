/**
 * Client-safe helpers derived from MarketCard. No DB / next/cache imports here —
 * these are shared by server components, API routes and client UI alike.
 */
import type { MarketCard } from "./market-card";

export type MarketAggregate = {
  liveCount: number;
  volumeUsd: number;
  mintedCount: number;
  listedCount: number;
};

export function aggregateMarket(live: MarketCard[]): MarketAggregate {
  return live.reduce<MarketAggregate>(
    (acc, card) => {
      if (card.kind === "gift_bundle") return acc;
      acc.liveCount += 1;
      acc.volumeUsd += card.stats.volumeUsd;
      acc.mintedCount += card.mintedCount;
      acc.listedCount += card.stats.listedCount;
      return acc;
    },
    { liveCount: 0, volumeUsd: 0, mintedCount: 0, listedCount: 0 },
  );
}

export type MarketStatus = "minting" | "listed" | "sold_out";

export function marketStatus(
  card: Pick<MarketCard, "hasListings" | "mintedCount" | "supply">,
): MarketStatus {
  if (card.hasListings) return "listed";
  if (card.supply > 0 && card.mintedCount >= card.supply) return "sold_out";
  return "minting";
}

/** Slim payload for the global search dialog — no tokens, no attributes. */
export type SearchItem = {
  id: string;
  slug: string;
  name: string;
  coverSrc: string;
  status: MarketStatus;
  floorUsd: number;
  volumeUsd: number;
  mintedPct: number;
};

export function toSearchItem(card: MarketCard): SearchItem {
  return {
    id: card.id,
    slug: card.slug,
    name: card.name,
    coverSrc: card.coverSrc,
    status: marketStatus(card),
    floorUsd: card.stats.floorUsd,
    volumeUsd: card.stats.volumeUsd,
    mintedPct: card.supply
      ? Math.min(100, Math.floor((card.mintedCount / card.supply) * 100))
      : 0,
  };
}
