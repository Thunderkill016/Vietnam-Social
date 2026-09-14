# Vietnam Social — Product Definition

Status: canonical product definition for the next product phase.

## Product definition

**Vietnam Social is a Vietnamese social network with the map as its primary interface, helping people discover the people, local content, communities, activities, and places that make up real social life around them.**

Instead of starting from an endless global feed, Vietnam Social starts from a place or area on the map.

The product should help a person answer:

- What is happening around here?
- What are people in this area talking about?
- Which communities exist here?
- What can I join or do nearby?
- Which places are socially active or worth exploring?
- Who is contributing useful public information to this area?

The long-term ambition is not to build a Vietnamese Facebook clone.

> **Vietnam Social aims to become the social layer of the map of Vietnam.**

The map is not a secondary discovery feature. The map is the home surface that connects online social activity to real places and communities.

## Target users

### 1. Local people and explorers

People who want to understand what is happening around the place they live, study, work, visit, or are considering going to.

Typical needs:

- discover something interesting nearby
- understand a neighborhood before going there
- find local conversations and recommendations
- find an activity or community to join
- ask or answer a question relevant to an area

The core question is:

> **I care about this place. What is happening here and how can I take part?**

### 2. Local contributors

People who create useful public context for a place or area.

Examples:

- sharing a new place
- posting a photo of something happening now
- asking a local question
- reporting a practical local issue
- sharing a recommendation or observation
- answering another person's local question

A contributor should not need thousands of followers to be discovered. Relevant local content can be surfaced because it is useful to a place.

### 3. Organizers and communities

People or groups that repeatedly bring people together in the real world.

Examples:

- badminton clubs
- running groups
- university communities
- photography groups
- language exchanges
- technology meetups
- neighborhood communities
- workshops and hobby clubs

Vietnam Social helps them build a local identity, publish activities, attract members, and appear in the geography where their community actually exists.

### 4. Local places and organizations

Public places that have social life around them, such as cafes, sports venues, parks, universities, cultural spaces, workshops, and community venues.

A place on Vietnam Social is more than a map marker. Over time it can become a social place containing relevant posts, activities, communities, and public context.

## Three core differentiators

### 1. Map-first — the map is the social feed

Traditional social networks usually organize discovery around:

`people you follow → ranking algorithm → feed`

Vietnam Social starts from:

`place or area → relevant people/content/communities/activities → action`

Users should be able to move around the map and see the social layer of a city change with geography.

**Location relevance can matter more than follower count.**

This does not mean exposing live people on a map. Social objects are attached to safe public places or appropriately coarse areas.

### 2. Hyperlocal — content is useful because it belongs somewhere

Vietnam Social favors content with real-world context:

- a place
- an area
- a time
- a community
- a local audience

A Local Post should answer at least one of these questions:

- Where is this relevant?
- When is this relevant?
- Who around this place would benefit from it?

The goal is not to maximize globally viral content. The goal is to make a map area socially informative and useful.

### 3. Social → real world

Vietnam Social should create more than views, likes, and scrolling time.

Examples:

- discover a running community → join a run
- see a workshop → attend it
- find a photography group → become a member
- ask a local question → receive an answer from someone who knows the area
- discover an interesting place → go there
- see useful local information → contribute back to the same area

The core product loop is:

`Map → Discover → Connect → Participate → Contribute`

## Five social primitives

### People

Public identity and contribution history. Profiles can show interests, communities, public contributions, and social relationships without publishing a person's precise live location.

### Local Posts

Persistent or time-bounded social content attached to a public place or coarse area. Examples include questions, photos, observations, recommendations, local updates, and practical information.

### Communities

Groups organized around an interest, identity, institution, or locality. Communities can have geographic relevance and recurring places without owning or exposing members' live locations.

### Activities

Time-sensitive things people can join or attend in the real world. The existing `ACTIVITY` Signal system remains the first implemented primitive and keeps its expiry, trust, confirmation, and moderation model.

### Places

Public physical anchors around which Local Posts, Activities, and Communities can accumulate. Vietnam Social should add social context to places rather than try to become a generic place database.

All five primitives are connected by **the Map**.

## Product safety boundary

Map-native social does **not** mean a public live-person map.

Vietnam Social must not require or encourage continuous location tracking. A user chooses when to associate a contribution with a public place or coarse area. Exact public coordinates are appropriate for verified public places, not for exposing a person's live position or private home.

## HCMC-first rollout

Ho Chi Minh City is the first city and the current technical foundation supports the city operationally.

Product coverage and operational density are different concepts:

- **Product coverage:** the supported HCMC map can exist city-wide.
- **Operations priority:** acquisition and community-building may deliberately concentrate in selected dense areas to avoid an empty map.

Operations priority must not be encoded as a permanent district-only product boundary.

## Current implementation status

The repository currently implements the **Activity** primitive most deeply: expiring Signals, approved places, map discovery, join/go/confirm, moderation, host supply tools, and privacy-preserving analytics.

That implementation remains useful, but it is **one module of Vietnam Social, not the definition of the whole product**.

The next social vertical slice should prove the broader network model:

`Create Local Post → discover it on the map → open → react/comment → open author profile → follow`

Communities and richer place social pages should build on the same map-native foundation after that slice is measurable and safe.
