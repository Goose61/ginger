/**
 * Browser Canvas compositor for trait-layer collections.
 * Port of server compositor logic without sharp / Vercel Blob.
 */

import { getLayer, putImage } from "@/lib/client-asset-store";
import {
  assertLayerSupply,
  createLayerRng,
  layerDna,
  maxLayerSupply,
  rollUniqueAttributeSets,
  sniffImageMime,
} from "@/lib/layer-catalog";
import { buildTokenMetadataJson } from "@/lib/metadata-builders";
import { parseSidecarJson } from "@/lib/metadata-review";
import { assignRarityRanks } from "@/lib/rarity";
import type { GeneratedToken, LayerCatalog, MetadataCreator, RoyaltySplit } from "@/lib/types";

async function loadLayerBitmap(
  collectionId: string,
  traitType: string,
  value: string,
): Promise<ImageBitmap> {
  const asset = await getLayer(collectionId, traitType, value);
  if (!asset) {
    throw new Error(
      `Missing layer image for ${traitType} / ${value}. Re-upload the layers ZIP in this browser.`,
    );
  }
  const bytes = new Uint8Array(asset.data);
  const type = sniffImageMime(bytes) || asset.contentType || "image/png";
  try {
    return await createImageBitmap(new Blob([bytes], { type }));
  } catch {
    throw new Error(`Could not read the image for ${traitType} / ${value}. Use PNG, JPG, or WebP.`);
  }
}

async function compositeLayers(
  collectionId: string,
  stackOrder: string[],
  attributes: { trait_type: string; value: string | number }[],
): Promise<Blob> {
  const bitmaps: ImageBitmap[] = [];
  try {
    for (const traitType of stackOrder) {
      const attr = attributes.find((entry) => entry.trait_type === traitType);
      if (!attr) continue;
      bitmaps.push(await loadLayerBitmap(collectionId, traitType, String(attr.value)));
    }
    if (bitmaps.length === 0) {
      throw new Error("No trait layers could be drawn. Re-upload the layers ZIP.");
    }

    const width = Math.max(...bitmaps.map((bitmap) => bitmap.width));
    const height = Math.max(...bitmaps.map((bitmap) => bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.clearRect(0, 0, width, height);
    for (const bitmap of bitmaps) {
      ctx.drawImage(bitmap, 0, 0);
    }

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to composite image"))),
        "image/png",
      );
    });
  } finally {
    for (const bitmap of bitmaps) bitmap.close();
  }
}

export type ClientGenerateOptions = {
  collectionId: string;
  name: string;
  description: string;
  nameTemplate: string;
  symbol?: string;
  supply: number;
  stackOrder: string[];
  layers: LayerCatalog[];
  creatorWallet: string;
  sellerFeeBps: number;
  royaltySplit?: RoyaltySplit;
  royaltyCreators?: MetadataCreator[];
  seed?: number;
  previewCount?: number;
  uniqueness?: boolean;
  onProgress?: (done: number, total: number) => void;
};

/** Generate preview composites (does not persist to IndexedDB). */
export async function generatePreviewsClient(
  opts: ClientGenerateOptions,
): Promise<{ tokenId: number; image: string; attributes: GeneratedToken["attributes"] }[]> {
  const available = maxLayerSupply(opts.layers, opts.stackOrder);
  if (available < 1) {
    throw new Error("Every trait value has weight 0. Set at least one weight above 0 on each trait.");
  }
  const count = Math.max(1, Math.min(opts.previewCount ?? 12, opts.supply || available, available));
  const sets = rollUniqueAttributeSets({
    stackOrder: opts.stackOrder,
    layers: opts.layers,
    count,
    rng: createLayerRng(opts.seed),
  });
  const previews: { tokenId: number; image: string; attributes: GeneratedToken["attributes"] }[] = [];

  for (let i = 0; i < sets.length; i++) {
    const attributes = sets[i];
    const blob = await compositeLayers(opts.collectionId, opts.stackOrder, attributes);
    previews.push({
      tokenId: i + 1,
      image: URL.createObjectURL(blob),
      attributes,
    });
  }
  return previews;
}

/** Generate full collection; writes PNGs to IndexedDB. Returns tokens without Arweave URIs. */
export async function generateFullCollectionClient(
  opts: ClientGenerateOptions,
): Promise<GeneratedToken[]> {
  const count = assertLayerSupply(opts.layers, opts.stackOrder, opts.previewCount ?? opts.supply);
  const sets = rollUniqueAttributeSets({
    stackOrder: opts.stackOrder,
    layers: opts.layers,
    count,
    rng: createLayerRng(opts.seed),
  });
  const tokens: GeneratedToken[] = [];

  for (let i = 0; i < sets.length; i++) {
    const attributes = sets[i];
    const tokenId = i + 1;
    const blob = await compositeLayers(opts.collectionId, opts.stackOrder, attributes);
    const buf = await blob.arrayBuffer();
    await putImage(opts.collectionId, tokenId, buf, "image/png");

    tokens.push({
      tokenId,
      dna: layerDna(attributes),
      attributes,
      imageRelPath: `images/${tokenId}.png`,
      metadataRelPath: `metadata/${tokenId}.json`,
    });

    opts.onProgress?.(tokenId, count);
  }

  const ranked = assignRarityRanks(tokens);
  for (const token of ranked) {
    const metaName = opts.nameTemplate
      .replace("{name}", opts.name)
      .replace("{id}", String(token.tokenId));
    const metadata = buildTokenMetadataJson({
      name: metaName,
      symbol: opts.symbol || opts.name.slice(0, 8).toUpperCase(),
      description: opts.description,
      sellerFeeBps: opts.sellerFeeBps,
      image: token.imageRelPath,
      attributes: token.attributes,
      creatorWallet: opts.creatorWallet,
      royaltySplit: opts.royaltySplit,
      royaltyCreators: opts.royaltyCreators,
    });
    token.sidecar = parseSidecarJson(metadata);
  }

  return ranked;
}

export function revokePreviewUrls(
  previews: { image: string }[],
): void {
  for (const p of previews) {
    if (p.image.startsWith("blob:")) URL.revokeObjectURL(p.image);
  }
}
