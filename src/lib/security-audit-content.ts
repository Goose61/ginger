export const SECURITY_REPORT_DOWNLOAD = {
  href: "/docs/ginger-security-report.md",
  filename: "ginger-security-report.md",
  label: "Download full security report (.md)",
} as const;

export const SECURITY_AUDIT_META = {
  reportDate: "29 September 2026",
  productionUrl: "https://www.gingernft.store",
  overallRisk: "Low to medium (public beta)",
  remediatedCount: 9,
} as const;

export const SECURITY_EXECUTIVE_SUMMARY = [
  "Ginger is a Solana NFT marketplace where you always custody assets in your own wallet. We never hold your private keys.",
  "Paid mints require verified SOL or SlicePay checkout tied to your wallet, the collection, and the exact token being purchased.",
  "Creators control drafts, allowlists, gifts, and treasury tools through wallet signatures. Unpublished work stays private.",
];

export type SecurityRating = {
  area: string;
  rating: string;
  note: string;
};

export const SECURITY_RATINGS: SecurityRating[] = [
  { area: "Payments & minting", rating: "Low", note: "Verified checkout; one invoice, one mint" },
  { area: "Wallet & access", rating: "Low", note: "Signed actions; private drafts" },
  { area: "Web protection", rating: "Low", note: "Security headers, CORS, rate limits" },
  { area: "Uploads & media", rating: "Low", note: "Type checks and safe image proxies" },
  { area: "NFT integrity", rating: "Low", note: "Metaplex Core with immutable metadata default" },
  { area: "Dependencies", rating: "Low to medium", note: "0 critical; monitored each release" },
];

export type SecurityFinding = {
  id: string;
  severity: "Critical" | "High" | "Medium" | "Info";
  domain: string;
  summary: string;
  status: "Fixed" | "Open" | "Monitored" | "By design";
};

export const SECURITY_REMEDIATED_FINDINGS: SecurityFinding[] = [
  { id: "PAY-01", severity: "Critical", domain: "SOL payments", summary: "Payment replay protection added", status: "Fixed" },
  { id: "PAY-02", severity: "High", domain: "SlicePay", summary: "Checkout bound to buyer, token, and collection", status: "Fixed" },
  { id: "PAY-03", severity: "High", domain: "SlicePay", summary: "Payment status double-checked before mint", status: "Fixed" },
  { id: "AC-01", severity: "High", domain: "Treasury", summary: "Creator-only holder rewards and buyback", status: "Fixed" },
  { id: "AC-02", severity: "High", domain: "Privacy", summary: "Draft collections hidden from public", status: "Fixed" },
  { id: "AC-04", severity: "Medium", domain: "Allowlist", summary: "Signed wallet required at mint", status: "Fixed" },
  { id: "WEB-01", severity: "Medium", domain: "Headers", summary: "Content security policy hardened", status: "Fixed" },
  { id: "WEB-02", severity: "Medium", domain: "Media proxy", summary: "Safe URL allowlist for thumbnails", status: "Fixed" },
  { id: "PAY-04", severity: "Medium", domain: "Checkout", summary: "Minimal public payment status responses", status: "Fixed" },
];

export const SECURITY_MONITORED_ITEMS = [
  {
    title: "Dependency updates",
    detail:
      "We track npm security advisories on each release. Remaining items are mostly in upstream Solana libraries with no known exploit path in Ginger.",
  },
  {
    title: "Beta evolution",
    detail:
      "Ginger is in public beta. New features ship with the same wallet-first and pay-before-mint rules described in the full report.",
  },
];

export const SECURITY_OPEN_FINDINGS: SecurityFinding[] = [];

export const SECURITY_CONTROLS = [
  "Your wallet private keys never leave your wallet app",
  "Signed wallet required to mint, buy, and pass allowlists",
  "SlicePay and SOL payments verified before any NFT is issued",
  "Single-use payment proofs so the same checkout cannot mint twice",
  "Unpublished collections hidden until the creator goes live",
  "Only token owners can list on the secondary market",
  "Creator-only gifts, rewards, and buyback actions",
  "Rate limits on mint, checkout, feedback, and API proxies",
  "Upload type validation and size limits on creator assets",
  "Immutable Metaplex Core metadata on new mints by default",
];

export const SECURITY_DEP_SNAPSHOT = {
  critical: 0,
  high: 9,
  moderate: 28,
  low: 14,
  date: "29 September 2026",
  note: "High-severity npm items are transitive Solana stack packages under active monitoring.",
};

export const SECURITY_FAQ_ITEMS = [
  {
    question: "Has Ginger been security audited?",
    answer:
      "We publish a full security report on the Security page covering payments, wallet auth, and marketplace controls. Ginger is in public beta. Review the report and use standard wallet care before large purchases.",
  },
  {
    question: "How does Ginger protect payments?",
    answer:
      "SOL mints require a recent transfer from your connected wallet, verified on-chain once. Card and USDC checkout uses SlicePay with invoices tied to your wallet, the collection, and the token. Each payment can only mint once.",
  },
  {
    question: "Who holds my NFTs?",
    answer:
      "You do. NFTs are sent to the wallet you connect. Ginger never asks for or stores wallet private keys.",
  },
  {
    question: "What should I do if I find a vulnerability?",
    answer:
      "Use the feedback button on the site or email slicepay@slicechain.io with reproduction steps. Please do not publicly disclose exploitable issues before we have time to patch.",
  },
];
