import fs from "node:fs";

function replaceOnce(path, from, to) {
  const before = fs.readFileSync(path, "utf8");
  if (!before.includes(from)) {
    throw new Error(`Expected text not found in ${path}: ${from.slice(0, 120)}`);
  }
  const after = before.replace(from, to);
  fs.writeFileSync(path, after);
}

// Squash pre-production E1 compatibility fixes into the single canonical migration.
const migration009 = "supabase/migrations/202609140009_unified_social_map_measurement.sql";
const migration010 = "supabase/migrations/202609140010_fixture_activity_evidence_compat.sql";
const migration011 = "supabase/migrations/202609140011_fixture_projection_observation_compat.sql";
const combined = [migration009, migration010, migration011]
  .map((path) => fs.readFileSync(path, "utf8").trim())
  .join("\n\n-- ---------------------------------------------------------------------------\n-- Pre-production E1 compatibility refinement (squashed before hosted rollout)\n-- ---------------------------------------------------------------------------\n\n");
fs.writeFileSync(migration009, `${combined}\n`);
fs.rmSync(migration010);
fs.rmSync(migration011);

replaceOnce(
  "README.md",
  "The repository implements the **Activities** primitive deeply and now also ships the map-native social layers: **Local Posts**, **Communities**, and **Rich Places + Area Following**. The existing Activity system remains one module of the broader social network.",
  "The repository implements the **Activities** primitive deeply and now also ships **Local Posts**, **Communities**, **Rich Places + Area Following**, and **Phase E1 Unified Social Map + Measurement Foundation**. The existing Activity system remains one module of the broader social network.",
);
replaceOnce(
  "README.md",
  "- unified map discovery for Local Posts and Communities",
  "- one bounded `/api/map` discovery boundary for Local Posts, Communities, Activities, and contextual Places",
);
replaceOnce(
  "README.md",
  "- privacy-preserving analytics",
  "- privacy-preserving client observations separated from database-confirmed social-action evidence\n- versioned `WMLC_v0` based on authoritative real actions, with fixture/test traffic excluded",
);
replaceOnce(
  "README.md",
  "Phases B (Local Posts), C (Communities core), and D (Rich Places + Area Following) are technically shipped. The Phase D loop is `map/social object → /p/[id] → follow Place/Area → /following → Place or /a area context`.\n\n**Real-world market validation and retention validation have NOT passed merely because the code shipped.** Phase E is not started automatically. Production rollout is a separate gate: apply migration `202609140008_rich_places_area_following.sql` only after exact-head and post-merge CI succeed, and verify its canonical version in the target project.",
  "Phases B (Local Posts), C (Communities core), D (Rich Places + Area Following), and E1 (Unified Social Map + Measurement Foundation) are technically shipped once the E1 PR, post-merge CI, hosted migration, and production smoke test are all verified. The E1 loop is `map viewport → Post / Community / Activity / Place → detail/action → return to map`.\n\n**Real-world market validation and retention validation have NOT passed merely because the code shipped.** E1 measurement explicitly distinguishes observations from authoritative facts. Production rollout is a separate gate: the canonical E1 database change is `202609140009_unified_social_map_measurement.sql`, applied only after exact-head and post-merge CI succeed.",
);

replaceOnce(
  "prd-v1.md",
  "Future graph edges may include:\n\n- user follows Community separately from membership\n- user follows place\n- user follows area\n\nThese future edges require separate product decisions and should not be silently inferred from membership or location.",
  "Current graph edges also include:\n\n- user follows approved public Place\n- user follows catalog-recognized coarse Area\n\nA future edge may include following a Community separately from membership. Membership, Place follow, Area follow, and person follow remain distinct and must never be silently inferred from one another or from device location.",
);
replaceOnce(
  "prd-v1.md",
  "### North-star candidate\n\n**Weekly meaningful local connections**: unique users who complete at least one meaningful local social action involving a real person, community, activity, or place.\n\nQualifying examples:\n\n- comment/reply on a relevant Local Post\n- follow a contributor after opening local content\n- join a Community\n- join/go to an Activity\n- provide a valid post-activity confirmation\n\nThe exact metric definition must be versioned before it is used for investment decisions.",
  "### North-star candidate — `WMLC_v0`\n\n`WMLC_v0` is the number of unique **real authenticated users** who complete at least one qualifying **database-confirmed** local social action during the ISO week evaluated in `Asia/Ho_Chi_Minh`.\n\nQualifying authoritative facts are:\n\n- persisted Local Post comment\n- persisted person follow\n- persisted Community join\n- persisted Activity join/go\n- valid persisted Activity confirmation\n- persisted Place follow\n- persisted Area follow\n\nMap opens, impressions, detail opens, failed button clicks, client-declared mutation success, demo/test traffic, and fixture-backed actions do not qualify. `WMLC_v0` is versioned measurement infrastructure, not proof that the metric is already validated as the final north star.",
);
replaceOnce(
  "prd-v1.md",
  "- map discovery containing both Local Posts and Communities",
  "- unified bounded map discovery containing Local Posts, Communities, Activities, and contextual Places",
);
replaceOnce(
  "prd-v1.md",
  "### Phase E — HCMC density and retention\n\nGrow genuine social activity across HCMC while preserving quality and safety.",
  "### Phase E1 — Unified Social Map + Measurement Foundation — technical scope\n\nUnifies Posts, Communities, Activities, and contextual Places in the primary map workspace and introduces strict measurement integrity: client observations are not authoritative mutation facts, fixture/test traffic is excluded from real evidence, and `WMLC_v0` is calculated from database-confirmed social actions.\n\nTechnical completion does not establish density, retention, or product-market fit.\n\n### Phase E2+ — HCMC density, retention, and deeper participation\n\nContinue improving genuine social activity across HCMC while preserving quality and safety. Later scopes require explicit assignment and should build on E1 rather than adding unrelated breadth.",
);

replaceOnce(
  "ARCHITECTURE.md",
  "Status: HCMC foundation, Activities, Local Posts (Phase B), Communities core (Phase C), and Rich Places + Area Following (Phase D) are technically shipped. Deployment and market/retention validation are separate gates. No broad adoption is claimed.",
  "Status: HCMC foundation, Activities, Local Posts (Phase B), Communities core (Phase C), Rich Places + Area Following (Phase D), and the Phase E1 Unified Social Map/measurement architecture are technically implemented on the E1 branch. Hosted deployment and market/retention validation remain separate gates. No broad adoption is claimed.",
);
replaceOnce(
  "ARCHITECTURE.md",
  "### `analytics`\n\n- strongly typed privacy-preserving product events\n- coarse geographic context only\n- explicit real/demo/test separation\n- versioned definitions for investment metrics",
  "### `analytics`\n\n- strongly typed privacy-preserving client observations\n- no raw GPS; coarse geographic context only\n- server-owned traffic classification\n- authoritative social-action facts recorded only after successful database mutations\n- explicit fixture/test exclusion from real evidence\n- versioned investment metrics, beginning with `WMLC_v0`",
);
replaceOnce(
  "ARCHITECTURE.md",
  "- Clients never authoritatively compute roles, moderation state, trust, author identity, or location authority.",
  "- Clients never authoritatively compute roles, moderation state, trust, author identity, location authority, test/demo classification, or successful social-action evidence.\n- Client analytics describe observations; database-confirmed domain mutations are the source for meaningful-action evidence and `WMLC_v0`.",
);
replaceOnce(
  "ARCHITECTURE.md",
  "A future map entity projection should provide a common display envelope rather than forcing every domain table into one generic object model.",
  "Phase E1 implements a common application-level map entity projection and bounded `/api/map` boundary rather than forcing every domain table into one generic persistence model.",
);

replaceOnce(
  "AGENTS.md",
  "Phases B (Local Posts), C (Communities core), and D (Rich Places + Area Following) are technically shipped. Preserve the existing social loop and the Phase D loop:",
  "Phases B (Local Posts), C (Communities core), D (Rich Places + Area Following), and the Phase E1 Unified Social Map/measurement foundation are technically implemented. Preserve the existing social loop and the Phase D loop:",
);
replaceOnce(
  "AGENTS.md",
  "Place follows, coarse Area follows and Community membership are distinct edges. Area identity comes from approved public Places, never client GPS. Phase E is not authorized by a generic “continue”; review real evidence and ask for explicit scope. Technical shipping does not establish market or retention validation.",
  "Place follows, coarse Area follows and Community membership are distinct edges. Area identity comes from approved public Places, never client GPS. Client observations must never be treated as authoritative successful mutations; `WMLC_v0` comes from database-confirmed social-action facts. Fixture/test traffic must remain excluded from real evidence. Technical shipping does not establish market or retention validation. Do not start a later phase without explicit scope.",
);

console.log("E1 migration and canonical docs finalized.");
