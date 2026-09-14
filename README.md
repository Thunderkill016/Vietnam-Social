# Vietnam Social

A map-first local activity app for one question: **What can I join or go to nearby in the next few hours?**

The current foundation covers **Ho Chi Minh City** with an operational boundary enforced by PostGIS, expanding from the initial 3-district pilot slice. A **Signal** is an expiring activity record anchored to an approved public venue, not a person's live location.

## Environment modes

Vietnam Social supports four operating modes configured via environment variables (validated at runtime in `src/lib/env.ts`):

1. **Demo (`demo`)**: Read-only preview with explicitly labeled sample activities. Active when no Supabase credentials are configured. All mutations fail closed (HTTP 503).
2. **Local (`local`)**: Runs against a local disposable Supabase instance (`127.0.0.1` / `localhost`) via Docker.
3. **Staging (`staging`)**: Pre-production environment running against a hosted Supabase project over HTTPS.
4. **Production (`production`)**: Live environment running against hosted Supabase. Requires HTTPS, rejects localhost, forbids service-role/secret keys in client bundles, and enforces city operational boundaries.

## Run the local preview (Demo mode)

Requires Node.js 22+ (CI uses Node 24).

```bash
npm ci
npm run dev
```

Open **http://127.0.0.1:3000**. Without Supabase configuration, the app displays explicitly labeled, read-only sample activities. Names and venues are fictional; joining, confirming and publishing cannot create fake successes.

The interface includes search, category filters, a MapLibre map, an accessible list, detail dialogs, shareable `/s/[id]` routes and mobile layouts. Location is optional, requested only on a button press, held in browser memory and never sent to the application backend or analytics. Basemap requests go directly to the configured tile provider.

## Run with Supabase locally

Install Docker (or compatible Podman) and start its daemon first. The Supabase CLI is already a dev dependency; no hosted project is needed.

```bash
npm run db:start
node scripts/local-test-env.mjs
npm run dev
```

The helper writes only the local URL and public anon key to the ignored `.env.local`. Restart Next.js after changing environment variables. Inspect the local services using `npx supabase status`; Studio is normally at **http://127.0.0.1:54323**.

Local seed data contains fictional test venues in HCMC and no activity inventory, users or endorsements. Register an account through the app. New accounts always have the `member` role. An operator can explicitly grant host access in the local Studio SQL editor:

```sql
update app_private.profiles
set role = 'host', display_name = 'Host thử nghiệm'
where id = (select id from auth.users where email = 'YOUR_LOCAL_TEST_EMAIL');
```

Use `moderator` only for an operator who needs the report queue and removal capability. Never put a service-role/secret key in a `NEXT_PUBLIC_*` variable.

## Run with Hosted Supabase (Staging / Production)

For hosted deployments, manage forward-only migrations via the Supabase CLI without resetting the database:

```bash
# 1. Authenticate with Supabase
npx supabase login

# 2. Link your project
npx supabase link --project-ref <YOUR_PROJECT_REF>

# 3. Inspect pending forward migrations
npx supabase migration list

# 4. Apply migrations non-destructively
npx supabase db push
```

See the [Task 002 Deployment & Operations Runbook](002-hcmc-production-foundation.md) for full deployment details and rollback strategies.

## Verification

```bash
npm run quality       # format, lint, strict typecheck, unit/API tests, production build
npm run test:db       # real local PostGIS/RLS/RPC tests; requires Supabase running
npx playwright install chromium
npm run test:e2e      # browser tests; demo suite without Supabase configuration
npm run db:types     # generate public database types from the running local database
```

`.github/workflows/quality.yml` separates app/demo checks from a disposable local Supabase job. The latter runs real SQL tests and a two-session authenticated browser flow (publish → join → confirm → broadcast → expire), using test identities and a localhost-only database guard. It uploads browser evidence and generated database types.

For a fresh **disposable** local test database, `npm run db:reset` destroys its local contents and replays migrations/seeds. Do not run it on local data you need to keep, and never run it against hosted staging/production databases.

Production builds do not require Supabase secrets. The app has a web manifest; offline mutation queues and service-worker caching of live activities are intentionally absent.

## Implementation boundaries

- Next.js 16 + strict TypeScript; Supabase Auth and database RPCs; PostGIS is the geo authority.
- Client roles, coordinates, author identity and confidence are never accepted as publishing authority.
- Only approved public venues are supported. Venues must be within the active city's operational boundary.
- All application tables have RLS. Private profiles, actions and audit events are not exposed through the API schema.
- Discovery is bounded to 100 results and six hours ahead. Expired, resolved, removed or disabled-venue activities are filtered by the database on every read and write.
- Realtime broadcasts contain only an activity ID on a coarse H3 channel. Clients re-fetch after broadcasts/reconnects and every 15 seconds while visible. No client broadcast can establish truth.
- Join/verification/report retries are idempotent. One verification per user can be corrected; users cannot vote both ways or confirm their own activity.
- Privacy-preserving analytics: 12 strongly typed event contracts enforce zero raw GPS coordinates (`latitude`, `longitude`, `coords`) in telemetry.
- Structured observability: automatic redaction of secrets, tokens, credentials, and coordinates.
- Honest empty-area UX: no artificial mock activities when an area has zero live Signals.

## Product documents

1. [Competitive brief](competitive-brief.md)
2. [Product principles](product-principles.md)
3. [PRD and real-user validation gates](prd-v0.1.md)
4. [Architecture](ARCHITECTURE.md)
5. [First vertical slice and verification status](001-first-vertical-slice.md)
6. [Task 002 — HCMC Production Foundation](002-hcmc-production-foundation.md)
7. [Agent instructions](AGENTS.md)

On 2026-09-14 the owner authorized the HCMC Production Foundation (Task 002). The codebase technically supports all of Ho Chi Minh City, but the seven-day supply validation and four-week pilot gates remain **unmeasured**, not passed. No city-wide user adoption is claimed.
