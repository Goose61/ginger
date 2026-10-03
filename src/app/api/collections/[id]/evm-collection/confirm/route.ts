import { NextRequest, NextResponse } from "next/server";
import { getCollection, saveCollection } from "@/lib/store";
import { requireWalletAuthAsync, assertCreatorAuth } from "@/lib/wallet-auth";
import { avalanchePublicClient, parseCloneFromReceiptLogs } from "@/lib/evm-collection";
import { snowtraceTxUrl } from "@/lib/avalanche-config";
import { collectionHomeChain, isEvmAddress } from "@/lib/chain-registry";
import { toPublicCollection } from "@/lib/public-collection";
import type { Hex } from "viem";

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
    const body = (await req.json()) as { txHash?: string };
    const txHash = String(body.txHash || "") as Hex;
    if (!txHash.startsWith("0x")) {
      return NextResponse.json({ error: "txHash required" }, { status: 400 });
    }
    const client = avalanchePublicClient();
    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "Collection transaction failed" }, { status: 400 });
    }
    const clone = parseCloneFromReceiptLogs(receipt.logs);
    if (!clone) {
      return NextResponse.json({ error: "Could not parse collection address from transaction" }, { status: 400 });
    }
    const existing = collection.onChainCollectionAddress?.trim();
    if (existing && isEvmAddress(existing) && existing.toLowerCase() !== clone.toLowerCase()) {
      return NextResponse.json(
        { error: "Avalanche collection is already set for this drop" },
        { status: 409 },
      );
    }

    collection.onChainCollectionAddress = clone;
    const home = collectionHomeChain(collection);
    const core = collection.coreCollectionAddress?.trim();
    if (home === "avalanche" || !core || isEvmAddress(core)) {
      collection.coreCollectionAddress = clone;
      collection.coreCollectionTxUrl = snowtraceTxUrl(txHash);
    }
    collection.updatedAt = new Date().toISOString();
    await saveCollection(collection);
    return NextResponse.json({
      collection: toPublicCollection(collection),
      collectionAddress: clone,
      txHash,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Confirm failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
