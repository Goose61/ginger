/**
 * Mainnet smoke test — platform wallet → Jupiter → creator treasury (minimal SOL).
 *
 * Cheapest path (buyback only, ~$0.10):
 *   1. node scripts/create-mainnet-smoke-wallet.mjs   (optional; mint mode only)
 *   2. Set SOLANA_NETWORK=mainnet in .env.local and restart `npm run dev`
 *   3. npm run smoke:mainnet:plan -- --collection <id-or-slug>
 *   4. Fund the platform wallet (amount printed by plan)
 *   5. npm run smoke:mainnet:buyback -- --collection <id-or-slug>
 *
 * Full mint path (optional, ~$1 mint + auto buyback):
 *   npm run smoke:mainnet:mint -- --collection <id-or-slug>
 *
 * Uses USDC as buyback token (liquid Jupiter route). Tokens land in the
 * collection creator wallet treasury ATA.
 */

import fs from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

const ROOT = path.resolve(process.cwd());
const PAYER_PATH = path.join(ROOT, ".mainnet-smoke-wallet.json");
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const RPC = process.env.SOLANA_RPC_URL_MAINNET ?? "https://api.mainnet.solana.com";
/** USDC — always routable on Jupiter mainnet. */
const SMOKE_BUYBACK_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SMOKE_BUYBACK_USD = 0.1;
const MIN_PLATFORM_SOL = 0.008;
const MINT_BUFFER_SOL = 0.012;
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

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

function b58decode(s: string) {
  const bytes: number[] = [];
  for (const c of s) {
    let carry = ALPHA.indexOf(c);
    if (carry < 0) throw new Error("Invalid base58");
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes.reverse());
}

function loadPayer(): Keypair | null {
  if (!fs.existsSync(PAYER_PATH)) return null;
  const raw = JSON.parse(fs.readFileSync(PAYER_PATH, "utf8")) as { secretKeyBase58: string };
  return Keypair.fromSecretKey(b58decode(raw.secretKeyBase58));
}

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function api(pathname: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    fail(`${pathname} returned non-JSON (${res.status}): ${text.slice(0, 240)}`);
  }
  return { res, data };
}

type Collection = {
  id: string;
  slug: string;
  name: string;
  status: string;
  supply: number;
  mintedCount: number;
  treasuryBuybackActive?: boolean;
  buybackTokenCa?: string;
  buybackTreasuryWallet?: string;
  payments: { basePriceUsd: number; creatorWallet?: string };
  fees?: { ownerPercent: number; buybackPercent: number };
  tokens?: { tokenId: number; owner?: string | null; reservedBy?: string | null }[];
};

async function loadCollection(idOrSlug: string): Promise<Collection> {
  const res = await api(`/api/collections/${encodeURIComponent(idOrSlug)}`);
  if (!res.res.ok) fail(`Collection not found: ${JSON.stringify(res.data)}`);
  return (res.data.collection as Collection | undefined) ?? (res.data as unknown as Collection);
}

async function assertMainnetServer() {
  const net = await api("/api/network");
  if (net.data.network !== "mainnet") {
    fail(
      `Server is "${String(net.data.network)}", not mainnet.\n` +
        "  Set SOLANA_NETWORK=mainnet and NEXT_PUBLIC_SOLANA_NETWORK=mainnet in .env.local,\n" +
        "  restart npm run dev, then rerun this script.",
    );
  }
}

async function setupCollection(collectionId: string, treasuryWallet: string) {
  loadEnvLocal();
  const { updateCollection } = await import("../src/lib/store");
  await updateCollection(collectionId, (c) => {
    c.buybackTokenCa = SMOKE_BUYBACK_MINT;
    c.buybackTreasuryWallet = treasuryWallet;
    c.treasuryBuybackActive = true;
    if (!c.feeLedger) {
      c.feeLedger = {
        holderTreasuryUsd: 0,
        buybackTreasuryUsd: 0,
        platformTreasuryUsd: 0,
        ownerAccruedUsd: 0,
        entries: [],
        distributionRounds: [],
        buybacks: [],
      };
    }
    c.feeLedger.buybackTreasuryUsd = Math.max(
      c.feeLedger.buybackTreasuryUsd,
      SMOKE_BUYBACK_USD,
    );
    return c;
  });
  console.log(`Configured buyback: USDC → treasury ${treasuryWallet}`);
  console.log(`Buyback pool topped to at least $${SMOKE_BUYBACK_USD}`);
}

async function runPlan(collectionId: string) {
  loadEnvLocal();
  await assertMainnetServer();

  const { getMintPaymentRecipient } = await import("../src/lib/platform-disbursement");
  const { getQuote } = await import("../src/lib/quotes");

  const collection = await loadCollection(collectionId);
  const platform = getMintPaymentRecipient();
  if (!platform) fail("ARWEAVE_SOLANA_KEY missing — platform wallet not configured");

  const creator = collection.payments.creatorWallet?.trim();
  if (!creator) fail("Collection has no creatorWallet");

  const treasury = collection.buybackTreasuryWallet?.trim() || creator;
  const conn = new Connection(RPC, "confirmed");
  const platformBal = (await conn.getBalance(new PublicKey(platform))) / LAMPORTS_PER_SOL;
  const buybackQuote = await getQuote(SMOKE_BUYBACK_USD);

  let mintQuoteSol = 0;
  let cheapestUsd = collection.payments.basePriceUsd;
  const available = (collection.tokens ?? []).find((t) => !t.owner && !t.reservedBy);
  if (available) {
    const { nftPrice } = await import("../src/lib/collection-ui");
    cheapestUsd = nftPrice(collection as Parameters<typeof nftPrice>[0], available as Parameters<typeof nftPrice>[1]);
    mintQuoteSol = (await getQuote(cheapestUsd)).sol;
  }

  const payer = loadPayer();

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(" MAINNET SMOKE TEST — funding plan (minimal amounts)");
  console.log("═══════════════════════════════════════════════════════════\n");
  console.log(`Server:     ${BASE}`);
  console.log(`Collection: ${collection.name} (${collection.id})`);
  console.log(`Buyback:    USDC ${SMOKE_BUYBACK_MINT}`);
  console.log(`Treasury:   ${treasury}\n`);

  console.log("── Wallets to fund ──\n");

  console.log("1) PLATFORM wallet (required for buyback-only test)");
  console.log(`   Address:  ${platform}`);
  console.log(`   Balance:  ${platformBal.toFixed(6)} SOL`);
  console.log(`   Send:     ${MIN_PLATFORM_SOL} SOL  (~$${(MIN_PLATFORM_SOL * buybackQuote.solUsd).toFixed(2)} at current price)`);
  console.log("   Why:      signs Jupiter swap + may create treasury USDC ATA (~0.002 SOL rent)\n");

  if (payer) {
    const payerBal = (await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL;
    console.log("2) PAYER wallet (only if running full --mint smoke)");
    console.log(`   Address:  ${payer.publicKey.toBase58()}`);
    console.log(`   Balance:  ${payerBal.toFixed(6)} SOL`);
    if (available) {
      console.log(
        `   Send:     ${MINT_BUFFER_SOL} SOL  (mint ~${mintQuoteSol.toFixed(6)} SOL for $${cheapestUsd} + fees)`,
      );
    } else {
      console.log("   Note:     collection sold out — skip mint test, use --buyback only");
    }
    console.log("   Why:      pays platform on mint; platform disburses creator + buyback\n");
  } else {
    console.log("2) PAYER wallet (optional — only for --mint)");
    console.log("   Run:      node scripts/create-mainnet-smoke-wallet.mjs");
    console.log(`   Send:     ${MINT_BUFFER_SOL} SOL to the new address\n`);
  }

  console.log("3) CREATOR / treasury wallet");
  console.log(`   Address:  ${treasury}`);
  console.log("   Send:     0 SOL — receives USDC from buyback automatically\n");

  console.log("── Commands (after funding platform) ──\n");
  console.log(`  npm run smoke:mainnet:setup -- --collection ${collectionId}`);
  console.log(`  npm run smoke:mainnet:buyback -- --collection ${collectionId}`);
  if (available) {
    console.log(`  npm run smoke:mainnet:mint -- --collection ${collectionId}`);
  }
  console.log("");
}

async function runBuyback(collectionId: string) {
  loadEnvLocal();
  await assertMainnetServer();

  const collection = await loadCollection(collectionId);
  const treasury = collection.buybackTreasuryWallet?.trim() || collection.payments.creatorWallet;
  if (!treasury) fail("No treasury wallet");

  const conn = new Connection(RPC, "confirmed");
  const mintPk = new PublicKey(SMOKE_BUYBACK_MINT);
  const treasuryPk = new PublicKey(treasury);
  let beforeRaw = 0n;
  try {
    const ata = await getAssociatedTokenAddress(mintPk, treasuryPk);
    beforeRaw = (await getAccount(conn, ata)).amount;
  } catch {
    /* ATA may not exist yet */
  }

  console.log(`Executing buyback ($${SMOKE_BUYBACK_USD} pool slice)…`);
  const buy = await api(`/api/collections/${encodeURIComponent(collectionId)}`, {
    method: "POST",
    body: JSON.stringify({ action: "execute_buyback", network: "mainnet" }),
  });
  if (!buy.res.ok) fail(`Buyback API failed: ${JSON.stringify(buy.data)}`);

  console.log(`  purchased   ${buy.data.purchased ? "yes" : "no"}`);
  if (!buy.data.purchased) fail(`Buyback failed: ${String(buy.data.reason)}`);

  console.log(`  usdSpent    $${buy.data.usdSpent}`);
  console.log(`  tokenAmount ${buy.data.tokenAmount}`);
  console.log(`  signature   ${buy.data.txSignature}`);
  console.log(`  explorer    ${buy.data.txUrl}`);

  const ata = await getAssociatedTokenAddress(mintPk, treasuryPk);
  const afterRaw = (await getAccount(conn, ata)).amount;
  const gained = afterRaw - beforeRaw;
  console.log(`  treasury ATA ${ata.toBase58()}`);
  console.log(`  USDC gained  ${gained} raw (${Number(gained) / 1e6} USDC)`);

  if (gained <= 0n) fail("Treasury USDC balance did not increase");
  console.log("\n✅ Mainnet Jupiter buyback smoke test passed\n");
}

async function runMint(collectionId: string) {
  loadEnvLocal();
  await assertMainnetServer();

  const payer = loadPayer();
  if (!payer) fail("No .mainnet-smoke-wallet.json — run: node scripts/create-mainnet-smoke-wallet.mjs");

  const collection = await loadCollection(collectionId);
  const available = (collection.tokens ?? []).find((t) => !t.owner && !t.reservedBy);
  if (!available) fail("No unminted tokens — use --buyback only");

  const { nftPrice } = await import("../src/lib/collection-ui");
  const { getMintPaymentRecipient } = await import("../src/lib/platform-disbursement");
  const platform = getMintPaymentRecipient();
  if (!platform) fail("Platform wallet not configured");

  const priceUsd = nftPrice(collection as Parameters<typeof nftPrice>[0], available as Parameters<typeof nftPrice>[1]);
  const quoteRes = await api(`/api/quotes?usd=${priceUsd}`);
  const quote = quoteRes.data.quote as { sol: number };
  if (!quote?.sol) fail("No SOL quote");

  const conn = new Connection(RPC, "confirmed");
  const lamports = Math.ceil(quote.sol * LAMPORTS_PER_SOL * 1.05);
  console.log(`Minting #${available.tokenId} ($${priceUsd}) → platform ${platform}`);

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const payTx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: new PublicKey(platform),
      lamports,
    }),
  );
  payTx.sign(payer);
  const paySig = await conn.sendRawTransaction(payTx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction({ signature: paySig, blockhash, lastValidBlockHeight }, "confirmed");
  console.log(`  paid ${paySig}`);

  const mintRes = await api(`/api/collections/${encodeURIComponent(collectionId)}`, {
    method: "POST",
    body: JSON.stringify({
      action: "mint",
      payer: payer.publicKey.toBase58(),
      recipient: payer.publicKey.toBase58(),
      qty: 1,
      tokenId: available.tokenId,
      method: "sol",
      txSignature: paySig,
      network: "mainnet",
    }),
  });
  if (!mintRes.res.ok) fail(`Mint failed: ${JSON.stringify(mintRes.data)}`);

  const creatorDisburse = mintRes.data.creatorDisburse as
    | { ok?: boolean; txUrl?: string; error?: string }
    | undefined;
  const buyback = mintRes.data.buyback as
    | { purchased?: boolean; tokenAmount?: number; txUrl?: string; reason?: string }
    | undefined;

  console.log(`  minted      ${JSON.stringify(mintRes.data.mintedTokenIds)}`);
  if (creatorDisburse) {
    console.log(
      `  creator     ${creatorDisburse.ok ? "paid" : "FAILED"} ${creatorDisburse.txUrl ?? creatorDisburse.error ?? ""}`,
    );
    if (!creatorDisburse.ok) fail("Creator disburse failed");
  }
  if (buyback?.purchased) {
    console.log(`  buyback     ${buyback.tokenAmount} tokens  ${buyback.txUrl}`);
  } else if (buyback) {
    console.log(`  buyback     skipped (${buyback.reason})`);
  }

  if (!buyback?.purchased) {
    fail("Mint succeeded but buyback did not run — check buybackTokenCa and platform SOL");
  }
  console.log("\n✅ Full mainnet mint → platform → creator + Jupiter buyback passed\n");
}

async function main() {
  if (!hasFlag("--i-understand-mainnet")) {
    fail(
      "Mainnet smoke test spends real SOL.\n" +
        "  Re-run with:  npm run smoke:mainnet:plan -- --i-understand-mainnet --collection <id>",
    );
  }

  const collectionId = arg("--collection") ?? process.env.SMOKE_COLLECTION_ID;
  if (!collectionId) {
    fail("Pass --collection <id-or-slug> or set SMOKE_COLLECTION_ID in .env.local");
  }

  if (hasFlag("--plan")) {
    await runPlan(collectionId);
    return;
  }
  if (hasFlag("--setup")) {
    const col = await loadCollection(collectionId);
    const treasury = col.buybackTreasuryWallet?.trim() || col.payments.creatorWallet;
    if (!treasury) fail("No creator wallet for treasury");
    await setupCollection(col.id, treasury);
    return;
  }
  if (hasFlag("--buyback")) {
    await runBuyback(collectionId);
    return;
  }
  if (hasFlag("--mint")) {
    const col = await loadCollection(collectionId);
    const treasury = col.buybackTreasuryWallet?.trim() || col.payments.creatorWallet;
    if (!treasury) fail("No creator wallet for treasury");
    await setupCollection(col.id, treasury);
    await runMint(collectionId);
    return;
  }

  fail("Use --plan, --setup, --buyback, or --mint");
}

void main();
