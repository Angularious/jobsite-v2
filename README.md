# jobsite-v2

A public, no-login demo that surfaces the **people behind any job** — recruiters
and people in similar roles at the hiring company, with optional contact info and
alumni from your school. **Powered by [Orthogonal](https://orthogonal.com).**

Two entry points:

- **Role-first search (`/jobs`)** — type a role (+ optional location / type /
  remote / recency) and get live postings. Hit **Find people** on any listing.
- **URL paste (`/`)** — paste any job or careers URL (LinkedIn, Greenhouse, Lever,
  Workday, BambooHR, Gem, a company careers page…) and get the same people +
  recruiters, then optionally pull contact info or find alumni.

All external data is fetched live through the Orthogonal API; **no provider data
is ever cached or persisted** (see `CLAUDE.md`).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · deployed on Vercel.
Optional Supabase (free tier) backs the cross-instance spend cap + rate limiter.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

### Environment variables

See `.env.example` for the full list. The essentials:

| Variable | Required | Purpose |
| --- | --- | --- |
| `ORTHOGONAL_API_KEY` | ✅ | Auth for all external data. **Server-side only** — never `NEXT_PUBLIC_`. |
| `REQUEST_TOKEN_SECRET` | ✅ | Random 32+ char secret signing the CSRF/timing tokens. |
| `NEXT_PUBLIC_APP_URL` | ✅ (prod) | Public origin, used for same-origin checks. |
| `DAILY_SPEND_CAP_USD` | – | Hard daily ceiling across all visitors (default 40). |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | – | Enable the shared cross-instance cap + rate limiter. Unset → in-memory per-instance counters. |

If using Supabase, run `supabase/migrations/0001_jobsitev2_spend_and_rate_limit.sql`
in the SQL editor first, then set the two env vars.

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build (also typechecks)
npm run start    # serve the production build
npm run lint     # eslint
npx tsc --noEmit # typecheck only (safe while `next dev` is running)
```

## Abuse protection

Every money-spending route runs a shared guard (`lib/security/guard.ts`):
same-origin + content-type check → obvious-bot UA filter → CSRF request-token →
honeypot → minimum form timing → **atomic global daily spend cap** (503) →
**per-visitor per-step rate limit** (429). No CAPTCHA.

## Layout

- `app/` — pages (`/`, `/jobs`) + API routes (`search`, `jobs/search`, `enrich`,
  `alumni`, `init`).
- `lib/` — `orthogonal.ts` (the one API wrapper), `domains.ts` (shared host/company
  helpers), `jobResolver.ts`, `jobs/searchJobs.ts`, `people.ts`, `security/`.
- `supabase/migrations/` — the spend-cap + rate-limit schema.

See **`CLAUDE.md`** for the full architecture, cost model, and conventions.
