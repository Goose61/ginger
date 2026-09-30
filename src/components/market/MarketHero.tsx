"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Wallet, Database, Sparkles } from "lucide-react";
import type { MarketCard } from "@/lib/market-card";
import { formatUsd } from "@/lib/collection-ui";
import { SearchTrigger } from "@/components/GlobalSearch";
import { collectionHref, isLiveFeatured, mintedPct, sortCards } from "./utils";

const TRUST = [
  { icon: Sparkles, label: "Metaplex Core" },
  { icon: Database, label: "Permanent storage" },
  { icon: Wallet, label: "You keep custody" },
  { icon: ShieldCheck, label: "Security reviewed", href: "/security" },
];

export function MarketHero({ live }: { live: MarketCard[] }) {
  const slides = useMemo(() => {
    const cards = live.filter((c) => c.kind !== "gift_bundle");
    const featured = cards.filter(isLiveFeatured);
    if (featured.length > 0) return featured.slice(0, 6);
    return sortCards(cards, "volume").slice(0, 3);
  }, [live]);

  return (
    <section className="relative z-[1] bg-transparent py-12 sm:py-16 lg:py-20">
      <div className="container relative mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
        <div>
          <p className="eyebrow !text-gold">NFT marketplace</p>
          <h1 className="mt-4 max-w-[13ch] font-[family-name:var(--font-display)] text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.02em] text-ink sm:text-[3.5rem] lg:text-[4rem]">
            Launch, mint and trade collections in one place.
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-ink-body sm:text-base">
            Creators upload finished art and go live from their wallet. Collectors mint with SOL
            or card, then resell right here on Ginger.
          </p>

          <div className="mt-7 max-w-xl">
            <SearchTrigger variant="hero" placeholder="Search collections…" />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="#trending"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white transition hover:bg-[#b42318]"
            >
              Explore drops
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/launch"
              className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-sm font-medium text-ink transition hover:border-ink/40 hover:bg-surface-1"
            >
              Launch a collection
            </Link>
          </div>

          <ul className="mt-8 grid w-fit grid-cols-2 gap-x-10 gap-y-3 text-[15px] font-medium text-ink-body">
            {TRUST.map(({ icon: Icon, label, href }) => {
              const inner = (
                <>
                  <Icon className="h-[18px] w-[18px] text-gold/80" aria-hidden />
                  {label}
                </>
              );
              return (
                <li key={label} className="inline-flex items-center gap-2">
                  {href ? (
                    <Link href={href} className="inline-flex items-center gap-2 hover:text-ink">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <FeaturedCard slides={slides} />
      </div>
    </section>
  );
}

function FeaturedCard({ slides }: { slides: MarketCard[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const active = slides[index] ?? slides[0];

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const id = window.setInterval(() => setIndex((c) => (c + 1) % slides.length), 6500);
    return () => window.clearInterval(id);
  }, [slides.length, paused]);

  useEffect(() => {
    if (index >= slides.length) setIndex(0);
  }, [index, slides.length]);

  if (!active) {
    return (
      <div className="relative mx-auto w-full max-w-[26rem] lg:ml-auto">
        <div className="nft-card flex aspect-square flex-col items-center justify-center p-8 text-center">
          <span className="eyebrow !text-gold">Featured drop</span>
          <p className="mt-3 font-[family-name:var(--font-display)] text-2xl text-ink">
            Your drop could be here.
          </p>
          <p className="mt-2 max-w-[18rem] text-sm text-ink-muted">
            The first live collection takes the featured slot on the homepage.
          </p>
          <Link
            href="/launch"
            className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-white hover:bg-[#b42318]"
          >
            Launch a collection
          </Link>
        </div>
      </div>
    );
  }

  const pct = mintedPct(active);
  const href = collectionHref(active);

  return (
    <div
      className="relative mx-auto w-full max-w-[26rem] lg:ml-auto"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Link
        href={href}
        className="nft-card group block shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]"
        aria-label={`${active.name}: ${active.hasListings ? "view listings" : "mint now"}`}
      >
        <div className="relative aspect-square overflow-hidden bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={active.id}
            src={active.coverSrc}
            alt={`${active.name} NFT artwork`}
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-gold px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-black">
            {isLiveFeatured(active) ? "Featured drop" : "Live now"}
          </span>
          <div className="absolute inset-x-4 bottom-4">
            <p className="truncate font-[family-name:var(--font-display)] text-2xl text-white drop-shadow">
              {active.name}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-3 p-4">
          <Stat label="Floor" value={formatUsd(active.stats.floorUsd)} />
          <Stat label="Minted" value={`${pct}%`} bar={pct} />
          <span className="inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-white transition group-hover:bg-[#b42318]">
            {active.hasListings ? "View listings" : "Mint now"}
          </span>
        </div>
      </Link>

      {slides.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2" role="tablist" aria-label="Featured drops">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show ${slide.name}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-8 bg-primary" : "w-3 bg-line-strong hover:bg-ink-subtle"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, bar }: { label: string; value: string; bar?: number }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] uppercase tracking-[0.12em] text-ink-subtle">{label}</p>
      <p className="num mt-0.5 truncate font-[family-name:var(--font-mono)] text-[15px] font-medium text-ink">
        {value}
      </p>
      {typeof bar === "number" && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-gold" style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  );
}
