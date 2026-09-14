from pathlib import Path


def replace_exact(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing expected docs block: {label}")
    return text.replace(old, new, 1)


readme = Path("README.md")
text = readme.read_text()
text = replace_exact(
    text,
    """The repository currently implements the **Activities** primitive most deeply. The existing Activity system is not being discarded; it becomes one module of the broader social network.

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
""",
    """The repository implements the **Activities** primitive deeply and now also ships the first two map-native social layers: **Local Posts** and **Communities**. The existing Activity system remains one module of the broader social network.

Today the shipped foundation includes:

- HCMC map-first discovery
- approved public places
- expiring Activity Signals
- join/go/confirm/not-there actions
- trust and moderation controls
- shareable Activity routes
- host onboarding and venue authorization
- activity templates and operator supply tools
- Local Posts anchored to safe areas or public places
- reactions, comments, reports, public profiles, and person follow graph
- map-native Communities with create, join/leave, member posting, and moderation
- unified map discovery for Local Posts and Communities
- privacy-preserving analytics

Planned but **not yet shipped as complete social modules**:

- richer social Place pages
- place/area following
- social notifications
- richer Community administration
- end-to-end Activity ↔ Community UX beyond the current optional database linkage

The next product phase defined by PRD v1 is **Rich Places and area following**, while the shipped Local Post and Community loops are validated with real users.
""",
    "README implementation status",
)
text = replace_exact(
    text,
    "- Future Local Posts must attach to a safe public place or appropriately coarse area; they must not expose a person's precise live position.\n",
    "- Local Posts and Communities attach to approved public places or server-derived safe areas; they must not expose a person's precise live position.\n",
    "README architecture boundary",
)
readme.write_text(text)

prd = Path("prd-v1.md")
text = prd.read_text()
text = replace_exact(
    text,
    "- join a Community when implemented\n",
    "- join a Community\n",
    "community metric",
)
text = replace_exact(
    text,
    """### Implemented deeply today

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

### Product direction defined but not yet implemented

- Local Posts
- comments/reactions
- public social profiles beyond the current account identity
- follow graph
- Communities
- rich social Place pages
- unified multi-entity map layers
- social notifications

Documentation must not describe these planned modules as shipped features.
""",
    """### Implemented deeply today

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
- map discovery containing both Local Posts and Communities
- optional Community linkage on Activity Signals at the database layer

### Product direction defined but not yet fully implemented

- rich social Place pages
- place and area following
- social notifications
- richer Community administration and roles UX
- end-to-end Activity ↔ Community creation/discovery UX beyond the optional database linkage

Documentation must distinguish shipped modules from planned extensions and must not claim market validation that has not happened.
""",
    "PRD implementation status",
)
text = replace_exact(
    text,
    """### Phase B — Local Post social vertical slice

Implement and validate:

`Post → map discovery → interaction → profile → follow`

### Phase C — Communities

Introduce persistent community identity, membership, posts, and Activity integration only after the first social slice is measurable and safe.

### Phase D — Rich Places and area following
""",
    """### Phase B — Local Post social vertical slice — shipped

Implemented:

`Post → map discovery → interaction → profile → follow`

This is technically shipped; real-world social validation is still pending.

### Phase C — Communities — shipped core

Implemented persistent Community identity, map discovery, membership, member-scoped Local Posts, moderation, and an optional Activity Signal database linkage. Richer Activity ↔ Community UX remains future work.

This is technically shipped; real-world Community retention and safety validation is still pending.

### Phase D — Rich Places and area following — next
""",
    "PRD rollout phases",
)
text = replace_exact(
    text,
    """Future graph edges may include:

- user joins/follows community
- user follows place
- user follows area

These require separate product decisions and should not be silently added to the first slice.
""",
    """Current graph edges include:

- person follows person
- user joins/leaves Community

Future graph edges may include:

- user follows Community separately from membership
- user follows place
- user follows area

These future edges require separate product decisions and should not be silently inferred from membership or location.
""",
    "PRD graph edges",
)
prd.write_text(text)
