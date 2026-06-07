# `/training/load` kept as a secondary deep-dive, not a primary surface

> **Superseded by ADR 0017.** `/training/load` is now deleted and its triad +
> trend fold into the home **Training Load Section**. The history below is
> retained for context.

ADR 0010 resolved that Form (TSB) lives as the Coach card at the top of the home
page (`/`), with the session ledger below it, and that we are **not** building a
separate `/training/load` destination as the primary daily surface. With the
Coach card (#59) and the home session ledger (#60/#61) shipped, the standalone
three-card `/training/load` page is no longer a primary destination — issue #62
asked us to decide its fate.

## Decision

Keep `/training/load`, reframed as an optional **secondary deep-dive**, rather
than deleting it.

Rationale: the page still shows information the home Coach card deliberately
omits — the full CTL (fitness) / ATL (fatigue) / TSB (form) breakdown and the
90-day CTL/ATL trend sparkline. The home card surfaces only the single
plain-language Form reading per ADR 0010; the deep-dive remains the place to
inspect the underlying load curve. The engine and snapshot data already exist
(ADR 0010), so retaining a thin read-only view is low cost.

## Consequences

- The home Coach card links to the deep-dive via a low-emphasis "View load trend
  →" link, in both the cold-start and trustworthy states.
- `/training/load` stays in the "More" overflow menu, not the primary pill nav;
  its header is reframed ("Training · Detail" with a "← Home" back link) so it
  reads as a sub-view of home rather than a primary daily destination.
- The existing "Full view →" link from `/training/upcoming` continues to work;
  nothing 404s.
- Home (`/`) remains the athlete's default destination after login.
