# PAYMENT_WEBHOOKS Fix Plan

## Changes

- `src/lib/verify-payment.ts` — recency + transfer instruction
- `src/app/api/slicepay/webhook/route.ts` — `secretsEqual`

## Verification goals

- [x] Old SOL tx (age > 20 min) is rejected
- [x] Non-transfer balance change is rejected
- [x] Duplicate signature consume fails
- [x] Missing webhook secret in production → 401
- [ ] Payer bound to signature (open)

## Manual verification (for the human)

1. Pay a small SOL mint on **devnet**; confirm success.
2. Replay the same signature — rejected.
3. Replay a funding tx to the platform wallet — rejected.
