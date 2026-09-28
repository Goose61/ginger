import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { isPaidStatus, slicePayConfigured, syncInvoiceStatus } from "@/lib/slicepay";

type Params = { params: Promise<{ invoiceId: string }> };

/** Poll payment state only — no collection/token/order metadata (prevents invoice hijack recon). */
export async function GET(req: NextRequest, { params }: Params) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`slicepay-status:${ip}`, 120, 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { invoiceId } = await params;
  const synced = await syncInvoiceStatus(invoiceId);
  if (synced) {
    return NextResponse.json({
      invoiceId,
      status: synced.status,
      paid: isPaidStatus(synced.status),
      demo: !slicePayConfigured(),
    });
  }

  return NextResponse.json({ error: "not found" }, { status: 404 });
}
