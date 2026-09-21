/**
 * Reset a minted token so it is available for primary mint again.
 * Usage: npx tsx scripts/reset-token-for-sale.ts <collection-slug-or-id> <tokenId>
 */
import fs from "node:fs";
import path from "node:path";
import { committedCount } from "../src/lib/store";

const ROOT = path.resolve(process.cwd());

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    if (process.env[key]) continue;
    process.env[key] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadEnvLocal();
  const collectionRef = process.argv[2] ?? "smoke-e2e";
  const tokenId = Number(process.argv[3] ?? 37);
  if (!Number.isFinite(tokenId) || tokenId < 1) {
    console.error("tokenId must be a positive number");
    process.exit(1);
  }

  const { getCollection, updateCollection } = await import("../src/lib/store");
  const col = await getCollection(collectionRef);
  if (!col) {
    console.error(`Collection not found: ${collectionRef}`);
    process.exit(1);
  }

  const token = col.tokens.find((t) => t.tokenId === tokenId);
  if (!token) {
    console.error(`Token #${tokenId} not found in ${col.name} (${col.slug})`);
    process.exit(1);
  }

  console.log("Before:", {
    collection: `${col.name} (${col.slug})`,
    tokenId,
    owner: token.owner ?? null,
    reservedBy: token.reservedBy ?? null,
    assetAddress: token.assetAddress ?? null,
    listing: token.listing ?? null,
    mintedCount: col.mintedCount,
    status: col.status,
  });

  await updateCollection(col.id, (c) => {
    const t = c.tokens.find((x) => x.tokenId === tokenId);
    if (!t) throw new Error("Token missing during update");
    delete t.owner;
    delete t.reservedBy;
    delete t.reservedAt;
    delete t.mintTxUrl;
    delete t.assetAddress;
    t.listing = null;
    delete c.pendingMint;
    c.mintedCount = committedCount(c);
    if (c.mintedCount < c.supply && c.status === "sold_out") {
      c.status = "live";
    }
    return c;
  });

  const after = await getCollection(col.id);
  const afterToken = after?.tokens.find((t) => t.tokenId === tokenId);
  console.log("After:", {
    owner: afterToken?.owner ?? null,
    reservedBy: afterToken?.reservedBy ?? null,
    assetAddress: afterToken?.assetAddress ?? null,
    listing: afterToken?.listing ?? null,
    mintedCount: after?.mintedCount,
    status: after?.status,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
