# The planning redesign speaks Norwegian, and `labels.ts` still owns every word

Status: Accepted · **Scoped for model-facing output by
[ADR 0092](./0092-every-athlete-operation-is-one-typed-action-and-the-routes-the-mcp-server-and-an-agent-are-its-readers.md)
§10**: action names, codes and enums a model reads are English, every word the
athlete reads in a tool result still comes from `labels.ts`, and an assistant's
prose is never `labels.ts`-owned and is always marked as the assistant's.

**Amends [ADR 0023](./0023-shared-display-formatting-layer.md) §1** (_"The
operator is Norwegian; English-language, European-style is the chosen house
format"_, line 27) **and [ADR 0028](./0028-mobile-first-ui-standard.md) §4**
(_"extending ADR 0023's fixed-locale, English-only house policy from formatting
to wording"_, line 50), with `docs/design/ui-conventions.md` §4, for the
surfaces of the planning redesign (#505) only. Decided when #505 was built.

## Context

The house wording is English-only. Spec #505 names its athlete-facing words in
Norwegian, and names them on purpose: the tabs _I dag_, _Sesong_, _Bibliotek_
and _Meg_; _Ukeskiftet_; _Ok_ / _Nei takk_; _bare denne gangen_ / _fra nå av_;
_ikke gjort_, _ekstra_, _lås opp_, _blokk n av ∞_, _Gjør uka lettere −15 %_,
_Dette fant vi_. The operator is Norwegian and so are the athletes the redesign
is for. Translating the spec's words back into English would ship a different
product from the one the spec describes, and a half-English, half-Norwegian
surface would be the worst of both.

## Decision

1. **The #505 planning surfaces use the spec's Norwegian words**, exactly as the
   spec writes them: the home list and its week headers, the ownership mark,
   Ukeskiftet and its proposals' reasons, the writing line, the four tabs, the
   first run, Sesong's edits, the import and strength-log prompts.
2. **`app/utils/labels.ts` still owns every athlete-facing enum→label map**,
   Norwegian or English, with a completeness test in `labels.test.ts`. A
   Norwegian word is still never hand-written beside an enum at a call site. The
   module stays the i18n seam: one language more in it makes the seam more real,
   not less.

   _Amended by #533 (module layout only):_ `labels.ts` is now a barrel over one
   module per surface in `app/utils/labels/` (`i-dag.ts`, `sesong.ts`, `meg.ts`,
   …, with shared enum words in `vocabulary.ts` and the plan's own words in
   `plan-domain.ts`). Every caller still imports from `labels.ts`, the
   completeness tests still read it, and the set stays a runtime leaf. A new
   label goes in the module of the surface that shows it. The rule above is
   unchanged: `labels.ts` is still the one home of every athlete-facing word.

3. **Formatting does not change.** Numbers, dates and times stay `format.ts`'s
   fixed, pure, Athlete-Timezone formatting (ADR 0023 §1–2). Only wording is
   amended.

   _Amended by
   [ADR 0082](./0082-i-dag-reads-like-a-printed-plan-and-the-season-strip-frames-the-reader.md)
   §9:_ on the home surface (`I dag`) **dates** are Norwegian too —
   `ons 7. okt`, `28. sep – 4. okt` — from `format.ts`'s `formatNb*` family,
   still fixed, pure and in the Athlete Timezone, with the month and weekday
   words in `labels.ts`. An English month beside a Norwegian sentence was the
   half-and-half surface the Context rules out. Numbers keep the house format.

4. **Surfaces #505 does not redesign stay English** until they are redesigned.
   Code, identifiers, logs, ADRs and the glossary stay English; the glossary
   records each Norwegian UI word next to the term it names (_UI word:_
   _Ukeskiftet_).

## Considered options

- **Keep English and translate the spec.** Rejected: the spec's words are the
  product's voice, and the owner chose them.
- **Add an i18n library now and ship both languages.** Rejected: nobody asked
  for a second language, and it would double every surface's copy review. The
  `labels.ts` seam keeps that door open at no cost.

## Consequences

- An English and a Norwegian surface sit side by side until the redesign reaches
  every page. That is accepted and temporary.
- A new #505 label is a Norwegian string in `labels.ts` plus its completeness
  test, the same rule as before (UI conventions §4).
- The hero pane's outcome names and other enum labels on #505 surfaces move to
  Norwegian as their slices touch them.
