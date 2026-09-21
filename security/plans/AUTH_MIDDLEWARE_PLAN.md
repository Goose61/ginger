# AUTH_MIDDLEWARE Fix Plan

## Changes

- `src/app/api/gift/route.ts`, `gift/mint`, `gift/prepare-sign`, `gift/cosign` — require wallet auth matching `payer`.
- `src/app/gift/page.tsx`, `src/components/WalletProvider.tsx` — send `buildAuthHeaders`.
- Optional: nonce table for signatures.

## Verification goals

- [x] Creator collection writes return 401 without a valid signature
- [x] Buyback/holder-crank routes return 401 without creator auth
- [ ] Unauthenticated `POST /api/gift` returns 401
- [ ] Replayed signature after TTL returns 401

## Manual verification (for the human)

1. Copy a creator request from DevTools, strip headers, replay — 401.
2. Sign in as wallet B, try to PATCH wallet A’s draft — 401.
