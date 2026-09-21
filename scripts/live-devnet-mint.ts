/**
 * Live devnet mint using .devnet-wallet.json
 *
 *   npx tsx scripts/live-devnet-mint.ts
 *   npx tsx scripts/live-devnet-mint.ts --collection <id-or-slug>
 *
 * Pays the platform wallet in SOL (creator share + buyback disbursed server-side), then co-signs the on-chain NFT if required.
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

const ROOT = path.resolve(process.cwd());
const WALLET_PATH = path.join(ROOT, ".devnet-wallet.json");
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const RPC = process.env.SOLANA_RPC_URL_DEVNET ?? "https://api.devnet.solana.com";
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function b58decode(s: string) {
  const bytes: number[] = [];
  for (const c of s) {
    let carry = ALPHA.indexOf(c);
    if (carry < 0) throw new Error("Invalid base58 secret key");
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

function loadWallet() {
  if (!fs.existsSync(WALLET_PATH)) {
    fail("No .devnet-wallet.json — run npm run create:devnet-wallet first");
  }
  const raw = JSON.parse(fs.readFileSync(WALLET_PATH, "utf8")) as {
    publicKey: string;
    secretKeyBase58: string;
  };
  const kp = Keypair.fromSecretKey(b58decode(raw.secretKeyBase58));
  if (kp.publicKey.toBase58() !== raw.publicKey) {
    fail("Wallet public key does not match secret key");
  }
  return kp;
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

type Token = {
  tokenId: number;
  owner?: string | null;
  reservedBy?: string | null;
  listing?: { priceUsd: number } | null;
  mintTxUrl?: string;
  assetAddress?: string;
  attributes?: { trait_type: string; value: string | number }[];
};

type Collection = {
  id: string;
  slug: string;
  name: string;
  status: string;
  supply: number;
  mintedCount: number;
  publicMintOpen?: boolean;
  payments: { basePriceUsd: number; creatorWallet?: string };
  fees?: { ownerPercent: number; holdersPercent: number; buybackPercent: number };
  traitPricing?: Record<string, Record<string, { priceModifier?: number }>>;
  tokens?: Token[];
  feeLedger?: {
    holderTreasuryUsd: number;
    buybackTreasuryUsd: number;
    platformTreasuryUsd: number;
    ownerAccruedUsd: number;
    entries: unknown[];
    buybacks: unknown[];
  };
  feeClaimsOpen?: boolean;
  treasuryBuybackActive?: boolean;
  pendingMint?: { tokenId?: number };
};

function isFree(t: Token) {
  return !t.owner && !t.reservedBy;
}

function nftPrice(collection: Collection, token: Token) {
  let price = collection.payments.basePriceUsd;
  const pricing = collection.traitPricing;
  if (!pricing) return price;
  for (const attr of token.attributes ?? []) {
    const extra = pricing[attr.trait_type]?.[String(attr.value)]?.priceModifier;
    if (extra) price += extra;
  }
  return Math.max(0, price);
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const { res, data } = await api("/api/network");
      if (res.ok && data.network) return String(data.network);
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  fail(`App not reachable at ${BASE}. Start it with npm run dev`);
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const argVal = (name: string) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const forcedId = argVal("--collection");
  const reuseSig = argVal("--tx-signature");
  const resumeOnchain = args.includes("--resume-onchain");
  const forcedTokenId = argVal("--token-id") ? Number(argVal("--token-id")) : undefined;

  const kp = loadWallet();
  const payer = kp.publicKey.toBase58();
  const conn = new Connection(RPC, "confirmed");
  const sol = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
  console.log(`Wallet  ${payer}`);
  console.log(`Balance ${sol} SOL (devnet)`);
  if (sol < 0.05) fail("Need more devnet SOL for mint + fees");

  console.log(`Waiting for ${BASE} …`);
  const network = await waitForServer();
  console.log(`Server network: ${network}`);
  if (network !== "devnet") {
    fail(`Refusing to mint: server is ${network}, wallet is devnet`);
  }

  let collection: Collection;
  if (resumeOnchain && forcedId) {
    const fullRes = await api(`/api/collections/${encodeURIComponent(forcedId)}`);
    if (!fullRes.res.ok) fail(`Could not load ${forcedId}: ${JSON.stringify(fullRes.data)}`);
    collection =
      (fullRes.data.collection as Collection | undefined) ??
      (fullRes.data as unknown as Collection);
  } else {
    const list = await api("/api/collections");
    if (!list.res.ok) fail(`Could not list collections: ${JSON.stringify(list.data)}`);
    const collections = (list.data.collections as Collection[]) ?? [];
    const live = collections.filter((c) => c.status === "live" || c.status === "sold_out");
    console.log(`Live collections: ${live.length}`);

    let target = forcedId
      ? live.find((c) => c.id === forcedId || c.slug === forcedId)
      : live.find((c) => c.status === "live" && c.mintedCount < c.supply);

    if (!target && forcedId) {
      const one = await api(`/api/collections/${encodeURIComponent(forcedId)}`);
      if (one.res.ok) target = (one.data.collection as Collection | undefined) ?? (one.data as unknown as Collection);
    }
    if (!target) fail("No live collection with remaining supply. Pass --collection <id>");

    const fullRes = await api(`/api/collections/${encodeURIComponent(target.id)}`);
    if (!fullRes.res.ok) fail(`Could not load ${target.id}: ${JSON.stringify(fullRes.data)}`);
    collection =
      (fullRes.data.collection as Collection | undefined) ??
      (fullRes.data as unknown as Collection);
  }
  const tokens = collection.tokens ?? [];
  const pendingTokenId = collection.pendingMint?.tokenId;
  const available = resumeOnchain
    ? tokens.find((t) => t.tokenId === (forcedTokenId ?? pendingTokenId))
    : forcedTokenId
      ? tokens.find((t) => t.tokenId === forcedTokenId && isFree(t))
      : tokens
          .filter(isFree)
          .sort((a, b) => nftPrice(collection, a) - nftPrice(collection, b))[0];
  if (!available) {
    fail(
      resumeOnchain
        ? `${collection.name} has no pending mint to finish`
        : forcedTokenId
          ? `${collection.name} #${forcedTokenId} is not available`
          : `${collection.name} has no unminted tokens`,
    );
  }
  if (!collection.payments.creatorWallet) fail("Collection has no creator payout wallet");

  const priceUsd = nftPrice(collection, available);
  console.log(`\nMinting ${collection.name} #${available.tokenId}`);
  console.log(`  price    $${priceUsd} (base $${collection.payments.basePriceUsd})`);
  console.log(`  creator  ${collection.payments.creatorWallet}`);
  const { getMintPaymentRecipient } = await import("../src/lib/platform-disbursement");
  const platform = getMintPaymentRecipient();
  if (!platform) fail("Platform wallet not configured (ARWEAVE_SOLANA_KEY)");
  console.log(`  platform ${platform}`);
  console.log(`  minted   ${collection.mintedCount}/${collection.supply}`);

  let requiresOnChainMint = resumeOnchain || Boolean(collection.pendingMint);
  if (!resumeOnchain) {

  const quoteRes = await api(`/api/quotes?usd=${priceUsd}`);
  const quote = quoteRes.data.quote as { sol: number; solUsd: number };
  if (!quote?.sol) fail(`No SOL quote: ${JSON.stringify(quoteRes.data)}`);
  // Pay a buffer so a SOL/USD tick between quote and server verify still clears 2% slippage.
  const lamports = Math.ceil(quote.sol * LAMPORTS_PER_SOL * 1.1);
  console.log(`  quote    ${quote.sol.toFixed(6)} SOL  (SOL/USD ${quote.solUsd})`);
  console.log(`  sending  ${(lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL (10% buffer)`);

  let paySig = reuseSig;
  if (paySig) {
    console.log(`  reusing  ${paySig}`);
  } else {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const payTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: new PublicKey(platform),
        lamports,
      }),
    );
    payTx.recentBlockhash = blockhash;
    payTx.feePayer = kp.publicKey;
    payTx.sign(kp);
    paySig = await conn.sendRawTransaction(payTx.serialize(), { skipPreflight: false });
    await conn.confirmTransaction({ signature: paySig, blockhash, lastValidBlockHeight }, "confirmed");
    for (let i = 0; i < 10; i++) {
      const parsed = await conn.getParsedTransaction(paySig, { maxSupportedTransactionVersion: 0 });
      if (parsed?.meta && !parsed.meta.err) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log(`  paid     ${paySig}`);
  }
  if (!paySig) fail("Missing SOL payment signature");
  console.log(`  explorer https://explorer.solana.com/tx/${paySig}?cluster=devnet`);

  const mintRes = await api(`/api/collections/${encodeURIComponent(collection.id)}`, {
    method: "POST",
    body: JSON.stringify({
      action: "mint",
      payer,
      recipient: payer,
      qty: 1,
      tokenId: available.tokenId,
      method: "sol",
      txSignature: paySig,
      network: "devnet",
    }),
  });
  if (!mintRes.res.ok) fail(`Mint API failed: ${JSON.stringify(mintRes.data)}`);
  console.log(`  recorded token #${available.tokenId}`);
  if (mintRes.data.feeBreakdowns) {
    console.log("  fees    ", JSON.stringify(mintRes.data.feeBreakdowns));
  }
  requiresOnChainMint = Boolean(mintRes.data.requiresOnChainMint);
  }

  let mintTx = "";
  if (requiresOnChainMint) {
    console.log("  on-chain mint required — preparing tx");
    const prep = await api("/api/gift/prepare-sign", {
      method: "POST",
      body: JSON.stringify({ collectionId: collection.id, payer, network: "devnet" }),
    });
    if (!prep.res.ok) fail(`prepare-sign failed: ${JSON.stringify(prep.data)}`);
    const txBase64 = String(prep.data.txBase64 || "");
    const tx = VersionedTransaction.deserialize(Buffer.from(txBase64, "base64"));
    tx.sign([kp]);
    const signedB64 = Buffer.from(tx.serialize()).toString("base64");
    const cosign = await api("/api/gift/cosign", {
      method: "POST",
      body: JSON.stringify({
        collectionId: collection.id,
        signedTxBase64: signedB64,
        preparedTxBase64: txBase64,
        payer,
        network: "devnet",
      }),
    });
    if (!cosign.res.ok) fail(`cosign failed: ${JSON.stringify(cosign.data)}`);
    mintTx = String(cosign.data.txSignature || "");
    const confirmed = await api(`/api/collections/${encodeURIComponent(collection.id)}/confirm-mint`, {
      method: "PATCH",
      body: JSON.stringify({
        tokenId: available.tokenId,
        txSignature: mintTx,
        network: "devnet",
      }),
    });
    if (!confirmed.res.ok) fail(`confirm-mint failed: ${JSON.stringify(confirmed.data)}`);
    console.log(`  minted   ${mintTx}`);
    console.log(`  explorer https://explorer.solana.com/tx/${mintTx}?cluster=devnet`);
  } else {
    console.log("  ledger-only mint (no platform key / on-chain skip)");
  }

  const status = await api(`/api/collections/${encodeURIComponent(collection.id)}`, {
    method: "POST",
    body: JSON.stringify({ action: "fee_status", wallet: payer }),
  });
  if (status.res.ok) {
    const ledger = status.data.feeLedger as Collection["feeLedger"];
    console.log("\nTreasury after mint:");
    if (ledger) {
      console.log(`  holder   $${ledger.holderTreasuryUsd}`);
      console.log(`  buyback  $${ledger.buybackTreasuryUsd}`);
      console.log(`  platform $${ledger.platformTreasuryUsd}`);
      console.log(`  creator  $${ledger.ownerAccruedUsd}`);
    } else {
      console.log("  (no ledger)");
    }
    console.log(`  claims   ${status.data.feeClaimsOpen ? "open" : "closed"}`);
    console.log(`  buyback  ${status.data.treasuryBuybackActive ? "active" : "inactive"}`);
  }

  const left = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
  console.log(`\nWallet remaining: ${left} SOL`);
  console.log("\n✅ Live mint test finished");
}

void main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
