import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import sharp from "sharp";
import JSZip from "jszip";
import type { GeneratedToken, LayerCatalog, MetadataCreator, RoyaltySplit } from "./types";
import {
  tmpImagesDir,
  tmpMetadataDir,
  tmpLayersDir,
  blobLayerPath,
  blobImagePath,
  blobMetadataPath,
} from "./paths";
import { uploadBlob, uploadBlobText, downloadBlobToTmp } from "./blob-storage";
import { buildTokenMetadataJson } from "./metadata-builders";
import { parseSidecarJson } from "./metadata-review";
import { assignRarityRanks } from "./rarity";
import {
  assertLayerSupply,
  catalogFromLayerFiles,
  createLayerRng,
  layerDna,
  parseLayerPath,
  rollUniqueAttributeSets,
} from "./layer-catalog";

export { assignRarityRanks };

export type ParsedZip = {
  layers: LayerCatalog[];
  stackOrder: string[];
  files: {
    traitType: string;
    value: string;
    weight: number;
    fileName: string;
    contentType: string;
    buffer: Buffer;
  }[];
};

export async function parseLayerZip(buffer: Buffer): Promise<ParsedZip> {
  const zip = await JSZip.loadAsync(buffer);
  const files: ParsedZip["files"] = [];

  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const parsed = parseLayerPath(entryPath);
    if (!parsed) continue;
    files.push({
      traitType: parsed.traitType,
      value: parsed.value,
      weight: parsed.weight,
      fileName: parsed.fileName,
      contentType: parsed.contentType,
      buffer: Buffer.from(await entry.async("uint8array")),
    });
  }

  const { layers, stackOrder } = catalogFromLayerFiles(files);
  return { layers, stackOrder, files };
}

/** Upload parsed layer files to Blob (or local staging in dev) and return layers with blobUrls. */
export async function persistLayerFiles(
  collectionId: string,
  parsed: ParsedZip,
): Promise<LayerCatalog[]> {
  const urls = new Map<string, string>();

  for (const file of parsed.files) {
    const blobPath = blobLayerPath(collectionId, file.traitType, file.value);
    const url = await uploadBlob(blobPath, file.buffer, file.contentType || "image/png");
    urls.set(`${file.traitType}\0${file.value}`, url);
  }

  return parsed.layers.map((layer) => ({
    ...layer,
    values: layer.values.map((value) => ({
      ...value,
      blobUrl: urls.get(`${layer.traitType}\0${value.value}`) ?? value.blobUrl,
    })),
  }));
}

/** Ensure a layer file is present in /tmp; download from Blob if needed. */
async function ensureLayerFile(
  traitType: string,
  value: string,
  blobUrl: string | undefined,
  collectionId: string,
): Promise<string | null> {
  const localPath = path.join(tmpLayersDir(collectionId), traitType, `${value}.png`);
  if (existsSync(localPath)) return localPath;
  if (!blobUrl) return null;
  try {
    await downloadBlobToTmp(blobUrl, localPath);
    return localPath;
  } catch {
    return null;
  }
}

export type GenerateOptions = {
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
};

export async function generateCollection(opts: GenerateOptions) {
  const count = assertLayerSupply(opts.layers, opts.stackOrder, opts.previewCount ?? opts.supply);
  const sets = rollUniqueAttributeSets({
    stackOrder: opts.stackOrder,
    layers: opts.layers,
    count,
    rng: createLayerRng(opts.seed),
  });
  const imagesDir = tmpImagesDir(opts.collectionId);
  const metaDir = tmpMetadataDir(opts.collectionId);
  await mkdir(imagesDir, { recursive: true });
  await mkdir(metaDir, { recursive: true });

  const layersByType = new Map(opts.layers.map((l) => [l.traitType, l]));
  const tokens: GeneratedToken[] = [];

  for (let i = 0; i < sets.length; i++) {
    const attributes = sets[i];
    const tokenId = i + 1;
    const dna = layerDna(attributes);

    const buffers: Buffer[] = [];
    for (const attr of attributes) {
      const layer = layersByType.get(attr.trait_type);
      const layerValue = layer?.values.find((v) => v.value === attr.value);
      const filePath = await ensureLayerFile(
        attr.trait_type,
        attr.value,
        layerValue?.blobUrl,
        opts.collectionId,
      );
      if (!filePath) {
        throw new Error(`Missing layer image for ${attr.trait_type} / ${attr.value}.`);
      }
      try {
        buffers.push(await sharp(filePath).ensureAlpha().png().toBuffer());
      } catch {
        throw new Error(`Could not read the image for ${attr.trait_type} / ${attr.value}. Use PNG, JPG, or WebP.`);
      }
    }

    const metas = await Promise.all(buffers.map((input) => sharp(input).metadata()));
    const width = Math.max(...metas.map((meta) => meta.width ?? 1));
    const height = Math.max(...metas.map((meta) => meta.height ?? 1));
    const imageBuffer = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(buffers.map((input) => ({ input, left: 0, top: 0 })))
      .png()
      .toBuffer();

    const imageRelPath = `images/${tokenId}.png`;
    const localImagePath = path.join(imagesDir, `${tokenId}.png`);
    await writeFile(localImagePath, imageBuffer);

    // Upload generated image to Blob immediately
    const imageUri = await uploadBlob(
      blobImagePath(opts.collectionId, tokenId),
      imageBuffer,
      "image/png",
    );

    const token: GeneratedToken = {
      tokenId,
      dna,
      attributes,
      imageRelPath,
      metadataRelPath: `metadata/${tokenId}.json`,
      imageUri,
    };
    tokens.push(token);
  }

  const ranked = assignRarityRanks(tokens);
  for (const token of ranked) {
    const name = opts.nameTemplate
      .replace("{name}", opts.name)
      .replace("{id}", String(token.tokenId));
    const metadata = buildTokenMetadataJson({
      name,
      symbol: opts.symbol || opts.name.slice(0, 8).toUpperCase(),
      description: opts.description,
      sellerFeeBps: opts.sellerFeeBps,
      image: token.imageUri ?? token.imageRelPath,
      attributes: token.attributes,
      creatorWallet: opts.creatorWallet,
      royaltySplit: opts.royaltySplit,
      royaltyCreators: opts.royaltyCreators,
    });
    const metaJson = JSON.stringify(metadata, null, 2);
    const localMetaPath = path.join(metaDir, `${token.tokenId}.json`);
    await writeFile(localMetaPath, metaJson);

    token.metadataUri = await uploadBlobText(
      blobMetadataPath(opts.collectionId, token.tokenId),
      metaJson,
    );
    token.sidecar = parseSidecarJson(metadata);
  }

  return ranked;
}

export async function tokenPreviewPng(collectionId: string, tokenId: number) {
  const localPath = path.join(tmpImagesDir(collectionId), `${tokenId}.png`);
  if (existsSync(localPath)) return localPath;
  return null;
}

/** Read a generated image for inline preview (returns Buffer or null). */
export async function readGeneratedImageBuffer(collectionId: string, tokenId: number): Promise<Buffer | null> {
  const localPath = path.join(tmpImagesDir(collectionId), `${tokenId}.png`);
  if (existsSync(localPath)) {
    return readFile(localPath);
  }
  return null;
}
