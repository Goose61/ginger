import type { ChainKey, Collection, MintDestination, TokenLocation } from "./types";
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

export const MINT_DESTINATIONS: MintDestination[] = ["solana", "avalanche", "avalanche_l1"];

export const CHAIN_DESCRIPTORS: Record<MintDestination, ChainDescriptor> = {
  solana: {
    key: "solana",
    label: "Solana",
    nativeSymbol: "SOL",
    addressFamily: "ed25519",
    mintDestination: "solana",
  },
  avalanche: {
    key: "avalanche",
    label: "Avalanche C-Chain",
    nativeSymbol: "AVAX",
    addressFamily: "evm",
    mintDestination: "avalanche",
  },
  avalanche_l1: {
    key: "avalanche_l1",
    label: "Avalanche L1",
    nativeSymbol: "AVAX",
    addressFamily: "evm",
    mintDestination: "avalanche_l1",
  },
};

export function collectionHomeChain(collection: Pick<Collection, "chain" | "homeChain">): ChainKey {
  return collection.homeChain ?? collection.chain ?? "solana";
}

export function collectionMintDestinations(
  collection: Pick<Collection, "chain" | "homeChain" | "mintDestinations" | "l1RemoteAddress">,
): MintDestination[] {
  const home = homeChainToDestination(collectionHomeChain(collection));
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
    "chain" | "homeChain" | "coreCollectionAddress" | "onChainCollectionAddress" | "l1RemoteAddress"
  >,
  opts?: ExplorerUrlOpts,
): CollectionContractLink[] {
  const home = collectionHomeChain(collection);
  const links: CollectionContractLink[] = [];
  const seen = new Set<string>();

  const add = (id: string, label: string, address: string | undefined, dest: MintDestination) => {
    const a = address?.trim();
    if (!a) return;
    const key = a.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      id,
      label,
      address: a,
      href: explorerAddressUrl(dest, a, opts),
      explorerName: dest === "solana" ? "Solana Explorer" : "Snowtrace",
    });
  };

  const core = collection.coreCollectionAddress;
  const evm = collection.onChainCollectionAddress;
  const l1 = collection.l1RemoteAddress;

  if (core && !isEvmAddress(core)) {
    add("solana", "Solana collection", core, "solana");
  }

  const cChain = evm && isEvmAddress(evm) ? evm : core && isEvmAddress(core) ? core : undefined;
  if (cChain) {
    add(
      "c-chain",
      home === "avalanche" ? "C-Chain collection" : "C-Chain destination",
      cChain,
      "avalanche",
    );
  }

  if (l1 && isEvmAddress(l1)) {
    add("l1", "Avalanche L1", l1, "avalanche_l1");
  }

  return links;
}

export function homeChainToDestination(chain: ChainKey): MintDestination {
  if (chain === "avalanche") return "avalanche";
  return "solana";
}

export function isMintDestination(value: unknown): value is MintDestination {
  return value === "solana" || value === "avalanche" || value === "avalanche_l1";
}

export function parseMintDestination(value: unknown, fallback: MintDestination = "solana"): MintDestination {
  return isMintDestination(value) ? value : fallback;
}

export function parseHomeChain(value: unknown): ChainKey {
  return value === "avalanche" ? "avalanche" : "solana";
}

export function isEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
}

export function isDestinationWallet(destination: MintDestination, wallet: string): boolean {
  if (destination === "solana") return !isEvmAddress(wallet) && wallet.length >= 32;
  return isEvmAddress(wallet);
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
  return snowtraceNftUrl(contract, tokenId, opts?.avalancheNetwork);
}

export function chainLabel(chain: ChainKey | MintDestination | TokenLocation | undefined): string {
  if (chain === "avalanche_l1") return "Avalanche L1";
  if (chain === "avalanche") return "Avalanche";
  if (chain === "in_flight") return "In flight";
  if (chain === "solana" || !chain) return "Solana";
  return chain.toUpperCase();
}

export function evmChainIdForDestination(destination: MintDestination): number | null {
  if (destination === "solana") return null;
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
  return getAvalancheRpcUrl();
}

export function avalancheNetworkLabel(): string {
  return getAvalancheNetwork() === "mainnet" ? "Avalanche C-Chain" : "Avalanche Fuji";
}
