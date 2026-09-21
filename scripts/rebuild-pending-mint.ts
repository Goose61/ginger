/**
 * Rebuild pendingMint for a paid-but-not-minted-on-chain token.
 * Usage: npx tsx scripts/rebuild-pending-mint.ts smoke-e2e 4 <payerWallet>
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
  const slug = process.argv[2] ?? "smoke-e2e";
  const tokenId = Number(process.argv[3] ?? 4);
  const payerArg = process.argv[4];

  const { getCollection, updateCollection } = await import("../src/lib/store");
  const { buildPendingMintForToken } = await import("../src/lib/collection-mint-on-chain");
  const { serverNetwork } = await import("../src/lib/solana-config");

  const col = await getCollection(slug);
  if (!col) {
    console.error("Collection not found");
    process.exit(1);
  }
  const token = col.tokens.find((t) => t.tokenId === tokenId);
  if (!token) {
    console.error("Token not found");
    process.exit(1);
  }

  const payer = payerArg ?? token.reservedBy ?? token.owner;
  const recipient = token.owner ?? token.reservedBy;
  if (!payer || !recipient) {
    console.error("Token needs reservedBy or owner wallet");
    process.exit(1);
  }

  const network = serverNetwork();
  const { txResult } = await buildPendingMintForToken({
    collection: col,
    tokenId,
    payer,
    recipient,
    network,
  });

  await updateCollection(col.id, (c) => {
    const t = c.tokens.find((x) => x.tokenId === tokenId);
    if (!t) return c;
    delete t.assetAddress;
    delete t.mintTxUrl;
    t.assetAddress = txResult.assetAddress;
    c.pendingMint = { ...txResult.pendingMint, tokenId };
    c.mintedCount = committedCount(c);
    return c;
  });

  console.log("Rebuilt pending mint:", {
    collection: slug,
    tokenId,
    payer,
    recipient,
    network,
    assetAddress: txResult.assetAddress,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
