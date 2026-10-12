import type { EvmNftChainId } from "./evm-nft-chain-catalog";
import { isEvmNftChainId } from "./evm-nft-chain-catalog";
import type { ChainKey, Collection } from "./types";

/** Canonical supply ledger: Solana Core or GingerNft on one EVM chain. */
export type HomeLedger = "solana" | EvmNftChainId;

export function universalHomeEnabled(): boolean {
  if (typeof process === "undefined") return false;
  const v = process.env.OMNICHAIN_UNIVERSAL_HOME ?? process.env.NEXT_PUBLIC_OMNICHAIN_UNIVERSAL_HOME;
  return v === "true" || v === "1";
}

export function isHomeLedger(value: unknown): value is HomeLedger {
  return value === "solana" || isEvmNftChainId(String(value));
}

export function parseHomeLedger(raw: unknown, fallback: HomeLedger = "solana"): HomeLedger {
  if (isHomeLedger(raw)) return raw;
  return fallback;
}

/** Backfill from legacy `homeChain` / `chain`. */
export function collectionHomeLedger(
  collection: Pick<Collection, "homeLedger" | "homeChain" | "chain">,
): HomeLedger {
  if (collection.homeLedger && isHomeLedger(collection.homeLedger)) {
    return collection.homeLedger;
  }
  const legacy = collection.homeChain ?? collection.chain ?? "solana";
  if (legacy === "avalanche") return "avalanche";
  if (legacy === "solana") return "solana";
  if (universalHomeEnabled() && isEvmNftChainId(String(legacy))) {
    return legacy as EvmNftChainId;
  }
  return "solana";
}

export function homeLedgerToMintDestination(ledger: HomeLedger): import("./types").MintDestination {
  return ledger;
}

export function isEvmHomeLedger(ledger: HomeLedger): ledger is EvmNftChainId {
  return ledger !== "solana";
}

/** Legacy market / payments field. */
export function homeLedgerToChainKey(ledger: HomeLedger): ChainKey {
  if (ledger === "solana") return "solana";
  if (ledger === "avalanche") return "avalanche";
  if (ledger === "ethereum") return "ethereum";
  if (ledger === "base") return "base";
  if (ledger === "polygon") return "polygon";
  return "avalanche";
}

export function syncHomeFieldsFromLedger(ledger: HomeLedger): {
  homeLedger: HomeLedger;
  homeChain: ChainKey;
  chain: ChainKey;
} {
  const homeChain = homeLedgerToChainKey(ledger);
  return { homeLedger: ledger, homeChain, chain: homeChain };
}
