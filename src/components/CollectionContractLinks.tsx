import { collectionContractLinks, shortenAddress } from "@/lib/chain-registry";
import type { AvalancheNetwork } from "@/lib/avalanche-config";
import type { Collection } from "@/lib/types";

export function CollectionContractLinks({
  collection,
  solanaClusterQuery,
  avalancheNetwork,
}: {
  collection: Collection;
  solanaClusterQuery?: string;
  avalancheNetwork?: AvalancheNetwork;
}) {
  const links = collectionContractLinks(collection, {
    solanaClusterQuery,
    avalancheNetwork,
  });
  if (links.length === 0) return null;

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
