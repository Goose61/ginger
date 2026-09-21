# FRONTEND_SECRETS Security Report

## Status: PASS

## Findings

- Client env: `NEXT_PUBLIC_SOLANA_NETWORK`, `NEXT_PUBLIC_SOLANA_RPC_URL_*` — public RPC URLs.
- Live scan: **no public `.js.map`** on https://www.gingernft.store (15 scripts checked).
- `productionBrowserSourceMaps` is not enabled in `next.config.ts`.
- SlicePay API key and Irys/platform secrets are server-only.
- `/api/network` exposes the **platform public key** and treasury floor — intended.

## What's at risk

None identified for secret keys in the bundle.

## What's already secure

Sensitive calls (Mongo, Irys server upload, platform cosign, SlicePay API key) stay on the server.

## Recommendations

Keep `productionBrowserSourceMaps` off. Do not add paid RPC API keys to `NEXT_PUBLIC_*`.
