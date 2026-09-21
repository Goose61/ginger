# DEPENDENCIES Fix Plan

## Changes

Human-operated upgrades (do not blindly `audit fix` on a live mint stack).

Suggested order:

1. `next` patch within 15.5.x
2. `sharp` current
3. Replace `wallet-adapter-wallets` with explicit Phantom/Solflare/MetaMask adapters only

## Verification goals

- [x] Lockfile committed
- [ ] `npm audit --omit=dev` has 0 critical
- [ ] App still builds and Phantom connects

## Manual verification (for the human)

After upgrades: `npm run build` and a devnet gift mint.
