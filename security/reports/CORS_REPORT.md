# CORS Security Report

## Status: PASS

## Findings

`src/middleware.ts`:

- Production with empty `ALLOWED_ORIGINS` does **not** echo Origin.
- Production with allowlist only reflects listed origins (else first allowlist entry — not the request origin).
- Methods: `GET, POST, PATCH, OPTIONS` (DELETE is used for drafts; browsers may preflight DELETE without it on the allow list). Worth adding `DELETE`.
- Live scan: foreign origin not allowed on page or static asset.

`.env.example` documents `https://gingernft.store,https://www.gingernft.store`.

## What's at risk

If `ALLOWED_ORIGINS` is unset in a misconfigured production deploy, CORS origin is omitted (fail closed). Local dev reflects any origin — expected.

DELETE preflight might fail from a browser on another allowlisted origin; same-origin Next.js fetches are unaffected.

## What's already secure

No `Access-Control-Allow-Origin: *`. Credentials are not paired with a wildcard.

## Recommendations

Add `DELETE` to `Access-Control-Allow-Methods` if you ever call delete cross-origin.
