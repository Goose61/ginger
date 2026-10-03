import {
  estimateGiftFees,
  CNFT_MINT_FEE_LAMPORTS,
  CNFT_MINT_BUFFER_LAMPORTS,
  lamportsToSol,
} from "@/lib/gift-fees";
import { isDevnetNetwork } from "@/lib/solana-config";

export const runtime = "nodejs";

async function getSolPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://lite-api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112",
      { signal: AbortSignal.timeout(3_000) },
    );
    if (!res.ok) return 0;
    const json = (await res.json()) as { data: Record<string, { price: number }> };
    return json.data["So11111111111111111111111111111111111111112"]?.price ?? 0;
  } catch {
    return 0;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const imageBytes = Math.max(0, parseInt(url.searchParams.get("imageBytes") ?? "0", 10) || 0);
  const metadataBytes = Math.max(
    0,
    parseInt(url.searchParams.get("metadataBytes") ?? "0", 10) || 0,
  );
  const devnet = isDevnetNetwork();

  const [fees, solPrice] = await Promise.all([
    estimateGiftFees(imageBytes, devnet, metadataBytes || undefined, { cnft: true }),
    getSolPrice(),
  ]);

  const totalSol = fees.totalSol;
  const totalUsd = solPrice > 0 ? totalSol * solPrice : null;

  return Response.json({
    user: {
      breakdown: {
        storage: {
          lamports: fees.storageWithBufferLamports.toString(),
          sol: fees.storageSol,
          label: "Permanent storage (image + metadata)",
        },
        rent: {
          lamports: (CNFT_MINT_FEE_LAMPORTS + CNFT_MINT_BUFFER_LAMPORTS).toString(),
          sol: lamportsToSol(CNFT_MINT_FEE_LAMPORTS + CNFT_MINT_BUFFER_LAMPORTS),
          label: "Compressed mint (transaction fee)",
        },
      },
      lamports: fees.totalLamports.toString(),
      sol: totalSol,
      usd: totalUsd,
    },
    solPrice,
    note:
      "Storage is charged first. The mint step is a compressed NFT (cNFT) — keep a little SOL for the transaction fee, not account rent.",
  });
}
