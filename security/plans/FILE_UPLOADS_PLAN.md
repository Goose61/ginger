# FILE_UPLOADS Fix Plan

## Changes

None required for a launch blocker. Follow-up: magic-byte check in `import-images-job`.

## Verification goals

- [x] Logo `.exe` renamed to `.png` → 400 (magic bytes)
- [x] Unauthenticated blob upload → 401
- [ ] ZIP inner file magic bytes (open)

## Manual verification (for the human)

Upload a 15 MB logo — 413. Upload a real PNG — 200.
