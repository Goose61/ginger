import { NextRequest, NextResponse } from "next/server";
import { cosignAndSubmitCoreCollectionTransaction } from "@/lib/create-core-collection";
import { getCollection, updateCollection } from "@/lib/store";
import { assertCreatorAuth, requireWalletAuth } from "@/lib/wallet-auth";
import { parseNetwork } from "@/lib/solana-config";
import { mergeSolanaSpokeAddress } from "@/lib/collection-spoke";
import { toPublicCollection } from "@/lib/public-collection";

export const runtime = "nodejs";
export const maxDuration = 60;
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

    const body = (await req.json()) as {
      signedTxBase64?: string;
      preparedTxBase64?: string;
      network?: string;
    };

    const signedTxBase64 = String(body.signedTxBase64 || "").trim();
    if (!signedTxBase64) {
      return NextResponse.json({ error: "signedTxBase64 required" }, { status: 400 });
    }

    const pending = collection.pendingSolanaSpoke;
    if (!pending) {
      return NextResponse.json(
        { error: "No pending Solana spoke. Prepare the transaction again." },
        { status: 400 },
      );
    }

    if (pending.payer !== auth.wallet) {
      return NextResponse.json({ error: "Connected wallet is not the collection payer." }, { status: 403 });
    }

    const preparedTxBase64 = String(body.preparedTxBase64 || pending.preparedTxBase64 || "").trim();
    const network = parseNetwork(body.network);

    const txSignature = await cosignAndSubmitCoreCollectionTransaction({
      userSignedTxBase64: signedTxBase64,
      pending: preparedTxBase64 ? { ...pending, preparedTxBase64 } : pending,
      network,
    });

    const updated = await updateCollection(id, (current) => {
      const merged = mergeSolanaSpokeAddress(current, pending.collectionAddress);
      return {
        ...merged,
        pendingSolanaSpoke: undefined,
        omnichainMintEnabled: true,
      };
    });

    return NextResponse.json({
      txSignature,
      collectionAddress: pending.collectionAddress,
      network,
      collection: updated ? toPublicCollection(updated) : undefined,
    });
  } catch (err) {
    console.error("[POST solana-spoke/cosign]", err);
    const message = err instanceof Error ? err.message : "Co-sign failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
