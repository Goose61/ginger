/**
 * End-to-end test of primary mint fee accrual, holder rewards, and treasury buyback.
 *
 * Uses the same functions as the live mint API (`accrueSaleFees`, `fireDueMilestones`,
 * `claimHolderFees`, `applyLedgerBuyback`). Does not spend SOL.
 *
 *   npx tsx scripts/test-mint-rewards-buyback.ts
 *   npx tsx scripts/test-mint-rewards-buyback.ts --inspect <collectionId>
 *
 * Inspect mode (read-only, needs the app running):
 *   BASE_URL=http://localhost:3000 npx tsx scripts/test-mint-rewards-buyback.ts --inspect dough-boi
 */

import {
  accrueSaleFees,
  applyLedgerBuyback,
  claimHolderFees,
  previewHolderClaim,
} from "../src/lib/fee-distribution";
import { applySaleTreasury, mintedPercent } from "../src/lib/milestones";
import type { Collection, GeneratedToken } from "../src/lib/types";

const ALICE = "Alice111111111111111111111111111111111111111";
const BOB = "Bob11111111111111111111111111111111111111111";
const CAROL = "Carol11111111111111111111111111111111111111";
const MINT_USD = 10;
const LISTING_USD = 2;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function assert(cond: unknown, message: string) {
  if (!cond) fail(message);
  console.log(`  ✓ ${message}`);
}

function token(id: number): GeneratedToken {
  return {
    tokenId: id,
    dna: `dna-${id}`,
    attributes: [],
    imageRelPath: `${id}.png`,
    metadataRelPath: `${id}.json`,
  };
}

function makeCollection(): Collection {
  const now = new Date().toISOString();
  return {
    id: "economy-test",
    slug: "economy-test",
    name: "Economy Test",
    symbol: "ECON",
    description: "Simulated drop for mint / holder / buyback tests",
    nameTemplate: "Economy Test #{id}",
    chain: "solana",
    status: "live",
    supply: 10,
    mintedCount: 0,
    artPath: "path-b",
    stackOrder: [],
    layers: [],
    blindMint: false,
    revealTrigger: "disabled",
    revealed: true,
    publicMintOpen: true,
    secondaryEnabled: false,
    holderPageUnlocked: false,
    irysPublished: true,
    feeClaimsOpen: false,
    treasuryBuybackActive: false,
    buybackTokenCa: "So11111111111111111111111111111111111111112",
    buybackTreasuryWallet: ALICE,
    royaltyBps: 500,
    royaltySplit: { ownerPercent: 50, holdersPercent: 30, buybackPercent: 20 },
    fees: { ownerPercent: 90, holdersPercent: 5, buybackPercent: 5, locked: true },
    payments: {
      basePriceUsd: MINT_USD,
      acceptSol: true,
      acceptUsdc: true,
      acceptPizza: false,
      acceptSlicePay: true,
      pizzaDiscountPercent: 0,
      giftMintEnabled: false,
      creatorWallet: ALICE,
    },
    milestones: [
      { at: 50, events: ["enable_secondary", "unlock_holder_page"], firedAt: null },
      { at: 80, events: ["fee_distribution"], firedAt: null },
      { at: 90, events: ["treasury_buyback"], firedAt: null },
    ],
    allowlist: [],
    waitlist: [],
    tokens: Array.from({ length: 10 }, (_, i) => token(i + 1)),
    createdAt: now,
    updatedAt: now,
  };
}

function mintTo(collection: Collection, tokenId: number, owner: string) {
  const tokenRow = collection.tokens.find((t) => t.tokenId === tokenId);
  if (!tokenRow) fail(`token ${tokenId} missing`);
  if (tokenRow.owner) fail(`token ${tokenId} already owned`);
  tokenRow.owner = owner;
  const { breakdown } = accrueSaleFees(collection, {
    saleUsd: MINT_USD,
    kind: "primary_mint",
    tokenId,
    payer: owner,
  });
  collection.mintedCount = collection.tokens.filter((t) => t.owner).length;
  const next = applySaleTreasury(collection);
  Object.assign(collection, next);
  return breakdown;
}

async function inspectLive(collectionId: string) {
  const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  console.log(`\n▶ Inspect ${base}/api/collections/${collectionId}\n`);
  const res = await fetch(`${base}/api/collections/${encodeURIComponent(collectionId)}`);
  if (!res.ok) {
    fail(`GET collection failed (${res.status}). Is the app running at ${base}?`);
  }
  const payload = (await res.json()) as { collection?: Collection } & Collection;
  const collection = (payload.collection ?? payload) as Collection;
  const ledger = collection.feeLedger;
  const pct = mintedPercent(collection);

  console.log(`  ${collection.name}  (${collection.id})`);
  console.log(`  status ${collection.status}  minted ${collection.mintedCount}/${collection.supply} (${pct}%)`);
  console.log(`  secondary ${collection.secondaryEnabled ? "on" : "off"}`);
  console.log(`  holder claims ${collection.feeClaimsOpen ? "open" : "closed"}`);
  console.log(`  buyback ${collection.treasuryBuybackActive ? "active" : "inactive"}`);
  if (collection.buybackTokenCa) console.log(`  buyback CA ${collection.buybackTokenCa}`);
  if (collection.buybackTreasuryWallet) console.log(`  treasury ${collection.buybackTreasuryWallet}`);

  if (ledger) {
    console.log(`\n  Ledger`);
    console.log(`    holder pool     $${ledger.holderTreasuryUsd.toFixed(2)}`);
    console.log(`    buyback pool    $${ledger.buybackTreasuryUsd.toFixed(2)}`);
    console.log(`    platform        $${ledger.platformTreasuryUsd.toFixed(2)}`);
    console.log(`    creator accrued $${ledger.ownerAccruedUsd.toFixed(2)}`);
    console.log(`    sales recorded  ${ledger.entries.length}`);
    console.log(`    buybacks        ${ledger.buybacks.length}`);
    console.log(`    claim rounds    ${ledger.distributionRounds.length}`);
    for (const b of ledger.buybacks) {
      if (b.tokenAmount != null) {
        console.log(
          `      ${b.tokenAmount} tokens  $${b.usdSpent ?? b.priceUsd ?? 0}  ${b.treasuryWallet ?? ""}  ${b.txSignature ?? ""}`,
        );
      } else {
        console.log(`      legacy NFT buy #${b.tokenId} @ $${b.priceUsd} from ${b.seller}`);
      }
    }
  } else {
    console.log("\n  No fee ledger yet — no mints have accrued.");
  }

  console.log("\n  Milestones");
  for (const m of collection.milestones ?? []) {
    const mark = m.firedAt ? "fired" : pct >= m.at ? "due" : "pending";
    console.log(`    ${m.at}%  ${m.events.join(", ")}  [${mark}]`);
  }

  const listed = (collection.tokens ?? []).filter((t) => t.listing);
  console.log(`\n  Secondary listings: ${listed.length}`);
  for (const t of listed) {
    console.log(`    #${t.tokenId}  $${t.listing!.priceUsd}  owner ${t.owner}`);
  }

  console.log(`\n  Live mint with SOL (devnet recommended):`);
  console.log(`    1. Set SOLANA_NETWORK=devnet in .env.local and restart.`);
  console.log(`    2. Open ${base}/collection/${collection.slug || collection.id}`);
  console.log(`    3. Connect Phantom, pay with SOL, confirm the mint.`);
  console.log(`    4. Re-run this inspect command and confirm holder/buyback pools increased.`);
    console.log(`    5. After each sale (or a fee_distribution milestone), open /collection/.../holders and claim.`);
}

function runSimulation() {
  console.log("\n▶ Simulated mint → holder rewards → treasury buyback\n");
  const c = makeCollection();

  console.log("1. Alice mints #1–#3, Bob mints #4–#5 ($10 each)");
  mintTo(c, 1, ALICE);
  mintTo(c, 2, ALICE);
  mintTo(c, 3, ALICE);
  mintTo(c, 4, BOB);
  const fifth = mintTo(c, 5, BOB);

  assert(fifth.platformUsd === 0.1, "each $10 mint takes $0.10 platform + trade tax");
  assert(fifth.holdersUsd === 0.5, "5% of $9.90 net → $0.50 holder pool per mint");
  assert(fifth.buybackUsd === 0.5, "5% of $9.90 net → $0.50 buyback pool per mint");
  assert(c.mintedCount === 5, "5/10 minted");
  assert(c.secondaryEnabled === true, "50% milestone enabled secondary");
  assert(c.holderPageUnlocked === true, "50% milestone unlocked holder lounge");
  assert(c.feeLedger?.holderTreasuryUsd === 2.5, "holder pool $2.50 after 5 mints");
  assert(c.feeLedger?.buybackTreasuryUsd === 2.5, "buyback pool $2.50 after 5 mints");

  console.log("\n2. Bob lists #4 on secondary at $2 (below treasury)");
  const listed = c.tokens.find((t) => t.tokenId === 4)!;
  listed.listing = { priceUsd: LISTING_USD, listedAt: new Date().toISOString() };

  console.log("\n3. Alice mints #6–#8 → 80% fires fee_distribution");
  mintTo(c, 6, ALICE);
  mintTo(c, 7, ALICE);
  mintTo(c, 8, ALICE);
  assert(c.mintedCount === 8, "8/10 minted");
  assert(c.feeClaimsOpen === true, "80% opened holder claims");
  const round = c.feeLedger!.distributionRounds[0];
  assert(round.poolUsd === 4, "distribution round locked $4.00 (8 × $0.50)");
  assert(c.feeLedger!.holderTreasuryUsd === 0, "holder pool emptied into the round");
  assert(round.snapshot.find((h) => h.wallet === ALICE)?.count === 6, "Alice held 6 at snapshot");
  assert(round.snapshot.find((h) => h.wallet === BOB)?.count === 2, "Bob held 2 at snapshot");

  console.log("\n4. Alice and Bob claim holder rewards");
  const aliceClaim = claimHolderFees(c, ALICE);
  const bobClaim = claimHolderFees(c, BOB);
  assert(aliceClaim.claimedUsd === 3, "Alice claims 6/8 of $4.00 = $3.00");
  assert(bobClaim.claimedUsd === 1, "Bob claims 2/8 of $4.00 = $1.00");
  const alicePreview = previewHolderClaim(c, ALICE);
  assert(alicePreview?.claimableUsd === 0, "Alice has nothing left to claim");

  let threw = false;
  try {
    claimHolderFees(c, CAROL);
  } catch {
    threw = true;
  }
  assert(threw, "Carol (0 NFTs at snapshot) cannot claim");

  console.log("\n5. Carol mints #9 → 90% arms SPL buyback (token purchase, not NFT floor)");
  mintTo(c, 9, CAROL);
  assert(c.treasuryBuybackActive === true, "90% activated treasury buyback");
  assert(c.tokens.find((t) => t.tokenId === 4)?.owner === BOB, "Bob still owns listed #4 — buyback does not take NFTs");
  const spent = applyLedgerBuyback(c, {
    usdSpent: 2.5,
    tokenAmount: 2500,
    route: "direct_mint",
  });
  assert(spent.purchased === true, "ledger buyback spent $2.50 of the pool");
  assert(c.feeLedger!.buybacks.length === 1, "one SPL buyback recorded");
  assert(c.feeLedger!.buybacks[0].usdSpent === 2.5, "recorded $2.50 spent");
  assert(c.feeLedger!.buybacks[0].treasuryWallet === ALICE, "tokens go to the treasury wallet");
  assert(c.feeLedger!.buybacks[0].buybackTokenCa === "So11111111111111111111111111111111111111112", "buyback CA stored");
  assert(c.feeLedger!.buybackTreasuryUsd === 2, "pool $4.50 − $2.50 = $2.00");

  console.log("\n6. Buyback with empty spend is skipped");
  const again = applyLedgerBuyback(c, { usdSpent: 0, tokenAmount: 0 });
  assert(again.purchased === false, "zero spend is skipped");

  console.log("\n✅ Mint, holder rewards, and buyback all passed\n");
  console.log("This proved the in-app economy (USD ledger + milestones).");
  console.log("On-chain SOL mint still needs Phantom in the browser — use --inspect after a live mint.");
}

function runInstantSimulation() {
  console.log("\n▶ No-milestone collection: distribute on every sale\n");
  const c = makeCollection();
  c.milestones = [];
  c.supply = 5;
  c.tokens = Array.from({ length: 5 }, (_, i) => token(i + 1));
  c.secondaryEnabled = false;
  c.feeClaimsOpen = false;
  c.treasuryBuybackActive = false;

  console.log("1. Alice mints #1 — only holder, gets 100% of that sale's holder pool");
  mintTo(c, 1, ALICE);
  assert(c.feeClaimsOpen, "claims open after the first sale");
  assert(c.treasuryBuybackActive, "buyback armed after the first sale");
  assert(c.secondaryEnabled, "secondary listings enabled (no enable_secondary milestone)");
  assert(c.feeLedger!.distributionRounds.length === 1, "round 1 opened immediately");
  assert(c.feeLedger!.holderTreasuryUsd === 0, "holder pool emptied into round 1");
  const r1 = c.feeLedger!.distributionRounds[0];
  assert(r1.snapshot.length === 1 && r1.snapshot[0].wallet === ALICE, "Alice is the only holder in round 1");
  assert(r1.poolUsd === 0.5, "round 1 locked $0.50");

  console.log("2. Bob mints #2 — Alice and Bob split that sale 50/50");
  mintTo(c, 2, BOB);
  const r2 = c.feeLedger!.distributionRounds[1];
  assert(c.feeLedger!.distributionRounds.length === 2, "round 2 opened on Bob's mint");
  assert(r2.snapshot.find((h) => h.wallet === ALICE)?.count === 1, "Alice still holds #1");
  assert(r2.snapshot.find((h) => h.wallet === BOB)?.count === 1, "Bob holds #2");
  assert(r2.poolUsd === 0.5, "round 2 locked $0.50");

  console.log("3. Carol mints #3, Alice mints #4 — SPL buyback spends the accrued pool");
  mintTo(c, 3, CAROL);
  mintTo(c, 4, ALICE);
  assert(c.tokens.find((t) => t.tokenId === 2)?.owner === BOB, "NFT owners unchanged — buyback is not an NFT floor bid");
  const pool = c.feeLedger!.buybackTreasuryUsd;
  assert(pool === 2, "4 mints × $0.50 = $2.00 buyback pool");
  const spent = applyLedgerBuyback(c, { usdSpent: pool, tokenAmount: 2000, route: "direct_mint" });
  assert(spent.purchased === true, "SPL buyback consumed the pool");
  assert(c.feeLedger!.buybackTreasuryUsd === 0, "buyback pool emptied");
  assert(c.feeLedger!.buybacks[0].treasuryWallet === ALICE, "tokens credited to treasury wallet");

  console.log("4. Claims sum every round, not just the latest");
  const alice = claimHolderFees(c, ALICE);
  const bob = claimHolderFees(c, BOB);
  const carol = claimHolderFees(c, CAROL);
  assert(alice.claimedUsd > bob.claimedUsd, "Alice earned more (held through more rounds)");
  assert(carol.claimedUsd > 0, "Carol received a share from rounds after she minted");
  assert(previewHolderClaim(c, ALICE)?.claimableUsd === 0, "Alice fully claimed");

  console.log("\n✅ Instant no-milestone distribution passed\n");
}

async function main() {
  const args = process.argv.slice(2);
  const inspectAt = args.indexOf("--inspect");
  if (inspectAt >= 0) {
    const id = args[inspectAt + 1];
    if (!id) fail("Usage: npx tsx scripts/test-mint-rewards-buyback.ts --inspect <collectionId>");
    await inspectLive(id);
    return;
  }
  runSimulation();
  runInstantSimulation();
}

void main();
