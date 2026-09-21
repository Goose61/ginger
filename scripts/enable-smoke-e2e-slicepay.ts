/**
 * One-off: enable SlicePay + SOL on the smoke-e2e collection in Mongo.
 * Usage: npx tsx scripts/enable-smoke-e2e-slicepay.ts
 */
import fs from "node:fs";
import path from "node:path";

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
  const { getCollection, updateCollection } = await import("../src/lib/store");
  const c = await getCollection("smoke-e2e");
  if (!c) {
    console.error("smoke-e2e not found");
    process.exit(1);
  }
  console.log("Before:", { acceptSlicePay: c.payments.acceptSlicePay, acceptSol: c.payments.acceptSol });
  await updateCollection(c.id, (col) => {
    col.payments = { ...col.payments, acceptSlicePay: true, acceptSol: true };
    return col;
  });
  const after = await getCollection("smoke-e2e");
  console.log("After:", {
    acceptSlicePay: after?.payments.acceptSlicePay,
    acceptSol: after?.payments.acceptSol,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
