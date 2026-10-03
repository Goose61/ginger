import { chainLabel } from "@/lib/chain-registry";
import type { TokenLocation } from "@/lib/types";

export function TokenLocationBadge({ location }: { location?: TokenLocation | null }) {
  if (!location) return null;
  const inflight = location === "in_flight";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        inflight ? "bg-amber-500/20 text-amber-200" : "bg-white/10 text-white/80"
      }`}
    >
      {inflight ? "In flight to Avalanche L1" : chainLabel(location)}
    </span>
  );
}
