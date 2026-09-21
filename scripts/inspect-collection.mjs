import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const slug = process.argv[2] ?? "smoke-e2e";
const { getCollection } = await import("../src/lib/store.ts");
const { getCoreCollectionAddress } = await import("../src/lib/core-collection.ts");
const c = await getCollection(slug);
if (!c) {
  console.error("not found");
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      id: c.id,
      slug: c.slug,
      status: c.status,
      mintedCount: c.mintedCount,
      supply: c.supply,
      coreCollectionAddress: c.coreCollectionAddress ?? null,
      envCoreMainnet: getCoreCollectionAddress("mainnet"),
      envCoreDevnet: getCoreCollectionAddress("devnet"),
      pendingMint: c.pendingMint ?? null,
      tokens: c.tokens.map((t) => ({
        tokenId: t.tokenId,
        owner: t.owner ?? null,
        reservedBy: t.reservedBy ?? null,
        assetAddress: t.assetAddress ?? null,
        mintTxUrl: t.mintTxUrl ?? null,
      })),
    },
    null,
    2,
  ),
);
