import { LAMPORTS_PER_SOL } from "@solana/web3.js";

/** Solana rent-exempt minimum for a basic system account. */
const RENT_EXEMPT_LAMPORTS = 890_880;

/**
 * Small operating float kept on the platform wallet (never disbursed).
 * Accrues over time from the 1% platform fee slice on each sale.
 * Override with PLATFORM_TREASURY_FLOOR_SOL (e.g. "0.002").
 */
const DEFAULT_ACCRUAL_LAMPORTS = 2_000_000;

/** Minimum balance the platform wallet must retain after any payout. */
export function platformTreasuryFloorLamports(): number {
  const raw = process.env.PLATFORM_TREASURY_FLOOR_SOL?.trim();
  if (raw) {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return RENT_EXEMPT_LAMPORTS + Math.floor(parsed * LAMPORTS_PER_SOL);
    }
  }
  return RENT_EXEMPT_LAMPORTS + DEFAULT_ACCRUAL_LAMPORTS;
}

/** SOL that can be spent while still leaving the treasury floor intact. */
export function platformSpendableLamports(balanceLamports: number): number {
  return Math.max(0, balanceLamports - platformTreasuryFloorLamports());
}

export function formatTreasuryFloorSol(): string {
  return (platformTreasuryFloorLamports() / LAMPORTS_PER_SOL).toFixed(4);
}
