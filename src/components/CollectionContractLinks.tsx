import { collectionContractLinks, shortenAddress } from "@/lib/chain-registry";
import type { AvalancheNetwork } from "@/lib/avalanche-config";
import type { Collection } from "@/lib/types";

export function CollectionContractLinks({
  collection,
  solanaClusterQuery,
  avalancheNetwork,
  variant = "inline",
}: {
  collection: Collection;
  solanaClusterQuery?: string;
  avalancheNetwork?: AvalancheNetwork;
  variant?: "inline" | "tile";
}) {
  const links = collectionContractLinks(collection, {
    solanaClusterQuery,
    avalancheNetwork,
  });
  if (links.length === 0) return null;

  if (variant === "tile") {
    return (
      <div className="mt-4 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
        <p className="text-xs font-medium text-white/80">Collection contract</p>
        <ul className="mt-2 space-y-2.5">
          {links.map((link) => (
            <li key={link.id}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                title={`${link.label} on ${link.explorerName}: ${link.address}`}
                className="block break-all font-mono text-xs text-white/80 hover:text-primary hover:underline"
              >
                <span className="mb-0.5 block font-sans text-[10px] tracking-wide text-white/45">
                  {link.label}
                </span>
                {link.address}
                <span className="ml-1 text-white/40">↗</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <ul className="mt-3 space-y-1.5 text-left">
      {links.map((link) => (
        <li key={link.id}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            title={`${link.label} on ${link.explorerName}: ${link.address}`}
            className="inline-flex max-w-full items-baseline gap-2 font-[family-name:var(--font-mono)] text-[11px] tracking-tight text-white/50 transition-colors hover:text-primary hover:underline"
          >
            <span className="shrink-0 text-white/35">{link.label}</span>
            <span className="truncate">{shortenAddress(link.address)}</span>
            <span className="shrink-0 text-white/30">↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
