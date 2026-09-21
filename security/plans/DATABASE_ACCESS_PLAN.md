# DATABASE_ACCESS Fix Plan

## Changes

- Human: Atlas user scoped to `crypgo`, strong password, URI only in Vercel.

## Verification goals

- [x] No client-side database credentials
- [ ] Atlas user cannot access other clusters/databases
- [ ] URI rotated if it ever left the machine

## Manual verification (for the human)

1. Atlas → Database Access: confirm one app user, `readWrite` on `crypgo` only.
2. Atlas → Network Access: review `0.0.0.0/0`.
