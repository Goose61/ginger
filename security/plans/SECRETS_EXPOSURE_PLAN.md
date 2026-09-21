# SECRETS_EXPOSURE Fix Plan

## Changes

- Human: rotate `ARWEAVE_SOLANA_KEY` and MongoDB credentials in Vercel + `.env.local`.
- Optional: install gitleaks for history scans.

## New files

None.

## Verification goals

- [x] `git ls-files .env` returns nothing
- [x] No `NEXT_PUBLIC_*` secret keys
- [x] `.env.example` exists with placeholders (merchant id is documented as public)
- [x] `/.env` and `/.git/config` return 404/403 on https://www.gingernft.store
- [ ] gitleaks clean on git history
- [ ] Platform wallet rotated if it was ever exposed

## Manual verification (for the human)

1. Create a new Solana keypair; move any remaining SOL; set `ARWEAVE_SOLANA_KEY` only in Vercel/`.env.local`.
2. Rotate the Atlas user password and update `MONGODB_URI`.
3. Confirm Network Access on Atlas is not wider than you intend.
