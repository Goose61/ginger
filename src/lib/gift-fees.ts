import { fetchIrysPriceLamports } from "@/lib/irys-shared";

/**
 * Metaplex Core asset rent the payer funds on create.
 * A live Core mint moved 3,095,120 lamports into the asset, then Core
 * reclaimed the excess down to today's rent-exempt minimum (1,595,120
 * for that 186-byte account). 3,100,000 covers the higher create amount.
 * The old 6,500,000 figure was Token Metadata rent, not Core.
 */
export const GIFT_MINT_RENT_LAMPORTS = BigInt(3_100_000);

/** Mint transaction fee buffer. */
export const GIFT_TX_FEE_LAMPORTS = BigInt(10_000);

/** Extra buffer so Core estimates err on the safe side. */
export const GIFT_FEE_BUFFER_LAMPORTS = BigInt(500_000);

/** cNFT mint has no account rent — tx fee + compute/priority buffer. */
export const CNFT_MINT_FEE_LAMPORTS = GIFT_TX_FEE_LAMPORTS;
export const CNFT_MINT_BUFFER_LAMPORTS = BigInt(1_000_000);

const META_BYTES = 512;

export type GiftFeeEstimate = {
  storageLamports: bigint;
  storageWithBufferLamports: bigint;
  mintLamports: bigint;
  totalLamports: bigint;
  storageSol: number;
  mintSol: number;
  totalSol: number;
};

export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / 1_000_000_000;
}

/** Minimum SOL the payer needs for a Core mint step (paid collections). */
export function getMintStepMinLamports(): bigint {
  return GIFT_MINT_RENT_LAMPORTS + GIFT_TX_FEE_LAMPORTS + GIFT_FEE_BUFFER_LAMPORTS;
}

/** Minimum SOL for a Bubblegum V2 gift mint (no asset rent). */
export function getCnftMintStepMinLamports(): bigint {
  return CNFT_MINT_FEE_LAMPORTS + CNFT_MINT_BUFFER_LAMPORTS;
}

export async function estimateGiftFees(
  imageBytes: number,
  devnet: boolean,
  metadataBytes = META_BYTES,
  opts?: { cnft?: boolean },
): Promise<GiftFeeEstimate> {
  const safeImageBytes = Math.max(0, imageBytes);
  const safeMetaBytes = Math.max(META_BYTES, metadataBytes);
  const [imageLamports, metaLamports] = await Promise.all([
    safeImageBytes > 0
      ? fetchIrysPriceLamports(safeImageBytes, devnet)
      : Promise.resolve(BigInt(0)),
    fetchIrysPriceLamports(safeMetaBytes, devnet),
  ]);

  const storageLamports = imageLamports + metaLamports;
  const storageWithBufferLamports =
    storageLamports + storageLamports / 10n + BigInt(5000);
  const mintLamports = opts?.cnft ? getCnftMintStepMinLamports() : getMintStepMinLamports();
  const totalLamports = storageWithBufferLamports + mintLamports;

  return {
    storageLamports,
    storageWithBufferLamports,
    mintLamports,
    totalLamports,
    storageSol: lamportsToSol(storageWithBufferLamports),
    mintSol: lamportsToSol(mintLamports),
    totalSol: lamportsToSol(totalLamports),
  };
}

export function formatInsufficientBalanceMessage(params: {
  balanceSol: number;
  requiredSol: number;
  mintOnly?: boolean;
  includeSalePrice?: boolean;
  cnft?: boolean;
}): string {
  const shortfall = Math.max(0, params.requiredSol - params.balanceSol);
  if (params.mintOnly) {
    const needFor = params.includeSalePrice
      ? params.cnft
        ? "sale price, compressed mint, and fees"
        : "sale price, NFT rent, and fees"
      : params.cnft
        ? "the compressed mint"
        : "NFT account rent";
    return (
      `Not enough SOL left for the mint step. You have ~${params.balanceSol.toFixed(4)} SOL ` +
      `but need ~${params.requiredSol.toFixed(4)} SOL for ${needFor}. ` +
      `Add ~${shortfall.toFixed(4)} SOL to your wallet and try again.`
    );
  }
  return (
    `Your wallet does not have enough SOL for this gift. You have ~${params.balanceSol.toFixed(4)} SOL ` +
    `but need ~${params.requiredSol.toFixed(4)} SOL total (~${shortfall.toFixed(4)} SOL short). ` +
    `Storage is charged first, then the mint step. Keep enough for both.`
  );
}
