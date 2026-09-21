# RATE_LIMITING Fix Plan

## Changes

- `src/lib/request-ip.ts` + all previous `x-forwarded-for` split[0] call sites
- `src/app/api/solana-proxy/route.ts` — 120/min

## Verification goals

- [x] Spoofed `X-Forwarded-For` is not the first choice on Vercel
- [x] Solana proxy returns 429 after burst
- [ ] image-thumb / quotes limited (not done)

## Manual verification (for the human)

Burst 15 mint requests from one IP — 429. Confirm Phantom in-app browser still works through the proxy.
