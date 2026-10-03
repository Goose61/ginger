/**
 * Avalanche C-Chain configuration (Fuji testnet / mainnet).
 */

export type AvalancheNetwork = "fuji" | "mainnet";

export const AVALANCHE_CHAIN_ID_FUJI = 43113;
export const AVALANCHE_CHAIN_ID_MAINNET = 43114;

export const AVALANCHE_RPC_FUJI = "https://api.avax-test.network/ext/bc/C/rpc";
export const AVALANCHE_RPC_MAINNET = "https://api.avax.network/ext/bc/C/rpc";

type EnvLike = Record<string, string | undefined>;

function env(): EnvLike {
  return typeof process !== "undefined" ? process.env : {};
}

export function getAvalancheNetwork(from?: EnvLike): AvalancheNetwork {
  const e = from ?? env();
  const raw =
    typeof window === "undefined"
      ? (e.AVALANCHE_NETWORK ?? e.NEXT_PUBLIC_AVALANCHE_NETWORK ?? "fuji")
      : (e.NEXT_PUBLIC_AVALANCHE_NETWORK ?? e.AVALANCHE_NETWORK ?? "fuji");
  return raw === "mainnet" ? "mainnet" : "fuji";
}

export function parseAvalancheNetwork(value: unknown): AvalancheNetwork {
  return value === "mainnet" ? "mainnet" : "fuji";
}

export function getAvalancheChainId(network?: AvalancheNetwork, from?: EnvLike): number {
  const net = network ?? getAvalancheNetwork(from);
  return net === "mainnet" ? AVALANCHE_CHAIN_ID_MAINNET : AVALANCHE_CHAIN_ID_FUJI;
}

export function getAvalancheRpcUrl(network?: AvalancheNetwork, from?: EnvLike): string {
  const e = from ?? env();
  const net = network ?? getAvalancheNetwork(e);
  if (net === "fuji") {
    return e.AVALANCHE_RPC_URL_FUJI ?? e.NEXT_PUBLIC_AVALANCHE_RPC_URL_FUJI ?? AVALANCHE_RPC_FUJI;
  }
  return e.AVALANCHE_RPC_URL_MAINNET ?? e.NEXT_PUBLIC_AVALANCHE_RPC_URL_MAINNET ?? AVALANCHE_RPC_MAINNET;
}

export function isFujiNetwork(network?: AvalancheNetwork): boolean {
  return (network ?? getAvalancheNetwork()) === "fuji";
}

export function snowtraceTxUrl(txHash: string, network?: AvalancheNetwork): string {
  const net = network ?? getAvalancheNetwork();
  const host = net === "mainnet" ? "https://snowtrace.io" : "https://testnet.snowtrace.io";
  return `${host}/tx/${txHash}`;
}

export function snowtraceAddressUrl(address: string, network?: AvalancheNetwork): string {
  const net = network ?? getAvalancheNetwork();
  const host = net === "mainnet" ? "https://snowtrace.io" : "https://testnet.snowtrace.io";
  return `${host}/address/${address}`;
}

export function snowtraceNftUrl(
  contract: string,
  tokenId: number,
  network?: AvalancheNetwork,
): string {
  const net = network ?? getAvalancheNetwork();
  const host = net === "mainnet" ? "https://snowtrace.io" : "https://testnet.snowtrace.io";
  return `${host}/nft/${contract}/${tokenId}`;
}

export function getAvalancheFactoryAddress(from?: EnvLike): string {
  const e = from ?? env();
  const net = getAvalancheNetwork(e);
  if (net === "mainnet") {
    return (e.AVALANCHE_FACTORY_ADDRESS_MAINNET ?? e.AVALANCHE_FACTORY_ADDRESS ?? "").trim();
  }
  return (e.AVALANCHE_FACTORY_ADDRESS_FUJI ?? e.AVALANCHE_FACTORY_ADDRESS ?? "").trim();
}

export function getAvalancheL1RemoteAddress(from?: EnvLike): string {
  const e = from ?? env();
  return (e.AVALANCHE_L1_REMOTE_ADDRESS ?? "").trim();
}

export function getAvalancheL1RpcUrl(from?: EnvLike): string {
  const e = from ?? env();
  return (e.AVALANCHE_L1_RPC_URL ?? "").trim();
}

/**
 * Fuji uses the C-Chain ICNFTT stub. Mainnet L1 minting requires a dedicated
 * L1 RPC — never the C-Chain URL, which would double-mint on C-Chain.
 */
export function avalancheL1MintEnabled(from?: EnvLike): boolean {
  const e = from ?? env();
  if (!getAvalancheL1RemoteAddress(e)) return false;
  if (getAvalancheNetwork(e) === "fuji") return true;
  const l1Rpc = getAvalancheL1RpcUrl(e).replace(/\/$/, "");
  if (!l1Rpc) return false;
  const cChain = getAvalancheRpcUrl("mainnet", e).replace(/\/$/, "");
  if (l1Rpc === cChain) return false;
  if (/api\.avax\.network/i.test(l1Rpc)) return false;
  return true;
}

export function getEvmMinterPrivateKey(from?: EnvLike): string {
  const e = from ?? env();
  return (e.AVALANCHE_MINTER_KEY ?? "").trim();
}

/** Prepaid gas / mint-proceeds wallet on C-Chain. Defaults to the minter key address. */
export function getAvalanchePlatformWallet(from?: EnvLike): string {
  const e = from ?? env();
  return (e.AVALANCHE_PLATFORM_WALLET ?? "").trim();
}
