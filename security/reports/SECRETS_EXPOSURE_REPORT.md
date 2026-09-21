# SECRETS_EXPOSURE Security Report

## Status: HIGH

## Findings

- `.env.local` is gitignored (`/.env*` with `!.env.example`). `git ls-files .env` is empty. Production scan of `/.env`, `/.git/config`, dumps, and common backup paths on https://www.gingernft.store **passed**.
- `.env.example` uses placeholders except `SLICEPAY_MERCHANT_ID`, which the code treats as a **public** merchant id (`src/lib/slicepay-config.ts`).
- `NEXT_PUBLIC_*` vars are only cluster/RPC URLs, not secret keys.
- Wallet JSON files (`.devnet-wallet.json`, `.mainnet-smoke-wallet.json`, etc.) are gitignored and not tracked.
- `gitleaks` is not installed, so git **history** was not scanned with a dedicated secret hunter.
- Local `.env.local` still holds a live `ARWEAVE_SOLANA_KEY` and MongoDB URI. A prior audit (2026-08-20) already warned that this platform key had been visible in plaintext. **Rotate it** if that wallet ever held mainnet funds or was pasted into chat/screenshots.
- `toPublicCollection` strips `assetSecretKeyB64` and `collectionSecretKeyB64` before API responses (`src/lib/public-collection.ts`). Those keys must never be logged.

## What's at risk

Anyone with the platform secret can mint as update authority, cosign Core collections, run Jupiter buybacks, and pay creator/holder disbursements.

## What's already secure

- `.env*` gitignore, example file with placeholders, no public source maps, no `.env` served on the live host.
- Platform secret is read only in server modules (`src/lib/platform-key.ts`).

## Recommendations

1. Rotate `ARWEAVE_SOLANA_KEY` and MongoDB user password; update Vercel env.
2. Install `gitleaks` and run `gitleaks detect --source . --verbose` on `Crypgo/web`.
3. Keep test wallet JSON files untracked (already in `.gitignore`).
