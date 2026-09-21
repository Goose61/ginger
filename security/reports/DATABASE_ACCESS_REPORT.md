# DATABASE_ACCESS Security Report

## Status: MEDIUM

## Findings

This app uses **MongoDB Atlas**, not Supabase/Firebase RLS.

- Connection is server-side only via `MONGODB_URI` (`src/lib/db.ts`). There is no anon key in the frontend.
- Collections: `collections`, `rate_limits`, `invoices`, `spent_sol_signatures`. Unique indexes on `id` / invoice ids.
- There is no Mongo equivalent of RLS. **Every API that can reach Atlas can read/write whatever the driver user is allowed.** Authorization is entirely in route handlers.
- `.env.example` still documents Atlas Network Access `0.0.0.0/0`, which is common for Vercel but means a leaked URI is enough.

## What's at risk

A leaked `MONGODB_URI` is full database takeover (collections, invoices, rate-limit docs).

## What's already secure

- No public database SDK in the browser.
- Queries use document fields (`id`, `slug`), not concatenated query strings.

## Recommendations

1. Atlas user with least privilege on database `crypgo` only.
2. Restrict Network Access if you can pin Vercel egress; otherwise treat URI as crown-jewel secret.
3. Keep application auth on every write (see ACCESS_CONTROL).
