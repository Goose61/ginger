/**
 * Full E2E: 3 mints → instant holder rounds → per-sale SPL buyback.
 *
 * Devnet (default): uses .devnet-wallet.json + test SPL mint buyback
 * Mainnet:          uses .mainnet-smoke-wallet.json + USDC Jupiter buyback
 *                   (requires --i-understand-mainnet)
 *
 *   npx tsx scripts/smoke-full-e2e.ts
 *   npx tsx scripts/smoke-full-e2e.ts --i-understand-mainnet
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
  VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

const ROOT = path.resolve(process.cwd());
const DEVNET_PAYER = path.join(ROOT, ".devnet-wallet.json");
const MAINNET_PAYER = path.join(ROOT, ".mainnet-smoke-wallet.json");
const HOLDERS_PATH = path.join(ROOT, ".smoke-holders.json");
const DEVNET_BUYBACK_MINT = path.join(ROOT, ".devnet-buyback-mint.json");
const SLUG = "smoke-e2e";
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MINT_COUNT = 3;

type Collection = {
  id: string;
  slug: string;
  name: string;
  mintedCount: number;
  supply: number;
  feeClaimsOpen?: boolean;
  treasuryBuybackActive?: boolean;
  buybackTokenCa?: string;
  buybackTreasuryWallet?: string;
  payments: { basePriceUsd: number; creatorWallet?: string };
  tokens?: { tokenId: number; owner?: string | null; reservedBy?: string | null }[];
  feeLedger?: {
    holderTreasuryUsd: number;
    buybackTreasuryUsd: number;
    distributionRounds: { poolUsd: number; snapshot: { wallet: string; count: number }[] }[];
    buybacks: { usdSpent?: number; tokenAmount?: number; txSignature?: string; route?: string }[];
  };
};

function fail(msg: string): never {
  console.error(`\n✗ ${msg}`);
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

function loadPayer(network: "devnet" | "mainnet"): Keypair {
  const file = network === "mainnet" ? MAINNET_PAYER : DEVNET_PAYER;
  if (!fs.existsSync(file)) {
    fail(
      network === "mainnet"
        ? "No .mainnet-smoke-wallet.json — run: npm run create:mainnet-smoke-wallet"
        : "No .devnet-wallet.json — run: npm run create:devnet-wallet",
    );
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { secretKeyBase58: string };
  return Keypair.fromSecretKey(b58decode(raw.secretKeyBase58));
}

function loadHolders(): Keypair[] {
  if (fs.existsSync(HOLDERS_PATH)) {
    const raw = JSON.parse(fs.readFileSync(HOLDERS_PATH, "utf8")) as { secretKey: number[] }[];
    return raw.map((r) => Keypair.fromSecretKey(Uint8Array.from(r.secretKey)));
  }
  const kps = Array.from({ length: 3 }, () => Keypair.generate());
  fs.writeFileSync(
    HOLDERS_PATH,
    JSON.stringify(
      kps.map((kp, i) => ({
        label: `smoke-holder-${i + 1}`,
        publicKey: kp.publicKey.toBase58(),
        secretKey: Array.from(kp.secretKey),
      })),
      null,
      2,
    ),
  );
  return kps;
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
    fail(`${pathname} non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  return { res, data };
}

async function ensureCollection(creator: string): Promise<Collection> {
  const hit = await api(`/api/collections/${SLUG}`);
  if (hit.res.ok) {
    const col = (hit.data.collection as Collection | undefined) ?? (hit.data as unknown as Collection);
    if (col?.id) return col;
  }

  const { getCollection, saveCollection, newId, slugify } = await import("../src/lib/store");
  const dough = await getCollection("dough-boi");
  if (!dough) fail("Need dough-boi in Mongo for metadata URIs");
  const source = (dough.tokens ?? [])
    .filter((t) => t.metadataUri?.startsWith("http") && t.tokenId !== 37)
    .slice(0, 4);
  if (source.length < 4) fail("Need 4 tokens with metadata from dough-boi");

  const now = new Date().toISOString();
  const id = newId();
  await saveCollection({
    id,
    slug: slugify("Smoke E2E"),
    name: "Smoke E2E",
    symbol: "SMKE",
    description: "Minimal E2E: holder rewards + SPL buyback on every mint.",
    nameTemplate: "Smoke E2E #{id}",
    chain: "solana",
    status: "live",
    supply: 4,
    mintedCount: 0,
    artPath: "path-a",
    stackOrder: [],
    layers: [],
    blindMint: false,
    revealTrigger: "disabled",
    revealed: true,
    milestones: [],
    payments: {
      basePriceUsd: 1,
      acceptSol: true,
      acceptUsdc: false,
      acceptPizza: false,
      acceptSlicePay: true,
      pizzaDiscountPercent: 0,
      giftMintEnabled: false,
      creatorWallet: creator,
    },
    fees: { ownerPercent: 40, holdersPercent: 30, buybackPercent: 30, locked: true },
    allowlist: [],
    waitlist: [],
    publicMintOpen: true,
    secondaryEnabled: true,
    holderPageUnlocked: true,
    irysPublished: true,
    royaltyBps: 500,
    createdAt: now,
    updatedAt: now,
    tokens: source.map((t, i) => ({
      tokenId: i + 1,
      dna: t.dna,
      attributes: t.attributes,
      imageRelPath: t.imageRelPath,
      metadataRelPath: t.metadataRelPath,
      imageUri: t.imageUri,
      metadataUri: t.metadataUri,
    })),
    logoUrl: dough.logoUrl,
  });
  console.log(`Created collection ${id} (${SLUG})`);
  const created = await api(`/api/collections/${SLUG}`);
  return (created.data.collection as Collection) ?? (created.data as unknown as Collection);
}

async function ensureDevnetSplMint(payer: Keypair, conn: Connection): Promise<string> {
  if (fs.existsSync(DEVNET_BUYBACK_MINT)) {
    const saved = JSON.parse(fs.readFileSync(DEVNET_BUYBACK_MINT, "utf8")) as { mint: string };
    if (saved.mint) return saved.mint;
  }
  const { createMint } = await import("@solana/spl-token");
  const { getPlatformSecretKey } = await import("../src/lib/platform-key");
  const secret = getPlatformSecretKey();
  if (!secret) fail("ARWEAVE_SOLANA_KEY missing");
  const platform = Keypair.fromSecretKey(secret);
  const bal = await conn.getBalance(platform.publicKey);
  if (bal < 50_000_000) {
    const need = 80_000_000 - bal;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: platform.publicKey, lamports: need }),
    );
    tx.sign(payer);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    console.log(`Funded platform +${need / 1e9} SOL for devnet ops`);
  }
  const mint = await createMint(conn, platform, platform.publicKey, null, 6);
  fs.writeFileSync(DEVNET_BUYBACK_MINT, JSON.stringify({ mint: mint.toBase58() }, null, 2));
  return mint.toBase58();
}

async function configureBuyback(collectionId: string, network: "devnet" | "mainnet", treasury: string, payer: Keypair, conn: Connection) {
  const buybackCa = network === "mainnet" ? USDC : await ensureDevnetSplMint(payer, conn);
  const { updateCollection } = await import("../src/lib/store");
  await updateCollection(collectionId, (c) => {
    c.buybackTokenCa = buybackCa;
    c.buybackTreasuryWallet = treasury;
    c.treasuryBuybackActive = true;
    return c;
  });
  console.log(`Buyback CA ${buybackCa} → treasury ${treasury}`);
}

async function mintOne(params: {
  collection: Collection;
  payer: Keypair;
  recipient: string;
  tokenId: number;
  conn: Connection;
  network: "devnet" | "mainnet";
}) {
  const { collection, payer, recipient, tokenId, conn, network } = params;
  const priceUsd = collection.payments.basePriceUsd;
  const quoteRes = await api(`/api/quotes?usd=${priceUsd}`);
  const quote = quoteRes.data.quote as { sol: number };
  if (!quote?.sol) fail("No SOL quote");

  const { getMintPaymentRecipient } = await import("../src/lib/platform-disbursement");
  const platform = getMintPaymentRecipient();
  if (!platform) fail("Platform wallet not configured");

  const lamports = Math.ceil(quote.sol * LAMPORTS_PER_SOL * 1.08);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const payTx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(
    SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: new PublicKey(platform), lamports }),
  );
  payTx.sign(payer);
  const paySig = await conn.sendRawTransaction(payTx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction({ signature: paySig, blockhash, lastValidBlockHeight }, "confirmed");

  const mintRes = await api(`/api/collections/${encodeURIComponent(collection.id)}`, {
    method: "POST",
    body: JSON.stringify({
      action: "mint",
      payer: payer.publicKey.toBase58(),
      recipient,
      qty: 1,
      tokenId,
      method: "sol",
      txSignature: paySig,
      network,
    }),
  });
  if (!mintRes.res.ok) fail(`Mint #${tokenId} failed: ${JSON.stringify(mintRes.data)}`);

  const fees = (mintRes.data.feeBreakdowns as { holdersUsd: number; buybackUsd: number }[] | undefined)?.[0];
  const creatorDisburse = mintRes.data.creatorDisburse as { ok?: boolean; txUrl?: string; error?: string } | undefined;
  const buyback = mintRes.data.buyback as { purchased?: boolean; tokenAmount?: number; txUrl?: string; reason?: string } | undefined;

  console.log(`  paid       ${paySig}`);
  console.log(`  holders    +$${fees?.holdersUsd ?? 0}  buyback +$${fees?.buybackUsd ?? 0}`);
  if (creatorDisburse) {
    console.log(`  creator    ${creatorDisburse.ok ? "paid" : "FAIL"} ${creatorDisburse.txUrl ?? creatorDisburse.error ?? ""}`);
    if (!creatorDisburse.ok) fail("Creator disburse failed");
  }
  if (buyback?.purchased) {
    console.log(`  buyback    ${buyback.tokenAmount} tokens  ${buyback.txUrl}`);
  } else if (buyback?.reason) {
    console.log(`  buyback    skipped (${buyback.reason})`);
  }

  if (mintRes.data.requiresOnChainMint) {
    const prep = await api("/api/gift/prepare-sign", {
      method: "POST",
      body: JSON.stringify({ collectionId: collection.id, payer: payer.publicKey.toBase58(), network }),
    });
    if (!prep.res.ok) fail(`prepare-sign failed: ${JSON.stringify(prep.data)}`);
    const txBase64 = String(prep.data.txBase64 || "");
    const tx = VersionedTransaction.deserialize(Buffer.from(txBase64, "base64"));
    tx.sign([payer]);
    const cosign = await api("/api/gift/cosign", {
      method: "POST",
      body: JSON.stringify({
        collectionId: collection.id,
        signedTxBase64: Buffer.from(tx.serialize()).toString("base64"),
        preparedTxBase64: txBase64,
        payer: payer.publicKey.toBase58(),
        network,
      }),
    });
    if (!cosign.res.ok) fail(`cosign failed: ${JSON.stringify(cosign.data)}`);
    const confirmed = await api(`/api/collections/${encodeURIComponent(collection.id)}/confirm-mint`, {
      method: "PATCH",
      body: JSON.stringify({
        tokenId,
        txSignature: String(cosign.data.txSignature || ""),
        network,
      }),
    });
    if (!confirmed.res.ok) fail(`confirm-mint failed: ${JSON.stringify(confirmed.data)}`);
  }

  return { paySig, buybackPurchased: buyback?.purchased ?? false };
}

async function main() {
  loadEnvLocal();
  const mainnetOk = process.argv.includes("--i-understand-mainnet");

  const netRes = await api("/api/network");
  const network = netRes.data.network === "mainnet" ? "mainnet" : "devnet";
  if (network === "mainnet" && !mainnetOk) {
    fail("Mainnet spends real SOL. Re-run with --i-understand-mainnet");
  }

  const rpc =
    network === "mainnet"
      ? process.env.SOLANA_RPC_URL_MAINNET ?? "https://api.mainnet.solana.com"
      : process.env.SOLANA_RPC_URL_DEVNET ?? "https://api.devnet.solana.com";

  const payer = loadPayer(network);
  const holders = loadHolders();
  const conn = new Connection(rpc, "confirmed");
  const payerSol = (await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL;

  console.log(`Network  ${network}`);
  console.log(`Payer    ${payer.publicKey.toBase58()}  ${payerSol} SOL`);
  holders.forEach((h, i) => console.log(`Holder ${i + 1} ${h.publicKey.toBase58()}`));

  const minSol = network === "mainnet" ? 0.04 : 0.15;
  if (payerSol < minSol) {
    fail(`Need ~${minSol} SOL on payer (have ${payerSol.toFixed(4)})`);
  }

  const creator = holders[0].publicKey.toBase58();
  let collection = await ensureCollection(creator);
  await configureBuyback(collection.id, network, creator, payer, conn);

  collection = ((await api(`/api/collections/${collection.id}`)).data.collection as Collection) ?? collection;

  const tokenIds = [1, 2, 3].filter((id) => {
    const t = collection.tokens?.find((row) => row.tokenId === id);
    return t && !t.owner && !t.reservedBy;
  });
  if (tokenIds.length < MINT_COUNT) {
    fail(`Need ${MINT_COUNT} unminted tokens; only ${tokenIds.length} available (reset smoke-e2e or use fresh collection)`);
  }

  let buybacksOk = 0;
  for (let i = 0; i < MINT_COUNT; i++) {
    const tokenId = tokenIds[i];
    const recipient = holders[i].publicKey.toBase58();
    console.log(`\n── Mint #${tokenId} → holder ${i + 1} ──`);
    const result = await mintOne({ collection, payer, recipient, tokenId, conn, network });
    if (result.buybackPurchased) buybacksOk++;
  }

  collection = ((await api(`/api/collections/${collection.id}`)).data.collection as Collection) ?? collection;
  const ledger = collection.feeLedger;

  console.log("\n── Holder distribution ──");
  console.log(`claims open   ${collection.feeClaimsOpen ? "yes" : "no"}`);
  console.log(`buyback active ${collection.treasuryBuybackActive ? "yes" : "no"}`);
  console.log(`rounds         ${ledger?.distributionRounds.length ?? 0}`);
  for (const [i, round] of (ledger?.distributionRounds ?? []).entries()) {
    const snap = round.snapshot
      .map((s) => {
        const idx = holders.findIndex((h) => h.publicKey.toBase58() === s.wallet);
        return `H${idx + 1}×${s.count}`;
      })
      .join(", ");
    console.log(`  round ${i + 1}  $${round.poolUsd}  ${snap}`);
  }

  console.log("\n── Claim previews ──");
  for (let i = 0; i < holders.length; i++) {
    const wallet = holders[i].publicKey.toBase58();
    const status = await api(`/api/collections/${encodeURIComponent(collection.id)}`, {
      method: "POST",
      body: JSON.stringify({ action: "fee_status", wallet }),
    });
    const preview = status.data.claimPreview as { heldCount: number; claimableUsd: number } | null;
    console.log(`  H${i + 1}  holds ${preview?.heldCount ?? 0}  claimable $${preview?.claimableUsd ?? 0}`);
  }

  console.log("\n── Buyback history ──");
  for (const b of ledger?.buybacks ?? []) {
    console.log(`  $${b.usdSpent ?? 0} → ${b.tokenAmount ?? 0} tokens  ${b.route ?? ""}  ${b.txSignature ?? ""}`);
  }

  const mintCa = collection.buybackTokenCa!;
  const mintPk = new PublicKey(mintCa);
  const ata = await getAssociatedTokenAddress(mintPk, new PublicKey(creator));
  try {
    const bal = await getAccount(conn, ata);
    const decimals = network === "mainnet" ? 6 : 6;
    console.log(`\nTreasury ATA ${ata.toBase58()}`);
    console.log(`Balance      ${Number(bal.amount) / 10 ** decimals} tokens`);
  } catch {
    fail("Treasury token account missing after buybacks");
  }

  if ((ledger?.distributionRounds.length ?? 0) < MINT_COUNT) {
    fail(`Expected ${MINT_COUNT} holder rounds, got ${ledger?.distributionRounds.length ?? 0}`);
  }
  if (buybacksOk < MINT_COUNT) {
    fail(`Expected ${MINT_COUNT} buybacks, got ${buybacksOk}`);
  }

  console.log("\n✅ Full E2E passed: mints → holder rounds → SPL buyback on every sale\n");
}

void main();
