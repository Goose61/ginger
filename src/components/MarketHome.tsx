import { unstable_cache } from "next/cache";
import { listCollectionsForMarket } from "@/lib/store";
import { partitionMarketCards } from "@/lib/market-card";
import { MarketBrowse } from "@/components/MarketBrowse";

const getMarketCards = unstable_cache(
  async () => partitionMarketCards(await listCollectionsForMarket()),
  ["market-cards"],
  { revalidate: 30 },
);

export async function MarketHome() {
  let live: Awaited<ReturnType<typeof getMarketCards>>["live"] = [];
  let secondary: Awaited<ReturnType<typeof getMarketCards>>["secondary"] = [];
  let giftBundle: Awaited<ReturnType<typeof getMarketCards>>["giftBundle"];
  try {
    ({ live, secondary, giftBundle } = await getMarketCards());
  } catch (err) {
    console.error("[market] database unavailable", err);
  }

  return (
    <main className="relative overflow-hidden">
      <MarketBrowse live={live} secondary={secondary} giftBundle={giftBundle} />
    </main>
  );
}
