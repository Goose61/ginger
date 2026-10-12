import { NextRequest, NextResponse } from "next/server";
import { getCollection, saveCollection } from "@/lib/store";
import { requireWalletAuthAsync, assertCreatorAuth } from "@/lib/wallet-auth";
import { toPublicCollection } from "@/lib/public-collection";
import { isMintDestination, MINT_DESTINATIONS } from "@/lib/chain-registry";
import {
  collectionHomeLedger,
  homeLedgerToMintDestination,
  parseHomeLedger,
  syncHomeFieldsFromLedger,
} from "@/lib/home-ledger";
import type { MintDestination } from "@/lib/types";
import { evmSpokeChainMeta, isEvmNftChainId, mintDestinationToSpokeChain } from "@/lib/evm-spoke-chains";
import type { EvmNftChainId } from "@/lib/evm-nft-chain-catalog";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const auth = await requireWalletAuthAsync(req);
    const collection = await getCollection(id);
    if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
    assertCreatorAuth(auth, collection.payments.creatorWallet);

    const body = (await req.json()) as {
      mintDestinations?: MintDestination[];
      omnichainMintEnabled?: boolean;
      spokeDeployAtLaunch?: string[];
      homeLedger?: string;
    };

    if (body.homeLedger != null) {
      const ledger = parseHomeLedger(body.homeLedger, collectionHomeLedger(collection));
      Object.assign(collection, syncHomeFieldsFromLedger(ledger));
    }

    const home = homeLedgerToMintDestination(collectionHomeLedger(collection));
    const requested = (body.mintDestinations ?? collection.mintDestinations ?? [home]).filter(isMintDestination);
    const mintDestinations = MINT_DESTINATIONS.filter((d) => {
      if (!requested.includes(d)) return false;
      if (d === home) return true;
      if (d === "avalanche_l1") return requested.includes("avalanche_l1");
      const spoke = mintDestinationToSpokeChain(d);
      if (!spoke) return d === "solana";
      const meta = evmSpokeChainMeta(spoke);
      if (!meta.deployReady && !meta.comingSoon) return false;
      return true;
    });
    const withHome = Array.from(new Set<MintDestination>([home, ...mintDestinations]));

    const omnichainMintEnabled =
      body.omnichainMintEnabled ?? withHome.length > 1;

    collection.mintDestinations = withHome;
    collection.omnichainMintEnabled = omnichainMintEnabled;
    if (Array.isArray(body.spokeDeployAtLaunch)) {
      collection.spokeDeployAtLaunch = body.spokeDeployAtLaunch.filter(isEvmNftChainId) as EvmNftChainId[];
    }
    collection.updatedAt = new Date().toISOString();
    await saveCollection(collection);

    return NextResponse.json({ collection: toPublicCollection(collection) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save omnichain settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
