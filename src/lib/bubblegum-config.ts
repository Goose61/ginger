/**
 * Bubblegum V2 tree + Core collection (BubblegumV2 plugin) for gift cNFTs.
 *
 * @see https://www.metaplex.com/docs/smart-contracts/bubblegum-v2/create-trees
 * @see https://www.metaplex.com/docs/smart-contracts/bubblegum-v2/mint-cnfts
 */

import { getSolanaNetwork, type SolanaNetwork } from "./solana-config";

function envVal(name: string): string {
  return (typeof process !== "undefined" ? process.env[name] : undefined)?.trim() ?? "";
}

function networkSuffix(network: SolanaNetwork): string {
  return network.toUpperCase();
}

/** Merkle tree address created with createTreeV2 (LeafSchemaV2). */
export function getBubblegumTreeAddress(network?: SolanaNetwork): string | null {
  const net = network ?? getSolanaNetwork();
  const specific = envVal(`BUBBLEGUM_TREE_ADDRESS_${networkSuffix(net)}`);
  if (specific) return specific;
  return envVal("BUBBLEGUM_TREE_ADDRESS") || null;
}

/**
 * MPL-Core collection that has the BubblegumV2 plugin.
 * Not the same as CORE_COLLECTION_ADDRESS (uncompressed Core gifts).
 */
export function getBubblegumCollectionAddress(network?: SolanaNetwork): string | null {
  const net = network ?? getSolanaNetwork();
  const specific = envVal(`BUBBLEGUM_COLLECTION_ADDRESS_${networkSuffix(net)}`);
  if (specific) return specific;
  return envVal("BUBBLEGUM_COLLECTION_ADDRESS") || null;
}

export function bubblegumGiftConfigured(network?: SolanaNetwork): boolean {
  return Boolean(getBubblegumTreeAddress(network));
}

export function requireBubblegumTree(network?: SolanaNetwork): string {
  const tree = getBubblegumTreeAddress(network);
  if (!tree) {
    throw new Error(
      "Compressed gift mint is not configured. Run `npm run setup:bubblegum-tree` and set BUBBLEGUM_TREE_ADDRESS.",
    );
  }
  return tree;
}
