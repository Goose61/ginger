import type { Collection, GeneratedToken, MetadataCreator, RoyaltySplit } from "./types";

export function tokenMetadataName(collection: Collection, token: GeneratedToken): string {
  const custom = token.sidecar?.name?.trim();
  if (custom) return custom;
  return metadataNameFromTemplate(collection.name, collection.nameTemplate, token.tokenId);
}

export function metadataNameFromTemplate(
  collectionName: string,
  nameTemplate: string,
  tokenId: number,
): string {
  return nameTemplate
    .replace("{name}", collectionName)
    .replace("{id}", String(tokenId));
}

export function tokenMetadataBps(
  collection: Collection,
  token: GeneratedToken,
  fallbackBps: number,
): number {
  const bps = token.sidecar?.sellerFeeBps;
  if (bps != null && Number.isFinite(bps)) return bps;
  return collection.royaltyBps ?? fallbackBps;
}

export function resolveMetadataCreators(
  creatorWallet: string,
  royaltySplit?: RoyaltySplit,
  royaltyCreators?: MetadataCreator[],
): MetadataCreator[] {
  return buildCreatorsFromRoyaltySplit(creatorWallet, royaltySplit, royaltyCreators);
}

export function buildCreatorsFromRoyaltySplit(
  creatorWallet: string,
  royaltySplit?: RoyaltySplit,
  royaltyCreators?: MetadataCreator[],
): { address: string; share: number }[] {
  if (royaltyCreators && royaltyCreators.length > 0) {
    return royaltyCreators.map((c) => ({
      address: c.address,
      share: c.share,
    }));
  }
  const wallet = creatorWallet || "CREATOR_WALLET";
  if (!royaltySplit) {
    return [{ address: wallet, share: 100 }];
  }
  const entries: { address: string; share: number }[] = [];
  if (royaltySplit.ownerPercent > 0) {
    entries.push({ address: wallet, share: royaltySplit.ownerPercent });
  }
  // Holder and buyback treasuries use platform-managed placeholder addresses in metadata;
  // actual routing is enforced off-chain until on-chain treasury contracts are wired.
  const treasury = process.env.PLATFORM_TREASURY_WALLET ?? wallet;
  if (royaltySplit.holdersPercent > 0) {
    entries.push({ address: treasury, share: royaltySplit.holdersPercent });
  }
  if (royaltySplit.buybackPercent > 0) {
    entries.push({ address: treasury, share: royaltySplit.buybackPercent });
  }
  if (entries.length === 0) return [{ address: wallet, share: 100 }];
  return entries;
}

/** Metaplex Core on-chain names are limited to 32 bytes. */
export function fitCoreAssetName(name: string): string {
  const trimmed = name.trim();
  const bytes = new TextEncoder().encode(trimmed);
  if (bytes.length <= 32) return trimmed;
  let cut = bytes.slice(0, 32);
  while (cut.length > 0 && (cut[cut.length - 1] & 0xc0) === 0x80) {
    cut = cut.slice(0, -1);
  }
  return new TextDecoder().decode(cut);
}

export function buildTokenMetadataJson(opts: {
  name: string;
  symbol: string;
  description: string;
  sellerFeeBps: number;
  image: string;
  attributes: GeneratedToken["attributes"];
  creatorWallet: string;
  royaltySplit?: RoyaltySplit;
  royaltyCreators?: MetadataCreator[];
}): Record<string, unknown> {
  const bps = Math.max(0, Math.min(10_000, Math.round(opts.sellerFeeBps)));
  const attributes = (opts.attributes ?? []).map((attr) => {
    const row: Record<string, unknown> = {
      trait_type: String(attr.trait_type),
      value: attr.value,
    };
    if (attr.display_type) row.display_type = attr.display_type;
    if (attr.max_value != null && Number.isFinite(attr.max_value)) row.max_value = attr.max_value;
    return row;
  });
  return {
    name: opts.name,
    symbol: opts.symbol.trim(),
    description: opts.description,
    seller_fee_basis_points: bps,
    image: opts.image,
    attributes,
    properties: {
      files: [{ uri: opts.image, type: "image/png" }],
      category: "image",
      creators: buildCreatorsFromRoyaltySplit(
        opts.creatorWallet,
        opts.royaltySplit,
        opts.royaltyCreators,
      ).map((creator) => ({
        address: creator.address,
        share: Math.round(creator.share),
      })),
    },
  };
}
