import { mintedBarPct, mintedPct } from "./utils";

export function MintProgress({
  minted,
  supply,
  className = "",
  trackClassName = "bg-white/10",
  labelClassName = "text-white/55",
  valueClassName = "text-white/80",
  showLabel = true,
}: {
  minted: number;
  supply: number;
  className?: string;
  trackClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
  showLabel?: boolean;
}) {
  const label = mintedPct({ mintedCount: minted, supply });
  const bar = mintedBarPct({ mintedCount: minted, supply });
  return (
    <div className={className}>
      {showLabel && (
      <div className={`mb-1.5 flex items-baseline justify-between gap-3 text-xs ${labelClassName}`}>
        <span>Minted</span>
        <span className={`font-[family-name:var(--font-mono)] tabular-nums ${valueClassName}`}>
          {minted}/{supply}
          <span className="ml-1.5">{label}%</span>
        </span>
      </div>
      )}
      <div
        className={`h-2 overflow-hidden rounded-full ${trackClassName}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(label)}
        aria-label={`${label}% minted`}
      >
        <div className="h-full rounded-full bg-gold" style={{ width: `${bar}%` }} />
      </div>
    </div>
  );
}
