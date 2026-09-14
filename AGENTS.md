# AGENTS.md

## Product

Vietnam Social is a **map-native Vietnamese social network**. Ho Chi Minh City is the first city and current technical foundation.

The product is broader than an activity finder. The map is the primary social discovery surface connecting five primitives:

- People
- Local Posts
- Communities
- Activities
- Places

Core product loop:

**Map → Discover → Connect → Participate → Contribute**

Read before changing product behavior:

- [PRODUCT.md](PRODUCT.md)
- [prd-v1.md](prd-v1.md) — canonical product scope
- [product-principles.md](product-principles.md)
- `ARCHITECTURE.md`
- [Privacy and location safety](prd-v1.md#13-privacy-and-location-safety)

`prd-v0.1.md` is historical documentation for the Activity-first phase. Do not treat its activity-only exclusions as the current product definition.

## Scope

Vietnam Social supports HCMC as the first city. Operations may concentrate acquisition in dense neighborhoods, but do not encode an operations cluster as a permanent district-only product boundary.

The existing `ACTIVITY` Signal system remains a first-class module. Do not delete or weaken its expiry, trust, moderation, or privacy guarantees merely because the broader social model now exists.

The next social vertical slice is:

`Create Local Post → discover on map → open → react/comment → profile → follow`

Do not add unrelated social breadth at the same time. Unless explicitly approved, defer:

- direct messages / group chat
- stories
- livestreaming / short-video feed
- marketplace / delivery
- payments / ads / creator monetization
- dating
- contact-book sync
- recommendation ML
- public live-person maps

## Architecture

Use a modular monolith.

- Frontend: Next.js 16 + strict TypeScript + MapLibre GL JS
- Backend: Supabase Auth + PostgreSQL + PostGIS + Realtime Broadcast
- Geo source of truth: PostGIS
- H3: secondary index for aggregation, approximation, and realtime partitioning
- Development basemap: OpenFreeMap; retain tile-provider portability

Target domain modules now include:

- `city`
- `map`
- `profiles`
- `posts`
- `social-graph`
- `communities`
- `signals/activities`
- `places`
- `trust`
- `moderation`
- `analytics`
- `notifications` when the product slice requires them

Do not introduce microservices, Kafka, Redis, Kubernetes, GraphQL, or event sourcing without demonstrated need and an ADR.

## Privacy and security

- Never expose a person's precise live GPS position.
- Never implement continuous location tracking as a social feature.
- Exact coordinates may identify an approved public place, not a private person or home.
- Person-originated content without a safe public place must use an appropriately coarse area.
- All exposed Supabase tables require RLS.
- Anonymous visitors may read content explicitly designed as public.
- Authentication is required for user-generated creation and mutations such as reactions, comments, follows, joins, confirmations, and reports.
- Users may mutate only their own content unless authorized for moderation.
- Analytics must not receive raw GPS coordinates.
- Roles, moderation state, author identity, location authority, and trust state are server/database owned.

## Domain invariants

### Social

- Every Local Post has an author and a safe geographic context: approved public place or coarse area.
- Local Posts are not required to expire by default.
- Reactions and follows must be idempotent per user/object.
- Users cannot follow themselves.
- Public profile data must never imply live presence at a precise map coordinate.
- Geographic relevance remains foundational; follower relationships must not turn the product into a follower-only feed.

### Activities

- Every Activity Signal has `starts_at` and `expires_at`.
- Every visible Activity Signal has a source and confidence state.
- Expired or resolved Activity Signals are excluded from active-map queries.
- Confirm and `not_there` actions must be idempotent per user.
- Server/database logic owns expiry and confidence; clients do not authoritatively compute them.

## Contribution and trust

Prefer open authenticated contribution with constrained distribution and progressive trust rather than requiring operator approval for every ordinary social action.

Safety controls belong server-side and may include:

- rate limits
- safe place/area constraints
- content validation
- moderation states
- quarantine
- abuse heuristics
- progressive trust

Verified Hosts remain a stronger organizer trust tier, not the definition of all social participation.

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

Documentation must distinguish clearly between **implemented features** and **target product direction**.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
