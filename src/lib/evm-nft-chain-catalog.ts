/**
 * EVM chains commonly used for NFTs (aligned with OpenSea SDK chain IDs + major L2s).
 * Sources: https://docs.opensea.io/, opensea-js chain.ts, chain official docs.
 * Override RPC via env `EVM_RPC_URL_<ENV_SUFFIX>` and factory via `EVM_FACTORY_ADDRESS_<ENV_SUFFIX>`.
 */

export type EvmNftChainDefinition = {
  /** Internal spoke key (matches MintDestination for EVM). */
  id: string;
  label: string;
  nativeSymbol: string;
  /** Mainnet chain ID unless `testnetChainId` is used via env toggle. */
  chainId: number;
  testnetChainId?: number;
  /** Env suffix for EVM_FACTORY_ADDRESS_* and EVM_RPC_URL_* */
  envSuffix: string;
  defaultRpcUrl: string;
  testnetRpcUrl?: string;
  explorerUrl?: string;
  /** When set, `EVM_CHAIN_<ENV_SUFFIX>_NETWORK=mainnet|testnet` picks IDs/RPC (Robinhood, etc.). */
  networkToggleEnv?: string;
  openseaSupported?: boolean;
};

/** Solana + Avalanche L1 are not in this catalog. */
export const EVM_NFT_CHAIN_CATALOG: EvmNftChainDefinition[] = [
  {
    id: "avalanche",
    label: "Avalanche C-Chain",
    nativeSymbol: "AVAX",
    chainId: 43114,
    testnetChainId: 43113,
    envSuffix: "AVALANCHE",
    defaultRpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    testnetRpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    explorerUrl: "https://snowtrace.io",
    openseaSupported: true,
  },
  {
    id: "ethereum",
    label: "Ethereum",
    nativeSymbol: "ETH",
    chainId: 1,
    envSuffix: "ETHEREUM",
    defaultRpcUrl: "https://ethereum.publicnode.com",
    explorerUrl: "https://etherscan.io",
    openseaSupported: true,
  },
  {
    id: "polygon",
    label: "Polygon",
    nativeSymbol: "POL",
    chainId: 137,
    envSuffix: "POLYGON",
    defaultRpcUrl: "https://polygon-rpc.com",
    explorerUrl: "https://polygonscan.com",
    openseaSupported: true,
  },
  {
    id: "base",
    label: "Base",
    nativeSymbol: "ETH",
    chainId: 8453,
    envSuffix: "BASE",
    defaultRpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    openseaSupported: true,
  },
  {
    id: "arbitrum",
    label: "Arbitrum One",
    nativeSymbol: "ETH",
    chainId: 42161,
    envSuffix: "ARBITRUM",
    defaultRpcUrl: "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    openseaSupported: true,
  },
  {
    id: "optimism",
    label: "Optimism",
    nativeSymbol: "ETH",
    chainId: 10,
    envSuffix: "OPTIMISM",
    defaultRpcUrl: "https://mainnet.optimism.io",
    explorerUrl: "https://optimistic.etherscan.io",
    openseaSupported: true,
  },
  {
    id: "bsc",
    label: "BNB Smart Chain",
    nativeSymbol: "BNB",
    chainId: 56,
    envSuffix: "BSC",
    defaultRpcUrl: "https://bsc-dataseed.binance.org",
    explorerUrl: "https://bscscan.com",
    openseaSupported: false,
  },
  {
    id: "zora",
    label: "Zora",
    nativeSymbol: "ETH",
    chainId: 7777777,
    envSuffix: "ZORA",
    defaultRpcUrl: "https://rpc.zora.energy",
    explorerUrl: "https://explorer.zora.energy",
    openseaSupported: true,
  },
  {
    id: "blast",
    label: "Blast",
    nativeSymbol: "ETH",
    chainId: 81457,
    envSuffix: "BLAST",
    defaultRpcUrl: "https://rpc.blast.io",
    explorerUrl: "https://blastscan.io",
    openseaSupported: true,
  },
  {
    id: "scroll",
    label: "Scroll",
    nativeSymbol: "ETH",
    chainId: 534352,
    envSuffix: "SCROLL",
    defaultRpcUrl: "https://rpc.scroll.io",
    explorerUrl: "https://scrollscan.com",
    openseaSupported: false,
  },
  {
    id: "linea",
    label: "Linea",
    nativeSymbol: "ETH",
    chainId: 59144,
    envSuffix: "LINEA",
    defaultRpcUrl: "https://rpc.linea.build",
    explorerUrl: "https://lineascan.build",
    openseaSupported: false,
  },
  {
    id: "zksync",
    label: "zkSync Era",
    nativeSymbol: "ETH",
    chainId: 324,
    envSuffix: "ZKSYNC",
    defaultRpcUrl: "https://mainnet.era.zksync.io",
    explorerUrl: "https://explorer.zksync.io",
    openseaSupported: false,
  },
  {
    id: "mantle",
    label: "Mantle",
    nativeSymbol: "MNT",
    chainId: 5000,
    envSuffix: "MANTLE",
    defaultRpcUrl: "https://rpc.mantle.xyz",
    explorerUrl: "https://mantlescan.xyz",
    openseaSupported: false,
  },
  {
    id: "apechain",
    label: "ApeChain",
    nativeSymbol: "APE",
    chainId: 33139,
    envSuffix: "APECHAIN",
    defaultRpcUrl: "https://rpc.apechain.com/http",
    explorerUrl: "https://apescan.io",
    openseaSupported: true,
  },
  {
    id: "berachain",
    label: "Berachain",
    nativeSymbol: "BERA",
    chainId: 80094,
    envSuffix: "BERACHAIN",
    defaultRpcUrl: "https://rpc.berachain.com",
    explorerUrl: "https://berascan.com",
    openseaSupported: true,
  },
  {
    id: "abstract",
    label: "Abstract",
    nativeSymbol: "ETH",
    chainId: 2741,
    envSuffix: "ABSTRACT",
    defaultRpcUrl: "https://api.mainnet.abs.xyz",
    explorerUrl: "https://abscan.org",
    openseaSupported: true,
  },
  {
    id: "unichain",
    label: "Unichain",
    nativeSymbol: "ETH",
    chainId: 130,
    envSuffix: "UNICHAIN",
    defaultRpcUrl: "https://mainnet.unichain.org",
    explorerUrl: "https://uniscan.xyz",
    openseaSupported: true,
  },
  {
    id: "ronin",
    label: "Ronin",
    nativeSymbol: "RON",
    chainId: 2020,
    envSuffix: "RONIN",
    defaultRpcUrl: "https://api.roninchain.com/rpc",
    explorerUrl: "https://app.roninchain.com",
    openseaSupported: true,
  },
  {
    id: "shape",
    label: "Shape",
    nativeSymbol: "ETH",
    chainId: 360,
    envSuffix: "SHAPE",
    defaultRpcUrl: "https://mainnet.shape.network",
    explorerUrl: "https://shapescan.xyz",
    openseaSupported: true,
  },
  {
    id: "b3",
    label: "B3",
    nativeSymbol: "ETH",
    chainId: 8333,
    envSuffix: "B3",
    defaultRpcUrl: "https://mainnet-rpc.b3.fun",
    explorerUrl: "https://explorer.b3.fun",
    openseaSupported: true,
  },
  {
    id: "gunzilla",
    label: "GUNZ",
    nativeSymbol: "GUN",
    chainId: 43419,
    envSuffix: "GUNZILLA",
    defaultRpcUrl: "https://rpc.gunzchain.io",
    explorerUrl: "https://gunzscan.io",
    openseaSupported: true,
  },
  {
    id: "hyperevm",
    label: "HyperEVM",
    nativeSymbol: "HYPE",
    chainId: 999,
    envSuffix: "HYPEREVM",
    defaultRpcUrl: "https://rpc.hyperliquid.xyz/evm",
    explorerUrl: "https://hyperevmscan.io",
    openseaSupported: true,
  },
  {
    id: "somnia",
    label: "Somnia",
    nativeSymbol: "SOMI",
    chainId: 5031,
    envSuffix: "SOMNIA",
    defaultRpcUrl: "https://api.infra.mainnet.somnia.network",
    explorerUrl: "https://explorer.somnia.network",
    openseaSupported: true,
  },
  {
    id: "monad",
    label: "Monad",
    nativeSymbol: "MON",
    chainId: 143,
    envSuffix: "MONAD",
    defaultRpcUrl: "https://rpc.monad.xyz",
    explorerUrl: "https://monadvision.com",
    openseaSupported: true,
  },
  {
    id: "megaeth",
    label: "MegaETH",
    nativeSymbol: "ETH",
    chainId: 4326,
    envSuffix: "MEGAETH",
    defaultRpcUrl: "https://mainnet.megaeth.com/rpc",
    explorerUrl: "https://megaeth.blockscout.com",
    openseaSupported: true,
  },
  {
    id: "soneium",
    label: "Soneium",
    nativeSymbol: "ETH",
    chainId: 1868,
    envSuffix: "SONEIUM",
    defaultRpcUrl: "https://rpc.soneium.org",
    explorerUrl: "https://soneium.blockscout.com",
    openseaSupported: true,
  },
  {
    id: "sei",
    label: "Sei",
    nativeSymbol: "SEI",
    chainId: 1329,
    envSuffix: "SEI",
    defaultRpcUrl: "https://evm-rpc.sei-apis.com",
    explorerUrl: "https://seitrace.com",
    openseaSupported: true,
  },
  {
    id: "flow",
    label: "Flow EVM",
    nativeSymbol: "FLOW",
    chainId: 747,
    envSuffix: "FLOW",
    defaultRpcUrl: "https://mainnet.evm.nodes.onflow.org",
    explorerUrl: "https://evm.flowscan.io",
    openseaSupported: true,
  },
  {
    id: "robinhood",
    label: "Robinhood Chain",
    nativeSymbol: "ETH",
    chainId: 4663,
    testnetChainId: 46630,
    envSuffix: "ROBINHOOD",
    defaultRpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    testnetRpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    networkToggleEnv: "ROBINHOOD",
    openseaSupported: true,
  },
];

export const EVM_NFT_CHAIN_IDS = EVM_NFT_CHAIN_CATALOG.map((c) => c.id);

export type EvmNftChainId = (typeof EVM_NFT_CHAIN_IDS)[number];

export function getEvmNftChainDefinition(id: string): EvmNftChainDefinition | undefined {
  return EVM_NFT_CHAIN_CATALOG.find((c) => c.id === id);
}

export function isEvmNftChainId(id: string): boolean {
  return EVM_NFT_CHAIN_CATALOG.some((c) => c.id === id);
}

function envNetworkIsTestnet(envSuffix: string): boolean {
  if (typeof process === "undefined") return false;
  const e = process.env;
  if (envSuffix === "AVALANCHE") {
    const n = e.AVALANCHE_NETWORK ?? e.NEXT_PUBLIC_AVALANCHE_NETWORK ?? "fuji";
    return n !== "mainnet";
  }
  if (envSuffix === "ROBINHOOD") {
    const n = e.ROBINHOOD_CHAIN_NETWORK ?? e.NEXT_PUBLIC_ROBINHOOD_CHAIN_NETWORK ?? "testnet";
    return n !== "mainnet";
  }
  const key = `EVM_CHAIN_${envSuffix}_NETWORK`;
  const v = e[key]?.toLowerCase();
  return v === "testnet" || v === "fuji" || v === "sepolia";
}

export function resolvedChainId(def: EvmNftChainDefinition): number {
  if (def.testnetChainId && envNetworkIsTestnet(def.envSuffix)) return def.testnetChainId;
  return def.chainId;
}

export function resolvedRpcUrl(def: EvmNftChainDefinition): string {
  const e: Record<string, string | undefined> =
    typeof process !== "undefined" ? (process.env as Record<string, string | undefined>) : {};
  const rpcKey = `EVM_RPC_URL_${def.envSuffix}`;
  const fromEnv = e[rpcKey]?.trim();
  if (fromEnv) return fromEnv;
  if (def.id === "avalanche") {
    return envNetworkIsTestnet("AVALANCHE")
      ? def.testnetRpcUrl ?? def.defaultRpcUrl
      : def.defaultRpcUrl;
  }
  if (def.testnetChainId && envNetworkIsTestnet(def.envSuffix)) {
    return def.testnetRpcUrl ?? def.defaultRpcUrl;
  }
  return def.defaultRpcUrl;
}

/** Default true when factory is configured; set `EVM_RELAYER_ENABLED_<SUFFIX>=false` to disable. */
export function evmRelayerEnabledForSuffix(envSuffix: string): boolean {
  if (typeof process === "undefined") return true;
  const raw = process.env[`EVM_RELAYER_ENABLED_${envSuffix}`]?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return true;
}

export function envFactoryAddress(envSuffix: string): string {
  if (typeof process === "undefined") return "";
  const e = process.env;
  if (envSuffix === "AVALANCHE") {
    const net = envNetworkIsTestnet("AVALANCHE") ? "FUJI" : "MAINNET";
    return (
      e[`AVALANCHE_FACTORY_ADDRESS_${net}`] ??
      e.AVALANCHE_FACTORY_ADDRESS ??
      ""
    ).trim();
  }
  return (e[`EVM_FACTORY_ADDRESS_${envSuffix}`] ?? e[`${envSuffix}_FACTORY_ADDRESS`] ?? "").trim();
}
