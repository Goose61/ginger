import type { Collection, MintDestination } from "./types";
import type { EvmSpokeChainId } from "./evm-spoke-chains";
import { isEvmAddress } from "./chain-registry";
import { collectionHomeLedger, homeLedgerToMintDestination, isEvmHomeLedger } from "./home-ledger";
import { mintDestinationToSpokeChain } from "./evm-spoke-chains";

export type HomeContract = { ledger: import("./home-ledger").HomeLedger; address: string };

export function collectionHomeContract(collection: Collection): HomeContract | null {
  const ledger = collectionHomeLedger(collection);
  if (ledger === "solana") {
    const core = collection.coreCollectionAddress?.trim();
    if (core && !isEvmAddress(core)) return { ledger, address: core };
    return null;
  }
  const homeEvm = collectionHomeEvmAddress(collection, ledger);
  if (homeEvm) return { ledger, address: homeEvm };
  return null;
}

export function collectionHomeEvmAddress(
  collection: Collection,
  homeLedger?: import("./home-ledger").HomeLedger,
): string | null {
  const ledger = homeLedger ?? collectionHomeLedger(collection);
  if (!isEvmHomeLedger(ledger)) return null;
  if (ledger === "avalanche") {
    const a = collection.onChainCollectionAddress?.trim();
    if (a && isEvmAddress(a)) return a;
    const core = collection.coreCollectionAddress?.trim();
    if (core && isEvmAddress(core)) return core;
    return null;
  }
  const fromHomeField = collection.onChainCollectionAddress?.trim();
  const home = collectionHomeLedger(collection);
  if (home === ledger && fromHomeField && isEvmAddress(fromHomeField)) return fromHomeField;
  const spoke = collection.evmSpokeAddresses?.[ledger]?.trim();
  if (home === ledger && spoke && isEvmAddress(spoke)) return spoke;
  return null;
}

export function collectionSolanaSpokeAddress(collection: Collection): string | null {
  const ledger = collectionHomeLedger(collection);
  if (ledger === "solana") {
    const core = collection.coreCollectionAddress?.trim();
    if (core && !isEvmAddress(core)) return core;
    return null;
  }
  const spoke = collection.solanaSpokeCoreAddress?.trim();
  return spoke && !isEvmAddress(spoke) ? spoke : null;
}

/** Contract used to mint on a destination (spoke or home). */
export function destinationMintContract(
  collection: Collection,
  destination: MintDestination,
): string | null {
  if (destination === "avalanche_l1") return null;
  const homeDest = homeLedgerToMintDestination(collectionHomeLedger(collection));
  if (destination === "solana") {
    if (homeDest === "solana") return collectionSolanaSpokeAddress(collection);
    return collectionSolanaSpokeAddress(collection);
  }
  const spoke = mintDestinationToSpokeChain(destination);
  if (!spoke) return null;
  if (destination === homeDest) return collectionHomeEvmAddress(collection);
  return collectionSpokeAddress(collection, spoke);
}

export function collectionSpokeAddress(
  collection: Collection,
  spokeChain: EvmSpokeChainId,
): string | null {
  const home = collectionHomeLedger(collection);
  if (spokeChain === home) {
    return collectionHomeEvmAddress(collection, spokeChain);
  }
  if (spokeChain === "avalanche") {
    const a = collection.onChainCollectionAddress?.trim();
    if (a && isEvmAddress(a)) return a;
    if (home === "avalanche") {
      return collectionHomeEvmAddress(collection, "avalanche");
    }
    const addr = collection.evmSpokeAddresses?.avalanche?.trim();
    return addr && isEvmAddress(addr) ? addr : null;
  }
  const addr = collection.evmSpokeAddresses?.[spokeChain]?.trim();
  return addr && isEvmAddress(addr) ? addr : null;
}

export function mergeSpokeAddress(
  collection: Collection,
  spokeChain: EvmSpokeChainId,
  address: string,
): Collection {
  const home = collectionHomeLedger(collection);
  if (spokeChain === home && isEvmHomeLedger(home)) {
    const next = {
      ...collection,
      onChainCollectionAddress: address,
      homeLedger: home,
      evmSpokeAddresses: {
        ...collection.evmSpokeAddresses,
        [home]: address,
      },
    };
    if (home === "avalanche") {
      next.coreCollectionAddress = address;
    }
    return next;
  }
  if (spokeChain === "avalanche") {
    return {
      ...collection,
      onChainCollectionAddress: address,
    };
  }
  return {
    ...collection,
    evmSpokeAddresses: {
      ...collection.evmSpokeAddresses,
      [spokeChain]: address,
    },
  };
}

export function mergeSolanaSpokeAddress(collection: Collection, address: string): Collection {
  const home = collectionHomeLedger(collection);
  if (home === "solana") {
    return { ...collection, coreCollectionAddress: address };
  }
  return { ...collection, solanaSpokeCoreAddress: address };
}
