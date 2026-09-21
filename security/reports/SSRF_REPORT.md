# SSRF Security Report

## Status: MEDIUM

## Findings

1. **`GET /api/image-thumb?u=`** fetches user-supplied URLs. Host allowlist: Irys, Arweave, Vercel Blob, datasprite, or same-origin `/api/assets|irys-gateway|assets-blob`. This audit **rejects the final URL after redirects** if it leaves the allowlist.
2. **`GET /api/irys-gateway/[id]`** fetches `https://gateway.irys.xyz/{id}` with id charset `A-Za-z0-9_-` 20–64. Redirects are followed to the CDN (intentional).
3. **`POST /api/solana-proxy`** forwards the body to configured Solana RPC (not a user URL). Abuse risk is quota/DoS, not classic SSRF. Rate limit + 256 KB cap added.
4. ZIP import only downloads Blob URLs (`src/lib/import-zip-server.ts` `isBlobZipUrl`).
5. SlicePay invoice `redirectUrl` is now origin-allowlisted.

Private IP blocking / DNS pinning is not implemented on image-thumb; the host allowlist is the control.

## What's at risk

Redirect SSRF from an allowlisted host to an internal IP (mitigated if final URL is re-checked). Open RPC proxy can burn a paid RPC quota.

## What's already secure

No generic “fetch this URL” admin tool. Blob ZIP SSRF is host-restricted.

## Recommendations

1. Prefer `redirect: 'manual'` and a hop limit of 2.
2. If you use a paid RPC, put it only in server env and keep the proxy rate-limited.
