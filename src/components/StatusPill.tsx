import type { MarketStatus } from "@/lib/market-view";

export function StatusPill({ status, className = "" }: { status: MarketStatus; className?: string }) {
  const map: Record<MarketStatus, { label: string; cls: string }> = {
    minting: { label: "Minting", cls: "bg-up/15 text-up" },
    listed: { label: "Listed", cls: "bg-gold/15 text-gold" },
    sold_out: { label: "Sold out", cls: "bg-surface-3 text-ink-muted" },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.02em] ${cls} ${className}`}
    >
      {label}
    </span>
  );
}
