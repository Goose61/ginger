import Link from "next/link";
import type { ReactNode } from "react";
import {
  SECURITY_AUDIT_META,
  SECURITY_CONTROLS,
  SECURITY_DEP_SNAPSHOT,
  SECURITY_DISCLAIMER,
  SECURITY_EXECUTIVE_SUMMARY,
  SECURITY_MONITORED_ITEMS,
  SECURITY_OPEN_FINDINGS,
  SECURITY_RATINGS,
  SECURITY_REMEDIATED_FINDINGS,
} from "@/lib/security-audit-content";

export function SecurityAuditReport() {
  const openCount = SECURITY_OPEN_FINDINGS.length;

  return (
    <section className="py-16 text-foreground">
      <div className="container px-4">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <p className="text-sm uppercase tracking-[0.18em] text-primary">Transparency</p>
            <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Security assessment</h1>
            <p className="mt-3 text-muted-foreground">
              {SECURITY_AUDIT_META.assessmentType} · {SECURITY_AUDIT_META.reportDate}
            </p>
          </div>

          <div className="mb-6 rounded-2xl border border-lime-500/30 bg-lime-500/10 px-5 py-4 text-center">
            <p className="text-lg font-semibold text-lime-200">
              {openCount === 0
                ? "No open security findings"
                : `${openCount} open finding${openCount === 1 ? "" : "s"}`}
            </p>
            <p className="mt-1 text-sm text-white/70">
              {SECURITY_AUDIT_META.remediatedCount} issues remediated in our September 2026 review
            </p>
          </div>

          <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm leading-6 text-white/75">
            {SECURITY_DISCLAIMER}
          </div>

          <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetaCard label="Site" value="gingernft.store" />
            <MetaCard label="Last reviewed" value={SECURITY_AUDIT_META.reportDate} />
            <MetaCard label="Residual risk" value={SECURITY_AUDIT_META.overallRisk} />
            <MetaCard label="Open findings" value={String(openCount)} />
          </div>

          <ReportBlock title="Summary">
            <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
              {SECURITY_EXECUTIVE_SUMMARY.map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </ReportBlock>

          <ReportBlock title="Risk overview">
            <div className="grid gap-3 sm:grid-cols-2">
              {SECURITY_RATINGS.map((row) => (
                <div
                  key={row.area}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white">{row.area}</p>
                    <span className="shrink-0 rounded-full bg-secondary/15 px-2 py-0.5 text-xs font-medium text-secondary">
                      {row.rating}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{row.note}</p>
                </div>
              ))}
            </div>
          </ReportBlock>

          {openCount > 0 && (
            <ReportBlock title="Open findings">
              <FindingsList items={SECURITY_OPEN_FINDINGS} />
            </ReportBlock>
          )}

          <ReportBlock title="Remediated in beta">
            <p className="mb-4 text-sm text-muted-foreground">
              Previously identified issues that are now fixed in production code.
            </p>
            <FindingsList items={SECURITY_REMEDIATED_FINDINGS} compact />
          </ReportBlock>

          <ReportBlock title="Controls in place">
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
          </ReportBlock>

          <ReportBlock title="Dependencies">
            <p className="mb-1 text-sm text-muted-foreground">
              {SECURITY_DEP_SNAPSHOT.command} · {SECURITY_DEP_SNAPSHOT.date}
            </p>
            <p className="mb-4 text-xs text-white/45">{SECURITY_DEP_SNAPSHOT.note}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBadge label="Critical" value={SECURITY_DEP_SNAPSHOT.critical} highlight />
              <StatBadge label="High" value={SECURITY_DEP_SNAPSHOT.high} />
              <StatBadge label="Moderate" value={SECURITY_DEP_SNAPSHOT.moderate} />
              <StatBadge label="Low" value={SECURITY_DEP_SNAPSHOT.low} />
            </div>
          </ReportBlock>

          <ReportBlock title="Monitored (not open findings)">
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
            <Link
              href="/faq"
              className="inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:border-white/30 hover:text-white"
            >
              Security FAQ
            </Link>
            <a
              href="mailto:slicepay@slicechain.io?subject=Ginger%20security%20report"
              className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/85"
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
            <span className="font-mono text-xs text-white/50">{f.id}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
              {f.severity}
            </span>
            {!compact && (
              <span className="text-xs font-medium text-lime-300">{f.status}</span>
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
      <h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>
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
