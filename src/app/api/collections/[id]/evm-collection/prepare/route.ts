import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/store";
import { requireWalletAuthAsync, assertCreatorAuth } from "@/lib/wallet-auth";
import { createCollectionTxRequest, estimateEvmGas, simulateEvmCall } from "@/lib/evm-collection";
import { collectionHomeChain } from "@/lib/chain-registry";
import { collectionSpokeAddress } from "@/lib/collection-spoke";
import { evmSpokeChainMeta, parseEvmSpokeChain, rpcUrlForSpokeChain } from "@/lib/evm-spoke-chains";
import type { Address } from "viem";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const auth = await requireWalletAuthAsync(req);
    const body = (await req.json().catch(() => ({}))) as { spokeChain?: string };
    const spokeChain = parseEvmSpokeChain(body.spokeChain);
    const meta = evmSpokeChainMeta(spokeChain);

    const collection = await getCollection(id);
    if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
    assertCreatorAuth(auth, collection.payments.creatorWallet);
    if (!auth.wallet.startsWith("0x")) {
      return NextResponse.json({ error: "Connect an EVM wallet to deploy a spoke" }, { status: 400 });
    }
    if (!meta.deployReady) {
      return NextResponse.json(
        { error: `${meta.label} factory is not configured on this server. ${meta.note ?? ""}`.trim() },
        { status: 503 },
      );
    }

    const existing = collectionSpokeAddress(collection, spokeChain);
    if (existing) {
      return NextResponse.json(
        { error: `${meta.label} spoke already exists`, collectionAddress: existing },
        { status: 409 },
      );
    }

    const owner = auth.wallet as Address;
    const rpcUrl = rpcUrlForSpokeChain(spokeChain);
    const tx = createCollectionTxRequest(collection, owner, spokeChain);
    await simulateEvmCall({ to: tx.to, data: tx.data, account: owner, rpcUrl, spokeChain });
    const est = await estimateEvmGas({ to: tx.to, data: tx.data, account: owner, rpcUrl, spokeChain });
    return NextResponse.json({
      to: tx.to,
      data: tx.data,
      chainId: meta.chainId,
      spokeChain,
      gas: est.gas.toString(),
      gasPrice: est.gasPrice.toString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Prepare failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
