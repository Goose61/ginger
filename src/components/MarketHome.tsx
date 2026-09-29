import { getMarketCards, getMarketCardsFresh } from "@/lib/market-data";
import { aggregateMarket } from "@/lib/market-view";
import { MarketHero } from "@/components/market/MarketHero";
import { MarketStats } from "@/components/market/MarketStats";
import { TrendingTable } from "@/components/market/TrendingTable";
import { MintGrid } from "@/components/market/MintGrid";
import { LaunchPromo } from "@/components/market/LaunchPromo";
import { TrustStrip } from "@/components/market/TrustStrip";
import { GiftStrip } from "@/components/market/GiftStrip";

/**
 * Landing page cadence:
 * hero (pitch + search + featured) → stats → trending table → open mints
 * → launch your own → security → gift.
 */
export async function MarketHome() {
  let live: Awaited<ReturnType<typeof getMarketCards>>["live"] = [];
  let secondary: Awaited<ReturnType<typeof getMarketCards>>["secondary"] = [];
  let giftBundle: Awaited<ReturnType<typeof getMarketCards>>["giftBundle"];
  try {
    ({ live, secondary, giftBundle } = await getMarketCards());
    // If Mongo timed out during a background revalidate, Next may serve a poisoned
    // empty cache entry — refetch once uncached before rendering an empty market.
    if (live.length === 0) {
      const fresh = await getMarketCardsFresh();
      if (fresh.live.length > 0) {
        ({ live, secondary, giftBundle } = fresh);
      }
    }
  } catch (err) {
    console.error("[market] database unavailable", err);
    try {
      ({ live, secondary, giftBundle } = await getMarketCardsFresh());
    } catch (retryErr) {
      console.error("[market] database unavailable (retry)", retryErr);
    }
  }

  const stats = aggregateMarket(live);

  return (
    <main className="relative overflow-hidden">
      <div aria-hidden className="page-glow" />
      <MarketHero live={live} />

      {/* vertical padding lives on this wrapper: the global .container utility forces py-0 */}
      <div className="relative z-[1] pb-20 pt-12 sm:pb-28 sm:pt-16">
        <div className="container relative mx-auto max-w-6xl space-y-14 px-4 sm:space-y-16">
          <div className="space-y-10 sm:space-y-12">
            <MarketStats stats={stats} />
            <TrendingTable live={live} secondary={secondary} />
          </div>
          <MintGrid live={live} />
          <LaunchPromo />
          <TrustStrip />
          {giftBundle && <GiftStrip collection={giftBundle} />}
        </div>
      </div>
    </main>
  );
}
