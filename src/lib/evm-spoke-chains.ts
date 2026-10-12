import type { MintDestination } from "./types";
import {
  EVM_NFT_CHAIN_CATALOG,
  EVM_NFT_CHAIN_IDS,
  envFactoryAddress,
  evmRelayerEnabledForSuffix,
  getEvmNftChainDefinition,
  isEvmNftChainId,
  resolvedChainId,
  resolvedRpcUrl,
  type EvmNftChainDefinition,
  type EvmNftChainId,
} from "./evm-nft-chain-catalog";
import { defineChain } from "viem";
import { getAvalancheFactoryAddress, getAvalancheRpcUrl } from "./avalanche-config";

export type EvmSpokeChainId = EvmNftChainId;

export type EvmSpokeChainMeta = {
  id: EvmSpokeChainId;
  mintDestination: MintDestination;
  label: string;
  nativeSymbol: string;
  chainId: number;
  defaultRpcUrl: string;
  explorerUrl?: string;
  deployReady: boolean;
  mintReady: boolean;
  comingSoon?: boolean;
  openseaSupported?: boolean;
  note?: string;
};

export function evmSpokeChainMeta(id: string): EvmSpokeChainMeta {
  const def = getEvmNftChainDefinition(id);
  if (!def) {
    return evmSpokeChainMeta("avalanche");
  }
  const factory =
    def.id === "avalanche" ? getAvalancheFactoryAddress() : envFactoryAddress(def.envSuffix);
  const deployReady = Boolean(factory);
  const relayerEnvOk = evmRelayerEnabledForSuffix(def.envSuffix);
  const mintReady = def.id === "avalanche" ? relayerEnvOk : deployReady && relayerEnvOk;
  return {
    id: def.id as EvmSpokeChainId,
    mintDestination: def.id as MintDestination,
    label: def.label,
    nativeSymbol: def.nativeSymbol,
    chainId: resolvedChainId(def),
    defaultRpcUrl: resolvedRpcUrl(def),
    explorerUrl: def.explorerUrl,
    deployReady,
    mintReady,
    comingSoon: !deployReady,
    openseaSupported: def.openseaSupported,
    note: deployReady
      ? undefined
      : `Deploy GingerCollectionFactory on ${def.label}, then set EVM_FACTORY_ADDRESS_${def.envSuffix}.`,
  };
}

export const EVM_SPOKE_CHAIN_IDS = EVM_NFT_CHAIN_IDS as EvmSpokeChainId[];

export function listEvmSpokeChains(): EvmSpokeChainMeta[] {
  return EVM_SPOKE_CHAIN_IDS.map((id) => evmSpokeChainMeta(id));
}

export function mintDestinationToSpokeChain(dest: MintDestination): EvmSpokeChainId | null {
  if (dest === "avalanche" || dest === "avalanche_l1") return "avalanche";
  if (isEvmNftChainId(dest)) return dest as EvmSpokeChainId;
  return null;
}

export function isExtendedMintDestination(value: unknown): value is MintDestination {
  if (value === "solana" || value === "avalanche_l1") return true;
  return isEvmNftChainId(String(value));
}

export function rpcUrlForSpokeChain(id: EvmSpokeChainId | string): string {
  const def = getEvmNftChainDefinition(id);
  if (!def) return getAvalancheRpcUrl();
  if (def.id === "avalanche") return getAvalancheRpcUrl();
  return resolvedRpcUrl(def);
}

export function factoryAddressForSpokeChain(id: EvmSpokeChainId | string): string {
  const def = getEvmNftChainDefinition(id);
  if (!def || def.id === "avalanche") return getAvalancheFactoryAddress();
  return envFactoryAddress(def.envSuffix);
}

export function parseEvmSpokeChain(raw: unknown): EvmSpokeChainId {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (isEvmNftChainId(id)) return id as EvmSpokeChainId;
  return "avalanche";
}

export function viemChainForSpokeId(id: EvmSpokeChainId | string) {
  const def = getEvmNftChainDefinition(id);
  if (!def) return viemChainFromDefinition(getEvmNftChainDefinition("avalanche")!);
  return viemChainFromDefinition(def);
}

function viemChainFromDefinition(def: EvmNftChainDefinition) {
  const id = resolvedChainId(def);
  const rpc = resolvedRpcUrl(def);
  return defineChain({
    id,
    name: def.label,
    nativeCurrency: { name: def.nativeSymbol, symbol: def.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
    blockExplorers: def.explorerUrl
      ? { default: { name: "Explorer", url: def.explorerUrl } }
      : undefined,
  });
}

export { EVM_NFT_CHAIN_CATALOG, isEvmNftChainId, getEvmNftChainDefinition };
