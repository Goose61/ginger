# ACCESS_CONTROL Fix Plan

## Changes

Already in this audit:

- `src/app/api/collections/route.ts` — nav filter; strip privileged POST fields; freeze live tokens
- `src/app/api/collections/[id]/route.ts` — draft GET auth; buyback/distribute auth
- `src/lib/upload-collection-zip.ts`, LaunchWizard — pass auth when polling imports

Still open:

- Mint allowlist: require wallet signature for `payer` on allowlisted drops

## Verification goals

- [x] Unauthenticated GET of a draft returns 404
- [x] Nav does not list drafts
- [x] Live POST cannot replace `tokens` or `status`
- [ ] Allowlisted mint rejects unsigned foreign `payer`

## Manual verification (for the human)

1. Create draft as wallet A; GET `/api/collections/{id}` logged out — 404.
2. Wallet B with A’s collection id, signed as B — 404/401.
3. Allowlist-only drop: pay as B while setting payer to A — should fail after the remaining fix.
