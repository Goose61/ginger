export const SECURITY_AUDIT_META = {
  reportDate: "29 September 2026",
  commit: "974734c",
  productionUrl: "https://www.gingernft.store",
  assessmentType: "Level A self-assessment + Level B automated review",
  overallRisk: "Medium (public beta)",
} as const;

export const SECURITY_DISCLAIMER =
  "This is an internal Ginger security assessment — not an independent third-party audit or certification. It documents controls, findings, and residual risk for transparency during public beta.";

export const SECURITY_EXECUTIVE_SUMMARY = [
  "Ginger mints Metaplex Core NFTs on Solana with SOL and SlicePay checkout. Collection state lives in MongoDB; a platform wallet co-signs on-chain operations.",
  "Critical payment and access-control issues identified in earlier reviews have been remediated, including SOL payment replay, SlicePay invoice binding, draft collection leakage, and unauthenticated treasury operations.",
  "Residual risk is medium: transitive dependency advisories, operational secret handling, and an open allowlist payer-binding improvement. No path to unauthenticated mass data theft was found in this pass.",
];

export type SecurityRating = {
  area: string;
  rating: string;
  note: string;
};

export const SECURITY_RATINGS: SecurityRating[] = [
  { area: "Payments & mint fulfillment", rating: "Low–Medium", note: "SlicePay + SOL hardened; invoices bound to buyer/token" },
  { area: "Access control", rating: "Low–Medium", note: "Draft IDOR fixed; allowlist payer signing still recommended" },
  { area: "Secrets & config", rating: "Medium", note: "Server-only keys; rotate if ever exposed" },
  { area: "Web hardening", rating: "Low", note: "CSP, CORS, rate limits, SSRF allowlists" },
  { area: "Dependencies", rating: "Medium", note: "0 critical / 9 high in npm audit (transitive)" },
  { area: "On-chain", rating: "Low–Medium", note: "Metaplex Core; immutable metadata default" },
];

export type SecurityFinding = {
  id: string;
  severity: "Critical" | "High" | "Medium" | "Info";
  domain: string;
  summary: string;
  status: "Fixed" | "Open" | "Operational" | "By design";
};

export const SECURITY_FINDINGS: SecurityFinding[] = [
  { id: "PAY-01", severity: "Critical", domain: "SOL payments", summary: "Historical transfers accepted as mint payment", status: "Fixed" },
  { id: "PAY-02", severity: "High", domain: "SlicePay", summary: "Invoice not bound to collection, token, or payer", status: "Fixed" },
  { id: "PAY-03", severity: "High", domain: "SlicePay webhook", summary: "Webhook body trusted without API re-verify", status: "Fixed" },
  { id: "AC-01", severity: "High", domain: "Treasury", summary: "Buyback / holder rewards callable without auth", status: "Fixed" },
  { id: "AC-02", severity: "High", domain: "IDOR", summary: "Draft collections readable by UUID", status: "Fixed" },
  { id: "AC-04", severity: "Medium", domain: "Allowlist", summary: "Unsigned payer field can bypass allowlist", status: "Open" },
  { id: "WEB-01", severity: "Medium", domain: "Headers", summary: "CSP gaps and X-Powered-By leakage", status: "Fixed" },
  { id: "WEB-02", severity: "Medium", domain: "SSRF", summary: "Image proxy followed off-allowlist redirects", status: "Fixed" },
  { id: "DEP-01", severity: "Medium", domain: "Dependencies", summary: "Transitive highs in Solana dependency tree", status: "Open" },
  { id: "CHN-01", severity: "Info", domain: "On-chain", summary: "Compressed NFTs (cNFTs) not supported", status: "By design" },
];

export const SECURITY_CONTROLS = [
  "Sensitive keys and MongoDB URI are server-only — never bundled to the browser",
  "Wallet signature auth for creator writes; secondary listings check token owner",
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
      "SOL mints require a recent on-chain transfer to the platform address with signature deduplication. SlicePay invoices are bound to collection, token, and payer wallet before mint; webhooks are re-verified against the SlicePay API. Demo/free mint shortcuts are disabled when real payments are configured.",
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
