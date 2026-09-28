import { getDb } from "./db";
import { isPaidStatus, PAID_STATUSES } from "./slicepay-shared";
import { getSlicePayMerchantId, SLICEPAY_API_BASE } from "./slicepay-config";

export { isPaidStatus, PAID_STATUSES };
export { slicePayConfigured } from "./slicepay-config";

export type StoredInvoice = {
  invoiceId: string;
  amountUsd: number;
  orderId: string;
  status: string;
  collectionId?: string;
  tokenId?: number;
  payerWallet?: string;
  kind?: "primary_mint" | "secondary_buy";
  createdAt: Date;
  expiresAt: Date;
  redeemedAt?: Date;
};

/** Context the buyer must match when redeeming an invoice for an NFT. */
export type SlicePayFulfillmentContext = {
  collectionId: string;
  tokenId: number;
  payerWallet: string;
  kind?: StoredInvoice["kind"];
};

const AMOUNT_TOLERANCE_USD = 0.01;

function amountMatches(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE_USD;
}

function fulfillmentMismatch(
  stored: StoredInvoice,
  ctx: SlicePayFulfillmentContext,
): string | null {
  if (!stored.collectionId) return "Invoice missing collection binding";
  if (stored.collectionId !== ctx.collectionId) return "Invoice collection mismatch";
  if (stored.tokenId == null) return "Invoice missing token binding";
  if (stored.tokenId !== ctx.tokenId) return "Invoice token mismatch";
  if (!stored.payerWallet) return "Invoice missing payer binding";
  if (stored.payerWallet !== ctx.payerWallet) return "Invoice payer mismatch";
  if (ctx.kind && stored.kind && stored.kind !== ctx.kind) return "Invoice kind mismatch";
  return null;
}

export async function storeInvoice(data: {
  invoiceId: string;
  amountUsd: number;
  orderId: string;
  status?: string;
  collectionId?: string;
  tokenId?: number;
  payerWallet?: string;
  kind?: StoredInvoice["kind"];
}): Promise<void> {
  const db = await getDb();
  const col = db.collection<StoredInvoice>("invoices");
  await col.createIndex({ invoiceId: 1 }, { unique: true, background: true });
  await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true });
  const now = Date.now();
  await col.updateOne(
    { invoiceId: data.invoiceId },
    {
      $set: {
        invoiceId: data.invoiceId,
        amountUsd: data.amountUsd,
        orderId: data.orderId,
        status: data.status ?? "waiting",
        collectionId: data.collectionId,
        tokenId: data.tokenId,
        payerWallet: data.payerWallet,
        kind: data.kind ?? "primary_mint",
        createdAt: new Date(now),
        expiresAt: new Date(now + 24 * 60 * 60 * 1000),
      },
    },
    { upsert: true },
  );
}

export async function getStoredInvoice(invoiceId: string): Promise<StoredInvoice | null> {
  const db = await getDb();
  const col = db.collection<StoredInvoice>("invoices");
  return col.findOne({ invoiceId });
}

export async function markInvoicePaid(invoiceId: string): Promise<void> {
  const db = await getDb();
  const col = db.collection<StoredInvoice>("invoices");
  await col.updateOne({ invoiceId }, { $set: { status: "paid" } });
}

export async function fetchSlicePayStatus(invoiceId: string): Promise<{
  status: string;
  amountUsd?: number;
  raw: Record<string, unknown>;
}> {
  const merchantId = getSlicePayMerchantId();
  if (!merchantId) {
    const stored = await getStoredInvoice(invoiceId);
    return {
      status: stored?.status ?? "waiting",
      amountUsd: stored?.amountUsd,
      raw: { demo: true },
    };
  }

  const res = await fetch(
    `${SLICEPAY_API_BASE}/payment-status/${encodeURIComponent(invoiceId)}`,
  );
  if (!res.ok) {
    throw new Error("Could not fetch payment status");
  }
  const data = (await res.json()) as Record<string, unknown>;
  const status = String(data.status ?? data.paymentStatus ?? "waiting");
  const amountUsd =
    data.amountUsd != null
      ? Number(data.amountUsd)
      : data.amount != null
        ? Number(data.amount)
        : undefined;
  return { status, amountUsd, raw: data };
}

function validateStoredInvoiceBasics(
  stored: StoredInvoice,
  expectedAmountUsd: number,
  expectedOrderPrefix: string,
): string | null {
  if (invoiceIdLooksSynthetic(stored.invoiceId)) {
    return "Invoice must be created via SlicePay create-invoice";
  }
  if (!stored.orderId.startsWith(expectedOrderPrefix)) {
    return "Invoice order mismatch";
  }
  if (!amountMatches(stored.amountUsd, expectedAmountUsd)) {
    return "Invoice amount mismatch";
  }
  if (stored.redeemedAt) {
    return "Invoice already used";
  }
  return null;
}

/** Pseudo IDs from hosted-checkout fallback cannot be redeemed for NFT mints. */
function invoiceIdLooksSynthetic(invoiceId: string): boolean {
  return invoiceId.startsWith("order:") || invoiceId.startsWith("demo_");
}

/** Re-fetch SlicePay before marking paid (webhook / sync). */
export async function confirmInvoicePaidFromSlicePay(
  invoiceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const stored = await getStoredInvoice(invoiceId);
  if (!stored) return { ok: false, error: "Unknown invoice" };
  if (stored.redeemedAt) return { ok: true };

  const merchantId = getSlicePayMerchantId();
  if (!merchantId) {
    if (isPaidStatus(stored.status)) return { ok: true };
    return { ok: false, error: "Payment not completed" };
  }

  try {
    const remote = await fetchSlicePayStatus(invoiceId);
    if (!isPaidStatus(remote.status)) {
      return { ok: false, error: "Payment not completed" };
    }
    if (remote.amountUsd != null && !amountMatches(Number(remote.amountUsd), stored.amountUsd)) {
      return { ok: false, error: "Paid amount mismatch" };
    }
    const remoteOrder = String(remote.raw.orderId ?? remote.raw.order_id ?? "");
    if (remoteOrder && remoteOrder !== stored.orderId) {
      return { ok: false, error: "Invoice order mismatch" };
    }
    await markInvoicePaid(invoiceId);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not verify payment status" };
  }
}

export async function verifySlicePayInvoice(
  invoiceId: string,
  expectedAmountUsd: number,
  expectedOrderPrefix: string,
  fulfillment?: SlicePayFulfillmentContext,
): Promise<{ ok: boolean; error?: string }> {
  if (!invoiceId) return { ok: false, error: "invoiceId required" };
  if (invoiceIdLooksSynthetic(invoiceId)) {
    return { ok: false, error: "Invalid invoice id" };
  }

  const stored = await getStoredInvoice(invoiceId);
  if (!stored) {
    return { ok: false, error: "Unknown invoice" };
  }

  const basics = validateStoredInvoiceBasics(stored, expectedAmountUsd, expectedOrderPrefix);
  if (basics) return { ok: false, error: basics };

  if (fulfillment) {
    const bindErr = fulfillmentMismatch(stored, fulfillment);
    if (bindErr) return { ok: false, error: bindErr };
  }

  if (isPaidStatus(stored.status)) return { ok: true };

  const merchantId = getSlicePayMerchantId();
  if (!merchantId) {
    if (!invoiceId.startsWith("demo_")) {
      return { ok: false, error: "Payment provider not configured" };
    }
    await markInvoicePaid(invoiceId);
    return { ok: true };
  }

  const confirmed = await confirmInvoicePaidFromSlicePay(invoiceId);
  if (!confirmed.ok) return confirmed;
  return { ok: true };
}

/** Mark a verified invoice as spent. Fails if already redeemed. */
export async function consumePaidInvoice(
  invoiceId: string,
  fulfillment?: SlicePayFulfillmentContext,
): Promise<{ ok: boolean; error?: string }> {
  if (!invoiceId) return { ok: false, error: "invoiceId required" };
  const db = await getDb();
  const col = db.collection<StoredInvoice>("invoices");
  const filter: Record<string, unknown> = {
    invoiceId,
    redeemedAt: { $exists: false },
    status: { $in: Array.from(PAID_STATUSES) },
  };
  if (fulfillment) {
    filter.collectionId = fulfillment.collectionId;
    filter.tokenId = fulfillment.tokenId;
    filter.payerWallet = fulfillment.payerWallet;
    if (fulfillment.kind) filter.kind = fulfillment.kind;
  }
  const result = await col.findOneAndUpdate(
    filter,
    { $set: { redeemedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) {
    const existing = await getStoredInvoice(invoiceId);
    if (!existing) return { ok: false, error: "Unknown invoice" };
    if (existing.redeemedAt) return { ok: false, error: "Invoice already used" };
    return { ok: false, error: "Invoice could not be redeemed" };
  }
  return { ok: true };
}

export async function syncInvoiceStatus(invoiceId: string): Promise<StoredInvoice | null> {
  const stored = await getStoredInvoice(invoiceId);
  if (!stored) return null;
  if (isPaidStatus(stored.status)) return stored;

  try {
    const confirmed = await confirmInvoicePaidFromSlicePay(invoiceId);
    if (confirmed.ok) {
      return { ...stored, status: "paid" };
    }
    const remote = await fetchSlicePayStatus(invoiceId);
    return { ...stored, status: remote.status };
  } catch {
    return stored;
  }
}

export function slicePayWebhookSecret(): string | undefined {
  return process.env.SLICEPAY_WEBHOOK_SECRET;
}
