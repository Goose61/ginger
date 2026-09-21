import type {
  Collection,
  FeeLedgerEntry,
  FeeSplit,
  RoyaltySplit,
} from "./types";
import {
  PRIMARY_PLATFORM_FEE_PERCENT,
  PRIMARY_TRADE_TAX_PERCENT,
  SECONDARY_PLATFORM_FEE_PERCENT,
} from "./platform-fees";

/** Legacy marker for NFTs taken by the old NFT-floor buyback path. */
export const TREASURY_OWNER_MARKER = "__platform_treasury__";

export type SaleFeeBreakdown = {
  saleUsd: number;
  kind: "primary_mint" | "secondary_sale";
  ownerUsd: number;
  holdersUsd: number;
  buybackUsd: number;
  platformUsd: number;
  platformFeeUsd: number;
  tradeTaxUsd: number;
};

export type HolderClaimPreview = {
  wallet: string;
  heldCount: number;
  claimableUsd: number;
  alreadyClaimedUsd: number;
};

function roundUsd(n: number) {
  return Math.round(n * 100) / 100;
}

export function roundUsdShare(poolUsd: number, shares: number, totalShares: number) {
  if (totalShares <= 0) return 0;
  return roundUsd((poolUsd * shares) / totalShares);
}

/** Creator split (owner / holders / buyback) on net after fixed platform + trade tax. */
export function splitPrimaryMintFees(
  saleUsd: number,
  fees: FeeSplit,
): Omit<SaleFeeBreakdown, "saleUsd" | "kind"> {
  const platformFeeUsd = roundUsd((saleUsd * PRIMARY_PLATFORM_FEE_PERCENT) / 100);
  const tradeTaxUsd = roundUsd((saleUsd * PRIMARY_TRADE_TAX_PERCENT) / 100);
  const platformUsd = roundUsd(platformFeeUsd + tradeTaxUsd);
  const netUsd = roundUsd(Math.max(0, saleUsd - platformUsd));

  const ownerUsd = roundUsd((netUsd * fees.ownerPercent) / 100);
  const holdersUsd = roundUsd((netUsd * fees.holdersPercent) / 100);
  const buybackUsd = roundUsd((netUsd * fees.buybackPercent) / 100);

  return { ownerUsd, holdersUsd, buybackUsd, platformUsd, platformFeeUsd, tradeTaxUsd };
}

/** Creator royalty portions of secondary sale price (excludes marketplace platform fee). */
export function splitSecondaryRoyalties(
  saleUsd: number,
  royaltyBps: number,
  royaltySplit?: RoyaltySplit,
): Pick<SaleFeeBreakdown, "ownerUsd" | "holdersUsd" | "buybackUsd"> {
  const royaltyUsd = roundUsd((saleUsd * royaltyBps) / 10_000);
  if (!royaltySplit || royaltyUsd <= 0) {
    return { ownerUsd: royaltyUsd, holdersUsd: 0, buybackUsd: 0 };
  }
  const ownerUsd = roundUsd((royaltyUsd * royaltySplit.ownerPercent) / 100);
  const holdersUsd = roundUsd((royaltyUsd * royaltySplit.holdersPercent) / 100);
  const buybackUsd = roundUsd((royaltyUsd * royaltySplit.buybackPercent) / 100);
  return { ownerUsd, holdersUsd, buybackUsd };
}

/** Full secondary sale breakdown: fixed platform fee + creator royalties. */
export function splitSecondarySale(
  saleUsd: number,
  royaltyBps: number,
  royaltySplit?: RoyaltySplit,
): Omit<SaleFeeBreakdown, "saleUsd" | "kind"> {
  const platformFeeUsd = roundUsd((saleUsd * SECONDARY_PLATFORM_FEE_PERCENT) / 100);
  const royaltyParts = splitSecondaryRoyalties(saleUsd, royaltyBps, royaltySplit);
  return {
    ...royaltyParts,
    platformUsd: platformFeeUsd,
    platformFeeUsd,
    tradeTaxUsd: 0,
  };
}

function ensureLedger(collection: Collection) {
  if (!collection.feeLedger) {
    collection.feeLedger = {
      holderTreasuryUsd: 0,
      buybackTreasuryUsd: 0,
      platformTreasuryUsd: 0,
      ownerAccruedUsd: 0,
      entries: [],
      distributionRounds: [],
      buybacks: [],
    };
  }
  return collection.feeLedger;
}

export function accrueSaleFees(
  collection: Collection,
  params: {
    saleUsd: number;
    kind: "primary_mint" | "secondary_sale";
    tokenId?: number;
    payer?: string;
    seller?: string;
  },
): { collection: Collection; breakdown: SaleFeeBreakdown } {
  const ledger = ensureLedger(collection);
  const breakdownParts =
    params.kind === "primary_mint"
      ? splitPrimaryMintFees(params.saleUsd, collection.fees)
      : splitSecondarySale(
          params.saleUsd,
          collection.royaltyBps ?? 500,
          collection.royaltySplit,
        );

  const breakdown: SaleFeeBreakdown = {
    saleUsd: params.saleUsd,
    kind: params.kind,
    ...breakdownParts,
  };

  ledger.holderTreasuryUsd = roundUsd(ledger.holderTreasuryUsd + breakdown.holdersUsd);
  ledger.buybackTreasuryUsd = roundUsd(ledger.buybackTreasuryUsd + breakdown.buybackUsd);
  ledger.platformTreasuryUsd = roundUsd(ledger.platformTreasuryUsd + breakdown.platformUsd);
  ledger.ownerAccruedUsd = roundUsd(ledger.ownerAccruedUsd + breakdown.ownerUsd);

  const entry: FeeLedgerEntry = {
    at: new Date().toISOString(),
    kind: params.kind,
    saleUsd: params.saleUsd,
    tokenId: params.tokenId,
    payer: params.payer,
    seller: params.seller,
    ownerUsd: breakdown.ownerUsd,
    holdersUsd: breakdown.holdersUsd,
    buybackUsd: breakdown.buybackUsd,
    platformUsd: breakdown.platformUsd,
    platformFeeUsd: breakdown.platformFeeUsd,
    tradeTaxUsd: breakdown.tradeTaxUsd,
  };
  ledger.entries.push(entry);

  return { collection, breakdown };
}

export function holderCounts(collection: Collection): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of collection.tokens) {
    const wallet =
      t.owner && t.owner !== TREASURY_OWNER_MARKER
        ? t.owner
        : t.reservedBy && t.reservedBy !== TREASURY_OWNER_MARKER
          ? t.reservedBy
          : null;
    if (!wallet) continue;
    counts.set(wallet, (counts.get(wallet) ?? 0) + 1);
  }
  return counts;
}

/** Open a holder distribution round when fee_distribution milestone fires. */
export function openFeeDistributionRound(collection: Collection, milestoneAt?: number): Collection {
  const ledger = ensureLedger(collection);
  const poolUsd = ledger.holderTreasuryUsd;
  if (poolUsd <= 0) return collection;

  const snapshot = Array.from(holderCounts(collection).entries()).map(([wallet, count]) => ({
    wallet,
    count,
  }));
  const totalShares = snapshot.reduce((s, h) => s + h.count, 0);
  if (totalShares === 0) return collection;

  ledger.distributionRounds.push({
    id: `round-${ledger.distributionRounds.length + 1}`,
    openedAt: new Date().toISOString(),
    milestoneAt,
    poolUsd,
    totalShares,
    snapshot,
    claims: [],
  });
  ledger.holderTreasuryUsd = 0;
  return collection;
}

export function getOpenDistributionRound(collection: Collection) {
  const rounds = collection.feeLedger?.distributionRounds ?? [];
  return rounds.length > 0 ? rounds[rounds.length - 1] : null;
}

/** Most recent round not yet paid on-chain (the one opened by the latest sale). */
export function getLatestUndistributedRound(collection: Collection) {
  const rounds = collection.feeLedger?.distributionRounds ?? [];
  for (let i = rounds.length - 1; i >= 0; i--) {
    const round = rounds[i];
    if (!round.distributedAt && round.poolUsd > 0 && round.snapshot.length > 0) {
      return round;
    }
  }
  return null;
}

/** All unpaid rounds, oldest first (for backfill). */
export function getUndistributedRounds(collection: Collection) {
  return (collection.feeLedger?.distributionRounds ?? []).filter(
    (round) => !round.distributedAt && round.poolUsd > 0 && round.snapshot.length > 0,
  );
}

/** Per-wallet USD owed for a distribution round (last wallet absorbs rounding remainder). */
export function holderPayoutsForRound(round: {
  poolUsd: number;
  totalShares: number;
  snapshot: { wallet: string; count: number }[];
}): { wallet: string; amountUsd: number }[] {
  if (round.poolUsd <= 0 || round.totalShares <= 0 || round.snapshot.length === 0) return [];
  const payouts: { wallet: string; amountUsd: number }[] = [];
  let assigned = 0;
  for (let i = 0; i < round.snapshot.length; i++) {
    const { wallet, count } = round.snapshot[i];
    const amountUsd =
      i === round.snapshot.length - 1
        ? roundUsd(round.poolUsd - assigned)
        : roundUsdShare(round.poolUsd, count, round.totalShares);
    if (i < round.snapshot.length - 1) assigned = roundUsd(assigned + amountUsd);
    if (amountUsd > 0) payouts.push({ wallet, amountUsd });
  }
  return payouts;
}

export function applyRoundPayouts(
  collection: Collection,
  roundId: string,
  payouts: {
    wallet: string;
    amountUsd: number;
    grossAmountUsd?: number;
    feeUsd?: number;
    txSignature: string;
    txUrl?: string;
    paidAt?: string;
  }[],
): Collection {
  const ledger = ensureLedger(collection);
  const round = ledger.distributionRounds.find((r) => r.id === roundId);
  if (!round) return collection;
  const now = new Date().toISOString();
  round.payouts = payouts.map((p) => ({
    wallet: p.wallet,
    amountUsd: p.amountUsd,
    grossAmountUsd: p.grossAmountUsd,
    feeUsd: p.feeUsd,
    txSignature: p.txSignature,
    txUrl: p.txUrl,
    paidAt: p.paidAt ?? now,
  }));
  round.distributedAt = now;
  for (const p of payouts) {
    if (p.amountUsd <= 0) continue;
    round.claims.push({ wallet: p.wallet, amountUsd: p.amountUsd, claimedAt: now });
  }
  return collection;
}

export function previewHolderClaim(collection: Collection, wallet: string): HolderClaimPreview | null {
  if (!collection.feeClaimsOpen) return null;

  const rounds = collection.feeLedger?.distributionRounds ?? [];
  const heldCount = holderCounts(collection).get(wallet) ?? 0;
  let claimableUsd = 0;
  let alreadyClaimedUsd = 0;

  for (const round of rounds) {
    const snap = round.snapshot.find((h) => h.wallet === wallet);
    const entitled = snap ? roundUsdShare(round.poolUsd, snap.count, round.totalShares) : 0;
    const paidOnChain = roundUsd(
      (round.payouts ?? [])
        .filter((p) => p.wallet === wallet)
        .reduce((s, p) => s + p.amountUsd, 0),
    );
    const claimed = roundUsd(
      round.claims.filter((c) => c.wallet === wallet).reduce((s, c) => s + c.amountUsd, 0),
    );
    const settled = roundUsd(Math.max(claimed, paidOnChain));
    alreadyClaimedUsd = roundUsd(alreadyClaimedUsd + settled);
    claimableUsd = roundUsd(claimableUsd + Math.max(0, entitled - settled));
  }

  return { wallet, heldCount, claimableUsd, alreadyClaimedUsd };
}

export function claimHolderFees(collection: Collection, wallet: string): {
  collection: Collection;
  claimedUsd: number;
} {
  if (!collection.feeClaimsOpen) {
    throw new Error("Fee claims are not open for this collection");
  }
  const preview = previewHolderClaim(collection, wallet);
  if (!preview || preview.claimableUsd <= 0) {
    throw new Error("Nothing to claim for this wallet");
  }

  const now = new Date().toISOString();
  const rounds = collection.feeLedger?.distributionRounds ?? [];
  let claimedUsd = 0;
  for (const round of rounds) {
    const snap = round.snapshot.find((h) => h.wallet === wallet);
    const entitled = snap ? roundUsdShare(round.poolUsd, snap.count, round.totalShares) : 0;
    const paidOnChain = roundUsd(
      (round.payouts ?? [])
        .filter((p) => p.wallet === wallet)
        .reduce((s, p) => s + p.amountUsd, 0),
    );
    const already = roundUsd(
      round.claims.filter((c) => c.wallet === wallet).reduce((s, c) => s + c.amountUsd, 0),
    );
    const settled = roundUsd(Math.max(already, paidOnChain));
    const due = roundUsd(Math.max(0, entitled - settled));
    if (due <= 0) continue;
    round.claims.push({ wallet, amountUsd: due, claimedAt: now });
    claimedUsd = roundUsd(claimedUsd + due);
  }
  if (claimedUsd <= 0) {
    throw new Error("Nothing to claim for this wallet");
  }

  return { collection, claimedUsd };
}

export type BuybackResult = {
  collection: Collection;
  purchased: boolean;
  usdSpent?: number;
  tokenAmount?: number;
  txSignature?: string;
  txUrl?: string;
  treasuryWallet?: string;
  reason?: string;
};

/** Debit the buyback USD pool and record an SPL purchase into the creator treasury. */
export function applyLedgerBuyback(
  collection: Collection,
  rec: {
    usdSpent: number;
    solSpent?: number;
    tokenAmount?: number;
    tokenAmountRaw?: string;
    txSignature?: string;
    txUrl?: string;
    route?: "jupiter" | "direct_mint";
  },
): BuybackResult {
  const ledger = ensureLedger(collection);
  const tokenCa = collection.buybackTokenCa?.trim();
  const treasury = collection.buybackTreasuryWallet?.trim() || collection.payments.creatorWallet;
  if (!collection.treasuryBuybackActive) {
    return { collection, purchased: false, reason: "Treasury buyback not active" };
  }
  if (!tokenCa) {
    return { collection, purchased: false, reason: "No buyback token CA set" };
  }
  if (!treasury) {
    return { collection, purchased: false, reason: "No buyback treasury wallet set" };
  }
  const usdSpent = roundUsd(rec.usdSpent);
  if (usdSpent <= 0) {
    return { collection, purchased: false, reason: "Buyback amount is zero" };
  }
  if (ledger.buybackTreasuryUsd + 1e-9 < usdSpent) {
    return {
      collection,
      purchased: false,
      reason: `Buyback treasury ($${ledger.buybackTreasuryUsd}) below spend ($${usdSpent})`,
    };
  }

  ledger.buybackTreasuryUsd = roundUsd(ledger.buybackTreasuryUsd - usdSpent);
  ledger.buybacks.push({
    at: new Date().toISOString(),
    usdSpent,
    solSpent: rec.solSpent,
    tokenAmount: rec.tokenAmount,
    tokenAmountRaw: rec.tokenAmountRaw,
    buybackTokenCa: tokenCa,
    treasuryWallet: treasury,
    txSignature: rec.txSignature,
    txUrl: rec.txUrl,
    route: rec.route,
    priceUsd: usdSpent,
  });

  return {
    collection,
    purchased: true,
    usdSpent,
    tokenAmount: rec.tokenAmount,
    txSignature: rec.txSignature,
    txUrl: rec.txUrl,
    treasuryWallet: treasury,
  };
}
