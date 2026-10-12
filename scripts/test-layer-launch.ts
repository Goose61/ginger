/**
 * Trait-layer launch: ZIP parsing, unique combinations, and generated metadata.
 * Run: npx tsx scripts/test-layer-launch.ts
 */
import assert from "node:assert/strict";
import JSZip from "jszip";
import { buildImportingCollectionStub } from "../src/lib/import-collection-stub";
import {
  assertLayerSupply,
  catalogFromLayerFiles,
  createLayerRng,
  layerDna,
  maxLayerSupply,
  parseLayerPath,
  rollUniqueAttributeSets,
} from "../src/lib/layer-catalog";
import { buildTokenMetadataJson, fitCoreAssetName } from "../src/lib/metadata-builders";
import { metadataReviewBlocksLaunch, reviewCollectionMetadata } from "../src/lib/metadata-review";
import { parseLayerZip } from "../src/lib/compositor";
import type { LayerCatalog } from "../src/lib/types";

function layersFrom(spec: Record<string, { value: string; weight?: number }[]>): {
  layers: LayerCatalog[];
  stackOrder: string[];
} {
  const files = Object.entries(spec).flatMap(([traitType, values]) =>
    values.map((value) => ({
      traitType,
      value: value.value,
      weight: value.weight ?? 100,
      fileName: `${value.value}.png`,
    })),
  );
  return catalogFromLayerFiles(files);
}

function uniqueDnas(sets: { trait_type: string; value: string }[][]): Set<string> {
  return new Set(sets.map((set) => layerDna(set)));
}

const parsedWeight = parseLayerPath("Background/Blue#40.png");
assert.ok(parsedWeight);
assert.equal(parsedWeight.traitType, "Background");
assert.equal(parsedWeight.value, "Blue");
assert.equal(parsedWeight.weight, 40);
assert.equal(parsedWeight.contentType, "image/png");

const parsedJpeg = parseLayerPath("layers/Eyes/Laser.jpg");
assert.ok(parsedJpeg);
assert.equal(parsedJpeg.traitType, "Eyes");
assert.equal(parsedJpeg.value, "Laser");
assert.equal(parsedJpeg.weight, 100);
assert.equal(parsedJpeg.contentType, "image/jpeg");

assert.equal(parseLayerPath("Blue.png"), null);
assert.equal(parseLayerPath("__MACOSX/Background/Blue.png"), null);
assert.equal(parseLayerPath("Background/._Blue.png"), null);

const ordered = catalogFromLayerFiles([
  { traitType: "02-Hat", value: "Crown", weight: 100, fileName: "Crown.png" },
  { traitType: "01-Background", value: "Blue", weight: 100, fileName: "Blue.png" },
  { traitType: "01-Background", value: "Red", weight: 20, fileName: "Red#20.png" },
]);
assert.deepEqual(ordered.stackOrder, ["01-Background", "02-Hat"]);
assert.equal(ordered.layers[0].values.find((value) => value.value === "Red")?.weight, 20);

const full = layersFrom({
  Background: [{ value: "A" }, { value: "B" }, { value: "C" }, { value: "D" }, { value: "E" }, { value: "F" }, { value: "G" }, { value: "H" }],
  Body: [{ value: "A" }, { value: "B" }, { value: "C" }, { value: "D" }, { value: "E" }, { value: "F" }, { value: "G" }, { value: "H" }],
  Eyes: [{ value: "A" }, { value: "B" }, { value: "C" }, { value: "D" }, { value: "E" }, { value: "F" }, { value: "G" }, { value: "H" }],
});
assert.equal(maxLayerSupply(full.layers, full.stackOrder), 512);
const all = rollUniqueAttributeSets({
  ...full,
  count: 512,
  rng: createLayerRng(7),
});
assert.equal(all.length, 512);
assert.equal(uniqueDnas(all).size, 512);
assert.ok(all.every((set) => set.length === 3));

const weighted = layersFrom({
  Background: [{ value: "Blue", weight: 0 }, { value: "Red", weight: 100 }],
  Body: [{ value: "Ape", weight: 100 }, { value: "Robot", weight: 100 }],
});
assert.equal(maxLayerSupply(weighted.layers, weighted.stackOrder), 2);
assert.throws(() => assertLayerSupply(weighted.layers, weighted.stackOrder, 4));
const picked = rollUniqueAttributeSets({
  ...weighted,
  count: 2,
  rng: createLayerRng(3),
});
assert.equal(uniqueDnas(picked).size, 2);
assert.ok(picked.every((set) => set.find((attr) => attr.trait_type === "Background")?.value === "Red"));

async function main() {
  const zip = new JSZip();
zip.file("Blue.png", Buffer.from("nope"));
zip.file("Background/Blue#40.png", Buffer.from("png"));
zip.file("Background/Red.jpg", Buffer.from("jpg"));
zip.file("Body/Ape.webp", Buffer.from("webp"));
zip.file("__MACOSX/Body/._Ape.webp", Buffer.from("junk"));
const parsedZip = await parseLayerZip(await zip.generateAsync({ type: "nodebuffer" }));
assert.deepEqual(parsedZip.stackOrder, ["Background", "Body"]);
assert.equal(parsedZip.layers[0].values.find((value) => value.value === "Blue")?.weight, 40);
assert.equal(parsedZip.files.find((file) => file.value === "Red")?.contentType, "image/jpeg");
assert.equal(parsedZip.files.some((file) => file.value.includes("._")), false);
assert.equal(maxLayerSupply(parsedZip.layers, parsedZip.stackOrder), 2);

const metadata = buildTokenMetadataJson({
  name: "Layers #1",
  symbol: " LYR ",
  description: "Generated from trait layers",
  sellerFeeBps: 500.4,
  image: "https://arweave.net/example",
  attributes: [
    { trait_type: "Background", value: "Blue" },
    { trait_type: "Body", value: "Ape" },
    { trait_type: "Rarity Rank", value: 1, display_type: "number", max_value: 4 },
  ],
  creatorWallet: "CreatorWallet111111111111111111111111111",
  royaltyCreators: [{ address: "CreatorWallet111111111111111111111111111", share: 100 }],
});
assert.equal(metadata.name, "Layers #1");
assert.equal(metadata.symbol, "LYR");
assert.equal(metadata.description, "Generated from trait layers");
assert.equal(metadata.seller_fee_basis_points, 500);
assert.equal(metadata.image, "https://arweave.net/example");
const properties = metadata.properties as {
  files: { uri: string; type: string }[];
  category: string;
  creators: { address: string; share: number }[];
};
assert.equal(properties.files[0].uri, "https://arweave.net/example");
assert.equal(properties.files[0].type, "image/png");
assert.equal(properties.category, "image");
assert.equal(properties.creators[0].share, 100);
const attributes = metadata.attributes as { trait_type: string; value: string | number; display_type?: string }[];
assert.deepEqual(
  attributes.map((attr) => attr.trait_type),
  ["Background", "Body", "Rarity Rank"],
);
assert.equal(attributes[0].value, "Blue");
assert.equal(attributes[2].display_type, "number");

const longName = "Layer Collection With A Very Long Name #10000";
assert.ok(longName.length > 32);
assert.ok(fitCoreAssetName(longName).length <= 32);
assert.ok(longName.startsWith(fitCoreAssetName(longName).slice(0, 8)));

const draft = buildImportingCollectionStub({
  id: "layer-draft",
  name: "Layers",
  description: "From traits",
  creatorWallet: "CreatorWallet111111111111111111111111111",
});
draft.artPath = "path-b";
draft.symbol = "LYR";
draft.layers = parsedZip.layers;
draft.stackOrder = parsedZip.stackOrder;
draft.supply = 2;
draft.tokens = [];
const review = reviewCollectionMetadata(draft);
assert.equal(metadataReviewBlocksLaunch(review), false);
assert.ok(review.issues.some((issue) => issue.code === "layers-generate-metadata"));
assert.equal(review.issues.some((issue) => issue.code === "no-tokens"), false);

draft.supply = 99;
const blocked = reviewCollectionMetadata(draft);
assert.equal(metadataReviewBlocksLaunch(blocked), true);
assert.ok(blocked.issues.some((issue) => issue.code === "layer-supply"));

  console.log("layer launch checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
