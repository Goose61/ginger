import { NextRequest, NextResponse } from "next/server";
import { prepareCoreCollectionTransaction } from "@/lib/create-core-collection";
import { getCollection, updateCollection } from "@/lib/store";
import { assertCreatorAuth, requireWalletAuth } from "@/lib/wallet-auth";
import { parseNetwork } from "@/lib/solana-config";
import { collectionHomeLedger, isEvmHomeLedger } from "@/lib/home-ledger";
import { collectionSolanaSpokeAddress } from "@/lib/collection-spoke";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = requireWalletAuth(req);
    const collection = await getCollection(id);
    if (!collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }
    assertCreatorAuth(auth, collection.payments.creatorWallet);

    const home = collectionHomeLedger(collection);
    if (!isEvmHomeLedger(home)) {
      return NextResponse.json(
        { error: "Solana spoke is only created when home is an EVM chain" },
        { status: 400 },
      );
    }

    const existing = collectionSolanaSpokeAddress(collection);
    if (existing) {
      return NextResponse.json({
        collectionAddress: existing,
        alreadyCreated: true,
      });
    }

    const body = (await req.json()) as { network?: string };
    const network = parseNetwork(body.network);

    const prepared = await prepareCoreCollectionTransaction({
      collection,
      payer: auth.wallet,
      network,
    });

    await updateCollection(id, (current) => ({
      ...current,
      pendingSolanaSpoke: prepared.pendingCoreCollection,
    }));

    return NextResponse.json({
      txBase64: prepared.txBase64,
      collectionAddress: prepared.collectionAddress,
      metadataUri: prepared.metadataUri,
      network,
    });
  } catch (err) {
    console.error("[POST solana-spoke/prepare-sign]", err);
    const message = err instanceof Error ? err.message : "Prepare sign failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
