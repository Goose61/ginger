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
  const { live, secondary, giftBundle } = await getMarketCards();

  return (
    <main className="relative overflow-hidden">
      <MarketBrowse live={live} secondary={secondary} giftBundle={giftBundle} />
    </main>
  );
}
