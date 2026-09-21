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

const { getCollection } = await import("../src/lib/store.ts");
const { splitPrimaryMintFees } = await import("../src/lib/fee-distribution.ts");

const c = await getCollection("smoke-e2e");
if (!c) {
  console.error("not found");
  process.exit(1);
}

const breakdown = splitPrimaryMintFees(c.payments.basePriceUsd, c.fees);
console.log(JSON.stringify({
  basePriceUsd: c.payments.basePriceUsd,
  fees: c.fees,
  creatorWallet: c.payments.creatorWallet ?? null,
  buybackTokenCa: c.buybackTokenCa ?? null,
  buybackTreasuryWallet: c.buybackTreasuryWallet ?? null,
  treasuryBuybackActive: c.treasuryBuybackActive ?? false,
  feeClaimsOpen: c.feeClaimsOpen ?? false,
  breakdown,
  distributionRounds: c.feeLedger?.distributionRounds?.length ?? 0,
  buybacks: c.feeLedger?.buybacks?.map((b) => ({
    usdSpent: b.usdSpent,
    tokenAmount: b.tokenAmount,
    treasuryWallet: b.treasuryWallet,
    route: b.route,
    txSignature: b.txSignature?.slice(0, 20),
  })) ?? [],
  holders: c.tokens.filter((t) => t.owner).map((t) => ({ tokenId: t.tokenId, owner: t.owner })),
}, null, 2));
