import type { Collection, MintDestination, MintExecutionMode } from "./types";
import { collectionMintDestinations } from "./chain-registry";
import {
  OMNICHAIN_PLATFORM_SURCHARGE_PERCENT,
  OMNICHAIN_RELAYER_BUFFER_USD,
} from "./platform-fees";
import { collectionSolanaSpokeAddress, collectionSpokeAddress } from "./collection-spoke";
import { collectionHomeLedger, homeLedgerToMintDestination, isEvmHomeLedger } from "./home-ledger";
import { getPlatformSecretKey } from "./platform-key";
import { evmSpokeChainMeta, mintDestinationToSpokeChain } from "./evm-spoke-chains";
import { avalancheL1MintEnabled } from "./avalanche-config";
import { registeredL1Remote } from "./l1-allowlist";

export function collectionOmnichainEnabled(
  collection: Pick<Collection, "omnichainMintEnabled" | "mintDestinations" | "chain" | "homeChain" | "l1RemoteAddress">,
): boolean {
  if (collection.omnichainMintEnabled === false) return false;
  const dests = collectionMintDestinations(collection);
  return dests.length > 1 || collection.omnichainMintEnabled === true;
}

export function mintIsOffHome(collection: Collection, destination: MintDestination): boolean {
  const homeDest = homeLedgerToMintDestination(collectionHomeLedger(collection));
  return destination !== homeDest;
}

/** Destination mint where Ginger can pay gas via platform keys (server + collection). */
export function supportsRelayerExecution(
  collection: Collection,
  destination: MintDestination,
): boolean {
  if (destination === "solana") {
    if (collectionHomeLedger(collection) === "solana") return false;
    if (!getPlatformSecretKey()) return false;
    return Boolean(collectionSolanaSpokeAddress(collection));
  }
  if (destination === "avalanche_l1") {
    if (!avalancheL1MintEnabled()) return false;
    return Boolean(registeredL1Remote(collection));
  }
  const spoke = mintDestinationToSpokeChain(destination);
  if (!spoke) return false;
  const meta = evmSpokeChainMeta(spoke);
  if (!meta.mintReady) return false;
  return Boolean(collectionSpokeAddress(collection, spoke));
}

export function relayerExecutionAvailable(
  collection: Collection,
  destination: MintDestination,
): boolean {
  if (!collectionOmnichainEnabled(collection)) return false;
  return supportsRelayerExecution(collection, destination);
}

export function omnichainPlatformSurchargeUsd(mintUsd: number): number {
  return (mintUsd * OMNICHAIN_PLATFORM_SURCHARGE_PERCENT) / 100;
}

export function quoteRelayerLineItems(params: {
  mintUsd: number;
  destGasUsd: number;
  homeDebitUsd: number;
  executionMode: MintExecutionMode;
  relayerAvailable: boolean;
}): { relayerUsd: number; omnichainFeeUsd: number; bufferUsd: number } {
  if (params.executionMode !== "relayer" || !params.relayerAvailable) {
    return { relayerUsd: 0, omnichainFeeUsd: 0, bufferUsd: 0 };
  }
  const omnichainFeeUsd = omnichainPlatformSurchargeUsd(params.mintUsd);
  const relayerUsd = params.destGasUsd + params.homeDebitUsd + OMNICHAIN_RELAYER_BUFFER_USD;
  return { relayerUsd, omnichainFeeUsd, bufferUsd: OMNICHAIN_RELAYER_BUFFER_USD };
}

export function mintCheckoutUsd(params: {
  mintUsd: number;
  executionMode: MintExecutionMode;
  relayerUsd: number;
  omnichainFeeUsd: number;
}): number {
  if (params.executionMode === "relayer") {
    return params.mintUsd + params.relayerUsd + params.omnichainFeeUsd;
  }
  return params.mintUsd;
}
