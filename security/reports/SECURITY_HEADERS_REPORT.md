# SECURITY_HEADERS Security Report

## Status: MEDIUM

## Findings

Live scan of https://www.gingernft.store (matches `src/middleware.ts`):

| Check | Result |
|-------|--------|
| CSP `default-src 'self'` | PASS |
| CSP `script-src` `'unsafe-inline'` + `'unsafe-eval'` | FAIL |
| CSP `object-src` missing | FAIL → **fixed in code** (`none`) |
| CSP `form-action` missing | FAIL → **fixed in code** (`'self'` + SlicePay) |
| CSP `frame-ancestors 'none'` | PASS |
| HSTS 63072000 includeSubDomains preload | PASS |
| X-Frame-Options DENY | PASS |
| X-Content-Type-Options nosniff | PASS |
| Referrer-Policy | PASS |
| Static `/_next/static` missing some headers | WARN → `next.config.ts` `headers()` added |

`script-src` still allows `'unsafe-inline'` and `'unsafe-eval'` because Next.js + wallet adapters historically need them. That is the remaining CSP gap vs vibe-check baseline.

HSTS `preload` is already on production. Only keep it if every subdomain is HTTPS.

## What's at risk

XSS is not contained by CSP if an injection exists. Plugin/`form-action` gaps are addressed locally pending deploy.

## What's already secure

HSTS, framing, nosniff, referrer, Permissions-Policy.

## Recommendations

1. Deploy middleware + next.config changes.
2. Later: nonce CSP as `Content-Security-Policy-Report-Only`, then drop `unsafe-eval`.
