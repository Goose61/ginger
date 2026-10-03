/**
 * PATCH /api/collections/[id]/confirm-mint
 * Confirm a Metaplex Core mint after Phantom + platform co-sign.
 */

import { NextRequest, NextResponse } from "next/server";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { committedCount, getCollection, updateCollection } from "@/lib/store";
import { explorerClusterQuery, serverNetwork } from "@/lib/solana-config";
import { verifyMintTransaction } from "@/lib/verify-mint";
import { consumeSolSignature, verifySolPayment } from "@/lib/verify-payment";
import { applySaleTreasury } from "@/lib/milestones";
import { applyRevealTriggers } from "@/lib/reveal";
import { accrueSaleFees, type SaleFeeBreakdown } from "@/lib/fee-distribution";
import { nftPrice } from "@/lib/collection-ui";
import { toPublicCollection } from "@/lib/public-collection";
import {
  processAllPendingHolderDistributions,
  processPrimaryMintProceeds,
} from "@/lib/platform-disbursement";
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

    const pending = existing.pendingMint;
    const tokenId = body.tokenId != null ? Number(body.tokenId) : pending?.tokenId;
    const expectedAsset =
      pending?.assetAddress ||
      existing.tokens.find((t) => t.tokenId === tokenId)?.assetAddress;

    const verified = await verifyMintTransaction(txSignature, network, expectedAsset);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.reason }, { status: 400 });
    }

    // Atomic pay-and-mint (SOL): the sale price was transferred inside this same tx.
    // Confirm it actually landed before we finalize the mint and disburse proceeds.
    const solPaid = Boolean(pending?.paymentRecipient && pending?.paymentLamports);
    if (solPaid) {
      const minSol = (pending!.paymentLamports as number) / LAMPORTS_PER_SOL;
      const paid = await verifySolPayment(
        txSignature,
        pending!.paymentRecipient as string,
        minSol,
        network,
        pending!.payer,
      );
      if (!paid.ok) {
        return NextResponse.json(
          { error: paid.error ?? "Mint payment not found in transaction" },
          { status: 402 },
        );
      }
    }

    let breakdown: SaleFeeBreakdown | null = null;
    let collection = await updateCollection(id, (c) => {
      const resolvedTokenId = tokenId ?? c.pendingMint?.tokenId;
      if (resolvedTokenId == null) {
        throw new Error("tokenId required. No pending mint");
      }
      const token = c.tokens.find((t) => t.tokenId === resolvedTokenId);
      if (!token) throw new Error("Token not found");

      token.mintTxUrl = `https://explorer.solana.com/tx/${txSignature}${explorerClusterQuery(network)}`;
      if (c.pendingMint?.assetAddress) {
        token.assetAddress = c.pendingMint.assetAddress;
      }
      token.owner =
        token.owner ||
        token.reservedBy ||
        c.pendingMint?.recipient ||
        pending?.recipient;
      token.location = token.location ?? "solana";
      if (!token.owner) {
        throw new Error("Mint confirmed on-chain but no owner wallet was recorded");
      }
      delete token.reservedBy;
      delete token.reservedAt;

      // SOL fees were deferred from the mint request; accrue them now that payment landed.
      if (solPaid) {
        const saleUsd = c.pendingMint?.saleUsd ?? nftPrice(c, token);
        const accrued = accrueSaleFees(c, {
          saleUsd,
          kind: "primary_mint",
          tokenId: resolvedTokenId,
          payer: c.pendingMint?.payer,
        });
        breakdown = accrued.breakdown;
      }

      delete c.pendingMint;
      c.mintedCount = committedCount(c);
      c.updatedAt = new Date().toISOString();
      let next = applySaleTreasury(c);
      if (solPaid) next = applyRevealTriggers(next);
      return next;
    });

    if (!collection) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (solPaid) {
      const spent = await consumeSolSignature(txSignature);
      if (!spent.ok && spent.error !== "SOL payment already used") {
        console.warn("[confirm-mint] could not record SOL payment signature:", spent.error);
      }
    }

    let creatorDisburse: Awaited<
      ReturnType<typeof processPrimaryMintProceeds>
    >["creatorDisburse"];
    let buyback: Awaited<ReturnType<typeof executeSplTokenBuyback>> | null = null;
    let holderDistribution: Awaited<ReturnType<typeof processAllPendingHolderDistributions>> | null =
      null;

    if (solPaid && collection.payments.creatorWallet) {
      // Full SOL settlement: creator payout + buyback + holder rewards from the platform.
      const proceeds = await processPrimaryMintProceeds({
        collectionId: id,
        network,
        creatorWallet: collection.payments.creatorWallet,
        breakdowns: breakdown ? [breakdown] : [],
      });
      creatorDisburse = proceeds.creatorDisburse;
      if (proceeds.buyback?.collection) collection = proceeds.buyback.collection;
      if (proceeds.holderDistribution?.collection) collection = proceeds.holderDistribution.collection;
    } else {
      // Gift/free mints: retry buyback if a payment-time disbursement fell short.
      if (collection.treasuryBuybackActive && (collection.feeLedger?.buybackTreasuryUsd ?? 0) > 0.009) {
        buyback = await executeSplTokenBuyback(id, network);
        if (buyback.collection) collection = buyback.collection;
        if (!buyback.purchased && buyback.reason) {
          console.warn("[confirm-mint] Pending buyback not executed:", buyback.reason);
        }
      }
      if (collection.feeClaimsOpen) {
        holderDistribution = await processAllPendingHolderDistributions({ collectionId: id, network });
        if (holderDistribution.collection) collection = holderDistribution.collection;
        for (const r of holderDistribution.results) {
          if (!r.ok && r.error) {
            console.warn("[confirm-mint] Holder distribution not executed:", r.error);
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      collection: toPublicCollection(collection),
      creatorDisburse: creatorDisburse
        ? {
            ok: creatorDisburse.ok,
            signature: creatorDisburse.signature ?? null,
            txUrl: creatorDisburse.txUrl ?? null,
            error: creatorDisburse.error ?? null,
          }
        : null,
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
