import Link from "next/link";
import { ArrowRight, Upload, Tag, Rocket } from "lucide-react";
import {
  FEATURE_ON_MARKET_DAYS,
  FEATURE_ON_MARKET_USD,
  SECONDARY_PLATFORM_FEE_PERCENT,
  formatPlatformFeePercent,
  primaryPlatformFeeLine,
} from "@/lib/platform-fees";
import { CreatorDashboardLink } from "@/components/CreatorDashboardLink";

const STEPS = [
  {
    icon: Upload,
    title: "Upload your art",
    text: "Drop a ZIP of finished images. Ginger fills in names, traits and rarity ranks for you.",
  },
  {
    icon: Tag,
    title: "Set price & fees",
    text: "Price in USD. Collectors pay with SOL or card at a live quote. Royalties are yours to set.",
  },
  {
    icon: Rocket,
    title: "Go live from your wallet",
    text: "Publish permanently to Arweave and mint on Metaplex Core. Milestones unlock resale.",
  },
];

export function LaunchPromo() {
  return (
    <section id="launch" className="scroll-mt-28 overflow-hidden rounded-3xl border border-line bg-surface-1/85 backdrop-blur-sm">
      <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative p-7 sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-primary/15 blur-3xl"
          />
          <p className="eyebrow !text-gold">For creators</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-[2rem] leading-[1.05] tracking-tight text-ink sm:text-[2.5rem]">
            Launch your own collection.
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-ink-body">
            No contracts to write, no metadata to hand-craft. Upload, price, and go live in an
            afternoon. Everything stays in your wallet.
          </p>

          <dl className="mt-6 grid gap-2 text-sm">
            <FeeRow label="Primary mints" value={primaryPlatformFeeLine()} />
            <FeeRow
              label="Resales"
              value={`${formatPlatformFeePercent(SECONDARY_PLATFORM_FEE_PERCENT)}% platform fee`}
            />
            <FeeRow
              label="Featured slot (optional)"
              value={`$${FEATURE_ON_MARKET_USD} · pinned to the homepage for ${FEATURE_ON_MARKET_DAYS} days`}
            />
          </dl>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/launch"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white transition hover:bg-[#b42318]"
            >
              Start a launch
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <CreatorDashboardLink
              className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-sm font-medium text-ink hover:bg-surface-2"
              label="Open creator dashboard"
            />
          </div>
        </div>

        <ol className="grid gap-px border-t border-line bg-line lg:border-l lg:border-t-0">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 bg-surface-1 p-6 sm:p-7">
              <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink">
                <step.icon className="h-5 w-5" aria-hidden />
                <span className="num absolute -left-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold font-[family-name:var(--font-mono)] text-[10px] font-bold text-black">
                  {i + 1}
                </span>
              </span>
              <div>
                <h3 className="text-[16px] font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-ink-muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line/70 pb-2 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="num text-right text-ink">{value}</dd>
    </div>
  );
}
