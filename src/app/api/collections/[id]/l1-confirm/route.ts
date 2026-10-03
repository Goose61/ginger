import { NextRequest, NextResponse } from "next/server";
import { getCollection, saveCollection } from "@/lib/store";
import { requireWalletAuthAsync } from "@/lib/wallet-auth";
import { l1RemoteOrThrow } from "@/lib/evm-collection";
import { gingerL1RemoteAbi } from "@/lib/ginger-nft-abi";
import { createPublicClient, http, zeroAddress, type Address } from "viem";
import { getAvalancheL1RpcUrl, getAvalancheRpcUrl } from "@/lib/avalanche-config";
import { avalancheViemChain } from "@/lib/evm-collection";
import { toPublicCollection } from "@/lib/public-collection";

export const runtime = "nodejs";

/** After ICNFTT/relayer delivery, mark location avalanche_l1 when the remote owns the token. */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    await requireWalletAuthAsync(req);
    const body = (await req.json()) as { tokenId?: number };
    const tokenId = Number(body.tokenId);
    const collection = await getCollection(id);
    if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
    const token = collection.tokens.find((t) => t.tokenId === tokenId);
    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    const remote = l1RemoteOrThrow(collection);
    const client = createPublicClient({
      chain: avalancheViemChain(),
      transport: http(getAvalancheL1RpcUrl() || getAvalancheRpcUrl()),
    });
    const owner = (await client.readContract({
      address: remote,
      abi: gingerL1RemoteAbi,
      functionName: "ownerOfToken",
      args: [BigInt(tokenId)],
    })) as Address;
    if (!owner || owner === zeroAddress) {
      return NextResponse.json({ error: "Remote mint not visible yet" }, { status: 409 });
    }
    collection.tokens = collection.tokens.map((t) =>
      t.tokenId === tokenId
        ? { ...t, location: "avalanche_l1", owner, spokeAddress: remote, icmMessageId: t.icmMessageId }
        : t,
    );
    collection.updatedAt = new Date().toISOString();
    await saveCollection(collection);
    return NextResponse.json({ collection: toPublicCollection(collection), location: "avalanche_l1" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Confirm L1 failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
