import type { ChainKey, Collection, MintDestination, TokenLocation } from "./types";
import { EVM_NFT_CHAIN_CATALOG, EVM_NFT_CHAIN_IDS, isEvmNftChainId } from "./evm-nft-chain-catalog";
import {
  collectionHomeLedger,
  homeLedgerToChainKey,
  homeLedgerToMintDestination,
  parseHomeLedger,
  type HomeLedger,
  universalHomeEnabled,
} from "./home-ledger";
import { evmSpokeChainMeta, mintDestinationToSpokeChain, rpcUrlForSpokeChain } from "./evm-spoke-chains";
import {
  avalancheL1MintEnabled,
  getAvalancheChainId,
  getAvalancheNetwork,
  getAvalancheRpcUrl,
  snowtraceAddressUrl,
  snowtraceNftUrl,
  snowtraceTxUrl,
  type AvalancheNetwork,
} from "./avalanche-config";
import { explorerClusterQuery, getSolanaNetwork } from "./solana-config";

export type AddressFamily = "ed25519" | "evm";

export type ChainDescriptor = {
  key: ChainKey | MintDestination;
  label: string;
  nativeSymbol: string;
  addressFamily: AddressFamily;
  mintDestination: MintDestination;
};

export const LAUNCH_HOME_CHAINS: ChainKey[] = ["solana", "avalanche"];

/** Solana + every catalog EVM when universal home is enabled; else legacy Solana + Avalanche. */
export const LAUNCH_HOME_OPTIONS: HomeLedger[] = universalHomeEnabled()
  ? (["solana", ...EVM_NFT_CHAIN_IDS] as HomeLedger[])
  : (["solana", "avalanche"] as HomeLedger[]);

export { parseHomeLedger, collectionHomeLedger, homeLedgerToMintDestination, type HomeLedger };

export const MINT_DESTINATIONS: MintDestination[] = [
  "solana",
  ...EVM_NFT_CHAIN_CATALOG.map((c) => c.id as MintDestination),
  "avalanche_l1",
];

function buildChainDescriptors(): Record<MintDestination, ChainDescriptor> {
  const out = {
    solana: {
      key: "solana" as const,
      label: "Solana",
      nativeSymbol: "SOL",
      addressFamily: "ed25519" as AddressFamily,
      mintDestination: "solana" as const,
    },
    avalanche_l1: {
      key: "avalanche_l1" as const,
      label: "Avalanche L1",
      nativeSymbol: "AVAX",
      addressFamily: "evm" as AddressFamily,
      mintDestination: "avalanche_l1" as const,
    },
  } as Record<MintDestination, ChainDescriptor>;

  for (const def of EVM_NFT_CHAIN_CATALOG) {
    const id = def.id as MintDestination;
    out[id] = {
      key: id,
      label: def.label,
      nativeSymbol: def.nativeSymbol,
      addressFamily: "evm",
      mintDestination: id,
    };
  }
  return out;
}

export const CHAIN_DESCRIPTORS: Record<MintDestination, ChainDescriptor> = buildChainDescriptors();

export function collectionHomeChain(collection: Pick<Collection, "chain" | "homeChain" | "homeLedger">): ChainKey {
  return homeLedgerToChainKey(collectionHomeLedger(collection));
}

export function collectionMintDestinations(
  collection: Pick<
    Collection,
    "chain" | "homeChain" | "homeLedger" | "mintDestinations" | "l1RemoteAddress"
  >,
): MintDestination[] {
  const home = homeLedgerToMintDestination(collectionHomeLedger(collection));
  const listed = collection.mintDestinations?.filter(isMintDestination) ?? [];
  const set = new Set<MintDestination>([home, ...listed]);
  return MINT_DESTINATIONS.filter((d) => {
    if (!set.has(d)) return false;
    if (d !== "avalanche_l1") return true;
    if (collection.l1RemoteAddress?.trim()) return true;
    return avalancheL1MintEnabled();
  });
}

export type CollectionContractLink = {
  id: string;
  label: string;
  address: string;
  href: string;
  explorerName: string;
};

export function shortenAddress(address: string, head = 6, tail = 4): string {
  const a = address.trim();
  if (a.length <= head + tail + 1) return a;
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

export type ExplorerUrlOpts = {
  solanaClusterQuery?: string;
  avalancheNetwork?: AvalancheNetwork;
};

export function collectionContractLinks(
  collection: Pick<
    Collection,
    | "chain"
    | "homeChain"
    | "homeLedger"
    | "coreCollectionAddress"
    | "onChainCollectionAddress"
    | "solanaSpokeCoreAddress"
    | "evmSpokeAddresses"
    | "l1RemoteAddress"
  >,
  opts?: ExplorerUrlOpts,
): CollectionContractLink[] {
  const ledger = collectionHomeLedger(collection);
  const links: CollectionContractLink[] = [];
  const seen = new Set<string>();

  const add = (id: string, label: string, address: string | undefined, dest: MintDestination) => {
    const a = address?.trim();
    if (!a) return;
    const key = a.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const explorerName =
      dest === "solana"
        ? "Solana Explorer"
        : dest === "avalanche" || dest === "avalanche_l1"
          ? "Snowtrace"
          : CHAIN_DESCRIPTORS[dest]?.label ?? "Explorer";
    links.push({
      id,
      label,
      address: a,
      href: explorerAddressUrl(dest, a, opts),
      explorerName,
    });
  };

  const homeDest = homeLedgerToMintDestination(ledger);
  const core = collection.coreCollectionAddress?.trim();
  const evmHome = collection.onChainCollectionAddress?.trim();
  if (homeDest === "solana" && core && !isEvmAddress(core)) {
    add("home", "Solana home", core, "solana");
  } else if (homeDest !== "solana") {
    const homeEvm =
      (ledger === homeDest && evmHome && isEvmAddress(evmHome) ? evmHome : null) ??
      collection.evmSpokeAddresses?.[homeDest as keyof typeof collection.evmSpokeAddresses]?.trim();
    if (homeEvm && isEvmAddress(homeEvm)) {
      add("home", `${CHAIN_DESCRIPTORS[homeDest]?.label ?? homeDest} home`, homeEvm, homeDest);
    }
  }

  if (ledger !== "solana") {
    const solSpoke = collection.solanaSpokeCoreAddress?.trim();
    if (solSpoke && !isEvmAddress(solSpoke)) {
      add("solana-spoke", "Solana destination", solSpoke, "solana");
    }
  }

  for (const dest of MINT_DESTINATIONS) {
    if (dest === homeDest || dest === "avalanche_l1" || dest === "solana") continue;
    const spoke = mintDestinationToSpokeChain(dest);
    if (!spoke) continue;
    let addr = collection.evmSpokeAddresses?.[spoke]?.trim();
    if (dest === "avalanche" && !addr && evmHome && isEvmAddress(evmHome) && ledger !== "avalanche") {
      addr = evmHome;
    }
    if (addr && isEvmAddress(addr)) {
      add(`spoke-${dest}`, `${CHAIN_DESCRIPTORS[dest]?.label ?? dest} spoke`, addr, dest);
    }
  }

  const l1 = collection.l1RemoteAddress;
  if (l1 && isEvmAddress(l1)) {
    add("l1", "Avalanche L1", l1, "avalanche_l1");
  }

  return links;
}

export function homeChainToDestination(chain: ChainKey | HomeLedger): MintDestination {
  if (isEvmNftChainId(String(chain))) return chain as MintDestination;
  if (chain === "avalanche") return "avalanche";
  return "solana";
}

export function isMintDestination(value: unknown): value is MintDestination {
  return value === "solana" || value === "avalanche_l1" || isEvmNftChainId(String(value));
}

export function parseMintDestination(value: unknown, fallback: MintDestination = "solana"): MintDestination {
  return isMintDestination(value) ? value : fallback;
}

export function parseHomeChain(value: unknown): ChainKey {
  if (universalHomeEnabled() && isHomeLedgerValue(value)) {
    return homeLedgerToChainKey(value);
  }
  return value === "avalanche" ? "avalanche" : "solana";
}

function isHomeLedgerValue(value: unknown): value is HomeLedger {
  return value === "solana" || isEvmNftChainId(String(value));
}

export function isEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

export function isDestinationWallet(destination: MintDestination, wallet: string): boolean {
  if (destination === "solana") return !isEvmAddress(wallet) && wallet.length >= 32;
  return isEvmAddress(wallet);
}

function evmExplorerBase(destination: MintDestination): string | null {
  if (destination === "solana") return null;
  if (destination === "avalanche" || destination === "avalanche_l1") {
    return getAvalancheNetwork() === "mainnet" ? "https://snowtrace.io" : "https://testnet.snowtrace.io";
  }
  const spoke = mintDestinationToSpokeChain(destination);
  if (!spoke) return null;
  return evmSpokeChainMeta(spoke).explorerUrl ?? null;
}

export function explorerTxUrl(
  destination: TokenLocation | MintDestination,
  tx: string,
  opts?: ExplorerUrlOpts,
): string {
  if (destination === "solana" || destination === "in_flight") {
    const q = opts?.solanaClusterQuery ?? explorerClusterQuery(getSolanaNetwork());
    return `https://explorer.solana.com/tx/${tx}${q}`;
  }
  if (destination === "avalanche" || destination === "avalanche_l1") {
    return snowtraceTxUrl(tx, opts?.avalancheNetwork);
  }
  const base = evmExplorerBase(destination);
  if (base) return `${base.replace(/\/$/, "")}/tx/${tx}`;
  return snowtraceTxUrl(tx, opts?.avalancheNetwork);
}

export function explorerAddressUrl(
  destination: MintDestination | ChainKey,
  address: string,
  opts?: ExplorerUrlOpts,
): string {
  if (destination === "solana") {
    const q = opts?.solanaClusterQuery ?? explorerClusterQuery(getSolanaNetwork());
    return `https://explorer.solana.com/address/${address}${q}`;
  }
  if (destination === "avalanche" || destination === "avalanche_l1") {
    return snowtraceAddressUrl(address, opts?.avalancheNetwork);
  }
  const dest = destination as MintDestination;
  if (isMintDestination(dest)) {
    const base = evmExplorerBase(dest);
    if (base) return `${base.replace(/\/$/, "")}/address/${address}`;
  }
  return snowtraceAddressUrl(address, opts?.avalancheNetwork);
}

export function explorerNftUrl(
  destination: TokenLocation | MintDestination,
  contract: string,
  tokenId: number,
  opts?: ExplorerUrlOpts,
): string {
  if (destination === "solana" || destination === "in_flight") {
    const q = opts?.solanaClusterQuery ?? explorerClusterQuery(getSolanaNetwork());
    return `https://explorer.solana.com/address/${contract}${q}`;
  }
  if (destination === "avalanche" || destination === "avalanche_l1") {
    return snowtraceNftUrl(contract, tokenId, opts?.avalancheNetwork);
  }
  if (isMintDestination(destination)) {
    const base = evmExplorerBase(destination);
    if (base) return `${base.replace(/\/$/, "")}/nft/${contract}/${tokenId}`;
  }
  return snowtraceNftUrl(contract, tokenId, opts?.avalancheNetwork);
}

export function chainLabel(chain: ChainKey | MintDestination | TokenLocation | undefined): string {
  if (chain === "in_flight") return "In flight";
  if (chain && isMintDestination(chain)) return CHAIN_DESCRIPTORS[chain].label;
  if (chain === "solana" || !chain) return "Solana";
  return String(chain);
}

export function evmChainIdForDestination(destination: MintDestination): number | null {
  if (destination === "solana") return null;
  if (destination === "avalanche_l1") return getAvalancheChainId();
  const spoke = mintDestinationToSpokeChain(destination);
  if (spoke) return evmSpokeChainMeta(spoke).chainId;
  return getAvalancheChainId();
}

export function evmRpcForDestination(destination: MintDestination): string | null {
  if (destination === "solana") return null;
  if (destination === "avalanche_l1") {
    const l1 = process.env.AVALANCHE_L1_RPC_URL?.trim();
    if (l1) return l1;
    if (getAvalancheNetwork() === "fuji") return getAvalancheRpcUrl();
    return null;
  }
  const spoke = mintDestinationToSpokeChain(destination);
  if (spoke) return rpcUrlForSpokeChain(spoke);
  return getAvalancheRpcUrl();
}

export function avalancheNetworkLabel(): string {
  return getAvalancheNetwork() === "mainnet" ? "Avalanche C-Chain" : "Avalanche Fuji";
}
