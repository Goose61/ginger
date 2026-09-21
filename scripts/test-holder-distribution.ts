/**
 * Launch a 6-NFT no-milestone collection on devnet and mint to 5 holders.
 *
 *   npx tsx scripts/test-holder-distribution.ts
 *   npx tsx scripts/test-holder-distribution.ts --buyback
 *
 * Pays with .devnet-wallet.json. Holder keypairs go to .devnet-holders.json.
 * `--buyback` creates a test SPL mint and buys it into the creator treasury.
 */

import fs from "node:fs";
import path from "node:path";
import nacl from "tweetnacl";
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
const PAYER_PATH = path.join(ROOT, ".devnet-wallet.json");
const HOLDERS_PATH = path.join(ROOT, ".devnet-holders.json");
const CREATOR_PATH = path.join(ROOT, ".devnet-creator.json");
const BUYBACK_MINT_PATH = path.join(ROOT, ".devnet-buyback-mint.json");
const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const RPC = process.env.SOLANA_RPC_URL_DEVNET ?? "https://api.devnet.solana.com";
const SLUG = "holder-test";
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const AUTH_PREFIX = "Dough Boi Auth: ";

function fail(message: string): never {
  console.error(`✗ ${message}`);
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

function loadPayer() {
  if (!fs.existsSync(PAYER_PATH)) fail("No .devnet-wallet.json — run npm run create:devnet-wallet");
  const raw = JSON.parse(fs.readFileSync(PAYER_PATH, "utf8")) as { secretKeyBase58: string };
  return Keypair.fromSecretKey(b58decode(raw.secretKeyBase58));
}

function loadOrCreateKeypair(file: string, label: string) {
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { secretKey: number[] };
    return Keypair.fromSecretKey(Uint8Array.from(raw.secretKey));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(
    file,
    JSON.stringify({ label, publicKey: kp.publicKey.toBase58(), secretKey: Array.from(kp.secretKey) }, null, 2),
  );
  return kp;
}

function loadOrCreateHolders(): Keypair[] {
  if (fs.existsSync(HOLDERS_PATH)) {
    const raw = JSON.parse(fs.readFileSync(HOLDERS_PATH, "utf8")) as { secretKey: number[] }[];
    return raw.map((row) => Keypair.fromSecretKey(Uint8Array.from(row.secretKey)));
  }
  const kps = Array.from({ length: 5 }, () => Keypair.generate());
  fs.writeFileSync(
    HOLDERS_PATH,
    JSON.stringify(
      kps.map((kp, i) => ({
        label: `holder-${i + 1}`,
        publicKey: kp.publicKey.toBase58(),
        secretKey: Array.from(kp.secretKey),
      })),
      null,
      2,
    ),
  );
  return kps;
}

function authHeaders(kp: Keypair) {
  const timestamp = Date.now();
  const msg = new TextEncoder().encode(`${AUTH_PREFIX}${timestamp}`);
  const signature = Buffer.from(nacl.sign.detached(msg, kp.secretKey)).toString("base64");
  return {
    "Content-Type": "application/json",
    "x-wallet": kp.publicKey.toBase58(),
    "x-signature": signature,
    "x-timestamp": String(timestamp),
  };
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
  assetAddress?: string;
  mintTxUrl?: string;
  imageUri?: string;
  metadataUri?: string;
  dna?: string;
  attributes?: { trait_type: string; value: string | number }[];
  imageRelPath?: string;
  metadataRelPath?: string;
};

type Collection = {
  id: string;
  slug: string;
  name: string;
  mintedCount: number;
  supply: number;
  tokens?: Token[];
  payments: { basePriceUsd: number; creatorWallet?: string };
  feeClaimsOpen?: boolean;
  treasuryBuybackActive?: boolean;
  buybackTokenCa?: string;
  buybackTreasuryWallet?: string;
  feeLedger?: {
    holderTreasuryUsd: number;
    buybackTreasuryUsd: number;
    distributionRounds: {
      poolUsd: number;
      totalShares: number;
      snapshot: { wallet: string; count: number }[];
    }[];
    buybacks: {
      tokenId?: number;
      priceUsd?: number;
      seller?: string;
      usdSpent?: number;
      tokenAmount?: number;
      txSignature?: string;
      treasuryWallet?: string;
      buybackTokenCa?: string;
    }[];
  };
};

async function ensureCollection(creator: string): Promise<Collection> {
  const existing = await api(`/api/collections/${SLUG}`);
  if (existing.res.ok) {
    const col = (existing.data.collection as Collection | undefined) ?? (existing.data as unknown as Collection);
    if (col?.id) return col;
  }

  loadEnvLocal();
  const { getCollection, saveCollection, newId, slugify } = await import("../src/lib/store");
  const dough = await getCollection("dough-boi");
  if (!dough) fail("Dough Boi not in Mongo — need published metadata URIs to copy");
  const source = (dough.tokens ?? [])
    .filter((t) => t.metadataUri?.startsWith("http") && t.tokenId !== 37)
    .slice(0, 6);
  if (source.length < 6) fail("Need 6 Dough Boi tokens with published metadata");

  const now = new Date().toISOString();
  const id = newId();
  const tokens = source.map((t, i) => ({
    tokenId: i + 1,
    dna: t.dna,
    attributes: t.attributes,
    imageRelPath: t.imageRelPath,
    metadataRelPath: t.metadataRelPath,
    imageUri: t.imageUri,
    metadataUri: t.metadataUri,
  }));

  await saveCollection({
    id,
    slug: slugify("Holder Test"),
    name: "Holder Test",
    symbol: "HOLD",
    description: "Devnet collection for instant holder rewards and buyback (no milestones).",
    nameTemplate: "Holder Test #{id}",
    chain: "solana",
    status: "live",
    supply: 6,
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
      acceptUsdc: true,
      acceptPizza: false,
      acceptSlicePay: false,
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
    tokens,
    logoUrl: dough.logoUrl,
  });
  console.log(`Created collection ${id} (${SLUG})`);
  const created = await api(`/api/collections/${SLUG}`);
  if (!created.res.ok) fail(`Could not reload new collection: ${JSON.stringify(created.data)}`);
  return (created.data.collection as Collection | undefined) ?? (created.data as unknown as Collection);
}

async function mintOne(params: {
  collection: Collection;
  payer: Keypair;
  recipient: string;
  tokenId: number;
  conn: Connection;
}) {
  const { collection, payer, recipient, tokenId, conn } = params;
  const priceUsd = collection.payments.basePriceUsd;
  const quoteRes = await api(`/api/quotes?usd=${priceUsd}`);
  const quote = quoteRes.data.quote as { sol: number; solUsd: number };
  if (!quote?.sol) fail(`No SOL quote: ${JSON.stringify(quoteRes.data)}`);
  const lamports = Math.ceil(quote.sol * LAMPORTS_PER_SOL * 1.1);
  const creator = collection.payments.creatorWallet;
  if (!creator) fail("Creator wallet missing");
  const { getMintPaymentRecipient } = await import("../src/lib/platform-disbursement");
  const platform = getMintPaymentRecipient();
  if (!platform) fail("Platform wallet not configured (ARWEAVE_SOLANA_KEY)");

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const payTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: new PublicKey(platform),
      lamports,
    }),
  );
  payTx.recentBlockhash = blockhash;
  payTx.feePayer = payer.publicKey;
  payTx.sign(payer);
  const paySig = await conn.sendRawTransaction(payTx.serialize());
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
      network: "devnet",
    }),
  });
  if (!mintRes.res.ok) fail(`Mint #${tokenId} failed: ${JSON.stringify(mintRes.data)}`);
  if (mintRes.data.creatorDisburse) {
    const d = mintRes.data.creatorDisburse as { ok?: boolean; txUrl?: string; error?: string };
    console.log(`  creator payout ${d.ok ? "sent" : "skipped"} ${d.txUrl ?? d.error ?? ""}`);
  }
  if (mintRes.data.buyback) {
    const b = mintRes.data.buyback as { purchased?: boolean; tokenAmount?: number; reason?: string };
    if (b.purchased) console.log(`  buyback    ${b.tokenAmount ?? 0} tokens`);
    else if (b.reason) console.log(`  buyback    skipped (${b.reason})`);
  }

  if (mintRes.data.requiresOnChainMint) {
    const prep = await api("/api/gift/prepare-sign", {
      method: "POST",
      body: JSON.stringify({
        collectionId: collection.id,
        payer: payer.publicKey.toBase58(),
        network: "devnet",
      }),
    });
    if (!prep.res.ok) fail(`prepare-sign #${tokenId} failed: ${JSON.stringify(prep.data)}`);
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
        network: "devnet",
      }),
    });
    if (!cosign.res.ok) fail(`cosign #${tokenId} failed: ${JSON.stringify(cosign.data)}`);
    const confirmed = await api(`/api/collections/${encodeURIComponent(collection.id)}/confirm-mint`, {
      method: "PATCH",
      body: JSON.stringify({
        tokenId,
        txSignature: String(cosign.data.txSignature || ""),
        network: "devnet",
      }),
    });
    if (!confirmed.res.ok) fail(`confirm-mint #${tokenId} failed: ${JSON.stringify(confirmed.data)}`);
  }

  const fees = mintRes.data.feeBreakdowns as { holdersUsd: number; buybackUsd: number }[] | undefined;
  return { paySig, holdersUsd: fees?.[0]?.holdersUsd, buybackUsd: fees?.[0]?.buybackUsd };
}

async function ensureBuybackSplMint(payer: Keypair, conn: Connection): Promise<string> {
  if (fs.existsSync(BUYBACK_MINT_PATH)) {
    const saved = JSON.parse(fs.readFileSync(BUYBACK_MINT_PATH, "utf8")) as { mint: string };
    if (saved.mint) {
      console.log(`Reusing SPL mint ${saved.mint}`);
      return saved.mint;
    }
  }
  const { createMint } = await import("@solana/spl-token");
  const { getPlatformSecretKey } = await import("../src/lib/platform-key");
  const secret = getPlatformSecretKey();
  if (!secret) fail("ARWEAVE_SOLANA_KEY missing — needed as mint authority for the test SPL");
  const platform = Keypair.fromSecretKey(secret);
  const platformSol = (await conn.getBalance(platform.publicKey)) / LAMPORTS_PER_SOL;
  if (platformSol < 0.05) {
    const need = Math.ceil((0.08 - platformSol) * 1e9);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: platform.publicKey,
        lamports: need,
      }),
    );
    tx.sign(payer);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    console.log(`Funded platform ${platform.publicKey.toBase58()} +${need / 1e9} SOL`);
  }
  const mint = await createMint(conn, platform, platform.publicKey, null, 6);
  fs.writeFileSync(BUYBACK_MINT_PATH, JSON.stringify({ mint: mint.toBase58() }, null, 2));
  console.log(`Created SPL mint ${mint.toBase58()} (platform mint authority)`);
  return mint.toBase58();
}

async function runBuybackTest(collectionId: string, payer: Keypair, creator: Keypair) {
  const { getAssociatedTokenAddress, getAccount } = await import("@solana/spl-token");
  const conn = new Connection(RPC, "confirmed");
  const mintCa = await ensureBuybackSplMint(payer, conn);
  const treasuryWallet = creator.publicKey.toBase58();

  console.log(`Attaching SPL buyback CA + treasury wallet to collection…`);
  const save = await api(`/api/collections/${encodeURIComponent(collectionId)}`, {
    method: "POST",
    headers: authHeaders(creator),
    body: JSON.stringify({
      action: "set_buyback",
      buybackTokenCa: mintCa,
      buybackTreasuryWallet: treasuryWallet,
    }),
  });
  if (!save.res.ok) fail(`Could not save buyback settings: ${JSON.stringify(save.data)}`);

  const beforeRes = await api(`/api/collections/${encodeURIComponent(collectionId)}`);
  if (!beforeRes.res.ok) fail(`Could not load collection: ${JSON.stringify(beforeRes.data)}`);
  const before = (beforeRes.data.collection as Collection | undefined) ?? (beforeRes.data as unknown as Collection);
  const ledger = before.feeLedger;
  const pool = ledger?.buybackTreasuryUsd ?? 0;
  console.log(`Buyback active: ${before.treasuryBuybackActive ? "yes" : "no"}`);
  console.log(`Buyback pool:   $${pool}`);
  console.log(`Token CA:       ${before.buybackTokenCa}`);
  console.log(`Treasury:       ${before.buybackTreasuryWallet}`);
  console.log(`Prior buys:     ${ledger?.buybacks.length ?? 0}`);
  for (const b of ledger?.buybacks ?? []) {
    if (b.txSignature) {
      console.log(`  already bought ${b.tokenAmount ?? 0} tokens  $${b.usdSpent ?? 0}  ${b.txSignature}`);
    } else if (b.tokenId) {
      console.log(`  legacy NFT buy #${b.tokenId} @ $${b.priceUsd} (ignored)`);
    }
  }
  if (pool <= 0) {
    console.log("Buyback pool empty — topping up ledger for devnet swap test");
    loadEnvLocal();
    const { updateCollection } = await import("../src/lib/store");
    await updateCollection(collectionId, (c) => {
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
      c.feeLedger.buybackTreasuryUsd = 0.5;
      c.treasuryBuybackActive = true;
      return c;
    });
  }

  console.log("Executing SPL buyback into treasury…");
  const buy = await api(`/api/collections/${encodeURIComponent(collectionId)}`, {
    method: "POST",
    body: JSON.stringify({ action: "execute_buyback", network: "devnet" }),
  });
  if (!buy.res.ok) fail(`Buyback failed: ${JSON.stringify(buy.data)}`);
  console.log(`  purchased ${buy.data.purchased ? "yes" : "no"}`);
  if (!buy.data.purchased) fail(`Buyback did not purchase: ${String(buy.data.reason)}`);
  console.log(`  usdSpent     $${buy.data.usdSpent}`);
  console.log(`  tokenAmount  ${buy.data.tokenAmount}`);
  console.log(`  treasury     ${buy.data.treasuryWallet}`);
  console.log(`  signature    ${buy.data.txSignature}`);
  console.log(`  explorer     ${buy.data.txUrl}`);

  const mintPk = new PublicKey(mintCa);
  const ata = await getAssociatedTokenAddress(mintPk, creator.publicKey);
  const account = await getAccount(conn, ata);
  const raw = account.amount.toString();
  console.log(`  treasury ATA ${ata.toBase58()}`);
  console.log(`  ATA balance  ${raw} raw`);
  if (account.amount === 0n) fail("Treasury ATA has 0 tokens after buyback");

  const afterCol = (buy.data.collection as Collection | undefined) ?? before;
  const afterLedger = afterCol.feeLedger;
  console.log(`  pool left    $${afterLedger?.buybackTreasuryUsd ?? 0}`);
  console.log(`  buy records  ${afterLedger?.buybacks.length ?? 0}`);
  console.log("\n✅ SPL token buyback into treasury passed");
}

async function main() {
  loadEnvLocal();
  const buybackOnly = process.argv.includes("--buyback");
  const payer = loadPayer();
  const creator = loadOrCreateKeypair(CREATOR_PATH, "creator");
  const holders = loadOrCreateHolders();
  const conn = new Connection(RPC, "confirmed");
  const sol = (await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL;
  console.log(`Payer    ${payer.publicKey.toBase58()}  ${sol} SOL`);
  console.log(`Creator  ${creator.publicKey.toBase58()}`);
  holders.forEach((h, i) => console.log(`Holder ${i + 1} ${h.publicKey.toBase58()}`));
  const net = await api("/api/network");
  if (net.data.network !== "devnet") fail(`Server is ${String(net.data.network)}, refusing`);

  let collection = await ensureCollection(creator.publicKey.toBase58());
  console.log(`\n${collection.name}  ${collection.mintedCount}/${collection.supply}`);
  if (buybackOnly) {
    await runBuybackTest(collection.id, payer, creator);
    return;
  }
  if (sol < 0.2) fail("Need ~0.2 devnet SOL for 6 cheap mints");

  const tokens = collection.tokens ?? [];
  const needed = [1, 2, 3, 4, 5].filter((id) => {
    const t = tokens.find((row) => row.tokenId === id);
    return t && !t.owner && !t.reservedBy;
  });

  for (const tokenId of needed) {
    const recipient = holders[tokenId - 1].publicKey.toBase58();
    console.log(`\nMinting #${tokenId} → holder ${tokenId}`);
    const result = await mintOne({ collection, payer, recipient, tokenId, conn });
    console.log(`  paid ${result.paySig}`);
    console.log(`  holders +$${result.holdersUsd}  buyback +$${result.buybackUsd}`);
  }

  collection = ((await api(`/api/collections/${collection.id}`)).data.collection as Collection) ?? collection;

  const token6 = collection.tokens?.find((t) => t.tokenId === 6);
  if (token6 && !token6.owner && !token6.reservedBy) {
    console.log("\nMinting #6 → holder 1");
    await mintOne({
      collection,
      payer,
      recipient: holders[0].publicKey.toBase58(),
      tokenId: 6,
      conn,
    });
  }

  collection = ((await api(`/api/collections/${collection.id}`)).data.collection as Collection) ?? collection;
  const ledger = collection.feeLedger;
  console.log("\n── Holder distribution ──");
  console.log(`claims   ${collection.feeClaimsOpen ? "open" : "closed"}`);
  console.log(`buyback  ${collection.treasuryBuybackActive ? "active" : "inactive"}`);
  console.log(`holder pool left $${ledger?.holderTreasuryUsd ?? 0}`);
  console.log(`buyback pool     $${ledger?.buybackTreasuryUsd ?? 0}`);
  console.log(`rounds           ${ledger?.distributionRounds.length ?? 0}`);
  for (const [i, round] of (ledger?.distributionRounds ?? []).entries()) {
    const names = round.snapshot
      .map((s) => {
        const idx = holders.findIndex((h) => h.publicKey.toBase58() === s.wallet);
        return `H${idx + 1}×${s.count}`;
      })
      .join(", ");
    console.log(`  round ${i + 1}  $${round.poolUsd}  ${names}`);
  }
  for (const b of ledger?.buybacks ?? []) {
    if (b.tokenAmount != null) {
      console.log(`  buyback ${b.tokenAmount} tokens  $${b.usdSpent ?? 0}  ${b.txSignature ?? ""}`);
    } else if (b.tokenId) {
      console.log(`  legacy NFT buy #${b.tokenId} @ $${b.priceUsd}`);
    }
  }

  console.log("\n── Claim previews ──");
  for (let i = 0; i < holders.length; i++) {
    const wallet = holders[i].publicKey.toBase58();
    const status = await api(`/api/collections/${encodeURIComponent(collection.id)}`, {
      method: "POST",
      body: JSON.stringify({ action: "fee_status", wallet }),
    });
    const preview = status.data.claimPreview as
      | { heldCount: number; claimableUsd: number; alreadyClaimedUsd: number }
      | null;
    const owned = (collection.tokens ?? []).filter((t) => t.owner === wallet).map((t) => t.tokenId);
    console.log(
      `  H${i + 1}  holds ${preview?.heldCount ?? 0} ${owned.length ? `(#${owned.join(",")})` : ""}  claimable $${preview?.claimableUsd ?? 0}`,
    );
  }

  const leftover = (await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL;
  console.log(`\nPayer remaining: ${leftover} SOL`);
  console.log("\n✅ Holder distribution test finished");
}

void main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
