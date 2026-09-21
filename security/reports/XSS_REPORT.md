# XSS Security Report

## Status: PASS

## Findings

No `dangerouslySetInnerHTML`, `innerHTML`, or `eval(` in `src/`. React 19 escapes by default.

User-controlled strings (collection name, gift note, social URLs) render as text/href. Gift notes are sliced and passed through `sanitizeForPhantomMetadata` for on-chain metadata, not HTML.

CSP still has `'unsafe-inline'`/`'unsafe-eval'` (see SECURITY_HEADERS), so CSP is not a strong XSS backstop.

## What's at risk

A future raw HTML path would be unprotected by CSP script-src.

## What's already secure

React autoescape; no innerHTML usage found.

## Recommendations

If you add markdown/HTML in descriptions, sanitize with DOMPurify first.
