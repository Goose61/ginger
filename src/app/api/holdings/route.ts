import { NextRequest, NextResponse } from "next/server";
import { isEvmAddress } from "@/lib/chain-registry";
import { isGiftBundle } from "@/lib/gift-bundle";
import { tokenName, tokenThumbSrc, walletOwnsToken } from "@/lib/collection-ui";
import { isValidSolanaAddress } from "@/lib/mint-nft";
import { findCollectionsHoldingWallet } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() ?? "";
  if (!wallet || (!isValidSolanaAddress(wallet) && !isEvmAddress(wallet))) {
    return NextResponse.json({ error: "Valid wallet required" }, { status: 400 });
  }

  const solanaWallet = wallet.startsWith("0x") ? null : wallet;
  const evmWallet = wallet.startsWith("0x") ? wallet : null;
  const collections = await findCollectionsHoldingWallet(wallet);
  const holdings = [];
  for (const collection of collections) {
    if (isGiftBundle(collection)) continue;
    for (const token of collection.tokens ?? []) {
      if (!walletOwnsToken(token.owner, solanaWallet, evmWallet)) continue;
      holdings.push({
        collectionId: collection.id,
        slug: collection.slug || collection.id,
        collectionName: collection.name,
        tokenId: token.tokenId,
        name: tokenName(collection, token),
        imageSrc: tokenThumbSrc(collection, token, 480),
        listingPriceUsd: token.listing?.priceUsd ?? null,
        owner: token.owner,
      });
    }
  }

  return NextResponse.json({ holdings });
}
