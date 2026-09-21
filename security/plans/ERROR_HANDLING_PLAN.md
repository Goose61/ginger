# ERROR_HANDLING Fix Plan

## Changes

- `next.config.ts` — `poweredByHeader: false`

Follow-up: wrap API `catch` blocks with a shared `publicError()`.

## Verification goals

- [x] Live scan: no debug endpoints
- [x] poweredByHeader disabled in config
- [ ] After deploy, no `X-Powered-By`
- [ ] Generic messages on 500s

## Manual verification (for the human)

`curl -sI https://www.gingernft.store | grep -i powered`
