# Vietnam Social

**Vietnam Social is a map-native Vietnamese social network.**

The map is the primary social discovery surface connecting five primitives:

- **People**
- **Local Posts**
- **Communities**
- **Activities**
- **Places**

The product is designed to answer broader local-social questions than an activity finder alone:

> What is happening here? What are people talking about? Which communities exist here? What can I join? Which places matter socially?

The long-term ambition is to become **the social layer of the map of Vietnam**, starting with Ho Chi Minh City.

See [PRODUCT.md](PRODUCT.md) and the canonical [PRD v1](prd-v1.md) before making product-scope decisions.

## Current implementation status

The repository currently implements the **Activities** primitive most deeply. The existing Activity system is not being discarded; it becomes one module of the broader social network.

Today the shipped foundation includes:

- HCMC map-first discovery
- approved public places
- expiring Activity Signals
- join/go/confirm/not-there actions
- trust and moderation controls
- shareable Activity routes
- host onboarding and venue authorization
- activity templates and operator supply tools
- privacy-preserving analytics

Planned but **not yet shipped as complete social modules**:

- Local Posts
- comments/reactions
- richer public social profiles
- person follow graph
- Communities
- richer social Place pages
- unified multi-entity map layers
- social notifications

The next social vertical slice defined by PRD v1 is:

`Create Local Post → discover on map → open → react/comment → profile → follow`

## Product principles

The umbrella loop is:

`Map → Discover → Connect → Participate → Contribute`

Important boundaries:

- map-first does **not** mean a public live-person map
- location is social context, not surveillance
- exact coordinates belong to approved public places, not private people or homes
- product coverage can support HCMC city-wide while operations concentrate on dense areas
- Activity Signals remain time-bounded; Local Posts and Communities have separate lifecycles
- demo/test data must never masquerade as real social activity

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

The current interface includes search, category filters, a MapLibre map, an accessible list, Activity detail dialogs, shareable `/s/[id]` routes and mobile layouts. Location is optional, requested only on a button press, held in browser memory and never sent to the application backend or analytics. Basemap requests go directly to the configured tile provider.

## Run with Supabase locally

Install Docker (or compatible Podman) and start its daemon first. The Supabase CLI is already a dev dependency; no hosted project is needed.

```bash
npm run db:start
node scripts/local-test-env.mjs
npm run dev
```

The helper writes only the local URL and public anon key to the ignored `.env.local`. Restart Next.js after changing environment variables. Inspect the local services using `npx supabase status`; Studio is normally at **http://127.0.0.1:54323**.

Local seed data contains fictional test venues in HCMC and no real social inventory, users or endorsements. Register an account through the app. New accounts currently have the `member` role. The existing Activity implementation still uses the Task 003 host authorization model until a separately reviewed migration changes that behavior.

Use `moderator` only for an operator who needs moderation and operational capabilities. Never put a service-role/secret key in a `NEXT_PUBLIC_*` variable.

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

See the [Task 002 Deployment & Operations Runbook](002-hcmc-production-foundation.md) for deployment details and rollback strategies.

## Verification

```bash
npm run quality       # format, lint, strict typecheck, unit/API tests, production build
npm run test:db       # real local PostGIS/RLS/RPC tests; requires Supabase running
npx playwright install chromium
npm run test:e2e      # browser tests; demo suite without Supabase configuration
npm run db:types      # generate public database types from the running local database
```

`.github/workflows/quality.yml` separates app/demo checks from a disposable local Supabase job. The database/live-flow job exercises the current Activity implementation with disposable test identities and a localhost-only database guard.

For a fresh **disposable** local test database, `npm run db:reset` destroys its local contents and replays migrations/seeds. Do not run it on data you need to keep, and never run it against hosted staging/production databases.

## Architecture boundaries

- Next.js 16 + strict TypeScript; Supabase Auth and database RPCs; PostGIS remains the geographic authority.
- The codebase remains a modular monolith.
- Target domain modules include city, map, profiles, posts, social graph, communities, activities/signals, places, trust, moderation, analytics, and notifications when required.
- Raw device GPS does not belong in analytics.
- No continuous public person tracking.
- All client-accessible tables require RLS and server-owned authorization.
- Realtime is an invalidation/update mechanism; PostgreSQL remains source of truth.
- H3 remains secondary to PostGIS for geographic truth.
- The existing Activity discovery window, expiry, confidence, moderation, and venue protections stay intact until explicitly revised.
- Future Local Posts must attach to a safe public place or appropriately coarse area; they must not expose a person's precise live position.

## Product documents

1. [Canonical product definition](PRODUCT.md)
2. [PRD v1 — map-native social network](prd-v1.md)
3. [Product principles](product-principles.md)
4. [Architecture](ARCHITECTURE.md)
5. [Competitive brief](competitive-brief.md)
6. [PRD v0.1 — historical Activity-first scope](prd-v0.1.md)
7. [First vertical slice and verification status](001-first-vertical-slice.md)
8. [Task 002 — HCMC Production Foundation](002-hcmc-production-foundation.md)
9. [Task 003 — HCMC Supply System & Real-World Evidence](003-hcmc-supply-system.md)
10. [Agent instructions](AGENTS.md)

## Product history

The first implementation phase deliberately proved an Activity loop:

`see → open → join/go → confirm → expire`

Task 003 then added host acquisition, onboarding, venue authorization, templates, operator tooling, and real-vs-test evidence separation.

Those systems remain useful. PRD v1 expands the product definition so Activity is now one social primitive inside a broader map-native network.

**Market validation for the broader social-network vision has not yet passed. Documentation must not claim otherwise.**
