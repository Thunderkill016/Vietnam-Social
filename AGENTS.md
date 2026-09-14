# AGENTS.md

## Product

Vietnam Social is a map-first, real-time local activity product for Ho Chi Minh City.

Core question: **What can I join or go to around me in the next few hours?**

Read before changing product behavior:

- [prd-v0.1.md](prd-v0.1.md)
- [product-principles.md](product-principles.md)
- `ARCHITECTURE.md`
- [Privacy and safety](prd-v0.1.md#12-privacy-and-safety)

## Scope

The pilot is one compact HCMC cluster, not the whole city.

The first public Signal type is `ACTIVITY`. Do not add FOOD, marketplace, friend tracking, chat, followers, stories, livestreaming, or a generic feed without a new product decision.

## Architecture

Use a modular monolith.

- Frontend: Next.js 16 + strict TypeScript + MapLibre GL JS
- Backend: Supabase Auth + PostgreSQL + PostGIS + Realtime Broadcast
- Geo source of truth: PostGIS
- H3: secondary index for aggregation, approximation, and realtime partitioning
- Development basemap: OpenFreeMap; retain tile-provider portability

Do not introduce microservices, Kafka, Redis, Kubernetes, GraphQL, or event sourcing without demonstrated need and an ADR.

## Privacy and security

- Never expose a person's precise live GPS position.
- Never implement continuous location tracking in the MVP.
- Exact coordinates may identify a public venue; a person's non-place Signal must expose only an approximate public location.
- All exposed Supabase tables require RLS.
- Anonymous visitors may read active public Signals.
- Authentication is required to create, confirm, reject, report, comment, or join.
- Users may mutate only their own content unless authorized for moderation.

## Domain invariants

- Every Signal has `starts_at` and `expires_at`.
- Every visible Signal has a source and confidence state.
- Expired or resolved Signals are excluded from active-map queries.
- Confirm and `not_there` actions must be idempotent per user.
- Server/database logic owns expiry and confidence; clients do not authoritatively compute them.

## Quality gate

Before claiming completion, actually run all relevant commands:

- format check
- lint
- typecheck
- unit tests
- database tests
- relevant end-to-end tests
- production build

Never claim PASS without command output. Schema changes require migrations. Keep business logic single-sourced and changes small enough to review.
