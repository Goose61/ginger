import Link from "next/link";
import type { ReactNode } from "react";
import {
  SECURITY_AUDIT_META,
  SECURITY_CONTROLS,
  SECURITY_DEP_SNAPSHOT,
  SECURITY_DISCLAIMER,
  SECURITY_EXECUTIVE_SUMMARY,
  SECURITY_FINDINGS,
  SECURITY_RATINGS,
} from "@/lib/security-audit-content";

const severityClass: Record<string, string> = {
  Critical: "bg-red-500/20 text-red-300",
  High: "bg-orange-500/20 text-orange-300",
  Medium: "bg-yellow-500/20 text-yellow-200",
  Info: "bg-white/10 text-white/70",
};

const statusClass: Record<string, string> = {
  Fixed: "text-lime-300",
  Open: "text-yellow-300",
  Operational: "text-white/60",
  "By design": "text-white/50",
};

export function SecurityAuditReport() {
  return (
    <section className="py-16 text-foreground">
      <div className="container px-4">
        <div className="mx-auto max-w-4xl">
          <div className="mb-10 text-center">
            <p className="text-sm uppercase tracking-[0.18em] text-primary">Transparency</p>
            <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Security assessment</h1>
            <p className="mt-3 text-muted-foreground">
              Level A self-assessment + Level B automated review · {SECURITY_AUDIT_META.reportDate}
            </p>
          </div>

          <div className="mb-8 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4 text-sm leading-6 text-white/85">
            {SECURITY_DISCLAIMER}
          </div>

          <div className="mb-10 grid gap-3 sm:grid-cols-2">
            <MetaCard label="Production" value={SECURITY_AUDIT_META.productionUrl} />
            <MetaCard label="Repository commit" value={SECURITY_AUDIT_META.commit} />
            <MetaCard label="Overall residual risk" value={SECURITY_AUDIT_META.overallRisk} />
            <MetaCard label="Assessment type" value={SECURITY_AUDIT_META.assessmentType} />
          </div>

          <ReportBlock title="Executive summary">
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              {SECURITY_EXECUTIVE_SUMMARY.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </ReportBlock>

          <ReportBlock title="Risk by area">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/50">
                    <th className="pb-2 pr-4 font-medium">Area</th>
                    <th className="pb-2 pr-4 font-medium">Rating</th>
                    <th className="pb-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {SECURITY_RATINGS.map((row) => (
                    <tr key={row.area} className="border-b border-white/5">
                      <td className="py-3 pr-4 text-white">{row.area}</td>
                      <td className="py-3 pr-4 font-medium text-secondary">{row.rating}</td>
                      <td className="py-3 text-muted-foreground">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReportBlock>

          <ReportBlock title="Findings register">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/50">
                    <th className="pb-2 pr-3 font-medium">ID</th>
                    <th className="pb-2 pr-3 font-medium">Severity</th>
                    <th className="pb-2 pr-3 font-medium">Domain</th>
                    <th className="pb-2 pr-3 font-medium">Summary</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {SECURITY_FINDINGS.map((f) => (
                    <tr key={f.id} className="border-b border-white/5 align-top">
                      <td className="py-3 pr-3 font-mono text-xs text-white/80">{f.id}</td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${severityClass[f.severity]}`}
                        >
                          {f.severity}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-white/90">{f.domain}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{f.summary}</td>
                      <td className={`py-3 font-medium ${statusClass[f.status]}`}>{f.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReportBlock>

          <ReportBlock title="Controls verified">
            <ul className="grid gap-2 sm:grid-cols-2">
              {SECURITY_CONTROLS.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground"
                >
                  {item}
                </li>
              ))}
            </ul>
          </ReportBlock>

          <ReportBlock title="Dependency snapshot">
            <p className="mb-4 text-sm text-muted-foreground">
              {SECURITY_DEP_SNAPSHOT.command} · {SECURITY_DEP_SNAPSHOT.date}
            </p>
            <div className="flex flex-wrap gap-3">
              <Badge label="Critical" value={SECURITY_DEP_SNAPSHOT.critical} tone="red" />
              <Badge label="High" value={SECURITY_DEP_SNAPSHOT.high} tone="orange" />
              <Badge label="Moderate" value={SECURITY_DEP_SNAPSHOT.moderate} tone="yellow" />
              <Badge label="Low" value={SECURITY_DEP_SNAPSHOT.low} tone="muted" />
            </div>
          </ReportBlock>

          <ReportBlock title="Scope & limitations">
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <span className="text-white">In scope:</span> Ginger web app, API routes, payment
                flows, wallet auth, headers, rate limits, MongoDB access patterns, and production
                configuration.
              </p>
              <p>
                <span className="text-white">Out of scope:</span> SlicePay core infrastructure,
                user wallet apps, Solana validators, MongoDB Atlas datacenter security, formal
                smart-contract audit, compressed NFTs.
              </p>
              <p>
                Full markdown report for operators:{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
                  security/SECURITY_ASSESSMENT_REPORT.md
                </code>{" "}
                in the repository.
              </p>
            </div>
          </ReportBlock>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/faq"
              className="inline-flex rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 hover:border-white/30 hover:text-white"
            >
              Read security FAQ
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

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-1 break-all text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function ReportBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-8 rounded-2xl border border-white/10 bg-card/60 p-5 sm:p-6">
      <h2 className="mb-4 text-xl font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}

function Badge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "orange" | "yellow" | "muted";
}) {
  const tones = {
    red: "border-red-500/30 bg-red-500/10 text-red-200",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-200",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
    muted: "border-white/15 bg-white/5 text-white/70",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  );
}
