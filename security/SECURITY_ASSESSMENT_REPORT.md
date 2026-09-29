# Ginger Security Assessment Report

**Assessment type:** Level A (structured self-assessment) + Level B (automated tooling + manual code review)  
**Product:** Ginger NFT marketplace — https://www.gingernft.store  
**Repository:** `github.com/Goose61/ginger`  
**Commit assessed:** `974734c` (main)  
**Report date:** 29 September 2026  
**Assessor:** Ginger engineering (internal — not an independent third-party audit)

---

## Disclaimer

This document is an **internal security assessment** intended for transparency with users and partners. It is **not** a substitute for an independent penetration test or smart-contract audit. Ginger makes no “certified safe” or “fully audited” claims. Residual risks are listed below.

For vulnerability reports, contact the team via the in-app feedback button or `slicepay@slicechain.io`.

---

## Executive summary

Ginger is a Next.js marketplace on Vercel that mints **Metaplex Core** NFTs on Solana, accepts **SOL** and **SlicePay** payments, and stores collection state in **MongoDB Atlas**. Platform operations use a server-side platform wallet (`ARWEAVE_SOLANA_KEY`) for co-signing mints and treasury flows.

**Overall residual risk:** **Medium** (appropriate for public beta with real mainnet mints when env secrets and deploy checklist are followed).

| Area | Rating | Notes |
|------|--------|-------|
| Payment & mint fulfillment | **Low–Medium** | SlicePay invoices bound to collection/token/payer; SOL replay fixed; webhook re-verified |
| Access control & IDOR | **Low–Medium** | Draft leakage and treasury cranks fixed; allowlist still trusts unsigned `payer` field |
| Secrets & configuration | **Medium** | Keys server-only; rotation recommended if ever exposed; MongoDB URI is crown-jewel |
| Web/API hardening | **Low** | CSP, CORS, rate limits, SSRF allowlists, timing-safe webhook compare |
| Dependencies | **Medium** | 0 critical / 9 high in `npm audit --omit=dev` (mostly transitive Solana stack) |
| On-chain model | **Low–Medium** | Metaplex Core with immutable metadata default; no compressed NFT (cNFT) path |

**No unauthenticated mass data exfiltration path** was identified in this pass. Issues that could move **SOL or NFTs** were triaged and **fixed or mitigated** before this report where noted.

---

## Scope

### In scope

- Application source in `Crypgo/web` (Next.js 15 App Router)
- Production deployment at `https://www.gingernft.store`
- API routes: collections, mint, secondary, SlicePay, assets, feedback, proxies
- Authentication model (wallet signature / creator auth)
- Payment verification (SOL + SlicePay)
- Security headers, middleware, rate limiting
- Dependency audit (`npm audit`)
- Git-tracked secrets scan (manual + `.gitignore` review)
- Prior live HTTP probe (vibe-check, September 2026)

### Out of scope

- SlicePay core API / hosted widget internals (integration surface only)
- User wallet software (Phantom, MetaMask, etc.)
- Solana validator / RPC provider security
- MongoDB Atlas physical infrastructure
- Formal smart-contract audit (Metaplex Core is standard; custom economics are app-layer)
- Compressed NFTs (Bubblegum) — not implemented

---

## Methodology (Level A + B)

| Method | Tool / process | Purpose |
|--------|----------------|---------|
| Structured checklist | vibe-check AI checklist + `security/reports/*` | Domain coverage |
| Static review | Manual review of API routes, auth, payments | Logic flaws |
| Automated deps | `npm audit --omit=dev` | Known CVEs in production tree |
| Build verification | `next build`, TypeScript | Ship-blocking errors |
| Live probes | HEAD/GET production (headers, sensitive paths) | Config drift |
| Git hygiene | `git ls-files`, history spot-check | Leaked secrets |

**Not run in this pass:** gitleaks, semgrep, OWASP ZAP, third-party pentest.

---

## Architecture & trust boundaries

```
Collector/Creator wallet
        │
        ▼
  Ginger web (Vercel)
        ├── MongoDB (collections, invoices, feedback)
        ├── Platform wallet (co-sign mints, treasury ops)
        ├── Arweave/Irys (permanent metadata — creator/minter paid)
        └── SlicePay hosted checkout (card/USDC)
                │
                ▼
           Solana mainnet/devnet (Metaplex Core assets)
```

**High-value secrets:** `MONGODB_URI`, `ARWEAVE_SOLANA_KEY`, `SLICEPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`.

---

## Findings register

| ID | Severity | Domain | Finding | Status |
|----|----------|--------|---------|--------|
| PAY-01 | Critical | SOL payments | Historical balance-delta accepted as mint payment (replay) | **Fixed** — transfer + recency check |
| PAY-02 | High | SlicePay | Invoice not bound to collection/token/payer | **Fixed** — `32a7095` |
| PAY-03 | High | SlicePay webhook | Trusted webhook body without API re-verify | **Fixed** — `confirmInvoicePaidFromSlicePay` |
| PAY-04 | Medium | SlicePay status | Public status leaked invoice metadata | **Fixed** — minimal response + rate limit |
| AC-01 | High | Access control | Unauthenticated buyback / holder reward spend | **Fixed** — creator auth required |
| AC-02 | High | IDOR | Draft collections readable by UUID | **Fixed** — 404 unless creator |
| AC-03 | High | IDOR | Nav API listed all drafts | **Fixed** — live/sold_out only |
| AC-04 | Medium | Allowlist | Unsigned `payer` field can bypass allowlist | **Open** — bind to wallet signature |
| SEC-01 | High | Secrets | Platform key in local env (rotation if exposed) | **Operational** — not in git |
| SEC-02 | Medium | MongoDB | Atlas `0.0.0.0/0` network access | **Accepted** — standard for Vercel |
| WEB-01 | Medium | Headers | CSP gaps, `X-Powered-By` | **Fixed** |
| WEB-02 | Medium | SSRF | Image thumb followed off-allowlist redirects | **Fixed** |
| WEB-03 | Medium | Rate limit | Spoofable `X-Forwarded-For` | **Fixed** — Vercel-trusted IP |
| DEP-01 | Medium | Dependencies | Transitive highs in Solana/wallet stack | **Open** — monitor upgrades |
| CHN-01 | Info | On-chain | Metaplex Core only; no cNFT support | **By design** |

Detailed per-domain notes remain in [`security/reports/`](reports/) and remediation plans in [`security/plans/`](plans/).

---

## Controls verified

- **No secrets in client bundle** — sensitive env vars are server-only
- **No SQL** — MongoDB structured queries; no string-built queries
- **CSRF** — JSON APIs + wallet auth; no session cookies on public pages
- **CORS** — not wildcard; `ALLOWED_ORIGINS` on production
- **File uploads** — magic-byte validation, size caps on logos
- **Demo mint path** — disabled when SlicePay merchant configured
- **Immutable metadata** — default on Core mints (`b49a584`)
- **Production webhook** — fails closed without `SLICEPAY_WEBHOOK_SECRET`

---

## Dependency snapshot (29 Sep 2026)

Command: `npm audit --omit=dev`

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High | 9 |
| Moderate | 28 |
| Low | 14 |

Most highs trace to **`bigint-buffer`** / Solana transitive chain. Next.js upgraded to **15.5.26**. Unused `@solana/wallet-adapter-wallets` removed.

---

## Pre-mainnet checklist (operators)

1. Confirm `ALLOWED_ORIGINS`, `SLICEPAY_WEBHOOK_SECRET`, and `MONGODB_URI` on Vercel
2. Rotate `ARWEAVE_SOLANA_KEY` if it was ever pasted in chat, docs, or git
3. Verify Resend domain + `RESEND_API_KEY` for feedback email
4. Re-run live header scan after deploy
5. Two-wallet IDOR test on mint / secondary / gift flows
6. Replay old SOL tx against mint — must reject (402)

---

## Residual risks & roadmap

1. **Allowlist payer binding** — recommend wallet-signed payer before allowlist check
2. **Independent pentest** — scheduled when moving beyond public beta
3. **Dependency churn** — ongoing `npm audit` review
4. **Platform wallet** — operational SOL; compromise affects co-sign + treasury
5. **Beta status** — features and economics still evolving; use at own risk

---

## Document history

| Date | Commit | Change |
|------|--------|--------|
| 2026-09-21 | — | Initial vibe-check audit (`AUDIT_SUMMARY.md`) |
| 2026-09-28 | `32a7095` | SlicePay fulfillment hardening |
| 2026-09-29 | `974734c` | Consolidated public assessment (this report) |

---

*Public summary:* https://www.gingernft.store/security
