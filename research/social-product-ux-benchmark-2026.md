# Vietnam Social — Social Product UX Benchmark (2026)

Status: product/UX benchmark for the V1 experience reset. This document is evidence for interface decisions, not a claim that Vietnam Social has matched the scale or traction of the products below.

## Objective

Vietnam Social should feel like a social network whose geography is meaningful — not like a GIS dashboard that happens to contain social records.

The benchmark question is:

> How do successful social products make people, conversations, communities, events and places feel alive — and which patterns should Vietnam Social adapt without cloning them?

## Products studied

### Nextdoor — local conversation first

Official product updates emphasize a neighborhood-focused main feed, easier-to-follow threaded conversations, useful local recommendations, and reducing low-quality/self-promotional noise. Nextdoor's public content model also treats posts as rich social objects with author/context, comments, reactions, neighborhood and recency rather than as anonymous map records.

Sources:

- https://blog.nextdoor.com/whats-new-on-nextdoor-product-updates-1
- https://developer.nextdoor.com/docs/displaying-overview
- https://blog.nextdoor.com/small-business-improvements

What to adapt:

- Human conversation is the default unit.
- Location narrows relevance; it does not replace the feed.
- Replies/reactions/social proof must remain visible on the discovery card.
- Commercial/Place content should not overwhelm local conversation.

Do not copy:

- identity verification model or business monetization model at this stage.

### Meetup — confidence before joining

Meetup's 2025–2026 redesign focuses on making groups/events feel more human and giving users more context before attending. Its roadmap explicitly highlights richer member profiles, organizer reputation and a unified member/organizer experience.

Sources:

- https://www.meetup.com/blog/new-design-2025/
- https://www.meetup.com/blog/2026-meetup-roadmap/

What to adapt:

- Community identity should be stronger than a category label.
- Organizer/member identity should be visible before users join.
- The UI should answer: who are these people, what happens here, and would I feel comfortable joining?
- Organizer tooling should be separate in complexity but not feel like another product brand.

### Partiful — social proof drives real-world conversion

Partiful Explore connects public events to the communities behind them. Event pages foreground host identity, visible guest interest/attendance, clear time/place and strong sharing/RSVP actions. It treats event discovery as a social surface rather than a generic listing directory.

Sources:

- https://partiful.com/explore
- https://help.partiful.com/en-us/articles/15525568-what-is-the-partiful-explore-page
- https://partiful.com/featuring-your-event-on-explore

What to adapt:

- Activities should show host/community, time, place and participation context directly in the discovery card.
- Activity is content inside the social network, not a separate top-level product.
- Strong primary action should appear only after enough human context is visible.

### Snap Map — the map is a social context, not a taxonomy dashboard

Snap Map combines people, community content and Places in one geographic surface. Places open as contextual pages; map content helps answer what is happening nearby. The product avoids presenting the underlying content model as database categories.

Sources:

- https://help.snapchat.com/hc/en-us/articles/7012298961684-What-are-Places-on-Snap-Map-How-do-I-find-them
- https://help.snapchat.com/hc/en-us/articles/7012276359700-How-do-I-find-my-friends-on-Snap-Map
- https://newsroom.snap.com/2025-snap-map-mau

What to adapt:

- The map should remain visually dominant.
- Markers should communicate social meaning visually, not letters like A/C/P.
- Place pages are supporting context for social behavior.
- Search/filter should feel like exploration, not an analytics toolbar.

Do not copy:

- live-person public location. Vietnam Social keeps its existing privacy rule: no public precise live-person GPS.

### Neme — direct Vietnam hyperlocal benchmark

Neme positions itself as a local social network for everyday community life in Vietnam. It ties content to wards/neighborhoods and combines residents, local activities, services and stories in a location-aware environment.

Sources:

- https://play.google.com/store/apps/details?id=com.neme.app
- https://apps.apple.com/vn/app/neme-connect-nearby/id6756638416

What to adapt:

- Vietnamese local-area language should be first-class.
- The interface must feel understandable without explaining product architecture.
- Posts/stories and people should be more prominent than system primitives.

How Vietnam Social should differ:

- Keep the map as the primary workspace.
- Connect Posts + Communities + Activities + Places in one interaction model rather than reproducing a standard local feed alone.

### Reclub — community/activity density

Reclub demonstrates the value of persistent clubs connected to repeated real-world activities. Its HCMC metropolitan directory publicly exposes a dense network of sports clubs and activities.

Source:

- https://reclub.co/vi/communities/ho-chi-minh-city-metropolitan-vietnam-1

What to adapt:

- Community is persistent identity; Activity is a moment generated by that community.
- Do not treat each Activity as an isolated listing.

Do not copy:

- sports-specific information architecture.

### Facebook Groups — people organize around identity and shared context

Facebook continues to frame Groups around people seeking advice, shared interests, local clubs and real communities, with discoverability balanced against member privacy.

Source:

- https://about.fb.com/news/2025/11/facebook-update-group-admins-flexibility-protecting-member-privacy/

What to adapt:

- Community pages need recognizable human identity and conversation, not just description/member count.
- Privacy boundary must remain obvious.

## Product conclusions

### 1. Vietnam Social must be social-first, map-native

Incorrect mental model:

`map + 4 database primitives + counters`

Correct mental model:

`people + conversations + communities + things to join, understood through place`

The map is the spatial canvas for the network.

### 2. Remove architecture language from user-facing UI

Do not expose language such as:

- Unified Social Map
- primitive
- A/C/P marker taxonomy
- technical inventory counters as hero content

Use human language:

- Quanh đây
- Bài viết
- Cộng đồng
- Hoạt động
- Địa điểm

### 3. One product shell

`/` and `/activities` should share the same discovery shell.

Activity organizer/operator tooling can remain more specialized under a management route, but users should not feel that Activities is a second branded application.

### 4. Social cards need identity and evidence

Local Post card:

- author identity
- time + area
- actual body
- replies/reactions

Community card:

- community identity
- creator/organizer
- category + area
- member count
- short purpose

Activity card:

- host/community identity
- time
- place
- activity type
- participation/trust when available

Place card:

- Place identity
- area
- explanation that its value is the social layer attached to it

### 5. Geography should improve relevance, not create surveillance

Keep:

- approved public Place coordinates
- coarse areas
- viewport discovery

Do not add:

- public live people
- background precise tracking
- precise home coordinates

### 6. Empty state is onboarding, not an error dashboard

When there is no supply, say that the area has not started talking yet and offer a clear contribution path. Do not fill the map with fake people or fake activity.

## V1 experience reset acceptance criteria

The first screen should make a new user understand within ~5 seconds:

1. This is Vietnam Social.
2. It is about people and communities near a real area.
3. The map is central.
4. I can read, join/follow, or contribute.
5. Activities are part of the network rather than a separate product.

The interface should not require the user to understand the database architecture to use it.
