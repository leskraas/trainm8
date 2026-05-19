# Zone system recipes live in code, not the database

Built-in zone recipes (`coggan-power-7`, `friel-hr-5-bike`, `friel-hr-5-run`,
`daniels-pace-5`, `css-3`) are typed constants in `app/utils/zones/`, not rows
in the database. The athlete's choice is stored as a recipe id string on
`DisciplineProfile`, with optional per-zone boundary overrides also on
`DisciplineProfile`. Zone resolution is a pure function of recipe id + athlete's
anchor threshold + overrides.

## Considered options

- **Recipes as DB rows**: Rejected — recipes are stable, versioned reference
  data, not athlete-owned. Storing them in code makes them reviewable in PRs,
  type-safe at compile time, and instantly available to the AI prompt builder
  without a DB roundtrip.
- **Recipe ratios per athlete**: Rejected — recipes encode named physiological
  models (Coggan, Friel, Daniels) that should not be silently mutable. Athletes
  who need different boundaries use per-zone overrides on top of a recipe.
- **One global zone system per athlete**: Rejected — Coggan/Friel/Daniels/CSS
  are discipline-specific. A rider may want Coggan power on bike and Friel HR on
  run; a swimmer wants CSS only.

## Consequences

- Recipe versioning is explicit: a changed recipe gets a new id
  (`coggan-power-7-v2`). Existing athletes stay on the old recipe until they opt
  to switch — no silent re-resolution of authored history.
- Custom recipes are not supported in v1; overrides only.
- AI prompts include the athlete's recipe id and zone count so resolution
  failures (Z6 on a 5-zone system) cannot happen.
- When a new threshold appears (FTP added later), the system prompts the athlete
  to switch recipes rather than auto-switching, matching the no-silent-mutation
  principle.
- Anchor metric missing (e.g. `powerPct` with no FTP) resolves to Unavailable
  Metric per glossary.
