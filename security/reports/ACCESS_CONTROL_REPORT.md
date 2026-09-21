# ACCESS_CONTROL Security Report

## Status: HIGH

## Findings

IDOR-style issues found and (mostly) fixed in this pass:

1. **`GET /api/collections?view=nav`** returned every draft plus `creatorWallet`. Used by `CreatorDashboardLink` only to find *live* creator collections. **Now filters to live/sold_out.**
2. **`GET /api/collections/[id]`** returned full drafts (layers, tokens, pending mint minus asset secret) to anyone with the UUID. Collection HTML pages already `notFound()` drafts. **GET now 404s drafts/importing unless the creator signature matches.** Import polling was updated to send auth headers.
3. **Generic `POST /api/collections`** merged client `status`, `feeLedger`, and `tokens`. A creator could rewrite live token owners. **Status/ledger/pending fields are stripped; live/sold_out token arrays cannot be replaced.**
4. **`execute_buyback` / `distribute_holder_rewards`** spent platform SOL with no caller check. **Creator auth required.**
5. Mint allowlist still trusts `body.payer` (self-reported). Payment is verified, but the allowlist check is not bound to a wallet signature — anyone who pays can name a listed wallet as payer to bypass allowlist while sending the NFT to `recipient`.

Allowlist bypass: pay the mint price, set `payer` to an allowlisted address you do not control, set `recipient` to yourself.

## What's at risk

Unpublished art theft (mitigated), treasury crank abuse (mitigated), allowlist bypass via paid impersonation of `payer`.

## What's already secure

- `assertCreatorAuth` on creator writes.
- Secondary list/unlist checks `token.owner === auth.wallet`.
- `toPublicCollection` strips asset secrets.
- Collection pages hide drafts.

## Recommendations

1. Bind mint `payer` to a wallet signature, or drop allowlist matching against an unsigned field.
2. Confirm gift bundle appends cannot overwrite another collection id (gift routes use client `collectionId`).
