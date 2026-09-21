/**
 * Set Smoke E2E mainnet buyback token + treasury for live E2E testing.
 * Usage: npx tsx scripts/configure-smoke-e2e-mainnet-buyback.ts
 */
import fs from "node:fs";
import path from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";

const ROOT = path.resolve(process.cwd());
const SLUG = "smoke-e2e";
const BUYBACK_TOKEN_CA = "4AkCN6KLeCmUDjWLg4XyQpuZuWtwBdPcbtBQjsA2pump";
const BUYBACK_TREASURY = "9fHWVYfjTvLq5UsPLMpJ73MgebbARd1z7Z9cfYzDRM94";

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
  const { getCollection, updateCollection } = await import("../src/lib/store");
  const { isValidSolanaAddress } = await import("../src/lib/mint-nft");

  if (!isValidSolanaAddress(BUYBACK_TOKEN_CA)) {
    throw new Error("Invalid buyback token CA");
  }
  if (!isValidSolanaAddress(BUYBACK_TREASURY)) {
    throw new Error("Invalid buyback treasury wallet");
  }

  const col = await getCollection(SLUG);
  if (!col) throw new Error(`${SLUG} not found`);

  console.log("Before:", {
    buybackTokenCa: col.buybackTokenCa ?? null,
    buybackTreasuryWallet: col.buybackTreasuryWallet ?? null,
  });

  await updateCollection(col.id, (c) => {
    c.buybackTokenCa = BUYBACK_TOKEN_CA;
    c.buybackTreasuryWallet = BUYBACK_TREASURY;
    c.treasuryBuybackActive = true;
    return c;
  });

  const after = await getCollection(SLUG);
  console.log("After:", {
    buybackTokenCa: after?.buybackTokenCa,
    buybackTreasuryWallet: after?.buybackTreasuryWallet,
    treasuryBuybackActive: after?.treasuryBuybackActive,
  });

  const rpc =
    process.env.SOLANA_RPC_URL_MAINNET?.trim() || "https://api.mainnet.solana.com";
  const conn = new Connection(rpc, "confirmed");
  const mintInfo = await conn.getAccountInfo(new PublicKey(BUYBACK_TOKEN_CA));
  if (mintInfo) {
    console.log(
      `Mainnet mint account ${BUYBACK_TOKEN_CA}: owner ${mintInfo.owner.toBase58()}, ${mintInfo.data.length} bytes`,
    );
  } else {
    console.warn(
      `WARNING: ${BUYBACK_TOKEN_CA} is not a mainnet account — Jupiter buyback may fail unless this is the correct SPL mint.`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
