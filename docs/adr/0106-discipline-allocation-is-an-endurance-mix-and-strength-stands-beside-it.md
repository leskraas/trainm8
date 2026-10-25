# Discipline Allocation is an endurance mix, and strength stands beside it

Status: Accepted · Resolves #395 · Amends ADR 0031 · Follows ADR 0046, ADR 0104

## Context

ADR 0031 defined the share as each discipline's part of a window's total
resolvable TSS. ADR 0046 §2 took strength out of the triad, so a denominator
with strength `sRPE` in it asserts an exchange rate between sets and TSS, which
ADR 0043 §7 forbids. ADR 0104 kept tracks separate (one day rule across tracks,
no figure across them), and the track model now has five disciplines: `run`,
`bike`, `swim` (TSS-commensurable), `strength` (`sets`) and `other` (Simple
Activities, which carry no TSS, ADR 0015).

## Decision

Option 1 of #395.

1. **The share is an endurance mix.** Denominator: resolvable TSS of `run`,
   `bike` and `swim` only.
2. **Strength and Simple Activities stand beside it** as session counts, never
   inside it and never as TSS. Adding or removing them changes no share.
3. **ADR 0031's Unavailable rule stands:** an endurance discipline that trained
   with no resolvable TSS has a `null` share and is excluded from the
   denominator, never a zero slice.
4. Code: `buildDisciplineAllocation` in
   `app/utils/load/discipline-allocation.ts`, with property tests over every
   combination of the five track disciplines.

## Open for the owner

- **Proposed, owner to confirm:** where the mix renders. ADR 0074 retired its
  surface and declined to re-home it; Meg's Form section is the natural host.
  Until then the module has no caller, which ADR 0074 §3 discourages. It is kept
  because it is the definition the next surface must build to, pinned by tests.

## Deferred hardening

None. The function is pure and reads no data; a future reader must stay
owner-scoped.
