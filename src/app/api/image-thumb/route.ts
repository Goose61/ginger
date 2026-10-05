import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

const MAX_WIDTH = 800;
const MIN_WIDTH = 64;
const MAX_UPSTREAM_BYTES = 12 * 1024 * 1024;
const MAX_CONCURRENT_THUMBS = 2;
let activeThumbs = 0;
const thumbWaiters: Array<() => void> = [];

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function acquireThumb(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
  if (activeThumbs < MAX_CONCURRENT_THUMBS) {
    activeThumbs += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const start = () => {
      signal.removeEventListener("abort", onAbort);
      activeThumbs += 1;
      resolve();
    };
    const onAbort = () => {
      const index = thumbWaiters.indexOf(start);
      if (index >= 0) thumbWaiters.splice(index, 1);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    thumbWaiters.push(start);
  });
}

function releaseThumb() {
  activeThumbs = Math.max(0, activeThumbs - 1);
  thumbWaiters.shift()?.();
}

function allowedRelativePath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/assets/") ||
    pathname.startsWith("/api/irys-gateway/") ||
    pathname.startsWith("/api/assets-blob/")
  );
}

function isAllowedAbsoluteUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host === "gateway.irys.xyz" ||
    host === "arweave.net" ||
    host === "blob.vercel-storage.com" ||
    host.endsWith(".public.blob.vercel-storage.com") ||
    host.endsWith(".datasprite-cdn.com")
  );
}

/** Grid thumbs must not call back into this server. That queue is what delays the full image. */
function resolveUpstream(raw: string, origin: string): URL | null {
  if (!raw || raw.length > 1024) return null;
  const irysId = raw.match(/^\/api\/irys-gateway\/([A-Za-z0-9_-]{20,64})$/);
  if (irysId) return new URL(`https://gateway.irys.xyz/${irysId[1]}`);
  if (raw.startsWith("/")) {
    if (!allowedRelativePath(raw)) return null;
    try {
      return new URL(raw, origin);
    } catch {
      return null;
    }
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!isAllowedAbsoluteUrl(url)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u") ?? "";
  const widthRaw = Number(req.nextUrl.searchParams.get("w") ?? 400);
  const width = Number.isFinite(widthRaw)
    ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(widthRaw)))
    : 400;

  const upstreamUrl = resolveUpstream(raw, req.nextUrl.origin);
  if (!upstreamUrl) {
    return NextResponse.json({ error: "Invalid image" }, { status: 400 });
  }

  const signal = AbortSignal.any([AbortSignal.timeout(15_000), req.signal]);
  let acquired = false;
  try {
    await acquireThumb(signal);
    acquired = true;
    if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");

    const upstream = await fetch(upstreamUrl, {
      redirect: "follow",
      signal,
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Upstream not found" }, { status: upstream.status });
    }

    const finalUrl = new URL(upstream.url);
    const sameOriginAllowed =
      finalUrl.origin === req.nextUrl.origin && allowedRelativePath(finalUrl.pathname);
    if (!isAllowedAbsoluteUrl(finalUrl) && !sameOriginAllowed) {
      return NextResponse.json({ error: "Invalid image" }, { status: 400 });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    if (buf.length > MAX_UPSTREAM_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    const webp = await sharp(buf)
      .rotate()
      .resize(width, width, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();

    return new NextResponse(new Uint8Array(webp), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (err) {
    if (isAbortError(err) || signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    return NextResponse.json(
      { error: `Thumb failed: ${String(err)}` },
      { status: 502 },
    );
  } finally {
    if (acquired) releaseThumb();
  }
}
