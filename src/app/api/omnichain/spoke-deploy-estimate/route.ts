import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/store";
import { estimateSpokeDeployRows } from "@/lib/spoke-deploy-estimate";
import { parseEvmSpokeChain } from "@/lib/evm-spoke-chains";
import type { Address } from "viem";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      spokeChainIds?: string[];
      collectionId?: string;
      name?: string;
      symbol?: string;
      supply?: number;
      creatorWallet?: string;
      owner?: string;
    };
    const spokeChainIds = (body.spokeChainIds ?? []).map((id) => parseEvmSpokeChain(id));
    if (!spokeChainIds.length) {
      return NextResponse.json({ error: "spokeChainIds required" }, { status: 400 });
    }

    let collection = body.collectionId ? await getCollection(body.collectionId) : null;
    if (body.collectionId && !collection) {
      return NextResponse.json({ error: "collection not found" }, { status: 404 });
    }

    const owner = body.owner?.startsWith("0x") ? (body.owner as Address) : undefined;
    const estimates = await estimateSpokeDeployRows({
      spokeChainIds,
      collection: collection ?? undefined,
      stub: {
        name: body.name,
        symbol: body.symbol,
        supply: body.supply,
        creatorWallet: body.creatorWallet ?? collection?.payments.creatorWallet,
      },
      owner,
    });

    const totalUsd = estimates.reduce((s, r) => s + (r.gasUsd ?? 0), 0);
    return NextResponse.json({ estimates, totalUsd });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Estimate failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
