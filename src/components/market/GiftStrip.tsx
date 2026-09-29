import Link from "next/link";
import { Gift, ArrowRight } from "lucide-react";
import type { MarketCard } from "@/lib/market-card";

export function GiftStrip({ collection }: { collection: MarketCard }) {
  const n = collection.mintedCount;
  return (
    <section className="bg-transparent">
      <Link
        href="/gift"
        className="group grid overflow-hidden rounded-3xl border border-line bg-surface-1 transition hover:border-line-strong md:grid-cols-[0.8fr_1.2fr]"
      >
        <div className="relative flex min-h-[200px] items-center justify-center overflow-hidden bg-surface-2 p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_100%,rgba(245,197,66,0.14),transparent_70%)]"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={collection.coverSrc}
            alt={collection.name}
            loading="lazy"
            className="relative max-h-52 rounded-2xl object-contain transition duration-500 group-hover:scale-[1.03]"
          />
        </div>
        <div className="flex flex-col justify-center p-6 sm:p-8">
          <p className="eyebrow !text-gold inline-flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5" aria-hidden />
            Gifts
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-[1.75rem] leading-none tracking-tight text-ink sm:text-[2.1rem]">
            Send a one-of-one to any wallet.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink-muted">
            {n === 0
              ? "Upload a single image, add a note, and mint it straight to a friend. Every gift lands in this bundle on the market."
              : `${n} gift${n === 1 ? "" : "s"} sent so far. Upload an image, add a note, and mint it straight to a friend.`}
          </p>
          <span className="mt-6 inline-flex h-10 w-fit items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-medium text-ink transition group-hover:border-ink/40 group-hover:bg-surface-2">
            Send a gift
            <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </Link>
    </section>
  );
}
