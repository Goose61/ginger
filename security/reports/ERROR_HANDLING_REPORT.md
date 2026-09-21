# ERROR_HANDLING Security Report

## Status: MEDIUM

## Findings

Live scan: error pages on gingernft.store **do not leak internals**; `/docs`, `/redoc`, `/openapi.json`, actuator, etc. **absent**. `X-Powered-By: Next.js` was present — **`poweredByHeader: false` added**.

Many routes still return `err.message` to the client (`String(err)` on solana-proxy, image-thumb, irys-gateway, gift cosign). Those can leak RPC/library strings.

No global `error.tsx` API wrapper that forces `{ error: "Something went wrong" }`.

Seed route is production-403.

## What's at risk

Attackers learn stack-specific messages (RPC URLs, Mongo text) to refine exploits.

## What's already secure

No framework debug UI on production. Seed disabled in production.

## Recommendations

Map unknown errors to a generic 500; log the real error server-side only.
