export const SECURITY_AUDIT_META = {
  reportDate: "29 September 2026",
  commit: "974734c",
  productionUrl: "https://www.gingernft.store",
  assessmentType: "Level A self-assessment + Level B automated review",
  overallRisk: "Low–Medium (public beta)",
  remediatedCount: 9,
} as const;

export const SECURITY_DISCLAIMER =
  "Internal Ginger security assessment — not an independent third-party certification. We publish this for transparency during public beta.";

export const SECURITY_EXECUTIVE_SUMMARY = [
  "Ginger mints Metaplex Core NFTs on Solana with SOL and SlicePay. Collectors custody assets in their own wallets; platform secrets stay on the server.",
  "Nine payment, access-control, and web-hardening issues from our September review are remediated, including SOL replay protection, SlicePay invoice binding, draft IDOR fixes, and signed-wallet mint auth for allowlists.",
  "Dependency advisories are monitored continuously (0 critical in production deps). Residual beta risk is mainly operational — protect platform keys and keep Vercel env vars current.",
];

export type SecurityRating = {
  area: string;
  rating: string;
  note: string;
};

export const SECURITY_RATINGS: SecurityRating[] = [
  { area: "Payments & mint fulfillment", rating: "Low", note: "SlicePay + SOL verified; invoices bound to buyer and token" },
  { area: "Access control", rating: "Low", note: "Signed wallet on mint/buy; drafts and treasury cranks protected" },
  { area: "Secrets & config", rating: "Low–Medium", note: "Server-only keys; rotate if ever exposed" },
  { area: "Web hardening", rating: "Low", note: "CSP, CORS, rate limits, SSRF allowlists" },
  { area: "Dependencies", rating: "Low–Medium", note: "0 critical; transitive highs tracked via npm audit" },
  { area: "On-chain", rating: "Low", note: "Metaplex Core with immutable metadata default" },
];

export type SecurityFinding = {
  id: string;
  severity: "Critical" | "High" | "Medium" | "Info";
  domain: string;
  summary: string;
  status: "Fixed" | "Open" | "Monitored" | "By design";
};

/** Remediated during public beta — kept for changelog, not shown as open issues. */
export const SECURITY_REMEDIATED_FINDINGS: SecurityFinding[] = [
  { id: "PAY-01", severity: "Critical", domain: "SOL payments", summary: "Historical transfers accepted as mint payment", status: "Fixed" },
  { id: "PAY-02", severity: "High", domain: "SlicePay", summary: "Invoice not bound to collection, token, or payer", status: "Fixed" },
  { id: "PAY-03", severity: "High", domain: "SlicePay webhook", summary: "Webhook body trusted without API re-verify", status: "Fixed" },
  { id: "AC-01", severity: "High", domain: "Treasury", summary: "Buyback / holder rewards callable without auth", status: "Fixed" },
  { id: "AC-02", severity: "High", domain: "IDOR", summary: "Draft collections readable by UUID", status: "Fixed" },
  { id: "AC-04", severity: "Medium", domain: "Allowlist", summary: "Unsigned payer field could bypass allowlist", status: "Fixed" },
  { id: "WEB-01", severity: "Medium", domain: "Headers", summary: "CSP gaps and X-Powered-By leakage", status: "Fixed" },
  { id: "WEB-02", severity: "Medium", domain: "SSRF", summary: "Image proxy followed off-allowlist redirects", status: "Fixed" },
  { id: "PAY-04", severity: "Medium", domain: "SlicePay status", summary: "Public status endpoint leaked invoice metadata", status: "Fixed" },
];

/** Active items we track but do not treat as open vulnerabilities on this page. */
export const SECURITY_MONITORED_ITEMS = [
  {
    title: "Transitive npm advisories",
    detail:
      "Solana and wallet-adapter dependencies pull in known highs (e.g. bigint-buffer). No critical issues in production tree; we review npm audit on each release.",
  },
  {
    title: "Platform wallet operations",
    detail:
      "The co-signer wallet holds operational SOL for mints and treasury flows. Protect ARWEAVE_SOLANA_KEY like any hot wallet secret.",
  },
];

export const SECURITY_OPEN_FINDINGS: SecurityFinding[] = [];

export const SECURITY_CONTROLS = [
  "Sensitive keys and MongoDB URI are server-only — never bundled to the browser",
  "Wallet signature required on mint and secondary buy; payer must match signer",
  "Allowlist checks the signed payer wallet, not a self-reported address",
  "SlicePay invoices expire; single-use redemption with fulfillment matching",
  "Rate limiting on feedback, proxies, and sensitive API routes",
  "Logo uploads validated by magic bytes with size caps",
  "Production SlicePay webhooks fail closed without a shared secret",
  "Default immutable Metaplex Core metadata on new mints",
];

export const SECURITY_DEP_SNAPSHOT = {
  critical: 0,
  high: 9,
  moderate: 28,
  low: 14,
  command: "npm audit --omit=dev",
  date: "29 September 2026",
  note: "High-severity items are transitive Solana stack deps with no direct app exploit path identified.",
};

export const SECURITY_FAQ_ITEMS = [
  {
    question: "Has Ginger been security audited?",
    answer:
      "We publish an internal Level A + B security assessment on the Security page — structured self-review plus automated dependency scanning and manual code review. It is not an independent third-party certification. Treat Ginger as public beta and review the report before high-value launches.",
  },
  {
    question: "How does Ginger protect payments?",
    answer:
      "SOL mints require a recent on-chain transfer from the connected wallet with signature deduplication. SlicePay invoices are bound to collection, token, and payer wallet before mint; webhooks are re-verified against the SlicePay API. Demo/free mint shortcuts are disabled when real payments are configured.",
  },
  {
    question: "Who holds my NFT keys and platform secrets?",
    answer:
      "Collectors always custody NFTs in their own wallets. Ginger never stores wallet private keys. Platform secrets (MongoDB, co-signer key, webhook secrets) live only in server environment variables on Vercel — not in the public JavaScript bundle.",
  },
  {
    question: "What should I do if I find a vulnerability?",
    answer:
      "Use the feedback button on the site or email slicepay@slicechain.io with reproduction steps. Please do not publicly disclose exploitable issues before we have time to patch.",
  },
];
