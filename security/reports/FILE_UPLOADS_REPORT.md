# FILE_UPLOADS Security Report

## Status: MEDIUM

## Findings

- Logo: 10 MB cap, magic bytes PNG/JPEG/WEBP (`src/app/api/collections/[id]/logo/route.ts`), creator auth.
- ZIP import: 500 MB, wallet auth, Blob content-type ZIP, random suffix (`blob/upload`).
- Gift images: client uploads to Arweave; server checks URI prefix `http` or `/api/`.
- Assets routes block `..` and resolve under `STAGING_DIR`.
- Logo may fall back to **inline `data:` URL in Mongo** if Irys is down and file ≤ 2.5 MB — large documents / XSS-via-data if ever rendered unsafely (currently used as `src`).

Magic bytes on ZIP contents (per-image) should be verified during import; layer parse trusts PNG-in-folder layout.

## What's at risk

Huge ZIP CPU (mitigated by auth + rate limit). Data-URI logos bloat Mongo.

## What's already secure

Creator auth on uploads; path traversal guards; Blob size limit; ZIP host allowlist.

## Recommendations

Validate image magic bytes inside ZIP import. Avoid storing data-URI logos in production.
