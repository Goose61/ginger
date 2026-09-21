# SECURITY_HEADERS Fix Plan

## Changes

- `src/middleware.ts` — `object-src 'none'`; `form-action 'self' https://pay.slicechain.io`
- `next.config.ts` — `poweredByHeader: false`; HSTS/XFO/nosniff/referrer on `/:path*`

## Verification goals

- [x] Code sets object-src and form-action
- [ ] Live scan after deploy: those two FAILs gone
- [ ] App still loads (wallet connect, SlicePay iframe, Dexscreener)

## Manual verification (for the human)

```
python3 vibe-check-main/skills/vibe-check/scripts/check.py https://www.gingernft.store --only headers
```

Do not add HSTS preload for new domains without HTTPS on every subdomain.
