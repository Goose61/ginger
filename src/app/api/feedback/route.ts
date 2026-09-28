import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sendFeedbackEmail } from "@/lib/feedback-email";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";

const CATEGORIES = new Set(["bug", "launch", "rewards", "idea", "other"]);

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`feedback:${ip}`, 8, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many messages. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const category = String(rec.category ?? "other");
  const message = String(rec.message ?? "").trim();
  const contact = String(rec.contact ?? "").trim().slice(0, 200);
  const page = String(rec.page ?? "").trim().slice(0, 300);

  if (!CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Choose a topic" }, { status: 400 });
  }
  if (message.length < 8 || message.length > 2000) {
    return NextResponse.json({ error: "Write at least a short note (8–2000 characters)" }, { status: 400 });
  }

  try {
    await sendFeedbackEmail({
      category,
      message,
      contact: contact || null,
      page: page || null,
    });

    const db = await getDb();
    await db.collection("feedback").insertOne({
      category,
      message,
      contact: contact || null,
      page: page || null,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("[POST /api/feedback]", err);
    const messageText =
      err instanceof Error && err.message.includes("RESEND_API_KEY")
        ? "Feedback email is not configured yet."
        : "Something went wrong";
    return NextResponse.json({ error: messageText }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
