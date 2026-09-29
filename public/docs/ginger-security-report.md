# Ginger NFT Marketplace — Security Report

**Version:** 1.0  
**Last updated:** 29 September 2026  
**Site:** https://www.gingernft.store  

This document describes the security measures built into Ginger for collectors, creators, and partners. It is intended for public review during our beta period.

---

## 1. Overview

Ginger is a Solana NFT marketplace for launching collections, primary mints, and secondary sales. Security is designed around three principles:

1. **You keep custody** — NFTs live in your wallet; Ginger never holds your private keys.
2. **Pay before mint** — Every paid mint is tied to verified payment and a specific token.
3. **Creators stay in control** — Only the creator wallet can change drafts, fees, allowlists, and treasury actions.

Ginger mints **Metaplex Core** assets on Solana. Art and metadata are published to permanent storage (Arweave via Irys) at go-live.

---

## 2. Wallet authentication

Ginger uses **wallet signatures**, not passwords.

| Feature | What it does |
|--------|----------------|
| **Connect to sign in** | You approve connections in Phantom, Solflare, Backpack, or MetaMask (Solana). |
| **Signed API requests** | Sensitive actions (mint, buy, creator dashboard) require a fresh wallet signature with a time-limited challenge. |
| **Payer binding** | The wallet that pays must be the wallet that signed the request — you cannot claim to be another address at checkout. |
| **Creator binding** | Collection edits, go-live, gifts, buyback, and holder rewards require the creator wallet signature. |

Allowlist checks use your **signed wallet address**, not a typed-in field, so early-access lists cannot be bypassed by impersonating another wallet.

---

## 3. Payment security

### SOL payments

- Mint price is quoted from a live SOL/USD rate at checkout.
- Payment must be a **recent on-chain SOL transfer** to Ginger’s payment address.
- The transfer must come **from your connected wallet** and meet the quoted amount (with small slippage tolerance).
- Each transaction signature can only be used **once** — replays are rejected.
- Transfers older than 20 minutes are rejected.

### Card / USDC (SlicePay)

- Checkout uses SlicePay’s hosted payment flow — card data never touches Ginger’s servers.
- Each invoice is created for a **specific collection, token ID, and buyer wallet**.
- Invoices **expire after 24 hours** and can only be **redeemed once** for mint.
- When SlicePay notifies Ginger of payment, we **re-check status with SlicePay’s API** before minting.
- Return URLs after checkout are restricted to Ginger’s own domains.

### Demo / free mint paths

- Test “demo” mint shortcuts are **disabled** whenever real payments are enabled in production.

---

## 4. Minting & NFT integrity

| Control | Detail |
|--------|--------|
| **Metaplex Core** | Standard Solana NFT program; assets can be grouped in a Core collection. |
| **Immutable metadata** | New mints default to immutable on-chain metadata — traits and URIs cannot be changed after mint. |
| **Token reservation** | Sold tokens are reserved atomically to prevent double-mints during checkout. |
| **On-chain co-signing** | When required, mint transactions are built server-side and you approve the final signature in your wallet. |
| **Gift mints** | Creators can gift unminted pieces; gifts require creator wallet authorization. |

Compressed NFTs (cNFTs) are **not** supported — Ginger uses full Core assets only.

---

## 5. Marketplace & access control

### Public vs draft collections

- Unpublished drafts are **not visible** on collection pages or the public market browse.
- Draft APIs return “not found” unless you are the signed-in creator.
- The market navigation only lists **live** or **sold-out** collections.

### Secondary sales

- Only the **token owner** can list or unlist on the secondary market (wallet signature required).
- Secondary purchases use the same SlicePay invoice binding and single-use redemption as primary mints.

### Collection data integrity

- Live collection token ownership and fee ledgers **cannot be overwritten** through generic save requests.
- Internal asset secrets are stripped before any public API response.

### Treasury actions (creators)

- Holder reward distribution and buyback execution require **creator wallet authentication**.

---

## 6. Web application protection

Ginger sends industry-standard security headers on every response:

- **Content-Security-Policy (CSP)** — Restricts scripts, frames, images, and connections to approved domains (Ginger, Solana RPC, Arweave/Irys, SlicePay, Jupiter, etc.).
- **X-Frame-Options: DENY** — Prevents clickjacking by embedding Ginger in other sites.
- **X-Content-Type-Options: nosniff** — Reduces MIME-type confusion attacks.
- **Strict-Transport-Security** — Forces HTTPS in browsers.
- **Referrer-Policy** — Limits referrer leakage on cross-origin requests.
- **Permissions-Policy** — Disables camera, microphone, and geolocation in the browser context.

### CORS

API cross-origin access is limited to **approved Ginger domains** in production — not open to arbitrary websites.

### Error handling

Production error pages do not expose stack traces or internal paths. Server technology fingerprints are minimized in HTTP headers.

---

## 7. Uploads & media

| Control | Detail |
|--------|--------|
| **Logo uploads** | Max 10 MB; file type verified by magic bytes (PNG, JPEG, WEBP only). |
| **Collection ZIP import** | Creator-authenticated; processed with size and type checks. |
| **Image proxy / thumbnails** | User-supplied URLs are allowlisted (Arweave, Irys, approved CDNs). Redirects to non-allowed hosts are blocked. |
| **Solana RPC proxy** | Rate-limited with request body size caps to prevent abuse. |

---

## 8. API abuse prevention

Rate limits protect high-impact endpoints (approximate limits per client):

| Endpoint area | Limit |
|---------------|-------|
| Mint | 10 requests / 15 min |
| Waitlist signup | 10 / hour |
| Creator gifts | 20 / 15 min |
| Feedback form | 8 / hour |
| SlicePay invoice creation | 20 / hour |
| Payment status checks | 120 / min |

Client IP detection uses trusted hosting headers to reduce spoofing via `X-Forwarded-For`.

---

## 9. Privacy & data

- Ginger **does not use password accounts** — identity is your public wallet address.
- **No wallet private keys** are collected or stored.
- Checkout email/contact fields (e.g. feedback form) are optional and used only for support replies.
- Sensitive configuration is kept **off the public website** — nothing in the browser bundle grants admin or payment authority.

---

## 10. Dependencies & maintenance

- Production dependencies are scanned with **`npm audit`** on each release cycle.
- As of September 2026: **0 critical** vulnerabilities in the production dependency tree; remaining advisories are mostly transitive packages in the Solana ecosystem and are monitored for upstream fixes.
- Next.js and core framework packages are kept on supported patch versions.

---

## 11. Security review summary (September 2026)

A structured review covered payments, access control, headers, uploads, and dependency health. **Nine issues** identified during beta were remediated, including:

- SOL payment replay protection  
- SlicePay invoice binding to buyer, token, and collection  
- SlicePay webhook verification hardening  
- Draft collection visibility fixes  
- Signed-wallet requirement for mint, buy, and allowlist  
- Content-Security-Policy and SSRF proxy hardening  

**No open security findings** remain on the public security page at the time of this report.

---

## 12. Responsible disclosure

If you believe you have found a security issue:

- Email **slicepay@slicechain.io** with steps to reproduce, or  
- Use the **feedback button** on gingernft.store  

Please allow reasonable time to investigate and patch before public disclosure. We appreciate responsible reports.

---

## 13. Beta notice

Ginger is in **public beta**. Features and economics may change. This report reflects controls in place at the date above; it is not a third-party certification or guarantee of zero risk. Use the marketplace with the same care you would on any on-chain product — verify transactions in your wallet before approving.

---

*© Ginger NFT Marketplace · https://www.gingernft.store/security*
