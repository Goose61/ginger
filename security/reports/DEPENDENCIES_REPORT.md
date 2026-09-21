# DEPENDENCIES Security Report

## Status: HIGH

## Findings

- Lockfile `package-lock.json` is committed.
- Versions in `package.json` use `^` / `~` (not exact pins).
- `npm audit --omit=dev`: **2 critical, 23 high, 77 moderate, 31 low** (133 total).

Notable:

| Package | Severity | Notes |
|---------|----------|--------|
| `next` 15.5.23 | critical | Windows-hosted unauthenticated RCE (this app is Linux/Vercel — lower practical risk, still patch) |
| `protobufjs` | critical | Transitive via Trezor (`@solana/wallet-adapter-wallets`) |
| `sharp` | high | libvips CVEs in 2026 advisories |
| `bigint-buffer` | high | Overflow in `@solana/buffer-layout-utils` chain |
| `ws`, `lodash`, `image-size`, `postcss` | high | Transitive |

No obvious slopsquatting (packages exist on npm with real publishers: Next, Metaplex, Solana, Irys).

`gitleaks` / `semgrep` not installed.

## What's at risk

Supply-chain and known CVEs, especially if you ever build on Windows or pull Trezor adapter code into the client bundle.

## What's already secure

Lockfile committed; mainstream registries.

## Recommendations

1. `npm audit fix` / bump `next` and `sharp` when compatible.
2. Drop `@solana/wallet-adapter-wallets` meta-package if you only need Phantom/Solflare/MetaMask (avoids Trezor/protobufjs).
3. Pin production versions without `^` when you freeze a release.
