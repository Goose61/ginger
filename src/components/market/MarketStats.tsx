import type { MarketAggregate } from "@/lib/market-view";
import { formatUsdAmount } from "@/lib/collection-ui";
import { compactNumber } from "./utils";

export function MarketStats({ stats }: { stats: MarketAggregate }) {
  const tiles = [
    { label: "Live drops", value: String(stats.liveCount) },
    { label: "Total volume", value: formatUsdAmount(stats.volumeUsd) },
    { label: "NFTs minted", value: compactNumber(stats.mintedCount) },
    { label: "Listed for sale", value: compactNumber(stats.listedCount) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl border border-line bg-surface-1 px-4 py-3.5">
          <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-subtle">{t.label}</dt>
          <dd className="num mt-1 font-[family-name:var(--font-mono)] text-xl font-medium text-ink sm:text-2xl">
            {t.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
