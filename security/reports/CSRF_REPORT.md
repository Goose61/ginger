# CSRF Security Report

## Status: PASS

## Findings

- Auth is custom headers (`X-Wallet` / `X-Signature` / `X-Timestamp`), not cookies. Browsers do not attach those on a cross-site form POST.
- Live scan: **no cookies** on the landing page (https://www.gingernft.store).
- Middleware CORS does not allow foreign origins in production when `ALLOWED_ORIGINS` is set.
- No GET handler in gift/mint that spends funds. `GET /api/collections/[id]` may persist reveal triggers for **live** collections (time-based reveal). That is a state change on GET, but it only advances public reveal policy, not balances.

## What's at risk

Low. Reveal-on-GET can be triggered by prefetch; acceptable for this product.

## What's already secure

Header-based auth is CSRF-resistant. CORS allowlist is explicit.

## Recommendations

Keep using signed headers for mutating routes. Do not add cookie sessions without CSRF tokens.
