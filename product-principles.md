# Product Principles

These principles are decision filters for Vietnam Social PRD v1. A feature that violates them requires an explicit product decision rather than being added silently.

## 1. The map is home

Vietnam Social is not a conventional feed with a map tab. The primary discovery surface begins from a place or area and reveals relevant social context there.

## 2. Location relevance can beat follower count

Useful local content should be discoverable because it matters to a place, even when the author has few followers. The product should not collapse into a follower-only distribution system.

## 3. Map-native does not mean a live-person map

People are social identities, not continuously tracked markers. Never expose precise live user location by default. Attach public social objects to approved public places or appropriately coarse areas.

## 4. Five primitives, one map

The core social primitives are:

- People
- Local Posts
- Communities
- Activities
- Places

The map connects them. Activity Signals remain important, but they are one primitive rather than the definition of the whole product.

## 5. Hyperlocal before globally viral

Content should gain value from place, area, time, community, or local audience relevance. Optimize first for making a map area useful, not for generating a global viral feed.

## 6. Social should lead to meaningful action

The umbrella loop is:

`Map → Discover → Connect → Participate → Contribute`

A useful interaction may be answering a local question, following a contributor, joining a community, attending an activity, visiting a place, or contributing useful context back to the map.

## 7. Activities remain time-bounded Signals

Activities keep the existing Signal lifecycle: start, expiry, source, trust state, join/go, confirmation, moderation, and automatic disappearance from active queries.

Persistent social content such as Local Posts and Communities must not inherit Activity expiry rules unless their own product model requires it.

## 8. Open contribution with progressive trust

Ordinary authenticated people should be able to contribute without requiring an operator to approve every normal action. Safety comes from server-owned authorization, rate limits, location constraints, moderation, quarantine, abuse controls, and progressive trust.

Verified Hosts remain a valuable trust tier with stronger organizer capabilities, not the only people allowed to participate socially.

## 9. Trust is visible and server-owned

Users need context about who created content, how fresh it is, what place it belongs to, and whether it has been challenged or confirmed where relevant.

Clients never authoritatively assign trust, moderation, role, or location authority.

## 10. Product coverage and operations density are different

Vietnam Social can support HCMC city-wide while community-building effort concentrates in selected dense areas. Do not permanently hard-code an operations cluster as the product boundary.

Density still matters: an empty map is not useful. Build genuine local density without redefining the entire product around one district.

## 11. Cold start must remain honest

Never fabricate users, posts, communities, confirmations, engagement, or real-world attendance. Demo/test data must remain clearly separated from production evidence.

## 12. Privacy and safety are architecture

Consent, minimization, RLS, moderation, retention, deletion, anti-abuse controls, and safe geographic precision are acceptance criteria, not polish.

No continuous location tracking. No public precise-person map. Exact coordinates are appropriate for verified public places, not private homes or a person's live position.

## 13. One social loop at a time

The next social vertical slice is:

`Create Local Post → discover on map → open → react/comment → profile → follow`

Do not simultaneously build chat, stories, video feeds, marketplace, payments, recommendation ML, and every possible social feature.

## 14. Real local behavior beats vanity metrics

Prioritize meaningful local interactions, repeat contributors, follows that emerge from local discovery, community participation, Activity join/go/confirm, safety outcomes, and retention.

Raw map views, likes, signups, and time spent alone do not prove Vietnam Social is useful.

## 15. Explain before automate

Use understandable ranking, trust, and moderation rules first. Introduce machine learning only after there is enough real labeled behavior to show deterministic baselines are insufficient.
