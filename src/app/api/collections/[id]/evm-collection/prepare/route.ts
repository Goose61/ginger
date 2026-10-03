import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/store";
import { requireWalletAuthAsync, assertCreatorAuth } from "@/lib/wallet-auth";
import { createCollectionTxRequest, estimateEvmGas, simulateEvmCall } from "@/lib/evm-collection";
import { getAvalancheChainId } from "@/lib/avalanche-config";
import { collectionHomeChain } from "@/lib/chain-registry";
import type { Address } from "viem";

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
    if (!auth.wallet.startsWith("0x")) {
      return NextResponse.json({ error: "Connect an Avalanche wallet to create this collection" }, { status: 400 });
    }
    if (collectionHomeChain(collection) === "avalanche") {
      assertCreatorAuth(auth, collection.payments.creatorWallet);
    }
    const existing = collection.onChainCollectionAddress?.trim();
    if (existing && existing.startsWith("0x")) {
      return NextResponse.json(
        { error: "Avalanche collection already exists", collectionAddress: existing },
        { status: 409 },
      );
    }
    const owner = auth.wallet as Address;
    const tx = createCollectionTxRequest(collection, owner);
    await simulateEvmCall({ to: tx.to, data: tx.data, account: owner });
    const est = await estimateEvmGas({ to: tx.to, data: tx.data, account: owner });
    return NextResponse.json({
      to: tx.to,
      data: tx.data,
      chainId: getAvalancheChainId(),
      gas: est.gas.toString(),
      gasPrice: est.gasPrice.toString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Prepare failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
