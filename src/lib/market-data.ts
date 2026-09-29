import { unstable_cache } from "next/cache";
import { listCollectionsForMarket } from "./store";
import { partitionMarketCards } from "./market-card";

export * from "./market-view";

/**
 * Shared, 30s-cached market snapshot used by the landing page and the
 * header search endpoint so both read the same partitioned cards.
 * Server-only: pulls in the Mongo store.
 */
export const getMarketCards = unstable_cache(
  async () => {
    try {
      return partitionMarketCards(await listCollectionsForMarket());
    } catch (err) {
      console.error("[market] getMarketCards failed", err);
      return { live: [] as Awaited<ReturnType<typeof partitionMarketCards>>["live"], secondary: [], giftBundle: undefined };
    }
  },
  ["market-cards"],
  { revalidate: 30 },
);
