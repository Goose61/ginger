/**
 * Trait-layer ZIP parsing and unique combination draws.
 * Shared by the browser wizard and the server compositor.
 */

import type { LayerCatalog } from "@/lib/types";

export const MAX_LAYER_SUPPLY = 10_000;

/** Above this, combinations are sampled without building the full index list. */
const ENUM_LIMIT = 250_000;

const SKIP = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;
const APPLE_DOUBLE = /(^|\/)\._/;

export type ParsedLayerPath = {
  traitType: string;
  value: string;
  weight: number;
  fileName: string;
  contentType: string;
};

export type LayerAttribute = { trait_type: string; value: string };

export function imageContentType(fileName: string): string {
  if (/\.webp$/i.test(fileName)) return "image/webp";
  if (/\.jpe?g$/i.test(fileName)) return "image/jpeg";
  return "image/png";
}

/** Browser decoders reject a Blob whose MIME does not match the bytes. */
export function sniffImageMime(data: Uint8Array): string {
  if (data.length >= 4 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/png";
}

/**
 * `TraitType/Value.png`. A HashLips weight suffix (`Blue#50.png`) sets the
 * draw weight and is not part of the trait value written into metadata.
 */
export function parseTraitFileStem(fileName: string): { value: string; weight: number } | null {
  const stem = fileName.replace(/\.(png|webp|jpe?g)$/i, "").trim();
  if (!stem || stem.startsWith(".")) return null;
  const hash = stem.lastIndexOf("#");
  if (hash > 0) {
    const value = stem.slice(0, hash).trim();
    const weightRaw = stem.slice(hash + 1).trim();
    const weight = Number(weightRaw);
    if (value && weightRaw !== "" && Number.isFinite(weight) && weight >= 0) {
      return { value, weight: Math.round(weight) };
    }
  }
  return { value: stem, weight: 100 };
}

export function parseLayerPath(entryPath: string): ParsedLayerPath | null {
  const normalized = entryPath.replace(/\\/g, "/");
  if (SKIP.test(normalized) || APPLE_DOUBLE.test(normalized)) return null;
  if (!/\.(png|webp|jpe?g)$/i.test(normalized)) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const fileName = parts[parts.length - 1];
  if (!fileName || fileName.startsWith(".")) return null;
  const traitType = parts[parts.length - 2].trim();
  if (!traitType || traitType.startsWith(".")) return null;
  const parsed = parseTraitFileStem(fileName);
  if (!parsed) return null;
  return {
    traitType,
    value: parsed.value,
    weight: parsed.weight,
    fileName,
    contentType: imageContentType(fileName),
  };
}

function numericFolderPrefix(name: string): number | null {
  const match = /^(\d+)[.\-_ ]+/.exec(name);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/** Numbered folders (`01-Background`) stack in numeric order. Otherwise ZIP order is kept. */
export function orderTraitTypes(typesInSeenOrder: string[]): string[] {
  if (typesInSeenOrder.length < 2) return typesInSeenOrder.slice();
  const prefixes = typesInSeenOrder.map(numericFolderPrefix);
  if (!prefixes.every((n) => n != null)) return typesInSeenOrder.slice();
  return typesInSeenOrder
    .map((traitType, index) => ({ traitType, n: prefixes[index] as number, index }))
    .sort((a, b) => a.n - b.n || a.index - b.index)
    .map((row) => row.traitType);
}

export function catalogFromLayerFiles(
  files: { traitType: string; value: string; weight: number; fileName: string }[],
): { layers: LayerCatalog[]; stackOrder: string[] } {
  const seenOrder: string[] = [];
  const byType = new Map<string, Map<string, { fileName: string; weight: number }>>();
  for (const file of files) {
    if (!byType.has(file.traitType)) {
      byType.set(file.traitType, new Map());
      seenOrder.push(file.traitType);
    }
    byType.get(file.traitType)!.set(file.value, {
      fileName: file.fileName,
      weight: file.weight,
    });
  }
  const stackOrder = orderTraitTypes(seenOrder);
  const layers: LayerCatalog[] = stackOrder.map((traitType) => ({
    traitType,
    values: Array.from(byType.get(traitType)!.entries()).map(([value, meta]) => ({
      value,
      fileName: meta.fileName,
      weight: meta.weight,
    })),
  }));
  return { layers, stackOrder };
}

function traitOrder(layers: LayerCatalog[], stackOrder?: string[]): string[] {
  if (stackOrder && stackOrder.length > 0) return stackOrder;
  return layers.map((layer) => layer.traitType);
}

function valuesFor(
  layers: LayerCatalog[],
  traitType: string,
  positiveWeightsOnly: boolean,
): LayerCatalog["values"] {
  const layer = layers.find((entry) => entry.traitType === traitType);
  const values = layer?.values ?? [];
  if (!positiveWeightsOnly) return values;
  const positive = values.filter((value) => value.weight > 0);
  return positive.length > 0 ? positive : values;
}

/** Product of trait-value counts. `null` when the product exceeds a safe integer. */
export function layerCombinationCount(
  layers: LayerCatalog[],
  stackOrder?: string[],
  options?: { positiveWeightsOnly?: boolean },
): number | null {
  const order = traitOrder(layers, stackOrder);
  if (order.length === 0) return 0;
  let count = 1;
  for (const traitType of order) {
    const n = valuesFor(layers, traitType, Boolean(options?.positiveWeightsOnly)).length;
    if (n <= 0) return 0;
    if (count > Number.MAX_SAFE_INTEGER / n) return null;
    count *= n;
  }
  return count;
}

export function weightsAreUniform(layers: LayerCatalog[]): boolean {
  const weights = layers.flatMap((layer) => layer.values.map((value) => value.weight));
  if (weights.length === 0) return true;
  return weights.every((weight) => weight === weights[0]);
}

/** How many NFTs these layers can produce (capped at 10,000). */
export function maxLayerSupply(layers: LayerCatalog[], stackOrder?: string[]): number {
  const full = layerCombinationCount(layers, stackOrder);
  if (full == null) return MAX_LAYER_SUPPLY;
  const usable = weightsAreUniform(layers)
    ? full
    : (layerCombinationCount(layers, stackOrder, { positiveWeightsOnly: true }) ?? full);
  return Math.max(0, Math.min(MAX_LAYER_SUPPLY, usable));
}

export function assertLayerSupply(
  layers: LayerCatalog[],
  stackOrder: string[] | undefined,
  supply: number,
): number {
  const max = maxLayerSupply(layers, stackOrder);
  const n = Math.floor(Number(supply));
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(max < 1
      ? "Every trait value has weight 0. Set at least one weight above 0 on each trait."
      : "Supply must be at least 1.");
  }
  if (n > max) {
    const full = layerCombinationCount(layers, stackOrder);
    const capped = full == null || full > MAX_LAYER_SUPPLY;
    throw new Error(
      capped && n > MAX_LAYER_SUPPLY
        ? `Supply is capped at ${MAX_LAYER_SUPPLY.toLocaleString()} NFTs.`
        : `Supply ${n.toLocaleString()} is higher than ${max.toLocaleString()} unique trait combinations. Lower supply or raise trait weights.`,
    );
  }
  return n;
}

export function layerDna(attributes: { trait_type: string; value: string | number }[]): string {
  return attributes.map((attr) => `${attr.trait_type}=${attr.value}`).join("|");
}

export function createLayerRng(seed?: number): () => number {
  let state = seed ?? (Date.now() % 1_000_000);
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(values: LayerCatalog["values"], rng: () => number): LayerCatalog["values"][number] | undefined {
  const pool = values.filter((value) => value.weight > 0);
  const usable = pool.length > 0 ? pool : values;
  if (usable.length === 0) return undefined;
  const total = usable.reduce((sum, value) => sum + Math.max(0, value.weight), 0);
  if (total <= 0) return usable[Math.min(usable.length - 1, Math.floor(rng() * usable.length))];
  let roll = rng() * total;
  for (const value of usable) {
    roll -= Math.max(0, value.weight);
    if (roll <= 0) return value;
  }
  return usable[usable.length - 1];
}

function attributesFromIndex(
  index: number,
  stackOrder: string[],
  layers: LayerCatalog[],
  positiveWeightsOnly: boolean,
): LayerAttribute[] {
  const attrs: LayerAttribute[] = new Array(stackOrder.length);
  let rest = index;
  for (let i = stackOrder.length - 1; i >= 0; i--) {
    const traitType = stackOrder[i];
    const values = valuesFor(layers, traitType, positiveWeightsOnly);
    const n = Math.max(1, values.length);
    const digit = rest % n;
    rest = Math.floor(rest / n);
    attrs[i] = { trait_type: traitType, value: values[digit]?.value ?? "None" };
  }
  return attrs;
}

function fisherYatesPartial(total: number, count: number, rng: () => number): number[] {
  const arr = new Array<number>(total);
  for (let i = 0; i < total; i++) arr[i] = i;
  const take = Math.min(count, total);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(rng() * (total - i));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr.slice(0, take);
}

function combinationWeight(
  index: number,
  stackOrder: string[],
  layers: LayerCatalog[],
  positiveWeightsOnly: boolean,
): number {
  let rest = index;
  let weight = 1;
  for (let i = stackOrder.length - 1; i >= 0; i--) {
    const values = valuesFor(layers, stackOrder[i], positiveWeightsOnly);
    const n = Math.max(1, values.length);
    const digit = rest % n;
    rest = Math.floor(rest / n);
    const valueWeight = values[digit]?.weight ?? 0;
    if (valueWeight <= 0) return 0;
    weight *= valueWeight;
  }
  return weight;
}

function weightedSampleIndices(
  total: number,
  count: number,
  rng: () => number,
  stackOrder: string[],
  layers: LayerCatalog[],
  positiveWeightsOnly: boolean,
): number[] {
  const scored: { index: number; key: number }[] = [];
  for (let index = 0; index < total; index++) {
    const weight = combinationWeight(index, stackOrder, layers, positiveWeightsOnly);
    if (weight <= 0) continue;
    scored.push({ index, key: Math.pow(rng(), 1 / weight) });
  }
  if (scored.length < count) {
    throw new Error(
      `Only ${scored.length.toLocaleString()} combinations have a weight above 0, but supply is ${count.toLocaleString()}. Raise weights or lower supply.`,
    );
  }
  scored.sort((a, b) => b.key - a.key);
  return scored.slice(0, count).map((row) => row.index);
}

function rejectionSample(
  count: number,
  stackOrder: string[],
  layers: LayerCatalog[],
  rng: () => number,
): LayerAttribute[][] {
  const seen = new Set<string>();
  const out: LayerAttribute[][] = [];
  const limit = Math.max(count * 80, count + 500);
  let guard = 0;
  while (out.length < count && guard < limit) {
    guard += 1;
    const attributes = stackOrder.map((traitType) => {
      const values = valuesFor(layers, traitType, true);
      const picked = pickWeighted(values, rng);
      return { trait_type: traitType, value: picked?.value ?? "None" };
    });
    const dna = layerDna(attributes);
    if (seen.has(dna)) continue;
    seen.add(dna);
    out.push(attributes);
  }
  if (out.length < count) {
    throw new Error(
      `Could not draw ${count.toLocaleString()} unique combinations. Lower supply or add more trait values.`,
    );
  }
  return out;
}

/**
 * Unique trait sets for a layer collection.
 * When supply equals the combination count, every combination is used once
 * (shuffled). Weighted draws are used only when supply is smaller than the
 * full set and weights differ.
 */
export function rollUniqueAttributeSets(opts: {
  stackOrder: string[];
  layers: LayerCatalog[];
  count: number;
  rng: () => number;
}): LayerAttribute[][] {
  const { stackOrder, layers, count, rng } = opts;
  if (stackOrder.length === 0 || layers.length === 0) {
    throw new Error("No trait layers to generate from. Re-upload the layers ZIP.");
  }
  const uniform = weightsAreUniform(layers);
  const positiveOnly = !uniform;
  const total = layerCombinationCount(layers, stackOrder, {
    positiveWeightsOnly: positiveOnly,
  });
  if (total == null || total > ENUM_LIMIT) {
    return rejectionSample(count, stackOrder, layers, rng);
  }
  if (total < 1) {
    throw new Error("Every trait value has weight 0. Set at least one weight above 0 on each trait.");
  }
  if (count > total) {
    throw new Error(
      `Supply ${count.toLocaleString()} is higher than ${total.toLocaleString()} unique trait combinations.`,
    );
  }
  const indices = uniform || count === total
    ? fisherYatesPartial(total, count, rng)
    : weightedSampleIndices(total, count, rng, stackOrder, layers, positiveOnly);
  return indices.map((index) => attributesFromIndex(index, stackOrder, layers, positiveOnly));
}
