/**
 * The shared enum→display-label layer (#281). Every athlete-facing enum value —
 * discipline, workout intent, step/intensity kind, event kind/priority/status,
 * event target, units, week-start day, structure mode, and integration
 * provider — is turned into its display string here, so `run`/`Run` never
 * disagree between a select trigger, its option list, and a badge.
 *
 * Sibling to `app/utils/format.ts` (ADR 0023) and the same house policy:
 *
 * - **English-only, fixed wording.** There is no i18n library yet; the labels
 *   are literal English strings. This module *is* the future i18n seam — when
 *   translation arrives it swaps the innards of one module, not every caller,
 *   so no surface should hand-capitalize or hard-code an enum's display text.
 *   New enum-facing UI must read its label from here.
 *   The #505 planning surfaces are the one exception to English: they speak
 *   the spec's Norwegian words (ADR 0081), and those labels live here too.
 * - **Values stay in the schema; labels live here.** The enum *value* arrays
 *   and their zod schemas remain in `workout-schema.ts` / `event-schema.ts` /
 *   `athlete-schema.ts` (the source of truth for what is valid). This module
 *   only imports their *types* (erased at build time), so it is a runtime leaf
 *   with no import cycle: schema files re-export these maps for their existing
 *   callers, everyone else imports straight from here.
 *
 * Some enums carry two athlete-facing registers on purpose (see
 * `getDisciplineLabel` vs `DISCIPLINE_LABELS`). Where that is deliberate the
 * rule is written down in `docs/design/ui-conventions.md` (§4.1 for the
 * discipline "Bike"/"Ride" split).
 *
 * **One barrel, one module per surface** (#533, ADR 0081 as amended). The
 * words live in `app/utils/labels/`, one module per surface the athlete reads
 * them on, and this file re-exports every one of them, so every caller still
 * imports from `labels.ts` and nothing else. A new label goes in the module of
 * the surface that shows it; a word two surfaces share goes in `vocabulary.ts`
 * (enums) or `plan-domain.ts` (the plan's own words). The modules import only
 * types from the domain and values from each other, never in a cycle, so the
 * set stays the runtime leaf described above. `_helpers.ts` is private to the
 * modules and not re-exported.
 */

// `import type` (not the house inline `{ type … }` style): Node's type
// stripping keeps an inline-specifier import statement as a side-effect
// import, which loads the schema modules at runtime and recreates the very
// import cycle this module exists to avoid (server boot then dies on a TDZ
// error). `import type` statements are erased entirely. Every module under
// `labels/` follows this rule for its domain imports.

export * from './labels/vocabulary.ts'
export * from './labels/i-dag.ts'
export * from './labels/week-change.ts'
export * from './labels/session-composer.ts'
export * from './labels/first-run.ts'
export * from './labels/plan-domain.ts'
export * from './labels/sesong.ts'
export * from './labels/plan-new.ts'
export * from './labels/plan-generate.ts'
export * from './labels/events.ts'
export * from './labels/workout-detail.ts'
export * from './labels/token-sentence.ts'
export * from './labels/token-editor.ts'
export * from './labels/bibliotek.ts'
export * from './labels/meg.ts'
export * from './labels/integrations.ts'
export * from './labels/actions.ts'
export * from './labels/privacy.ts'
