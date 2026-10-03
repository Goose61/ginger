import { NextResponse } from "next/server";
import { getCoreCollectionAddress } from "@/lib/core-collection";
import { getBubblegumCollectionAddress, getBubblegumTreeAddress } from "@/lib/bubblegum-config";
import { getGiftBundleId } from "@/lib/gift-bundle";
import {
  GIFT_COLLECTION_DISPLAY_NAME,
  GIFT_EXTERNAL_URL,
  GIFT_NAME,
  GIFT_SYMBOL,
} from "@/lib/gift-metadata";
import { getPlatformPublicKey } from "@/lib/platform-key";
import { getSolanaNetwork } from "@/lib/solana-config";

export const runtime = "nodejs";

/** Public gift-mint config (platform creator, Bubblegum tree, metadata defaults). */
export async function GET() {
  const network = getSolanaNetwork();
  const platformCreatorAddress = getPlatformPublicKey();
  const coreCollectionAddress = getCoreCollectionAddress(network);

  return NextResponse.json({
    network,
    platformCreatorAddress,
    coreCollectionAddress,
    bubblegumTreeAddress: getBubblegumTreeAddress(network),
    bubblegumCollectionAddress: getBubblegumCollectionAddress(network),
    compressedGifts: Boolean(getBubblegumTreeAddress(network)),
    giftBundleCollectionId: getGiftBundleId(),
    giftCollectionName: GIFT_COLLECTION_DISPLAY_NAME,
    giftSymbol: GIFT_SYMBOL,
    giftName: GIFT_NAME,
    giftExternalUrl: GIFT_EXTERNAL_URL,
  });
}
