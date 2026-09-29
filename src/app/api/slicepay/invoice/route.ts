import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { storeInvoice, slicePayConfigured } from "@/lib/slicepay";
import { isValidSolanaAddress } from "@/lib/mint-nft";
import {
  extractSlicePayInvoiceId,
  getSlicePayApiKey,
  getSlicePayMerchantId,
  slicePayCheckoutInvoiceUrl,
  slicePayGatewayFetch,
} from "@/lib/slicepay-config";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`invoice:${ip}`, 20, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!slicePayConfigured()) {
    return NextResponse.json(
      {
        error:
          "SlicePay is not configured. Set SLICEPAY_MERCHANT_ID and SLICEPAY_API_KEY on the server.",
      },
      { status: 503 },
    );
  }

  const body = await req.json();
  const merchantId = getSlicePayMerchantId();
  const apiKey = getSlicePayApiKey()!;
  const amountUsd = Number(body.amountUsd ?? 0);
  const orderId = String(body.orderId ?? `mint-${Date.now()}`).slice(0, 128);
  const description = String(body.description ?? "NFT mint").slice(0, 500);
  const redirectUrlRaw = String(body.redirectUrl ?? "");
  let redirectUrl = "";
  if (redirectUrlRaw) {
    try {
      const parsed = new URL(redirectUrlRaw);
      const allowed =
        process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      if (parsed.origin === req.nextUrl.origin || allowed.includes(parsed.origin)) {
        redirectUrl = parsed.toString();
      }
    } catch {
      redirectUrl = "";
    }
  }
  const collectionId = body.collectionId ? String(body.collectionId) : undefined;
  const tokenId = body.tokenId != null ? Number(body.tokenId) : undefined;
  const payerWallet = body.payerWallet ? String(body.payerWallet) : undefined;
  const kind = body.kind === "secondary_buy" ? "secondary_buy" : "primary_mint";

  if (!(amountUsd >= 0.01)) {
    return NextResponse.json({ error: "amountUsd must be at least $0.01" }, { status: 400 });
  }
  if (collectionId) {
    if (tokenId == null || !Number.isFinite(tokenId) || tokenId <= 0) {
      return NextResponse.json({ error: "tokenId required for collection checkout" }, { status: 400 });
    }
    if (!payerWallet || !isValidSolanaAddress(payerWallet)) {
      return NextResponse.json({ error: "Valid payerWallet required for collection checkout" }, { status: 400 });
    }
  }

  const invoicePayload: Record<string, unknown> = {
    merchantId,
    amountUsd,
    amount: amountUsd,
    orderId,
    description,
    redirectUrl,
    apiKey,
  };

  try {
    const res = await slicePayGatewayFetch("/create-invoice", {
      method: "POST",
      json: invoicePayload,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const invoiceId = extractSlicePayInvoiceId(data);
    if (res.ok && invoiceId) {
      await storeInvoice({
        invoiceId,
        amountUsd,
        orderId,
        status: "waiting",
        collectionId,
        tokenId,
        payerWallet,
        kind,
      });
      return NextResponse.json({
        invoiceId,
        configured: true,
        checkoutUrl:
          typeof data.checkoutUrl === "string" && data.checkoutUrl
            ? data.checkoutUrl
            : slicePayCheckoutInvoiceUrl(invoiceId),
      });
    }
    const detail =
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : "SlicePay could not create an invoice";
    console.error("[slicepay] create-invoice failed", res.status, data);
    return NextResponse.json({ error: detail }, { status: res.status >= 400 ? res.status : 502 });
  } catch (err) {
    console.error("[slicepay] create-invoice error", err);
    return NextResponse.json({ error: "SlicePay invoice request failed" }, { status: 502 });
  }
}

/** GET — report whether SlicePay is configured (safe for client). */
export async function GET() {
  return NextResponse.json({
    configured: slicePayConfigured(),
    checkoutBase: "https://pay.slicechain.io",
  });
}
