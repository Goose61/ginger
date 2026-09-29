"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MarketCard } from "@/lib/market-card";
import { marketStatus } from "@/lib/market-view";
import { formatUsd } from "@/lib/collection-ui";
import { StatusPill } from "@/components/GlobalSearch";
import { Shelf } from "./Shelf";
import { collectionHref, isLiveFeatured, mintedPct, sortCards } from "./utils";

const INITIAL = 6;

export function MintGrid({ live }: { live: MarketCard[] }) {
  const [showAll, setShowAll] = useState(false);
  const cards = useMemo(
    () =>
      sortCards(
        live.filter((c) => c.kind !== "gift_bundle" && c.supply > 0 && c.mintedCount < c.supply),
        "volume",
      ),
    [live],
  );

  if (cards.length === 0) return null;
  const visible = showAll ? cards : cards.slice(0, INITIAL);

  return (
    <Shelf
      id="mints"
      eyebrow="Primary"
      title="Open mints"
      hint="Live drops you can mint now. Pay with SOL or card at a live USD quote."
      aside={
        cards.length > INITIAL ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="h-9 rounded-full border border-line px-4 text-sm text-ink-body hover:border-line-strong hover:text-ink"
          >
            {showAll ? "Show fewer" : `View all ${cards.length}`}
          </button>
        ) : undefined
      }
    >
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => (
          <MintCard key={c.id} collection={c} />
        ))}
      </div>
    </Shelf>
  );
}

function MintCard({ collection }: { collection: MarketCard }) {
  const pct = mintedPct(collection);
  return (
    <Link
      href={collectionHref(collection)}
      className="nft-card group block"
      aria-label={`${collection.name}, floor ${formatUsd(collection.stats.floorUsd)}, ${pct}% minted`}
    >
      <div className="relative aspect-square overflow-hidden bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={collection.coverSrc}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
        {isLiveFeatured(collection) && (
          <span className="absolute left-3 top-3 rounded-full bg-gold px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-black">
            Featured
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 truncate text-[17px] font-semibold text-ink">{collection.name}</h3>
          <StatusPill status={marketStatus(collection)} />
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10.5px] uppercase tracking-[0.12em] text-ink-subtle">Floor</p>
            <p className="num mt-0.5 font-[family-name:var(--font-mono)] text-lg font-medium text-ink">
              {formatUsd(collection.stats.floorUsd)}
            </p>
          </div>
          <p className="num text-right text-xs text-ink-muted">
            <span className="font-[family-name:var(--font-mono)] text-ink">{pct}%</span> minted ·{" "}
            {collection.stats.available} left
          </p>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </Link>
  );
}
