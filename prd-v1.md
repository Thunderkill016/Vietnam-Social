# Vietnam Social PRD v1

Status: product direction approved for architecture and the next social vertical slice; market validation not yet passed.

Supersedes `prd-v0.1.md` as the canonical product scope. PRD v0.1 remains historical documentation for the Activity-first phase.

## 1. Product vision

Vietnam Social is a **map-native Vietnamese social network**.

The product helps people discover the social life of a place: people, public local content, communities, activities, and socially meaningful places.

The map is the primary interface, not an accessory to a conventional feed.

> **Vietnam Social aims to become the social layer of the map of Vietnam.**

The initial city is Ho Chi Minh City. Expansion to other Vietnamese cities remains evidence-gated.

## 2. Problem

Local social information is fragmented across Facebook groups, Zalo groups, community pages, event listings, venue pages, messaging groups, and word of mouth.

Traditional social networks answer questions such as:

- What are people I already follow posting?
- What content is globally or personally engaging?

Maps answer questions such as:

- What places exist here?
- How do I get there?

Neither model cleanly answers:

- What is happening in this area right now?
- What are people here talking about?
- Which communities exist here?
- What can I join nearby?
- Which places are socially active?
- Who contributes useful public knowledge about this area?

Vietnam Social combines geographic discovery with social participation without turning people into live location markers.

## 3. Target users

### 3.1 Local people and explorers

People who live, study, work, travel, or spend time in a Vietnamese city and want to understand the social context of a place.

Needs:

- discover nearby things worth doing
- understand what is happening in an area
- ask and answer local questions
- find communities and activities
- discover socially relevant places
- contribute useful information back to the map

### 3.2 Local contributors

People who share useful public context about a place or area.

Examples:

- questions
- photos
- observations
- practical alerts
- recommendations
- local updates
- answers to other people's local questions

Discovery must not require a large follower base. Geographic relevance can surface useful content.

### 3.3 Organizers and community leaders

People and groups who repeatedly organize real-world social activity.

Examples include sports clubs, running groups, student communities, photography groups, language exchanges, technology meetups, neighborhood groups, hobby clubs, and workshop organizers.

### 3.4 Local places and organizations

Public physical places with recurring social activity, such as cafes, sports venues, parks, universities, cultural spaces, and community venues.

## 4. Jobs to be done

### Local discovery

When I care about a place, help me understand what is happening there and what I can take part in.

### Local contribution

When I know something useful about a place, let me share it with people for whom that place is relevant without needing a large audience first.

### Social connection

When I find a useful person, community, activity, or place, help me form an ongoing relationship with it.

### Real-world participation

When online discovery points to something meaningful nearby, help me act on it in the physical world.

## 5. Three core differentiators

### 5.1 Map-first: the map is the social feed

Traditional social discovery commonly begins with a global or follower-driven feed.

Vietnam Social begins with geography:

`place or area → relevant social objects → interaction/action`

Moving around the map should change what social context is visible.

The ranking principle is:

> **Location relevance can matter more than follower count.**

This does not permit public live-person tracking.

### 5.2 Hyperlocal: social content belongs somewhere

Vietnam Social favors content that has meaningful real-world context:

- public place
- coarse area
- time
- local community
- local audience

The goal is not maximum global virality. The goal is that opening an area of the map reveals useful social context for that area.

### 5.3 Social → real world

The product should optimize for meaningful local participation, not only views, likes, or time spent.

The umbrella loop is:

`Map → Discover → Connect → Participate → Contribute`

Examples:

- discover a running group → join a run
- see a workshop → attend it
- find a useful contributor → follow them
- ask a local question → receive a relevant answer
- discover a place → visit it
- attend an activity → contribute context back to the area

## 6. Social primitives

Vietnam Social has five first-class primitives.

### 6.1 People

Public social identity.

A profile may include:

- display name
- avatar
- bio
- interests
- public contribution history
- communities
- public social relationships
- trust/moderation state where appropriate

A profile must never expose a person's precise live location by default.

### 6.2 Local Posts

Social content attached to a public place or coarse area.

Initial post modes may include:

- question
- update/observation
- recommendation
- photo with context

A Local Post is not required to expire, unlike an Activity Signal, but freshness and geographic relevance affect discovery.

Required conceptual fields:

- id
- author_id
- body
- optional media
- place_id or safe coarse area reference
- created_at
- updated_at
- visibility/moderation state
- reaction/comment counts subject to privacy and abuse controls

### 6.3 Communities

Persistent groups organized around an interest, locality, institution, or recurring social practice.

A Community may have:

- name
- description
- category
- public area relevance
- recurring public places
- membership state
- moderators
- Local Posts
- Activities

Community membership must not reveal member live locations.

### 6.4 Activities

Time-sensitive real-world participation objects.

The existing `ACTIVITY` Signal implementation remains valid and becomes the Activities module of the broader social network.

Activities retain:

- start time
- expiry
- public place anchor
- trust/confidence state
- join/go intent
- confirmation/not-there
- moderation
- shareable route

### 6.5 Places

Public physical anchors that can accumulate social context.

A Place may surface:

- Local Posts
- Activities
- Communities
- useful public place information

Vietnam Social should not attempt to replace a general-purpose place database. It adds a social layer to public places.

## 7. The Map

The map is the composition surface for all social primitives.

A map viewport may eventually contain multiple entity types, but visual overload must be controlled through filtering, zoom-dependent aggregation, and contextual ranking.

Conceptual map layers:

- Local Posts
- Activities
- Communities
- Places
- public profile/contributor context only where safe and useful

People themselves are not continuously tracked markers.

### 7.1 Area view

Selecting or zooming into an area should progressively answer:

1. What is happening here?
2. What are people discussing here?
3. What can I join here?
4. Which communities are active here?
5. Which places matter socially here?

## 8. Core product loops

### 8.1 Local content loop

`Map → discover Local Post → open → react/comment → author/profile → follow → later return`

### 8.2 Activity loop

`Map → discover Activity → open → join/go → attend → confirm → Activity expires`

### 8.3 Community loop

`Map/post/activity → discover Community → open → join/follow → see posts/activities → participate/contribute`

### 8.4 Contribution loop

`Observe something useful → create place/area-scoped contribution → local people discover it → interaction → contributor reputation/context improves`

## 9. First social vertical slice

The next implementation must prove that Vietnam Social can behave like a social network, not only an activity finder.

### Slice

`Authenticated user creates Local Post → Post appears in relevant map/list context → second user opens it → reacts/comments → opens author profile → follows author`

### Included

- authenticated Local Post creation
- attachment to an approved public place or safe coarse area
- map/list discovery
- Local Post detail
- one reaction model with idempotency
- comments/replies only to the minimum depth needed for the slice
- public profile page
- follow/unfollow person
- author contribution history
- report/moderation path
- privacy-preserving analytics
- mobile responsive UX

### Required safety

- server-side authorization
- RLS
- per-account publishing limits
- content length/type validation
- report rate limiting
- no raw device GPS in analytics
- no private-home precision exposure
- no anonymous content creation

### Explicitly not required in this slice

- DMs/chat
- stories
- livestream/video platform
- algorithmic infinite feed
- marketplace
- payments
- ads
- creator monetization
- recommendation ML
- public live-person map
- contact syncing
- full community implementation

## 10. Social graph

The first social graph edge is **person follows person**.

Requirements:

- follow/unfollow is idempotent
- users cannot follow themselves
- follower/following counts may be shown with abuse/privacy safeguards
- a follow does not grant private-location access
- map ranking must not become follower-only; geographic relevance remains foundational

Current graph edges include:

- person follows person
- user joins/leaves Community

Current graph edges also include:

- user follows approved public Place
- user follows catalog-recognized coarse Area

A future edge may include following a Community separately from membership. Membership, Place follow, Area follow, and person follow remain distinct and must never be silently inferred from one another or from device location.

## 11. Local Posts discovery

Local Posts should not become a conventional unbounded global feed.

Initial discovery inputs should remain understandable:

- map viewport / selected area
- place relevance
- freshness
- basic engagement quality
- moderation/trust state

Follower relationships may influence ranking later, but should not eliminate local discovery from people outside the user's existing graph.

## 12. Contribution and progressive trust

Vietnam Social should prefer **open contribution with constrained distribution and progressive trust** over a system where every ordinary contribution requires operator approval.

For authenticated member contributions:

- enforce rate limits
- restrict unsafe location precision
- apply content validation
- use server-owned moderation state
- quarantine suspicious content instead of silently trusting client state

Trust can expand privileges over time based on real behavior and moderation history.

Verified organizers/hosts remain a meaningful trust tier rather than the only class allowed to participate socially.

Activity publishing permissions can evolve toward this model separately; existing Task 003 host tooling remains operational until that change is implemented and tested.

## 13. Privacy and location safety

Location is social context, not surveillance.

Requirements:

- no continuous background location tracking
- no public live-person map
- no precise user-home exposure
- location permission requested contextually
- browsing works without precise device location
- exact coordinates are appropriate for approved public places
- person-originated content without a safe public place uses an appropriately coarse area
- analytics never receive raw GPS
- private contact information is not exposed through public profiles
- deletion and retention rules apply to user-generated content

## 14. Trust, moderation, and abuse

Map-native content can create high real-world harm if false location claims are trusted blindly.

Minimum controls:

- authenticated creation
- rate limits
- server-owned moderation states
- reporting
- deterministic duplicate/idempotency protections
- spam heuristics where justified
- progressive trust
- venue/place validation for precise public pins
- test/demo traffic excluded from real-world evidence

Community reports may reduce distribution or quarantine content, but raw report count alone must not become an easily weaponized permanent-deletion mechanism.

## 15. Geographic strategy

### Phase 1: Ho Chi Minh City

The application may technically support the HCMC operational boundary city-wide.

Operations may concentrate acquisition in dense neighborhoods or categories to build useful social density.

Do not confuse these:

- **Product coverage:** supported HCMC geography
- **Operations priority:** where community-building effort is concentrated

A temporary operations cluster must not become an accidental hard-coded permanent district boundary.

### Later cities

Order remains:

1. Ho Chi Minh City
2. Hanoi
3. Da Nang
4. additional Vietnamese cities

Expansion remains evidence-gated rather than code-driven.

## 16. Metrics

The Activity module keeps its existing operational metrics, but they are not sufficient to measure the social network as a whole.

### North-star candidate — `WMLC_v0`

`WMLC_v0` is the number of unique **real authenticated users** who complete at least one qualifying **database-confirmed** local social action during the ISO week evaluated in `Asia/Ho_Chi_Minh`.

Qualifying authoritative facts are:

- persisted Local Post comment
- persisted person follow
- persisted Community join
- persisted Activity join/go
- valid persisted Activity confirmation
- persisted Place follow
- persisted Area follow

Map opens, impressions, detail opens, failed button clicks, client-declared mutation success, demo/test traffic, and fixture-backed actions do not qualify. `WMLC_v0` is versioned measurement infrastructure, not proof that the metric is already validated as the final north star.

### Social activation

Candidate activation for the first social slice:

- user opens a Local Post from map/area context and performs at least one meaningful interaction in the first session

### Contribution health

- weekly unique local contributors
- percentage of Local Posts receiving a qualified open
- percentage receiving a meaningful interaction
- repeat contributor rate
- posts removed/quarantined for abuse

### Connection health

- comments/replies per qualified Local Post open
- follow conversion from author profile
- week-1 returning social users
- distinct map areas with genuine social activity

### Activity module health

Continue measuring:

- active Signals
- qualified opens
- join/go conversion
- confirmations
- host retention
- stale/not-there rate

### Guardrails

- report rate
- moderation reversal rate
- spam rate
- location/privacy incidents
- harassment rate when comment/follow features exist
- public precise-person-location incidents: target zero

## 17. Current implementation versus target product

### Implemented deeply today

- HCMC city domain
- MapLibre map shell
- approved public places
- Activity Signals
- expiry
- join/go/confirm/not-there
- share routes
- host supply tooling
- moderation/reporting
- privacy-preserving analytics
- Local Posts anchored to approved public places or safe coarse areas
- Local Post reactions, comments, reporting, and public contribution history
- public social profiles and person follow/unfollow graph
- map-native Communities with identity, membership, owner protection, member posting, and moderation
- unified bounded map discovery containing Local Posts, Communities, Activities, and contextual Places
- optional Community linkage on Activity Signals at the database layer
- rich Place social pages, explicit Place/Area following, and a private Following view
- bounded area context and contextual approved Place discovery from the map

### Product direction defined but not yet fully implemented

- social notifications
- richer Community administration and roles UX
- end-to-end Activity ↔ Community creation/discovery UX beyond the optional database linkage

Documentation must distinguish shipped modules from planned extensions and must not claim market validation that has not happened.

## 18. Rollout sequence

### Phase A — Foundation reset

- make PRD v1 canonical
- update agent instructions and architecture
- keep Activity module stable

### Phase B — Local Post social vertical slice — shipped

Implemented:

`Post → map discovery → interaction → profile → follow`

This is technically shipped; real-world social validation is still pending.

### Phase C — Communities — shipped core

Implemented persistent Community identity, map discovery, membership, member-scoped Local Posts, moderation, and an optional Activity Signal database linkage. Richer Activity ↔ Community UX remains future work.

This is technically shipped; real-world Community retention and safety validation is still pending.

### Phase D — Rich Places and area following — technically shipped

Implemented `/p/[id]` with existing Local Posts, discoverable Activities, Communities and real follower counts; authenticated idempotent Place/Area follow and unfollow; private `/following`; and `/a` area context based on catalog-recognized `(city_id, area)`. The map offers a bounded list of approved Places in its viewport, and Posts, Activities and Communities link back to Place pages.

No GPS tracking, person-location access, business ratings, fake engagement or generic infinite feed is introduced. Community membership and Place/Area follows remain separate graph edges.

Real-world market validation and retention validation have NOT passed merely because the code shipped. Deployment and production migration are verified separately; Phase E requires a new explicit scope.

### Phase E1 — Unified Social Map + Measurement Foundation — technical scope

Unifies Posts, Communities, Activities, and contextual Places in the primary map workspace and introduces strict measurement integrity: client observations are not authoritative mutation facts, fixture/test traffic is excluded from real evidence, and `WMLC_v0` is calculated from database-confirmed social actions.

Technical completion does not establish density, retention, or product-market fit.

### Phase E2+ — HCMC density, retention, and deeper participation

Continue improving genuine social activity across HCMC while preserving quality and safety. Later scopes require explicit assignment and should build on E1 rather than adding unrelated breadth.

### Phase F — Multi-city expansion

Only after HCMC demonstrates repeat social contribution, local discovery value, safety, and retention.

## 19. Product non-goals for now

Do not turn the project into a clone of a conventional global social feed.

Deferred unless separately approved:

- direct messaging
- group chat
- stories
- short-video feed
- livestreaming
- marketplace
- delivery
- dating
- public live-friend map
- continuous GPS tracking
- creator payouts
- advertising system
- recommendation ML
- contact-book scraping/sync

## 20. Product decision rule

A feature belongs in Vietnam Social when it strengthens at least one of these while respecting privacy and safety:

1. understanding a place socially
2. discovering locally relevant people/content/communities/activities
3. forming a meaningful local connection
4. participating in the real world
5. contributing useful context back to the map

If a feature primarily increases generic screen time without strengthening the map-native social loop, it is not a priority.
