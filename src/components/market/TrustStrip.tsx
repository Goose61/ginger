import Link from "next/link";
import { ShieldCheck, Wallet, ReceiptText, KeyRound, Download, ArrowRight } from "lucide-react";
import {
  SECURITY_AUDIT_META,
  SECURITY_OPEN_FINDINGS,
  SECURITY_REPORT_DOWNLOAD,
} from "@/lib/security-audit-content";

const PRINCIPLES = [
  {
    icon: Wallet,
    title: "You keep custody",
    text: "NFTs live in your wallet. Ginger never holds private keys.",
  },
  {
    icon: ReceiptText,
    title: "Pay before mint",
    text: "Every paid mint is tied to a verified payment and a specific token. Proofs are single-use.",
  },
  {
    icon: KeyRound,
    title: "Creators stay in control",
    text: "Only the creator wallet can change drafts, fees, allowlists and treasury actions.",
  },
];

export function TrustStrip() {
  const open = SECURITY_OPEN_FINDINGS.length;
  return (
    <section id="security" className="scroll-mt-28 bg-transparent">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Trust & safety</p>
          <h2 className="mt-1.5 font-[family-name:var(--font-display)] text-[1.75rem] leading-none tracking-tight text-ink sm:text-[2.1rem]">
            Built to be checked
          </h2>
        </div>
        <Link href="/security" className="inline-flex items-center gap-1.5 text-sm text-ink-body hover:text-ink">
          Read the security report
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        {/* Audit status */}
        <div className="flex flex-col justify-between rounded-3xl border border-up/25 bg-up/[0.06] p-6">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-up/15 px-3 py-1 text-xs font-semibold text-up">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {open === 0 ? "No open security findings" : `${open} open finding${open === 1 ? "" : "s"}`}
            </span>
            <p className="mt-4 text-sm leading-6 text-ink-body">
              {SECURITY_AUDIT_META.remediatedCount} improvements shipped in the latest review.
              Risk level: <span className="text-ink">{SECURITY_AUDIT_META.overallRisk}</span>.
            </p>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="uppercase tracking-[0.12em] text-ink-subtle">Last reviewed</dt>
              <dd className="mt-1 text-ink">{SECURITY_AUDIT_META.reportDate}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-[0.12em] text-ink-subtle">Full report</dt>
              <dd className="mt-1">
                <a
                  href={SECURITY_REPORT_DOWNLOAD.href}
                  download={SECURITY_REPORT_DOWNLOAD.filename}
                  className="inline-flex items-center gap-1 text-ink hover:text-gold"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Download .md
                </a>
              </dd>
            </div>
          </dl>
        </div>

        {/* Principles */}
        <ul className="grid gap-3 sm:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <li key={p.title} className="rounded-3xl border border-line bg-surface-1 p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-gold">
                <p.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-[15px] font-semibold text-ink">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-ink-muted">{p.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
