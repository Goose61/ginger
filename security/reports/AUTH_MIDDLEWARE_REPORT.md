# AUTH_MIDDLEWARE Security Report

## Status: HIGH

## Findings

Auth is **wallet message signatures** (`X-Wallet`, `X-Signature`, `X-Timestamp`), not cookies (`src/lib/wallet-auth.ts`). Max age is 2 hours. There is no single-use nonce, so a captured header set can be replayed until expiry.

### Route inventory (36 API routes)

**Creator-signed (auth before mutate):**  
`POST /api/collections`, `DELETE /api/collections/[id]`, allowlist/reveal/set_buyback/creator_gift, logo, uris, import-draft, import-tokens, layers/parse, generate/preview, blob/upload, import/images, arweave-upload, core-collection prepare/cosign, storage-estimate.

**Owner-signed:** `list_secondary`, `unlist_secondary`, `claim_fees`.

**Payment-gated (no wallet sig, invoice/SOL proof):** `mint`, `buy_secondary`.

**Shared secret:** `POST /api/slicepay/webhook`, `POST /api/blob/purge-uploads`.

**Intentionally public:** network, quotes, featured-art, gift/config, gift/estimate, gift/balance-check, slicepay invoice/status, irys-gateway, image-thumb, assets, waitlist, fee_status, GET live collections.

**Still unsigned (state-changing):**

| Route | Risk |
|-------|------|
| `POST /api/gift` | Anyone can append a gift token and start a platform-cosigned mint for a self-reported payer |
| `POST /api/gift/mint`, `PATCH /api/gift` | Confirm/rebuild mint without proving wallet |
| `POST /api/gift/prepare-sign`, `/api/gift/cosign` | Cosign pipeline; tx is checked against stored pending mint, but caller is unauthenticated |
| `PATCH /api/collections/[id]/confirm-mint` | Confirms on-chain mint by signature; also retries buyback/distribution |
| `POST /api/solana-proxy` | Open JSON-RPC proxy (rate-limited this audit) |
| `POST /api/seed/doughboi` | Blocked when `NODE_ENV === production` |

This audit added creator auth to `execute_buyback` and `distribute_holder_rewards`.

`requireWalletAuth` throws; callers map that to HTTP 401. There is still no global middleware that runs **before** every handler.

## What's at risk

Replay of a 2-hour creator signature; unauthenticated gift mint spam; anyone triggering confirm-mint after a real chain tx.

## What's already secure

Creator mutations and secondary list/unlist require a valid signature matching the resource owner.

## Recommendations

1. Require `requireWalletAuth` on gift POST/mint/prepare/cosign with `auth.wallet === payer`.
2. Shorten auth TTL or store used timestamps (nonce) per wallet.
3. Keep seed route production-blocked.
