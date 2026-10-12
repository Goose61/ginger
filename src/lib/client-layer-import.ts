/**
 * Parse trait-layer ZIP in the browser and store layer images in IndexedDB.
 */

import JSZip from "jszip";
import { putLayer } from "@/lib/client-asset-store";
import { MAX_CLIENT_ZIP_BYTES } from "@/lib/client-zip-import";
import { catalogFromLayerFiles, parseLayerPath, type ParsedLayerPath } from "@/lib/layer-catalog";
import type { LayerCatalog } from "@/lib/types";

export type ClientLayerImportProgress = {
  phase: "reading" | "parsing" | "storing";
  done: number;
  total: number;
};

export type ClientLayerImportResult = {
  layers: LayerCatalog[];
  stackOrder: string[];
};

export async function parseLayerZipClient(
  file: File,
  collectionId: string,
  onProgress?: (p: ClientLayerImportProgress) => void,
): Promise<ClientLayerImportResult> {
  if (file.size > MAX_CLIENT_ZIP_BYTES) {
    throw new Error("Upload too large (max 500 MB)");
  }

  onProgress?.({ phase: "reading", done: 0, total: 1 });
  const buffer = await file.arrayBuffer();

  onProgress?.({ phase: "parsing", done: 0, total: 1 });
  const zip = await JSZip.loadAsync(buffer);
  const parsed: ParsedLayerPath[] = [];
  const bytes = new Map<string, { data: Uint8Array; contentType: string }>();

  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const layer = parseLayerPath(entryPath);
    if (!layer) continue;
    parsed.push(layer);
    const data = await entry.async("uint8array");
    bytes.set(`${layer.traitType}\0${layer.value}`, { data, contentType: layer.contentType });
  }

  if (parsed.length === 0) {
    throw new Error("No layer images found in ZIP (use folders like Background/Blue.png)");
  }

  const { layers, stackOrder } = catalogFromLayerFiles(parsed);
  let stored = 0;
  const total = bytes.size;

  for (const layer of layers) {
    for (const value of layer.values) {
      const asset = bytes.get(`${layer.traitType}\0${value.value}`);
      if (!asset) continue;
      await putLayer(collectionId, layer.traitType, value.value, asset.data, asset.contentType);
      stored += 1;
      onProgress?.({ phase: "storing", done: stored, total });
    }
  }

  return { layers, stackOrder };
}
