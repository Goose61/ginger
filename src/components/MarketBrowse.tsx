"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { formatUsd, formatUsdAmount, thumbSrc } from "@/lib/collection-ui";
import type { MarketCard } from "@/lib/market-card";

type SortKey = "volume" | "floor" | "minted" | "newest";

function collectionHref(collection: MarketCard) {
  return `/collection/${collection.slug || collection.id}`;
}

function mintedPct(collection: MarketCard) {
  if (!collection.supply) return 0;
  return Math.min(100, Math.floor((collection.mintedCount / collection.supply) * 100));
}

function isLiveFeatured(collection: MarketCard) {
  return Boolean(collection.featuredUntil && new Date(collection.featuredUntil).getTime() > Date.now());
}

function sortCards(cards: MarketCard[], sort: SortKey) {
  return [...cards].sort((a, b) => {
    if (sort === "floor") return b.stats.floorUsd - a.stats.floorUsd;
    if (sort === "minted") return mintedPct(b) - mintedPct(a);
    if (sort === "newest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return b.stats.volumeUsd - a.stats.volumeUsd;
  });
}

function matchesQuery(collection: MarketCard, query: string) {
  if (!query) return true;
  const haystack = `${collection.name} ${collection.description}`.toLowerCase();
  return haystack.includes(query);
}

export function MarketBrowse({
  live,
  secondary,
  giftBundle,
}: {
  live: MarketCard[];
  secondary: MarketCard[];
  giftBundle?: MarketCard;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("volume");
  const q = query.trim().toLowerCase();

  const mintCards = useMemo(
    () => live.filter((card) => card.kind !== "gift_bundle" && matchesQuery(card, q)),
    [live, q],
  );
  const secondaryCards = useMemo(
    () => secondary.filter((card) => matchesQuery(card, q)),
    [secondary, q],
  );
  const sortedMints = useMemo(() => sortCards(mintCards, sort), [mintCards, sort]);
  const sortedSecondary = useMemo(() => sortCards(secondaryCards, sort), [secondaryCards, sort]);

  const heroSlides = useMemo(() => {
    const featured = live.filter((card) => card.kind !== "gift_bundle" && isLiveFeatured(card));
    if (featured.length > 0) return featured.slice(0, 6);
    return sortCards(
      live.filter((card) => card.kind !== "gift_bundle"),
      "volume",
    ).slice(0, 3);
  }, [live]);

  const hottest = useMemo(
    () =>
      sortCards(
        live.filter((card) => card.kind !== "gift_bundle" && matchesQuery(card, q)),
        "volume",
      ).slice(0, 6),
    [live, q],
  );

  const giftVisible = giftBundle && matchesQuery(giftBundle, q) ? giftBundle : undefined;

  return (
    <div>
      <FeaturedHero slides={heroSlides} />

      <div className="container relative mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <Toolbar
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          mintCount={sortedMints.length}
          secondaryCount={sortedSecondary.length}
        />

        <Shelf
          id="mints"
          kicker="Primary"
          title="Open mints"
          hint="Live drops. Mint stays on Ginger."
        >
          {sortedMints.length === 0 ? (
            <EmptyCopy>
              {q ? "No mints match that search." : "No active mints right now."}
            </EmptyCopy>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sortedMints.map((collection) => (
                <MintCard key={collection.id} collection={collection} />
              ))}
            </div>
          )}
        </Shelf>

        <Shelf
          id="secondary"
          kicker="In-ecosystem"
          title="Secondary"
          hint="Listings stay here. Nothing graduates away."
        >
          {sortedSecondary.length === 0 ? (
            <EmptyCopy>
              {q
                ? "No listings match that search."
                : "Secondary unlocks when a collection hits its milestone. Nothing here yet."}
            </EmptyCopy>
          ) : (
            <SecondaryTable collections={sortedSecondary} />
          )}
        </Shelf>

        {hottest.length > 0 && (
          <Shelf kicker="Activity" title="Hottest" hint="Ranked by volume, then mint progress.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hottest.map((collection, index) => (
                <MoverTile key={collection.id} rank={index + 1} collection={collection} />
              ))}
            </div>
          </Shelf>
        )}

        {giftVisible && <GiftStrip collection={giftVisible} />}
      </div>
    </div>
  );
}

function FeaturedHero({ slides }: { slides: MarketCard[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const active = slides[index] ?? slides[0];

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [slides.length, paused]);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [index, slides.length]);

  if (!active) {
    return (
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(226,60,47,0.22),transparent_58%)]"
        />
        <div className="container relative mx-auto flex min-h-[22rem] max-w-6xl flex-col justify-end px-4 py-16 sm:min-h-[28rem] sm:py-20">
          <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.22em] text-white/50">
            GINGER MARKET
          </p>
          <h1 className="mt-2 max-w-2xl text-4xl sm:text-6xl">No live drops yet.</h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white/55">
            Launch a collection to take this spot. Primary mints and secondary listings stay on Ginger.
          </p>
          <Link
            href="/launch"
            className="mt-6 inline-flex w-fit rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/80"
          >
            Launch a collection
          </Link>
        </div>
      </section>
    );
  }

  const pct = mintedPct(active);

  return (
    <section
      className="relative overflow-hidden border-b border-white/10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbSrc(active.coverSrc, 1600)}
          alt=""
          className="h-full w-full scale-105 object-cover opacity-35 blur-xl"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0908] via-[#0a0908]/80 to-[#0a0908]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0908] via-transparent to-[#0a0908]/40" />
      </div>

      <div className="container relative mx-auto grid min-h-[26rem] max-w-6xl items-end gap-8 px-4 py-10 sm:min-h-[32rem] sm:py-14 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="pb-2">
          <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.22em] text-secondary">
            {isLiveFeatured(active) ? "FEATURED DROP" : "LIVE ON GINGER"}
          </p>
          <h1 className="mt-3 max-w-xl break-words text-4xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">
            {active.name}
          </h1>
          <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-6 text-white/60 sm:text-base">
            {active.description || "Primary mint and secondary listings stay in-ecosystem."}
          </p>
          <dl className="mt-6 grid max-w-lg grid-cols-3 gap-2">
            <HeroStat label="Floor" value={formatUsd(active.stats.floorUsd)} />
            <HeroStat label="Volume" value={formatUsdAmount(active.stats.volumeUsd)} />
            <HeroStat label="Minted" value={`${pct}%`} />
          </dl>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={collectionHref(active)}
              className="inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/80"
            >
              {active.hasListings ? "View listings" : "Mint now"}
            </Link>
            <Link
              href="#mints"
              className="inline-flex rounded-full border border-white/20 px-5 py-2.5 text-sm text-white hover:border-white/40"
            >
              Browse mints
            </Link>
          </div>
        </div>

        <Link
          href={collectionHref(active)}
          className="group relative mx-auto aspect-square w-full max-w-[28rem] overflow-hidden rounded-3xl border border-white/15 bg-card shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbSrc(active.coverSrc, 900)}
            alt={active.name}
            className="h-full w-full object-contain p-5 transition duration-500 group-hover:scale-[1.03]"
          />
          <span className="absolute left-4 top-4 rounded-full bg-black/60 px-3 py-1 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.16em] text-white backdrop-blur-sm">
            {active.hasListings ? "SECONDARY OPEN" : "OPEN MINT"}
          </span>
        </Link>
      </div>

      {slides.length > 1 && (
        <div className="container relative mx-auto flex max-w-6xl items-center gap-2 px-4 pb-6">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Show ${slide.name}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition ${
                i === index ? "w-10 bg-primary" : "w-4 bg-white/25 hover:bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Toolbar({
  query,
  onQuery,
  sort,
  onSort,
  mintCount,
  secondaryCount,
}: {
  query: string;
  onQuery: (value: string) => void;
  sort: SortKey;
  onSort: (value: SortKey) => void;
  mintCount: number;
  secondaryCount: number;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative block min-w-0 flex-1">
        <span className="sr-only">Search collections</span>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search collections"
          className="input h-11 w-full rounded-full bg-white/5 pl-4 pr-4"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.16em] text-white/40">
          {mintCount} MINTS · {secondaryCount} LISTED
        </p>
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          className="input h-11 w-auto rounded-full bg-white/5 px-4 text-sm"
          aria-label="Sort collections"
        >
          <option value="volume">Volume</option>
          <option value="floor">Floor</option>
          <option value="minted">Minted %</option>
          <option value="newest">Newest</option>
        </select>
      </div>
    </div>
  );
}

function Shelf({
  id,
  kicker,
  title,
  hint,
  children,
}: {
  id?: string;
  kicker: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-28 sm:mt-16">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.22em] text-white/40">
            {kicker}
          </p>
          <h2 className="mt-1 text-3xl sm:text-4xl">{title}</h2>
        </div>
        <p className="max-w-sm text-sm text-white/45">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function MintCard({ collection }: { collection: MarketCard }) {
  const pct = mintedPct(collection);
  const featured = isLiveFeatured(collection);

  return (
    <Link
      href={collectionHref(collection)}
      className="nft-card group hover:border-primary/50"
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-white/5 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbSrc(collection.coverSrc, 640)}
          alt={collection.name}
          loading="lazy"
          decoding="async"
          className="max-h-full max-w-full object-contain transition duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-black/60 px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10px] text-white backdrop-blur-sm">
            {formatUsd(collection.stats.floorUsd)}
          </span>
          {featured && (
            <span className="rounded-full bg-secondary px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10px] text-black">
              FEATURED
            </span>
          )}
        </div>
        <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] text-white/80 backdrop-blur-sm">
          {pct}% minted
        </span>
      </div>
      <div className="border-t border-white/10 p-4">
        <h3 className="truncate text-lg font-semibold text-white">{collection.name}</h3>
        <p className="mt-1 text-xs text-white/45">
          {collection.stats.available} available · {collection.stats.sold} sold
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-secondary"
            style={{ width: `${pct}%` }}
          />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-white/5 px-2.5 py-2">
            <dt className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.14em] text-white/40">
              VOLUME
            </dt>
            <dd className="mt-0.5 text-sm text-white">{formatUsdAmount(collection.stats.volumeUsd)}</dd>
          </div>
          <div className="rounded-lg bg-white/5 px-2.5 py-2">
            <dt className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.14em] text-white/40">
              MCAP
            </dt>
            <dd className="mt-0.5 text-sm text-white">{formatUsdAmount(collection.stats.marketCapUsd)}</dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}

function SecondaryTable({ collections }: { collections: MarketCard[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/12 bg-card">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.16em] text-white/40">
            <th className="px-4 py-3 font-medium">#</th>
            <th className="px-4 py-3 font-medium">Collection</th>
            <th className="px-4 py-3 font-medium">Floor</th>
            <th className="px-4 py-3 font-medium">Volume</th>
            <th className="px-4 py-3 font-medium">Listed</th>
            <th className="px-4 py-3 font-medium">Sold</th>
            <th className="px-4 py-3 font-medium">Available</th>
          </tr>
        </thead>
        <tbody>
          {collections.map((collection, index) => (
            <tr key={collection.id} className="border-b border-white/8 last:border-0">
              <td className="px-4 py-3 font-[family-name:var(--font-mono)] text-white/35">
                {index + 1}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={collectionHref(collection)}
                  className="flex items-center gap-3 text-white hover:text-primary"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbSrc(collection.coverSrc, 96)}
                    alt=""
                    className="h-9 w-9 rounded-lg object-cover"
                  />
                  <span className="font-medium">{collection.name}</span>
                </Link>
              </td>
              <td className="px-4 py-3 font-[family-name:var(--font-mono)] tabular-nums text-white">
                {formatUsd(collection.stats.floorUsd)}
              </td>
              <td className="px-4 py-3 font-[family-name:var(--font-mono)] tabular-nums text-white">
                {formatUsdAmount(collection.stats.volumeUsd)}
              </td>
              <td className="px-4 py-3 tabular-nums text-white/80">{collection.stats.listedCount}</td>
              <td className="px-4 py-3 tabular-nums text-white/80">{collection.stats.sold}</td>
              <td className="px-4 py-3 tabular-nums text-white/80">{collection.stats.available}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoverTile({ rank, collection }: { rank: number; collection: MarketCard }) {
  const pct = mintedPct(collection);
  return (
    <Link
      href={collectionHref(collection)}
      className="flex items-center gap-3 rounded-2xl border border-white/12 bg-card px-3 py-3 transition hover:-translate-y-0.5 hover:border-primary/50"
    >
      <span className="w-6 font-[family-name:var(--font-mono)] text-sm text-white/35">{rank}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbSrc(collection.coverSrc, 128)}
        alt=""
        className="h-12 w-12 rounded-xl object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">{collection.name}</p>
        <p className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] text-white/45">
          Floor {formatUsd(collection.stats.floorUsd)}
        </p>
      </div>
      <div className="text-right">
        <p className="font-[family-name:var(--font-mono)] text-sm text-secondary">{pct}%</p>
        <p className="text-[11px] text-white/40">minted</p>
      </div>
    </Link>
  );
}

function GiftStrip({ collection }: { collection: MarketCard }) {
  return (
    <section className="mt-12 sm:mt-16">
      <Link
        href="/gift"
        className="group relative grid overflow-hidden rounded-3xl border border-white/12 bg-card md:grid-cols-[1.1fr_0.9fr]"
      >
        <div className="relative flex min-h-[220px] items-center justify-center bg-white/5 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbSrc(collection.coverSrc, 800)}
            alt={collection.name}
            className="max-h-56 object-contain transition duration-500 group-hover:scale-[1.03]"
          />
        </div>
        <div className="flex flex-col justify-center p-6 sm:p-8">
          <p className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.22em] text-secondary">
            GIFTS
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl">{collection.name}</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">
            {collection.mintedCount === 0
              ? "Send a 1/1 collectible. It lands in this bundle on the market."
              : `${collection.mintedCount} gift${collection.mintedCount === 1 ? "" : "s"} minted. Send another from /gift.`}
          </p>
          <span className="mt-6 inline-flex w-fit rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white">
            Send a gift
          </span>
        </div>
      </Link>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
      <dt className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.16em] text-white/40">
        {label.toUpperCase()}
      </dt>
      <dd className="mt-1 truncate text-lg font-semibold text-white">{value}</dd>
    </div>
  );
}

function EmptyCopy({ children }: { children: ReactNode }) {
  return <p className="text-sm text-white/50">{children}</p>;
}
