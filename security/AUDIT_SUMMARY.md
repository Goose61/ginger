# Security Audit Summary

Date: 2026-09-21

Source: [benavlabs/vibe-check](https://github.com/benavlabs/vibe-check) (`vibe-check-main` in this workspace).

Live scan (read-only GET/HEAD/OPTIONS):

| Target | Result |
|--------|--------|
| https://gingernft.store → https://www.gingernft.store | 4 FAIL, 2 WARN, 15 PASS |
| https://www.thecrust.io | 4 FAIL, 1 WARN, 14 PASS (marketing site; same CSP gaps) |

Sensitive files (`.env`, `.git`, dumps) are **not** served on production. No public source maps. CORS is not wildcard. Debug/API-docs endpoints are not exposed.

`gitleaks` and `semgrep` are **not installed**. `npm audit --omit=dev` reported **2 critical / 23 high** (mostly transitive: Next.js Windows RCE, protobufjs via Trezor, sharp/libvips, bigint-buffer).

## Results

| # | Category | Status | Report | Plan |
|---|----------|--------|--------|------|
| 1 | SECRETS_EXPOSURE | HIGH | [report](reports/SECRETS_EXPOSURE_REPORT.md) | [plan](plans/SECRETS_EXPOSURE_PLAN.md) |
| 2 | DATABASE_ACCESS | MEDIUM | [report](reports/DATABASE_ACCESS_REPORT.md) | [plan](plans/DATABASE_ACCESS_PLAN.md) |
| 3 | AUTH_MIDDLEWARE | HIGH | [report](reports/AUTH_MIDDLEWARE_REPORT.md) | [plan](plans/AUTH_MIDDLEWARE_PLAN.md) |
| 4 | ACCESS_CONTROL | HIGH | [report](reports/ACCESS_CONTROL_REPORT.md) | [plan](plans/ACCESS_CONTROL_PLAN.md) |
| 5 | FRONTEND_SECRETS | PASS | [report](reports/FRONTEND_SECRETS_REPORT.md) | — |
| 6 | SSRF | MEDIUM | [report](reports/SSRF_REPORT.md) | [plan](plans/SSRF_PLAN.md) |
| 7 | CSRF | PASS | [report](reports/CSRF_REPORT.md) | — |
| 8 | SECURITY_HEADERS | MEDIUM | [report](reports/SECURITY_HEADERS_REPORT.md) | [plan](plans/SECURITY_HEADERS_PLAN.md) |
| 9 | CORS | PASS | [report](reports/CORS_REPORT.md) | — |
| 10 | RATE_LIMITING | MEDIUM | [report](reports/RATE_LIMITING_REPORT.md) | [plan](plans/RATE_LIMITING_PLAN.md) |
| 11 | SQL_INJECTION | PASS | [report](reports/SQL_INJECTION_REPORT.md) | — |
| 12 | XSS | PASS | [report](reports/XSS_REPORT.md) | — |
| 13 | PAYMENT_WEBHOOKS | HIGH | [report](reports/PAYMENT_WEBHOOKS_REPORT.md) | [plan](plans/PAYMENT_WEBHOOKS_PLAN.md) |
| 14 | FILE_UPLOADS | MEDIUM | [report](reports/FILE_UPLOADS_REPORT.md) | [plan](plans/FILE_UPLOADS_PLAN.md) |
| 15 | ERROR_HANDLING | MEDIUM | [report](reports/ERROR_HANDLING_REPORT.md) | [plan](plans/ERROR_HANDLING_PLAN.md) |
| 16 | PASSWORD_HASHING | N/A | [report](reports/PASSWORD_HASHING_REPORT.md) | — |
| 17 | DEPENDENCIES | HIGH | [report](reports/DEPENDENCIES_REPORT.md) | [plan](plans/DEPENDENCIES_PLAN.md) |

## Critical issues

Nothing in this pass is an unauthenticated “read all user data from Supabase” style leak. The issues that can move **real SOL / NFTs** if left unfixed:

1. **Rotate `ARWEAVE_SOLANA_KEY` and the MongoDB password now.** They live in local `.env.local` (gitignored). The previous audit already flagged the platform key as having been visible in plaintext. Do not reuse that key in production.
2. **SOL payment proofs used to accept any historical inbound transfer** to the platform wallet (balance delta only). Code now requires a recent System Program transfer to the platform address. **Redeploy before taking mainnet SOL mints.**
3. **Unauthenticated `execute_buyback` / `distribute_holder_rewards`** could spend platform SOL. Creator wallet auth is now required. **Redeploy.**
4. **Draft collections were enumerable** via `GET /api/collections?view=nav` and readable by UUID. Draft GET now 404s unless the creator is signed in; nav only returns live/sold-out. **Redeploy.**

Gift mint/cosign and SlicePay webhook shared-secret quality still need follow-up (see plans).

## Fixes applied in this audit (local; unverified until deployed)

- CSP: `object-src 'none'`, `form-action 'self' https://pay.slicechain.io`
- `poweredByHeader: false` and host-level security headers in `next.config.ts`
- Timing-safe compares for SlicePay webhook and blob purge secrets
- Rate-limit IP uses Vercel-trusted headers
- Image-thumb rejects redirects off the allowlist
- Solana RPC proxy: rate limit + 256 KB body cap
- SlicePay `redirectUrl` allowlisted to app origins
- Live collections can no longer have `tokens` / `status` / fee ledger overwritten via generic POST
- `AGENTS.md` copied into the app root for future AI edits

## Remaining manual verification

See [manual-checklist.md](../../../vibe-check-main/manual-checklist.md). Highest priority:

1. Rotate platform wallet + MongoDB credentials; confirm Vercel env matches.
2. Confirm `ALLOWED_ORIGINS` and `SLICEPAY_WEBHOOK_SECRET` are set on Vercel.
3. After deploy: `python3 vibe-check-main/skills/vibe-check/scripts/check.py https://www.gingernft.store`
4. As creator A, confirm you cannot GET creator B’s draft by ID.
5. Replay an old SOL transfer signature against mint — must 402.
6. Two-wallet IDOR test on mint / secondary / gift.
7. `npm audit` and decide which high/critical transitives to upgrade (sharp, next, wallet-adapter-trezor).
