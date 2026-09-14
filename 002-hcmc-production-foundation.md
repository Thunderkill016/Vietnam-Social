# Task 002 — Ho Chi Minh City Production Foundation

Status: implemented & verified; production foundation established; HCMC host supply and real-world adoption remain **unmeasured** and unvalidated.

## 1. Objective

Transition Vietnam Social from the initial 3-district pilot slice (Gò Vấp – Phú Nhuận – Tân Bình) into a **production-ready Ho Chi Minh City foundation**, without deviating from the product north star:

> Help a user answer: “What can I join or go to near me in the next few hours?”

An `ACTIVITY Signal` anchored to an approved public venue remains the only supported Signal type.

---

## 2. Geographic Strategy & Rollout Phases

The geographic expansion strategy is:

```text
Phase 1 — Ho Chi Minh City (Current focus)
Phase 2 — Hanoi (Deferred)
Phase 3 — Da Nang (Deferred)
Phase 4 — Selected additional Vietnamese cities (Deferred)
```

### Invariant: Expansion Depends on Evidence, Not Code

A new city launch is never triggered merely by writing software or populating a catalog. Launching Phase 2 (Hanoi) or beyond requires demonstrable proof of success in the preceding phase, measured against physical validation gates:

- **Host Supply Density:** At least 15 active hosts per pilot cluster publishing at least 2 verified activities weekly.
- **Active Signals Inventory:** Sufficient real-time density in targeted neighborhoods so users discover relevant activities within 1–5 km.
- **Conversion Rate:** Measurable `join` and `go` actions taken by unique users within 6 hours of publication.
- **Real-world Confirmation:** Independent attendee confirmations and low `not_there` dispute ratios.
- **Host Retention:** Repeated voluntary host scheduling across consecutive weeks without platform subsidies.
- **Repeat Organic Demand:** Voluntary weekly active users returning without promotional prompts.
- **Low Stale/False Rate:** Stale or abandoned Signal rate strictly below 5%.

**HCMC is not marked as validated yet.** The code is now technically capable of serving the whole HCMC operational boundary, but real supply operations will remain concentrated in density clusters.

---

## 3. Architecture & Domain Model

### City Domain Entity

The hard-coded pilot assumption has been refactored into a canonical `City` domain model supported by both PostgreSQL/PostGIS and application TypeScript schemas:

```text
City
 ├── id: string ('hcm')
 ├── slug: string ('ho-chi-minh')
 ├── name: string ('TP. Hồ Chí Minh')
 ├── country_code: string ('VN')
 ├── timezone: string ('Asia/Ho_Chi_Minh')
 ├── default_center: [106.675, 10.815]
 ├── default_zoom: 13
 ├── active: boolean (true)
 ├── launch_state: 'live' | 'pilot' | 'inactive'
 └── operational_boundary: geometry(Polygon, 4326)
```

- **PostGIS as Geo Authority:** Every approved venue and Signal must be verifiably inside the active city's `operational_boundary`.
- **H3 as Secondary Partition:** H3 parent resolution 6 is used solely for coarse realtime broadcast channels (`signals:hcm:<cell>`), never for geographic query authority.
- **Bounded Viewport Queries:** City-wide support does not fetch thousands of markers. Spatial queries are bounded (`east - west <= 0.25`, `north - south <= 0.25`, `limit 100`) to guarantee fast rendering and preserve mobile bandwidth.

---

## 4. Production Environment Architecture

The application defines four distinct environment operating modes in `src/lib/env.ts`:

1. **Demo (`demo`):**
   - Activated when no Supabase credentials are configured.
   - Provides read-only sample activities for visual evaluation.
   - Explicitly labeled with demo badges; all mutation attempts (`publish`, `join`, `confirm`, `report`) fail closed with HTTP 503.
2. **Local Supabase (`local`):**
   - Activated when `NEXT_PUBLIC_SUPABASE_URL` points to `localhost` or `127.0.0.1`.
   - Used for development and disposable integration tests.
3. **Staging (`staging`):**
   - Hosted Supabase environment for pre-production verification.
   - Requires HTTPS Supabase URL and valid public anon key.
4. **Production (`production`):**
   - Hosted Supabase environment serving real end users.
   - Strictly requires HTTPS for both Supabase API and vector basemap styles.
   - Prohibits localhost/127.0.0.1 endpoints.
   - Strictly prohibits `service_role` or secret keys in browser/public variables.
   - Fails fast on incomplete configuration.

---

## 5. Hosted Supabase Deployment & Migration Runbook

### Forward-only Migrations

Database migrations are strictly sequential and forward-only:

- `supabase/migrations/202609140001_first_slice.sql` — Initial schema, PostGIS extension, private tables, RPCs, RLS.
- `supabase/migrations/202609140002_hcmc_foundation.sql` — Extended city model, HCMC operational boundary, city-aware publishing validation.

### Applying Migrations to Hosted Supabase (Staging/Production)

1. Authenticate with Supabase CLI:
   ```bash
   npx supabase login
   ```
2. Link the repository to your hosted Supabase project:
   ```bash
   npx supabase link --project-ref <YOUR_PROJECT_REF>
   ```
3. Verify pending migrations:
   ```bash
   npx supabase migration list
   ```
4. Push migrations safely (non-destructive forward apply):
   ```bash
   npx supabase db push
   ```
   > [!CAUTION]
   > Never run `supabase db reset` against a hosted staging or production database. `db reset` destroys all tables and re-seeds from scratch, which is strictly for disposable local development.

### Rollback & Disaster Recovery Strategy

- Schema changes are designed forward-only. If an issue occurs, deploy a forward migration (`_fix` or `_revert`) rather than resetting the database.
- Hosted Supabase Point-in-Time Recovery (PITR) and daily automated WAL backups must be enabled before public launch.
- If a security incident occurs, revoke affected JWTs by rotating JWT secret keys in the Supabase dashboard without modifying database data.

---

## 6. Analytics Event Contract (Privacy-Preserving)

Implemented in `src/lib/analytics.ts` with replaceable adapters (`ConsoleAnalyticsAdapter`, `MemoryAnalyticsAdapter`, `NoopAnalyticsAdapter`).

**Strict Privacy Invariant:**
No raw device GPS coordinates (`latitude`, `longitude`, `coords`) are ever permitted in analytics payloads. Only `city_id` and coarse spatial context (e.g. `coarse_h3`, `area_name`) are accepted.

Defined event contracts:

- `map_opened`
- `area_selected`
- `signal_impression`
- `signal_opened`
- `join_clicked`
- `go_clicked`
- `share_clicked`
- `confirmation_submitted`
- `not_there_submitted`
- `signal_created`
- `signal_expired`
- `report_submitted`

---

## 7. Structured Observability

Implemented in `src/lib/logger.ts`:

- Structured logs with level, message, context, and timestamp.
- Development mode logs clear formatted output; production mode outputs single-line JSON.
- **Sensitive Data Redaction:** Automatically redacts `authorization`, `token`, `access_token`, `refresh_token`, `password`, `secret`, `key`, `service_role`, `cookie`, and any coordinate fields (`latitude`, `longitude`, `coords`) before output.

---

## 8. Honest Empty-Area UX

When a user pans to an area of HCMC with no active Signals:

- **No Content Fabrication:** The app never generates artificial mock activities to simulate fake density.
- **Clear Guidance:** Explains that Vietnam Social only displays real expiring activities in the next few hours.
- **Actionable Recovery:**
  - "Về trung tâm TP. Hồ Chí Minh" button smoothly returns the map camera to central HCMC.
  - Authorized hosts are presented with a "Tạo hoạt động mới" button to seed genuine local supply.

---

## 9. Verification & Quality Gates

Command status in local test environment:

```text
npm run format:check         PASS
npm run lint                 PASS
npm run typecheck            PASS
npm test                     PASS (42/42 tests across 4 test files)
npm run build                PASS (Next.js production build clean)
npx playwright test (demo)   PASS (6/6 tests passing)
npm run test:db              BLOCKED locally (Docker daemon unavailable on runner; executed in CI)
```
