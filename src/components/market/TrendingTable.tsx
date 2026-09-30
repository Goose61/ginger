"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import type { MarketCard } from "@/lib/market-card";
import { marketStatus } from "@/lib/market-view";
import { formatUsd, formatUsdAmount } from "@/lib/collection-ui";
import { StatusPill } from "@/components/GlobalSearch";
import { Shelf } from "./Shelf";
import { collectionHref, isLiveFeatured, mintedPct, sortCards } from "./utils";

type Tab = "trending" | "mints" | "listings" | "newest";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "trending", label: "Trending", hint: "Ranked by volume, then mint progress." },
  { id: "mints", label: "Open mints", hint: "Collections you can mint right now." },
  { id: "listings", label: "Listings", hint: "Collections with NFTs for resale on Ginger." },
  { id: "newest", label: "Newest", hint: "Most recently launched." },
];

export function TrendingTable({
  live,
  secondary,
}: {
  live: MarketCard[];
  secondary: MarketCard[];
}) {
  const [tab, setTab] = useState<Tab>("trending");

  const rows = useMemo(() => {
    const cards = live.filter((c) => c.kind !== "gift_bundle");
    switch (tab) {
      case "mints":
        return sortCards(
          cards.filter((c) => c.supply > 0 && c.mintedCount < c.supply),
          "minted",
        );
      case "listings":
        return sortCards(secondary, "volume");
      case "newest":
        return sortCards(cards, "newest");
      default:
        return sortCards(cards, "volume");
    }
  }, [live, secondary, tab]);

  const active = TABS.find((t) => t.id === tab)!;

  return (
    <Shelf
      id="trending"
      eyebrow="Collections"
      title="What's moving"
      hint={active.hint}
    >
      {/* Tabs */}
      <div role="tablist" aria-label="Collection views" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-9 rounded-full px-3.5 text-sm font-medium transition ${
              tab === t.id
                ? "bg-ink text-surface-0"
                : "border border-line text-ink-body hover:border-line-strong hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <>
          {/* Mobile: card rows */}
          <ul className="space-y-2.5 md:hidden">
            {rows.map((c, i) => (
              <li key={c.id}>
                <Link
                  href={collectionHref(c)}
                  className="block rounded-2xl border border-line bg-surface-1 p-3.5 transition hover:border-line-strong hover:bg-surface-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="num w-5 font-[family-name:var(--font-mono)] text-xs text-ink-subtle">
                      {i + 1}
                    </span>
                    <Cover src={c.coverSrc} alt={`${c.name} cover`} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink">{c.name}</span>
                        {isLiveFeatured(c) && <Star className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" aria-label="Featured" />}
                      </div>
                      <StatusPill status={marketStatus(c)} className="mt-1" />
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <MobileStat label="Floor" value={formatUsd(c.stats.floorUsd)} />
                    <MobileStat label="Volume" value={formatUsdAmount(c.stats.volumeUsd)} />
                    <MobileStat label="Minted" value={`${mintedPct(c)}%`} />
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface-1 md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-ink-subtle">
                  <Th className="w-12 pl-5">#</Th>
                  <Th>Collection</Th>
                  <Th className="text-right">Floor</Th>
                  <Th className="text-right">Volume</Th>
                  <Th className="w-44">Minted</Th>
                  <Th className="text-right">Listed</Th>
                  <Th className="w-28 pr-5 text-right">Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => {
                  const pct = mintedPct(c);
                  const href = collectionHref(c);
                  return (
                    <tr
                      key={c.id}
                      className="group relative border-b border-line/70 transition last:border-0 hover:bg-surface-2"
                    >
                      <Td className="num pl-5 font-[family-name:var(--font-mono)] text-ink-subtle">{i + 1}</Td>
                      <Td>
                        <Link href={href} className="flex items-center gap-3 text-ink">
                          {/* stretched link: covers the whole row */}
                          <span className="absolute inset-0" aria-hidden />
                          <Cover src={c.coverSrc} alt={`${c.name} cover`} size={40} />
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium group-hover:text-ink">{c.name}</span>
                            {isLiveFeatured(c) && (
                              <Star className="h-3.5 w-3.5 shrink-0 fill-gold text-gold" aria-label="Featured" />
                            )}
                          </span>
                        </Link>
                      </Td>
                      <Td className="num text-right font-[family-name:var(--font-mono)] text-ink">
                        {formatUsd(c.stats.floorUsd)}
                      </Td>
                      <Td className="num text-right font-[family-name:var(--font-mono)] text-ink">
                        {formatUsdAmount(c.stats.volumeUsd)}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                            <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="num w-10 text-right font-[family-name:var(--font-mono)] text-xs text-ink-body">
                            {pct}%
                          </span>
                        </div>
                      </Td>
                      <Td className="num text-right text-ink-body">{c.stats.listedCount}</Td>
                      <Td className="pr-5 text-right">
                        <StatusPill status={marketStatus(c)} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shelf>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

function Cover({ src, alt, size }: { src: string; alt: string; size: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-lg border border-line bg-surface-2 object-cover"
    />
  );
}

function MobileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-subtle">{label}</dt>
      <dd className="num mt-0.5 truncate font-[family-name:var(--font-mono)] text-sm text-ink">{value}</dd>
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const copy: Record<Tab, string> = {
    trending: "No live collections yet.",
    mints: "No open mints right now.",
    listings: "No NFTs listed for resale yet. Listings open once a collection hits its milestone.",
    newest: "No live collections yet.",
  };
  return (
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-[family-name:var(--font-display)] text-xl text-ink">Nothing here yet</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
        {copy[tab]}
      </p>
      <Link
        href="/launch"
        className="mt-5 inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-[#b42318]"
      >
        Launch the first one
      </Link>
    </div>
  );
}
