import { NextRequest, NextResponse } from "next/server";
import { getCollection, saveCollection } from "@/lib/store";
import { requireWalletAuthAsync, assertCreatorAuth } from "@/lib/wallet-auth";
import { avalanchePublicClient, parseCloneFromReceiptLogs } from "@/lib/evm-collection";
import { snowtraceTxUrl } from "@/lib/avalanche-config";
import { isEvmAddress } from "@/lib/chain-registry";
import { collectionHomeLedger, isEvmHomeLedger } from "@/lib/home-ledger";
import { toPublicCollection } from "@/lib/public-collection";
import { collectionSpokeAddress, mergeSpokeAddress } from "@/lib/collection-spoke";
import {
  evmSpokeChainMeta,
  parseEvmSpokeChain,
  rpcUrlForSpokeChain,
  viemChainForSpokeId,
} from "@/lib/evm-spoke-chains";
import { createPublicClient, http, type Hex } from "viem";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const auth = await requireWalletAuthAsync(req);
    let collection = await getCollection(id);
    if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
    assertCreatorAuth(auth, collection.payments.creatorWallet);
    const body = (await req.json()) as { txHash?: string; spokeChain?: string };
    const spokeChain = parseEvmSpokeChain(body.spokeChain);
    const txHash = String(body.txHash || "") as Hex;
    if (!txHash.startsWith("0x")) {
      return NextResponse.json({ error: "txHash required" }, { status: 400 });
    }

    const rpc = rpcUrlForSpokeChain(spokeChain);
    const client =
      spokeChain === "avalanche"
        ? avalanchePublicClient()
        : createPublicClient({ chain: viemChainForSpokeId(spokeChain), transport: http(rpc) });

    const receipt = await client.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "Collection transaction failed" }, { status: 400 });
    }
    const clone = parseCloneFromReceiptLogs(receipt.logs);
    if (!clone) {
      return NextResponse.json({ error: "Could not parse collection address from transaction" }, { status: 400 });
    }

    const prior = collectionSpokeAddress(collection, spokeChain);
    if (prior && isEvmAddress(prior) && prior.toLowerCase() !== clone.toLowerCase()) {
      return NextResponse.json({ error: "Spoke address is already set for this chain" }, { status: 409 });
    }

    collection = mergeSpokeAddress(collection, spokeChain, clone);
    const home = collectionHomeLedger(collection);
    if (spokeChain === home && isEvmHomeLedger(home)) {
      collection.homeLedger = home;
    }
    if (spokeChain === "avalanche" && home === "avalanche") {
      collection.coreCollectionAddress = clone;
      collection.coreCollectionTxUrl = snowtraceTxUrl(txHash);
    }
    collection.updatedAt = new Date().toISOString();
    if (
      (collection.mintDestinations?.length ?? 0) > 1 ||
      collection.omnichainMintEnabled
    ) {
      collection.omnichainMintEnabled = true;
    }
    await saveCollection(collection);
    return NextResponse.json({
      collection: toPublicCollection(collection),
      collectionAddress: clone,
      spokeChain,
      label: evmSpokeChainMeta(spokeChain).label,
      txHash,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Confirm failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
