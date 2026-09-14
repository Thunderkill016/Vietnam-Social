# Task 001 — First Real Signal Vertical Slice

The original sequencing required the seven-day evidence gate in [prd-v0.1.md](prd-v0.1.md). On 2026-09-14 the owner explicitly authorized implementation and requested local Supabase preparation. Development may proceed; the evidence gate remains unmeasured and public rollout is not authorized.

## Objective

Prove one end-to-end behavior:

> An authorized host publishes an expiring ACTIVITY Signal at a public venue; another user sees it in a map viewport, opens it, joins/confirms it, receives a realtime update, and no longer sees it after expiry.

## Before coding

1. Inspect the repository and existing instructions.
2. Produce a concrete implementation plan and list assumptions.
3. Do not silently expand scope.
4. If this is a new repository, initialize only the foundation needed for this slice.

## Technology decisions

- Next.js 16
- TypeScript strict mode
- MapLibre GL JS
- Supabase Auth
- PostgreSQL + PostGIS
- Supabase Realtime Broadcast
- H3 only as a secondary index
- OpenFreeMap for development basemap, with provider configuration isolated

## Required implementation

### Foundation

- project setup, formatting, linting, typecheck, unit test, and E2E test commands
- environment schema validation with safe example values
- feature-oriented modular structure
- CI running deterministic non-secret checks

### Database

- migrations enabling PostGIS
- minimal profiles/roles needed for the slice
- cities, places, signals, confirmations/attendance actions, reports, and audit-safe trust inputs
- geography point and GiST index
- active-window query indexes
- versioned confidence calculation
- expiry-safe viewport function/query
- RLS for anonymous read and authenticated mutations
- seed data for the approved pilot cluster
- generated TypeScript database types

### Product

- full-screen map plus accessible list fallback
- viewport query, bounded and paginated/capped
- Signal marker and detail surface
- host create form for ACTIVITY only
- `join`, `confirm`, and `not_there`, each idempotent
- shareable route
- coarse analytics events without raw GPS
- realtime update with authoritative re-fetch
- expired Signal disappearance without relying solely on a cron job

## Not in scope

- additional Signal types
- user-to-user chat
- friends/follows
- background location
- payment
- recommendations
- full HCMC data ingestion
- elaborate animation/design system
- microservices or new infrastructure categories

## Acceptance scenarios

1. Anonymous visitor can query and view active public Signals but cannot mutate.
2. Authenticated non-host cannot publish unless policy grants the role.
3. Host can create a valid venue-anchored Signal.
4. Invalid lifetime, out-of-pilot location, or forbidden precise-person location is rejected.
5. A second session sees the Signal inside the matching viewport.
6. Join/confirm is idempotent and cannot be self-confirmed by the author.
7. Realtime update changes safe display state without leaking private fields.
8. `not_there` changes confidence according to the versioned rule.
9. Expired Signal is absent from viewport/list/detail active views even if the expiry worker has not run.
10. RLS tests prove cross-user writes and private moderation reads are denied.
11. Keyboard and screen-reader users can reach the same Signal details and actions through the list fallback.
12. The production build completes with no secret embedded in the client bundle.

## Required verification

Run and report exact results for:

- install
- format check
- lint
- typecheck
- unit tests
- database reset/migration
- database/RLS tests
- relevant E2E tests with two isolated sessions
- production build

Do not mark PASS for commands that were skipped or unavailable. Report blockers separately.

## Completion report

- architecture and product assumptions used
- exact files changed
- migrations created
- commands executed with PASS/FAIL
- screenshots or test artifacts for the core two-session flow
- privacy/security checks
- unresolved risks
- one recommended next task only

## Implementation record — 2026-09-14

The active development objective is a locally runnable first slice, with a read-only demo for environments without Supabase. Reuse Next.js, Supabase Auth/RPC/Broadcast, PostGIS, MapLibre, H3, Radix Dialog and Playwright rather than replacing their infrastructure.

Measurable engineering exit: anonymous read isolation, host-only venue publication, idempotent cross-session participation, independent confirmation, authoritative realtime refresh, and expiry without a worker. SQL regression cases and the two-session browser test encode these behaviors. A passing demo suite alone does not establish this exit.

Current local environment has Node.js but no Docker/Podman. The Supabase startup check therefore cannot pass on this machine yet. SQL and live-flow checks are also defined in a disposable CI stack. Refer to command output/CI for executed results rather than treating test files as proof.

Implemented scope includes the app shell, map/list, filters/search, authentication forms, venue-only publication, participation/verification/reporting, owner resolution, moderator report queue/removal, local seed configuration, private audit inputs and share metadata. Browser location is optional and ephemeral.

Still outside the completed acceptance claim: measured pilot supply/demand, calibrated confidence, full conversion analytics, account deletion/retention operations, and a public production deployment. Generated database types are produced from a running local stack and retained as a CI artifact; runtime RPC projections are validated at the application boundary.
