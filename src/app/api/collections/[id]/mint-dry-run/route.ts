import { NextRequest, NextResponse } from "next/server";
import { getCollection, updateCollection } from "@/lib/store";
import { markDryRunSimulated, resolveDryRun } from "@/lib/mint-dry-run-store";
import { simulateHomeDebit, tokenAlreadyIssued } from "@/lib/home-debit";
import {
  collectionEvmAddress,
  l1RemoteOrThrow,
  signUserMintAuthorization,
  simulateEvmCall,
} from "@/lib/evm-collection";
import { avalancheL1MintEnabled, getAvalancheL1RpcUrl } from "@/lib/avalanche-config";
import { simulateUnsignedTransaction } from "@/lib/mint-nft";
import { buildPendingMintForToken } from "@/lib/collection-mint-on-chain";
import { getSolanaNetwork } from "@/lib/solana-config";
import { isAllowedL1Remote } from "@/lib/l1-allowlist";
import { collectionHomeChain } from "@/lib/chain-registry";
import type { Address } from "viem";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as { dryRunId?: string };
    const collection = await getCollection(id);
    if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
    const rec = resolveDryRun(String(body.dryRunId || ""), collection);
    if (!rec || rec.collectionId !== id) {
      return NextResponse.json({ error: "Quote expired. Request a new mint quote." }, { status: 400 });
    }
    if (rec.destination === "avalanche_l1" && !avalancheL1MintEnabled()) {
      return NextResponse.json(
        { error: "Avalanche L1 minting is not enabled on this network" },
        { status: 400 },
      );
    }
    if (tokenAlreadyIssued(collection, rec.tokenId)) {
      return NextResponse.json({ error: "Token already minted" }, { status: 400 });
    }
    const token = collection.tokens.find((t) => t.tokenId === rec.tokenId);
    if (!token?.metadataUri?.startsWith("http")) {
      return NextResponse.json({ error: "Token metadata is not published" }, { status: 400 });
    }

    if (rec.offHome) {
      await simulateHomeDebit({
        collection,
        tokenId: rec.tokenId,
        destination: rec.destination,
        uri: token.metadataUri,
      });
    }

    if (rec.destination === "solana") {
      const built = await buildPendingMintForToken({
        collection,
        tokenId: rec.tokenId,
        payer: rec.recipient,
        recipient: rec.recipient,
        network: getSolanaNetwork(),
      });
      await simulateUnsignedTransaction(built.txResult.txBase64, getSolanaNetwork());
    } else {
      const contract =
        rec.destination === "avalanche_l1"
          ? l1RemoteOrThrow(collection)
          : collectionEvmAddress(collection);
      if (!contract) throw new Error("Destination contract is not set");
      if (rec.destination === "avalanche_l1" && !isAllowedL1Remote(collection, contract)) {
        throw new Error("L1 remote is not on the Ginger allowlist");
      }
      const authz = await signUserMintAuthorization({
        contract,
        to: rec.recipient as Address,
        tokenId: rec.tokenId,
        uri: token.metadataUri,
        destination: rec.destination,
        home: collectionHomeChain(collection),
      });
      await simulateEvmCall({
        to: contract,
        data: authz.data,
        account: rec.recipient as Address,
        rpcUrl: rec.destination === "avalanche_l1" ? getAvalancheL1RpcUrl() || undefined : undefined,
      });
    }

    markDryRunSimulated(rec.dryRunId);
    await updateCollection(id, (current) => {
      if (current.activeMintQuote?.dryRunId !== rec.dryRunId) return current;
      return { ...current, activeMintQuote: { ...current.activeMintQuote, simulated: true } };
    });
    return NextResponse.json({ ok: true, dryRunId: rec.dryRunId, destination: rec.destination });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Dry-run failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
