import { NextRequest, NextResponse } from "next/server";
import {
  clearTokenReservation,
  committedCount,
  getCollection,
  tryAssignTokenOwner,
  tryClearTokenOwner,
  tryReserveToken,
  updateCollection,
} from "@/lib/store";
import { applySaleTreasury } from "@/lib/milestones";
import { applyRevealTriggers } from "@/lib/reveal";
import { rateLimit } from "@/lib/rate-limit";
import { readAuthHeaders, readAuthHeadersAsync, assertCreatorAuth, assertPayerAuth, requireWalletAuth, requireWalletAuthAsync } from "@/lib/wallet-auth";
import { consumePaidInvoice, slicePayConfigured, verifySlicePayInvoice } from "@/lib/slicepay";
import { getQuote } from "@/lib/quotes";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { isValidSolanaAddress } from "@/lib/mint-nft";
import { collectionHomeChain, isEvmAddress } from "@/lib/chain-registry";
import { consumeDryRun, requireSimulatedDryRun, withClearedMintQuote } from "@/lib/mint-dry-run-store";
import { parseNetwork, serverNetwork } from "@/lib/solana-config";
import { collectionAllowsResale, nftPrice } from "@/lib/collection-ui";
import { buildPendingMintForToken } from "@/lib/collection-mint-on-chain";
import { getPlatformSecretKey } from "@/lib/platform-key";
import {
  accrueSaleFees,
  claimHolderFees,
  previewHolderClaim,
  treasurySummary,
  walletRewardSummary,
  type SaleFeeBreakdown,
} from "@/lib/fee-distribution";
import {
  getMintPaymentRecipient,
  processAllPendingHolderDistributions,
  processLatestHolderDistribution,
  processPrimaryMintProceeds,
  processSaleBuyback,
} from "@/lib/platform-disbursement";
import { getPlatformPublicKey } from "@/lib/platform-key";
import { executeSplTokenBuyback } from "@/lib/spl-buyback";
import { splMintRejectionReason } from "@/lib/spl-mint";
import { toPublicCollection, tokenIsCommitted } from "@/lib/public-collection";
import { getClientIp } from "@/lib/request-ip";
import type { BuildTxResult } from "@/lib/mint-nft";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const collection = await getCollection(id);
  if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (collection.status === "draft" || collection.status === "importing") {
    try {
      assertCreatorAuth(readAuthHeaders(req), collection.payments.creatorWallet);
    } catch {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }

  const triggered = applyRevealTriggers(collection);
  const revealChanged =
    triggered.revealed !== collection.revealed ||
    JSON.stringify(triggered.revealedTokenIds ?? []) !==
      JSON.stringify(collection.revealedTokenIds ?? []);

  if (revealChanged) {
    await updateCollection(id, () => triggered);
    return NextResponse.json({ collection: toPublicCollection(triggered) });
  }
  return NextResponse.json({ collection: toPublicCollection(collection) });
}

async function rollbackMint(params: {
  id: string;
  tokenIds: number[];
  recipient: string;
  onChain: boolean;
}) {
  for (const tokenId of params.tokenIds) {
    if (params.onChain) {
      await clearTokenReservation(params.id, tokenId);
    } else {
      await tryClearTokenOwner(params.id, tokenId, params.recipient);
    }
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const ip = getClientIp(req);
  const { id } = await params;
  const body = await req.json();

  try {
    if (body.action === "waitlist") {
      const rl = await rateLimit(`waitlist:${ip}`, 10, 60 * 60 * 1000);
      if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

      const collection = await updateCollection(id, (current) => {
        const wallet = String(body.wallet || "").trim();
        if (wallet && !isValidSolanaAddress(wallet)) {
          throw new Error("Invalid wallet address");
        }
        if (wallet && !current.waitlist.includes(wallet)) {
          current.waitlist.push(wallet);
        }
        return current;
      });
      if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ collection: toPublicCollection(collection) });
    }

    if (body.action === "allowlist") {
      const auth = readAuthHeaders(req);
      const existing = await getCollection(id);
      if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
      try {
        assertCreatorAuth(auth, existing.payments.creatorWallet);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }

      const collection = await updateCollection(id, (current) => {
        const wallets = String(body.wallets || "")
          .split(/[\s,]+/)
          .map((w: string) => w.trim())
          .filter(Boolean);
        for (const w of wallets) {
          if (!isValidSolanaAddress(w)) throw new Error(`Invalid wallet: ${w}`);
        }
        current.allowlist = Array.from(new Set([...current.allowlist, ...wallets]));
        current.publicMintOpen = current.allowlist.length === 0;
        return current;
      });
      if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ collection: toPublicCollection(collection) });
    }

    if (body.action === "mint") {
      const payer = String(body.payer || ip);
      const rl = await rateLimit(`mint:${payer}`, 10, 15 * 60 * 1000);
      if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

      const payerAddr = String(body.payer || "");
      const dryRunId = String(body.dryRunId || "");
      const quoted = await getCollection(id);
      if (!quoted) return NextResponse.json({ error: "not found" }, { status: 404 });
      let dryRun;
      try {
        dryRun = requireSimulatedDryRun({
          dryRunId,
          collectionId: id,
          tokenId: body.tokenId != null ? Number(body.tokenId) : undefined,
          collection: quoted,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Dry-run required before mint";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      const destIsEvm = dryRun.destination !== "solana";
      if (!payerAddr || (destIsEvm ? !isEvmAddress(payerAddr) : !isValidSolanaAddress(payerAddr))) {
        return NextResponse.json(
          { error: destIsEvm ? "Valid Avalanche wallet required" : "Valid payer wallet required" },
          { status: 400 },
        );
      }
      if (dryRun.recipient.toLowerCase() !== payerAddr.toLowerCase() && dryRun.recipient !== payerAddr) {
        return NextResponse.json({ error: "Payer must match the quoted destination wallet" }, { status: 400 });
      }

      let payerAuth;
      try {
        payerAuth = destIsEvm ? await requireWalletAuthAsync(req) : requireWalletAuth(req);
        assertPayerAuth(payerAuth, payerAddr);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }

      const pre = await getCollection(id);
      if (!pre) return NextResponse.json({ error: "not found" }, { status: 404 });

      const requestedId = body.tokenId != null ? Number(body.tokenId) : null;
      const tokenForPrice =
        requestedId != null
          ? pre.tokens.find((t) => t.tokenId === requestedId)
          : pre.tokens.find((t) => !tokenIsCommitted(t, pre));
      const expectedUsd = tokenForPrice ? nftPrice(pre, tokenForPrice) : pre.payments.basePriceUsd;
      const method = String(body.method || "slicepay");
      const invoiceId = String(body.invoiceId || "");
      const txSignature = String(body.txSignature || "");

      if (method === "slicepay") {
        if (requestedId == null || !Number.isFinite(requestedId)) {
          return NextResponse.json({ error: "tokenId required for SlicePay mint" }, { status: 400 });
        }
        const orderPrefix = `mint-${pre.id}-`;
        const fulfillment = {
          collectionId: pre.id,
          tokenId: requestedId,
          payerWallet: payerAddr,
          kind: "primary_mint" as const,
        };
        const verified = await verifySlicePayInvoice(
          invoiceId,
          expectedUsd,
          orderPrefix,
          fulfillment,
        );
        if (!verified.ok) {
          return NextResponse.json({ error: verified.error ?? "Payment not verified" }, { status: 402 });
        }
      } else if (method === "sol") {
        if (destIsEvm) {
          return NextResponse.json(
            { error: "SOL pay-and-mint is only for Solana destinations. Pay with SlicePay or mint onto Solana." },
            { status: 400 },
          );
        }
        // Atomic pay-and-mint: the sale price is transferred inside the mint tx (see
        // buildPendingMintForToken payment) and verified at confirm-mint. A standalone
        // SOL transfer looks like a drainer to Phantom/Blowfish; bundling it with the
        // NFT receipt does not. Nothing to verify up front.
        if (!getMintPaymentRecipient()) {
          return NextResponse.json({ error: "Platform payment wallet not configured" }, { status: 503 });
        }
        if (!pre.payments.creatorWallet) {
          return NextResponse.json({ error: "Creator payout wallet not set" }, { status: 400 });
        }
        if (!getPlatformSecretKey()) {
          return NextResponse.json({ error: "On-chain mint not configured for SOL payments" }, { status: 503 });
        }
      } else if (method === "demo") {
        if (slicePayConfigured()) {
          return NextResponse.json({ error: "Demo mint disabled in production" }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: "Unsupported payment method" }, { status: 400 });
      }

      if (pre.status !== "live") {
        return NextResponse.json({ error: "Collection is not live" }, { status: 400 });
      }
      if (committedCount(pre) >= pre.supply) {
        return NextResponse.json({ error: "Sold out" }, { status: 400 });
      }
      if (
        !pre.publicMintOpen &&
        pre.allowlist.length > 0 &&
        !pre.allowlist.includes(payerAddr)
      ) {
        return NextResponse.json({ error: "Not on allowlist" }, { status: 403 });
      }

      const qty = Math.max(1, Math.min(10, Number(body.qty ?? 1)));
      const remaining = pre.supply - committedCount(pre);
      const minted = Math.min(qty, remaining);
      const recipient = destIsEvm
        ? dryRun.recipient
        : String(body.recipient || body.payer || "");
      if (!destIsEvm && recipient && !isValidSolanaAddress(recipient)) {
        return NextResponse.json({ error: "Invalid recipient wallet" }, { status: 400 });
      }
      const recipientAddr = recipient || payerAddr;
      const available = pre.tokens.filter((t) => !tokenIsCommitted(t, pre));
      const pick =
        requestedId != null
          ? available.filter((t) => t.tokenId === requestedId).slice(0, 1)
          : available.slice(0, minted);
      if (pick.length === 0) {
        return NextResponse.json(
          { error: requestedId != null ? "That NFT is already sold" : "Sold out" },
          { status: 400 },
        );
      }

      const solAtomic = method === "sol";
      const useOnChain = !destIsEvm && pick.length === 1 && Boolean(getPlatformSecretKey());
      const destMint = destIsEvm;
      if (solAtomic && !useOnChain) {
        return NextResponse.json(
          { error: "On-chain mint required for SOL payments" },
          { status: 503 },
        );
      }
      const mintedTokenIds: number[] = [];

      for (const token of pick) {
        if (useOnChain || destMint) {
          const reserved = await tryReserveToken(id, token.tokenId, recipientAddr);
          if (!reserved) {
            await rollbackMint({ id, tokenIds: mintedTokenIds, recipient: recipientAddr, onChain: true });
            return NextResponse.json({ error: "That NFT is already sold" }, { status: 400 });
          }
        } else {
          const assigned = await tryAssignTokenOwner(id, token.tokenId, recipientAddr);
          if (!assigned) {
            await rollbackMint({ id, tokenIds: mintedTokenIds, recipient: recipientAddr, onChain: false });
            return NextResponse.json({ error: "That NFT is already sold" }, { status: 400 });
          }
        }
        mintedTokenIds.push(token.tokenId);
      }

      let txResult: BuildTxResult | null = null;
      if (useOnChain) {
        const tokenId = mintedTokenIds[0];
        const network = serverNetwork(body.network);
        // For SOL, fold the sale price into the mint tx so the wallet sees a fair swap.
        let payment: { recipient: string; lamports: number } | undefined;
        let saleUsd: number | undefined;
        if (solAtomic) {
          const tok = pre.tokens.find((t) => t.tokenId === tokenId);
          saleUsd = tok ? nftPrice(pre, tok) : expectedUsd;
          const quote = await getQuote(saleUsd);
          payment = {
            recipient: getMintPaymentRecipient()!,
            lamports: Math.ceil(quote.sol * LAMPORTS_PER_SOL),
          };
        }
        try {
          const built = await buildPendingMintForToken({
            collection: pre,
            tokenId,
            payer: payerAddr,
            recipient: recipientAddr,
            network,
            payment,
            saleUsd,
          });
          txResult = built.txResult;
        } catch (e) {
          await rollbackMint({ id, tokenIds: mintedTokenIds, recipient: recipientAddr, onChain: true });
          const message = e instanceof Error ? e.message : "On-chain mint could not be built";
          console.error("[mint] On-chain tx build failed:", e);
          return NextResponse.json({ error: message }, { status: 500 });
        }
      }

      if (method === "slicepay") {
        const consumed = await consumePaidInvoice(invoiceId, {
          collectionId: pre.id,
          tokenId: mintedTokenIds[0] ?? requestedId!,
          payerWallet: payerAddr,
          kind: "primary_mint",
        });
        if (!consumed.ok) {
          await rollbackMint({
            id,
            tokenIds: mintedTokenIds,
            recipient: recipientAddr,
            onChain: useOnChain,
          });
          return NextResponse.json({ error: consumed.error ?? "Invoice already used" }, { status: 402 });
        }
      }
      // SOL settles atomically with the mint; there is no standalone signature to consume.

      const feeBreakdowns: ReturnType<typeof accrueSaleFees>["breakdown"][] = [];
      let collection = await updateCollection(id, (current) => {
        for (const tokenId of mintedTokenIds) {
          const token = current.tokens.find((t) => t.tokenId === tokenId);
          if (!token) continue;
          // SOL fees accrue at confirm-mint, once the atomic pay+mint has actually landed.
          if (!solAtomic) {
            const saleUsd = nftPrice(current, token);
            const accrued = accrueSaleFees(current, {
              saleUsd,
              kind: "primary_mint",
              tokenId: token.tokenId,
              payer: payerAddr,
            });
            feeBreakdowns.push(accrued.breakdown);
          }
          if (txResult && tokenId === mintedTokenIds[0]) {
            token.assetAddress = txResult.assetAddress;
          }
        }
        if (txResult) {
          current.pendingMint = { ...txResult.pendingMint, tokenId: mintedTokenIds[0] };
        }
        current.mintedCount = committedCount(current);
        if (current.mintedCount >= current.supply) current.status = "sold_out";
        // Defer treasury milestones + reveal for SOL until payment confirms.
        const next = solAtomic
          ? current
          : applyRevealTriggers(applySaleTreasury(current, { excludeTokenIds: mintedTokenIds }));
        return withClearedMintQuote(next, dryRunId);
      });
      if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      consumeDryRun(dryRunId);

      const network = serverNetwork(body.network);
      let creatorDisburse: Awaited<ReturnType<typeof processPrimaryMintProceeds>>["creatorDisburse"];
      let buyback: Awaited<ReturnType<typeof processPrimaryMintProceeds>>["buyback"] = null;
      let holderDistribution: Awaited<
        ReturnType<typeof processPrimaryMintProceeds>
      >["holderDistribution"] = null;
      // SOL proceeds (creator payout, buyback, holder rewards) are processed at
      // confirm-mint, after the atomic pay+mint lands. SlicePay is captured up front.
      const paysOnChainFromPlatform =
        method === "slicepay" && collection.payments.creatorWallet;
      if (solAtomic) {
        // no-op: settlement deferred to confirm-mint
      } else if (paysOnChainFromPlatform) {
        const proceeds = await processPrimaryMintProceeds({
          collectionId: id,
          network,
          creatorWallet: collection.payments.creatorWallet!,
          breakdowns: feeBreakdowns,
        });
        creatorDisburse = proceeds.creatorDisburse;
        buyback = proceeds.buyback;
        holderDistribution = proceeds.holderDistribution ?? null;
        if (buyback?.collection) collection = buyback.collection;
        if (holderDistribution?.collection) collection = holderDistribution.collection;
      } else {
        if (collection.treasuryBuybackActive) {
          const buybackUsd = feeBreakdowns.reduce((sum, b) => sum + b.buybackUsd, 0);
          buyback = await processSaleBuyback({ collectionId: id, network, buybackUsd });
          if (buyback?.collection) collection = buyback.collection;
        }
        holderDistribution = await processLatestHolderDistribution({ collectionId: id, network });
        if (holderDistribution?.collection) collection = holderDistribution.collection;
      }

      return NextResponse.json({
        collection: toPublicCollection(collection),
        mintedTokenIds,
        recipient: recipientAddr,
        requiresOnChainMint: Boolean(txResult),
        requiresDestinationMint: destMint,
        dryRunId: destMint ? dryRun.dryRunId : undefined,
        destination: dryRun.destination,
        feeBreakdowns,
        mintPaymentWallet: method === "sol" ? getPlatformPublicKey() : null,
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
              ok: holderDistribution.ok,
              roundId: holderDistribution.roundId ?? null,
              payouts: holderDistribution.payouts ?? null,
              error: holderDistribution.error ?? null,
            }
          : null,
      });
    }

    if (body.action === "list_secondary") {
      let auth;
      try {
        auth = await requireWalletAuthAsync(req);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }
      const wallet = auth.wallet;
      const tokenId = Number(body.tokenId);
      const priceUsd = Number(body.priceUsd);
      if (!tokenId || priceUsd <= 0) {
        return NextResponse.json({ error: "tokenId and priceUsd required" }, { status: 400 });
      }
      const collection = await updateCollection(id, (current) => {
        if (!collectionAllowsResale(current)) throw new Error("This collection is not open for resale");
        const token = current.tokens.find((t) => t.tokenId === tokenId);
        if (!token?.owner) throw new Error("Token not owned");
        const owner = token.owner.startsWith("0x") ? token.owner.toLowerCase() : token.owner;
        const lister = wallet.startsWith("0x") ? wallet.toLowerCase() : wallet;
        if (owner !== lister) throw new Error("Only the owner can list");
        if (token.location === "in_flight") throw new Error("Cannot list while the NFT is in flight");
        token.listing = { priceUsd, listedAt: new Date().toISOString() };
        return current;
      });
      if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ collection: toPublicCollection(collection) });
    }

    if (body.action === "unlist_secondary") {
      let auth;
      try {
        auth = await requireWalletAuthAsync(req);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }
      const wallet = auth.wallet;
      const tokenId = Number(body.tokenId);
      const collection = await updateCollection(id, (current) => {
        const token = current.tokens.find((t) => t.tokenId === tokenId);
        if (!token?.listing) throw new Error("Not listed");
        const owner = token.owner?.startsWith("0x") ? token.owner.toLowerCase() : token.owner;
        const actor = wallet.startsWith("0x") ? wallet.toLowerCase() : wallet;
        if (owner !== actor) throw new Error("Only the owner can unlist");
        token.listing = null;
        return current;
      });
      if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ collection: toPublicCollection(collection) });
    }

    if (body.action === "buy_secondary") {
      const payerAddr = String(body.payer || "");
      const evmBuy = isEvmAddress(payerAddr);
      if (!payerAddr || (!evmBuy && !isValidSolanaAddress(payerAddr))) {
        return NextResponse.json({ error: "Valid payer wallet required" }, { status: 400 });
      }

      try {
        assertPayerAuth(evmBuy ? await requireWalletAuthAsync(req) : requireWalletAuth(req), payerAddr);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }

      const tokenId = Number(body.tokenId);
      const pre = await getCollection(id);
      if (!pre) return NextResponse.json({ error: "not found" }, { status: 404 });
      const token = pre.tokens.find((t) => t.tokenId === tokenId);
      if (!token?.listing) return NextResponse.json({ error: "Not listed for sale" }, { status: 400 });
      if (token.location === "in_flight") {
        return NextResponse.json({ error: "Cannot buy while the NFT is in flight" }, { status: 409 });
      }
      const loc = token.location ?? "solana";
      if (loc === "solana" && evmBuy) {
        return NextResponse.json({ error: "This NFT lives on Solana. Connect a Solana wallet to buy." }, { status: 400 });
      }
      if (loc !== "solana" && !evmBuy) {
        return NextResponse.json({ error: "This NFT lives on Avalanche. Connect MetaMask or Core to buy." }, { status: 400 });
      }
      const expectedUsd = token.listing.priceUsd;
      const method = String(body.method || "slicepay");
      const invoiceId = String(body.invoiceId || "");

      if (method === "slicepay") {
        const fulfillment = {
          collectionId: pre.id,
          tokenId,
          payerWallet: payerAddr,
          kind: "secondary_buy" as const,
        };
        const verified = await verifySlicePayInvoice(
          invoiceId,
          expectedUsd,
          `secondary-${pre.id}-`,
          fulfillment,
        );
        if (!verified.ok) {
          return NextResponse.json({ error: verified.error ?? "Payment not verified" }, { status: 402 });
        }
      } else if (method === "demo") {
        if (slicePayConfigured()) {
          return NextResponse.json({ error: "Demo buy disabled in production" }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: "Secondary buys require SlicePay" }, { status: 400 });
      }

      if (method === "slicepay") {
        const consumed = await consumePaidInvoice(invoiceId, {
          collectionId: pre.id,
          tokenId,
          payerWallet: payerAddr,
          kind: "secondary_buy",
        });
        if (!consumed.ok) {
          return NextResponse.json({ error: consumed.error ?? "Invoice already used" }, { status: 402 });
        }
      }

      const secondaryCtx = { breakdown: null as SaleFeeBreakdown | null };
      const sellerWallet = token.owner ?? undefined;

      let collection = await updateCollection(id, (current) => {
        if (!collectionAllowsResale(current)) throw new Error("This collection is not open for resale");
        const t = current.tokens.find((x) => x.tokenId === tokenId);
        if (!t?.listing) throw new Error("Not listed for sale");
        if (t.owner === payerAddr) throw new Error("Already yours");
        const saleUsd = t.listing.priceUsd;
        t.owner = payerAddr;
        t.listing = null;
        const accrued = accrueSaleFees(current, {
          saleUsd,
          kind: "secondary_sale",
          tokenId,
          payer: payerAddr,
          seller: sellerWallet,
        });
        secondaryCtx.breakdown = accrued.breakdown;
        return applySaleTreasury(current, { excludeTokenIds: [tokenId] });
      });
      if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      const network = serverNetwork(body.network);
      let buyback: Awaited<ReturnType<typeof processSaleBuyback>> = null;
      if (collection.treasuryBuybackActive && secondaryCtx.breakdown) {
        buyback = await processSaleBuyback({
          collectionId: id,
          network,
          buybackUsd: secondaryCtx.breakdown.buybackUsd,
        });
        if (buyback?.collection) collection = buyback.collection;
      }
      const holderDistribution = await processLatestHolderDistribution({ collectionId: id, network });
      if (holderDistribution?.collection) collection = holderDistribution.collection;
      return NextResponse.json({
        collection: toPublicCollection(collection),
        tokenId,
        buyer: payerAddr,
        feeBreakdown: secondaryCtx.breakdown,
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
              ok: holderDistribution.ok,
              roundId: holderDistribution.roundId ?? null,
              payouts: holderDistribution.payouts ?? null,
              error: holderDistribution.error ?? null,
            }
          : null,
      });
    }

    if (body.action === "claim_fees") {
      let auth;
      try {
        auth = requireWalletAuth(req);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }
      const wallet = auth.wallet;
      let claimedUsd = 0;
      const collection = await updateCollection(id, (current) => {
        const result = claimHolderFees(current, wallet);
        claimedUsd = result.claimedUsd;
        return result.collection;
      });
      if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({
        collection: toPublicCollection(collection),
        claimedUsd,
        wallet,
      });
    }

    if (body.action === "set_buyback") {
      const auth = readAuthHeaders(req);
      const existing = await getCollection(id);
      if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
      try {
        assertCreatorAuth(auth, existing.payments.creatorWallet);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }
      const tokenCa = String(body.buybackTokenCa || "").trim();
      const treasury = String(body.buybackTreasuryWallet || "").trim();
      if (!isValidSolanaAddress(tokenCa)) {
        return NextResponse.json({ error: "Invalid buyback token CA" }, { status: 400 });
      }
      if (!isValidSolanaAddress(treasury)) {
        return NextResponse.json({ error: "Invalid treasury wallet" }, { status: 400 });
      }
      if (collectionHomeChain(existing) === "solana") {
        const reason = await splMintRejectionReason(tokenCa, serverNetwork());
        if (reason) return NextResponse.json({ error: reason }, { status: 400 });
      }
      const collection = await updateCollection(id, (current) => {
        current.buybackTokenCa = tokenCa;
        current.buybackTreasuryWallet = treasury;
        return current;
      });
      if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ collection: toPublicCollection(collection) });
    }

    if (body.action === "execute_buyback") {
      const existing = await getCollection(id);
      if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
      try {
        assertCreatorAuth(readAuthHeaders(req), existing.payments.creatorWallet);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }
      if (!existing.treasuryBuybackActive) {
        return NextResponse.json({ error: "Treasury buyback is not active" }, { status: 400 });
      }
      const result = await executeSplTokenBuyback(id, serverNetwork(body.network));
      if (!result.collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({
        collection: toPublicCollection(result.collection),
        purchased: result.purchased,
        usdSpent: result.usdSpent ?? null,
        tokenAmount: result.tokenAmount ?? null,
        treasuryWallet: result.treasuryWallet ?? existing.buybackTreasuryWallet ?? null,
        txSignature: result.txSignature ?? null,
        txUrl: result.txUrl ?? null,
        reason: result.reason ?? null,
      });
    }

    if (body.action === "distribute_holder_rewards") {
      const existing = await getCollection(id);
      if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
      try {
        assertCreatorAuth(readAuthHeaders(req), existing.payments.creatorWallet);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }
      if (!existing.feeClaimsOpen) {
        return NextResponse.json({ error: "Holder rewards are not open" }, { status: 400 });
      }
      const { results, collection } = await processAllPendingHolderDistributions({
        collectionId: id,
        network: serverNetwork(body.network),
      });
      if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({
        collection: toPublicCollection(collection),
        rounds: results.map((r) => ({
          ok: r.ok,
          roundId: r.roundId ?? null,
          payouts: r.payouts ?? null,
          error: r.error ?? null,
        })),
      });
    }

    if (body.action === "fee_status") {
      const wallet = String(body.wallet || "");
      const collection = await getCollection(id);
      if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      const knownWallet =
        wallet && (isValidSolanaAddress(wallet) || isEvmAddress(wallet)) ? wallet : "";
      const preview = knownWallet ? previewHolderClaim(collection, knownWallet) : null;
      return NextResponse.json({
        summary: treasurySummary(collection),
        walletRewards: knownWallet ? walletRewardSummary(collection, knownWallet) : null,
        feeLedger: collection.feeLedger ?? null,
        feeClaimsOpen: collection.feeClaimsOpen ?? false,
        treasuryBuybackActive: collection.treasuryBuybackActive ?? false,
        buybackTokenCa: collection.buybackTokenCa ?? null,
        buybackTreasuryWallet: collection.buybackTreasuryWallet ?? collection.payments.creatorWallet ?? null,
        claimPreview: preview,
      });
    }

    if (body.action === "creator_gift") {
      const auth = readAuthHeaders(req);
      const rl = await rateLimit(`creator-gift:${auth?.wallet || ip}`, 20, 15 * 60 * 1000);
      if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      const existing = await getCollection(id);
      if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
      try {
        assertCreatorAuth(auth, existing.payments.creatorWallet);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }
      const payerAddr = auth?.wallet;
      if (!payerAddr) {
        return NextResponse.json({ error: "Wallet signature required" }, { status: 401 });
      }

      const recipientAddr = String(body.recipient || "").trim();
      const tokenId = Number(body.tokenId);
      if (!isValidSolanaAddress(recipientAddr)) {
        return NextResponse.json({ error: "Valid recipient wallet required" }, { status: 400 });
      }
      if (!Number.isFinite(tokenId) || tokenId <= 0) {
        return NextResponse.json({ error: "tokenId required" }, { status: 400 });
      }
      if (existing.status !== "live") {
        return NextResponse.json({ error: "Collection is not live" }, { status: 400 });
      }

      const token = existing.tokens.find((t) => t.tokenId === tokenId);
      if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
      if (tokenIsCommitted(token, existing)) {
        return NextResponse.json({ error: "That NFT is already minted or reserved" }, { status: 400 });
      }

      if (!getPlatformSecretKey()) {
        return NextResponse.json(
          { error: "Gift mint needs a wallet confirmation, and the mint signer is not configured." },
          { status: 503 },
        );
      }

      const reserved = await tryReserveToken(id, token.tokenId, recipientAddr);
      if (!reserved) {
        return NextResponse.json({ error: "That NFT is already minted or reserved" }, { status: 400 });
      }

      let txResult: BuildTxResult | null = null;
      const network = serverNetwork(body.network);
      try {
        const built = await buildPendingMintForToken({
          collection: existing,
          tokenId: token.tokenId,
          payer: payerAddr,
          recipient: recipientAddr,
          network,
        });
        txResult = built.txResult;
      } catch (e) {
        await rollbackMint({
          id,
          tokenIds: [token.tokenId],
          recipient: recipientAddr,
          onChain: true,
        });
        const message = e instanceof Error ? e.message : "On-chain mint could not be built";
        console.error("[creator_gift] On-chain tx build failed:", e);
        return NextResponse.json({ error: message }, { status: 500 });
      }

      let collection: Awaited<ReturnType<typeof updateCollection>> = null;
      try {
        collection = await updateCollection(id, (current) => {
          const gifted = current.tokens.find((t) => t.tokenId === tokenId);
          if (gifted && txResult) gifted.assetAddress = txResult.assetAddress;
          if (txResult) {
            current.pendingMint = { ...txResult.pendingMint, tokenId };
          }
          return current;
        });
      } catch (e) {
        await rollbackMint({
          id,
          tokenIds: [token.tokenId],
          recipient: recipientAddr,
          onChain: true,
        });
        throw e;
      }
      if (!collection || !txResult) {
        await rollbackMint({
          id,
          tokenIds: [token.tokenId],
          recipient: recipientAddr,
          onChain: true,
        });
        return NextResponse.json({ error: "Gift mint could not be prepared" }, { status: 500 });
      }

      return NextResponse.json({
        tokenId,
        recipient: recipientAddr,
        requiresOnChainMint: true,
      });
    }

    if (body.action === "creator_gift_cancel") {
      const auth = readAuthHeaders(req);
      const existing = await getCollection(id);
      if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
      try {
        assertCreatorAuth(auth, existing.payments.creatorWallet);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }
      const tokenId = Number(body.tokenId);
      const token = existing.tokens.find((t) => t.tokenId === tokenId);
      if (!token || token.owner) {
        return NextResponse.json({ ok: true, released: false });
      }
      await clearTokenReservation(id, tokenId);
      await updateCollection(id, (current) => {
        if (current.pendingMint?.tokenId === tokenId && !(current.pendingMint.paymentLamports && current.pendingMint.paymentLamports > 0)) {
          delete current.pendingMint;
        }
        const held = current.tokens.find((t) => t.tokenId === tokenId);
        if (held && !held.owner) {
          delete held.assetAddress;
          delete held.reservedBy;
          delete held.reservedAt;
        }
        current.mintedCount = current.tokens.filter((t) => Boolean(t.owner)).length;
        if (current.status === "sold_out" && current.mintedCount < current.supply) {
          current.status = "live";
        }
        return current;
      });
      return NextResponse.json({ ok: true, released: true });
    }

    if (body.action === "reveal") {
      const auth = readAuthHeaders(req);
      const existing = await getCollection(id);
      if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
      try {
        assertCreatorAuth(auth, existing.payments.creatorWallet);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unauthorized";
        return NextResponse.json({ error: message }, { status: 401 });
      }

      const collection = await updateCollection(id, (current) => {
        current.revealed = true;
        return current;
      });
      if (!collection) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json({ collection: toPublicCollection(collection) });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    const status =
      message === "Not on allowlist" ? 403 : message === "not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const auth = requireWalletAuth(req);
    const existing = await getCollection(id);
    if (!existing) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    assertCreatorAuth(auth, existing.payments.creatorWallet);
    if (existing.status !== "draft" && existing.status !== "importing") {
      return NextResponse.json(
        { error: "Only draft or in-progress launches can be deleted" },
        { status: 400 },
      );
    }
    const { deleteCollection } = await import("@/lib/store");
    const deleted = await deleteCollection(id);
    if (!deleted) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    const status =
      message.includes("signature") || message.includes("creator") || message.includes("Wallet")
        ? 401
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
