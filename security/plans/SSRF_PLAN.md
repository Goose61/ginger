# SSRF Fix Plan

## Changes

- `src/app/api/image-thumb/route.ts` — validate `upstream.url` after follow
- `src/app/api/solana-proxy/route.ts` — rate limit + body cap
- `src/app/api/slicepay/invoice/route.ts` — redirect allowlist

## Verification goals

- [x] Thumb `u=http://127.0.0.1` → 400
- [x] Thumb off-allowlist host → 400
- [x] Solana proxy oversized body → 413
- [ ] Manual: allowlisted host that 302s to 169.254.169.254 → 400

## Manual verification (for the human)

Confirm image thumbs still load Irys/Arweave/Blob URLs on Market after deploy.
