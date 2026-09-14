# Vietnam Social V1 Experience Checkpoint

This checkpoint exists to prevent the product from drifting back into an architecture-first dashboard.

## Product test

A first-time visitor should understand without reading implementation terminology that:

- Vietnam Social is a local social network for people and communities in Vietnam.
- the map is the primary spatial canvas, not an analytics dashboard;
- posts, communities, activities and places are parts of one network;
- Activities are not a second branded product;
- contribution comes from real people and empty inventory stays honest;
- public live-person location is not part of the product.

## UI anti-regressions

Do not reintroduce user-facing language such as `UNIFIED SOCIAL MAP`, `primitive`, or letter-only `A/C/P` taxonomy markers as the main information architecture.

Do not make raw entity counters the hero of the page. Social identity, conversation, community context and real-world participation should remain more prominent than database categories.

The previous split between a social homepage and a separately branded Activity finder is retained only as historical implementation context. The public discovery surfaces should use one Vietnam Social shell; specialized host/operator tooling may remain behind a management route.
