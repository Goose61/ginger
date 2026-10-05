import { unstable_cache } from "next/cache";
import { listCollectionsForMarket } from "./store";
import { partitionMarketCards } from "./market-card";

export * from "./market-view";

/** Bump when cache shape or fetch semantics change (invalidates stale entries). */
const MARKET_CARDS_CACHE_KEY = "market-cards-v6";

function isMongoTimeout(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("timed out") || msg.includes("Server selection") || msg.includes("MongoNetwork");
}

async function loadMarketCards() {
  try {
    return partitionMarketCards(await listCollectionsForMarket());
  } catch (err) {
    if (!isMongoTimeout(err)) throw err;
    return partitionMarketCards(await listCollectionsForMarket());
  }
}

/**
 * Shared, 30s-cached market snapshot used by the landing page and the
 * header search endpoint. Never cache empty fallbacks on DB errors — that
 * poisons the homepage until revalidate (collections “disappear”).
 */
export const getMarketCards = unstable_cache(loadMarketCards, [MARKET_CARDS_CACHE_KEY], {
  revalidate: 30,
});

/** Uncached read for recovery when the cached snapshot may be stale or empty. */
export async function getMarketCardsFresh() {
  return loadMarketCards();
}
