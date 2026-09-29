import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { SECURITY_REPORT_DOWNLOAD } from "@/lib/security-audit-content";

/** Serve the public security report as a file download (not inline preview). */
export async function GET() {
  const filePath = path.join(process.cwd(), "public/docs", SECURITY_REPORT_DOWNLOAD.filename);

  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return NextResponse.json({ error: "Security report not found" }, { status: 404 });
  }

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${SECURITY_REPORT_DOWNLOAD.filename}"`,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
