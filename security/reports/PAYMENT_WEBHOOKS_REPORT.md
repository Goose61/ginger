# PAYMENT_WEBHOOKS Security Report

## Status: HIGH

## Findings

Payments are **SlicePay + on-chain SOL**, not Stripe.

### SlicePay (`src/app/api/slicepay/webhook/route.ts`)

- Production requires `SLICEPAY_WEBHOOK_SECRET` and header `x-slicepay-secret` / `x-webhook-secret`.
- Comparison is now **timing-safe**.
- If the secret is unset in production, webhook returns 401 (fail closed).
- Event processing is not Stripe-like; it marks a stored invoice paid then mint consumes `redeemedAt`.
- `GET /api/slicepay/status/[invoiceId]` is unauthenticated and returns amount/order/collectionId for known invoices.

### SOL (`src/lib/verify-payment.ts`)

Previously accepted **any historical transaction** that increased the platform wallet’s balance by `minSol` (no transfer instruction check, no recency). That allowed replaying old inbound transfers as mint payment until `consumeSolSignature`.

**This audit:** require `blockTime` within 20 minutes and a System Program `transfer`/`transferWithSeed` to the platform address with enough lamports. Signatures are still consumed uniquely.

SOL verification still does not bind **sender** to `body.payer`.

### Demo path

`method: "demo"` is rejected when SlicePay is configured (`slicePayConfigured()` is true whenever merchant id is non-empty — always, via default merchant id).

## What's at risk

Before the SOL fix: free mints against historical deposits. After deploy: residual allowlist/`payer` spoof (ACCESS_CONTROL). Weak webhook secret if unset on Vercel until first deploy of fail-closed behavior (already fail-closed in prod).

## What's already secure

Invoice amount + order prefix checks; invoice redeem-once; SOL signature uniqueness index.

## Recommendations

1. Redeploy SOL verification before mainnet paid mints.
2. Set a long random `SLICEPAY_WEBHOOK_SECRET` in Vercel and the SlicePay dashboard.
3. Bind payer to a wallet signature.
