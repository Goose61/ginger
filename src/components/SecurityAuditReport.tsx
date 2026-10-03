import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { Download } from "lucide-react";
import {
  GINGER_LOGO_SRC,
  SECURITY_AUDIT_META,
  SECURITY_CONTROLS,
  SECURITY_DEP_SNAPSHOT,
  SECURITY_EXECUTIVE_SUMMARY,
  SECURITY_MONITORED_ITEMS,
  SECURITY_OPEN_FINDINGS,
  SECURITY_REMEDIATED_FINDINGS,
  SECURITY_REPORT_DOWNLOAD,
} from "@/lib/security-audit-content";

export function SecurityAuditReport() {
  const openCount = SECURITY_OPEN_FINDINGS.length;

  return (
    <section className="py-16 text-foreground">
      <div className="container px-4">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <Image
              src={GINGER_LOGO_SRC}
              alt=""
              width={96}
              height={96}
              className="mx-auto h-16 w-16 object-contain"
            />
            <p className="mt-4 text-sm uppercase tracking-[0.18em] text-primary">Trust & safety</p>
            <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Security</h1>
            <p className="mt-3 text-muted-foreground">
              How Ginger protects collectors and creators · {SECURITY_AUDIT_META.reportDate}
            </p>
            <a
              href={SECURITY_REPORT_DOWNLOAD.href}
              download={SECURITY_REPORT_DOWNLOAD.filename}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium text-white hover:border-primary/50 hover:text-primary"
            >
              <Download className="h-4 w-4" aria-hidden />
              {SECURITY_REPORT_DOWNLOAD.label}
            </a>
          </div>

          <div className="mb-10 rounded-2xl border border-lime-500/30 bg-lime-500/10 px-5 py-4 text-center">
            <p className="text-lg font-semibold text-lime-200">
              {openCount === 0
                ? "No open security findings"
                : `${openCount} open finding${openCount === 1 ? "" : "s"}`}
            </p>
            <p className="mt-1 text-sm text-white/70">
              {SECURITY_AUDIT_META.remediatedCount} improvements shipped in our September 2026 review
            </p>
          </div>

          <div className="mb-10 grid gap-3 sm:grid-cols-3">
            <MetaCard label="Site" value="gingernft.store" />
            <MetaCard label="Last reviewed" value={SECURITY_AUDIT_META.reportDate} />
            <MetaCard label="Status" value={SECURITY_AUDIT_META.status} />
          </div>

          <ReportBlock title="At a glance">
            <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
              {SECURITY_EXECUTIVE_SUMMARY.map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </ReportBlock>

          <ReportBlock title="Security features">
            <ul className="grid gap-2 sm:grid-cols-2">
              {SECURITY_CONTROLS.map((item) => (
                <li
                  key={item}
                  className="flex gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground"
                >
                  <span className="text-lime-400" aria-hidden>
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-white/45">
              Full detail on each feature is in the{" "}
              <a
                href={SECURITY_REPORT_DOWNLOAD.href}
                download={SECURITY_REPORT_DOWNLOAD.filename}
                className="text-primary underline-offset-2 hover:underline"
              >
                downloadable report
              </a>
              .
            </p>
          </ReportBlock>

          {openCount > 0 && (
            <ReportBlock title="Open findings">
              <FindingsList items={SECURITY_OPEN_FINDINGS} />
            </ReportBlock>
          )}

          <ReportBlock title="Recent improvements">
            <p className="mb-4 text-sm text-muted-foreground">
              Issues found during beta review that are now resolved.
            </p>
            <FindingsList items={SECURITY_REMEDIATED_FINDINGS} compact />
          </ReportBlock>

          <ReportBlock title="Dependency health">
            <p className="mb-4 text-xs text-white/45">{SECURITY_DEP_SNAPSHOT.note}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBadge label="Critical" value={SECURITY_DEP_SNAPSHOT.critical} highlight />
              <StatBadge label="High" value={SECURITY_DEP_SNAPSHOT.high} />
              <StatBadge label="Moderate" value={SECURITY_DEP_SNAPSHOT.moderate} />
              <StatBadge label="Low" value={SECURITY_DEP_SNAPSHOT.low} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Snapshot: {SECURITY_DEP_SNAPSHOT.date}
            </p>
          </ReportBlock>

          <ReportBlock title="Ongoing monitoring">
            <div className="space-y-3">
              {SECURITY_MONITORED_ITEMS.map((item) => (
                <div key={item.title} className="rounded-xl border border-white/10 px-4 py-3">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>
          </ReportBlock>

          <div className="mt-10 flex flex-wrap gap-3">
            <a
              href={SECURITY_REPORT_DOWNLOAD.href}
              download={SECURITY_REPORT_DOWNLOAD.filename}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/85"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download report
            </a>
            <Link
              href="/faq"
              className="inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:border-white/30 hover:text-white"
            >
              Security FAQ
            </Link>
            <a
              href="mailto:slicepay@slicechain.io?subject=Ginger%20security%20report"
              className="inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:border-white/30 hover:text-white"
            >
              Report a vulnerability
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function FindingsList({
  items,
  compact = false,
}: {
  items: typeof SECURITY_REMEDIATED_FINDINGS;
  compact?: boolean;
}) {
  return (
    <ul className={`space-y-2 ${compact ? "sm:columns-2 sm:gap-4" : ""}`}>
      {items.map((f) => (
        <li
          key={f.id}
          className="break-inside-avoid rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-lime-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-lime-300">
              Resolved
            </span>
            {!compact && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                {f.severity}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/90">{f.summary}</p>
          {compact && (
            <p className="mt-1 text-xs text-white/45">{f.domain}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function ReportBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-8 rounded-2xl border border-white/10 bg-card/40 p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-white">
        <Image src={GINGER_LOGO_SRC} alt="" width={40} height={40} className="h-8 w-8 object-contain" />
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatBadge({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 text-center ${
        highlight
          ? "border-lime-500/30 bg-lime-500/10"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-white/45">{label}</p>
      <p className={`text-2xl font-semibold ${highlight ? "text-lime-200" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
