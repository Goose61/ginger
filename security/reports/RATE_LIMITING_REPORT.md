# RATE_LIMITING Security Report

## Status: MEDIUM

## Findings

MongoDB sliding window in `src/lib/rate-limit.ts`. Fails **closed** in production if DB is down.

Applied on: collections POST, mint, waitlist, creator-gift, gift POST/prepare/cosign, layers, invoices, generate, import.

**This audit:** rate-limit keys now prefer `x-vercel-forwarded-for` / `x-real-ip` (`src/lib/request-ip.ts`) instead of the first `X-Forwarded-For` hop (spoofable).

Still unscoped or weakly scoped:

- `POST /api/solana-proxy` now 120/min/IP (was unlimited)
- Gift confirm PATCH, confirm-mint, quotes, image-thumb, irys-gateway — no dedicated limiter
- Wallet auth / mint payer field can still be rotated to evade per-wallet mint limits (`mint:${payer}`)

## What's at risk

RPC proxy and image-thumb CPU (sharp) can still be expensive at scale.

## What's already secure

Write-heavy creator/upload/mint paths are limited. Production fail-closed.

## Recommendations

Add limits on `/api/image-thumb` and `/api/quotes`. Bind mint rate limits to IP **and** authenticated wallet.
