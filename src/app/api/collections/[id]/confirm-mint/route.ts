/**
 * PATCH /api/collections/[id]/confirm-mint
 * Confirm a Metaplex Core mint after Phantom + platform co-sign.
 */

import { NextRequest, NextResponse } from "next/server";
import { committedCount, getCollection, updateCollection } from "@/lib/store";
import { explorerClusterQuery, serverNetwork } from "@/lib/solana-config";
import { verifyMintTransaction } from "@/lib/verify-mint";
import { applySaleTreasury } from "@/lib/milestones";
import { toPublicCollection } from "@/lib/public-collection";
import { processAllPendingHolderDistributions } from "@/lib/platform-disbursement";
import { executeSplTokenBuyback } from "@/lib/spl-buyback";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const txSignature = String(body.txSignature || "").trim();
    const network = serverNetwork(body.network);

    if (!txSignature) {
      return NextResponse.json({ error: "txSignature required" }, { status: 400 });
    }

    const existing = await getCollection(id);
    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const tokenId = body.tokenId != null ? Number(body.tokenId) : existing.pendingMint?.tokenId;
    const expectedAsset =
      existing.pendingMint?.assetAddress ||
      existing.tokens.find((t) => t.tokenId === tokenId)?.assetAddress;

    const verified = await verifyMintTransaction(txSignature, network, expectedAsset);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.reason }, { status: 400 });
    }

    let collection = await updateCollection(id, (c) => {
      const resolvedTokenId = tokenId ?? c.pendingMint?.tokenId;
      if (resolvedTokenId == null) {
        throw new Error("tokenId required — no pending mint");
      }
      const token = c.tokens.find((t) => t.tokenId === resolvedTokenId);
      if (!token) throw new Error("Token not found");

      token.mintTxUrl = `https://explorer.solana.com/tx/${txSignature}${explorerClusterQuery(network)}`;
      if (c.pendingMint?.assetAddress) {
        token.assetAddress = c.pendingMint.assetAddress;
      }
      if (token.reservedBy && !token.owner) {
        token.owner = token.reservedBy;
      }
      delete token.reservedBy;
      delete token.reservedAt;
      delete c.pendingMint;
      c.mintedCount = committedCount(c);
      c.updatedAt = new Date().toISOString();
      return applySaleTreasury(c);
    });

    if (!collection) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // Retry buyback if payment-time disbursement failed (e.g. platform SOL too low).
    let buyback: Awaited<ReturnType<typeof executeSplTokenBuyback>> | null = null;
    if (collection.treasuryBuybackActive && (collection.feeLedger?.buybackTreasuryUsd ?? 0) > 0.009) {
      buyback = await executeSplTokenBuyback(id, network);
      if (buyback.collection) collection = buyback.collection;
      if (!buyback.purchased && buyback.reason) {
        console.warn("[confirm-mint] Pending buyback not executed:", buyback.reason);
      }
    }

    let holderDistribution: Awaited<ReturnType<typeof processAllPendingHolderDistributions>> | null =
      null;
    if (collection.feeClaimsOpen) {
      holderDistribution = await processAllPendingHolderDistributions({ collectionId: id, network });
      if (holderDistribution.collection) collection = holderDistribution.collection;
      for (const r of holderDistribution.results) {
        if (!r.ok && r.error) {
          console.warn("[confirm-mint] Holder distribution not executed:", r.error);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      collection: toPublicCollection(collection),
      buyback: buyback
        ? {
            purchased: buyback.purchased,
            usdSpent: buyback.usdSpent ?? null,
            tokenAmount: buyback.tokenAmount ?? null,
            txSignature: buyback.txSignature ?? null,
            txUrl: buyback.txUrl ?? null,
            reason: buyback.reason ?? null,
          }
        : null,
      holderDistribution: holderDistribution
        ? {
            rounds: holderDistribution.results.map((r) => ({
              ok: r.ok,
              roundId: r.roundId ?? null,
              payouts: r.payouts ?? null,
              error: r.error ?? null,
            })),
          }
        : null,
    });
  } catch (err) {
    console.error("[PATCH /api/collections/confirm-mint]", err);
    const message = err instanceof Error ? err.message : "Failed to confirm mint";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
