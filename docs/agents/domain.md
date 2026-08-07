# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **`docs/research/README.md`** — if the area touches training science (load
  math, zones, intensity distribution, thresholds, workout prescription,
  stream/interval analysis), read the index and then the relevant document. It
  records what the primary literature actually says, which ADRs it confirms, and
  which it challenges.

If any of these files don't exist, **proceed silently**. Don't flag their
absence; don't suggest creating them upfront. The producer skill
(`/grill-with-docs`) creates them lazily when terms or decisions actually get
resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   └── 0001-training-app-migration.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal,
a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift
to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either
you're inventing language the project doesn't use (reconsider) or there's a real
gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding:

> _Contradicts ADR-0001 (training app migration) — but worth reopening because…_

An ADR is a record of a decision, not a constraint on the next one. Where the
evidence says a shipped decision is wrong, recommend the correct design and name
the ADR that should be superseded — don't design around it. ADR 0047 set the
precedent that a **research asset**, not only another ADR, can be the
superseding document. Check `docs/research/README.md` before assuming a decision
still stands: several ADRs already carry a **Revisit** note pointing at the
finding that challenges them.
