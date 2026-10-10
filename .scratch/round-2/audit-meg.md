# Audit: the Meg sub-pages (round 2)

Branch `claude/meg-pages` from `origin/claude/round-2` (b1d66ce). Production build, `MOCKS=true`,
port 3625, a copy of the kody DB. Screenshots: `scratchpad/meg/before/before-<page>-<390|1280>-<light|dark>.png`.
Measurements (390 touch): `scratchpad/meg/before/before-report.json` (`shots.mjs`).

Pages (from `app-tabs.ts` `me: ['/me','/settings','/integrations','/imports']` and the Meg links):
`/settings/profile` (+ `photo`, `change-email`, `password`, `password/create`, `two-factor`, `two-factor/verify`,
`two-factor/disable`, `connections`, `passkeys`), `/settings/training` (+ `analyze`, `history`, `gym`,
`lifts/:id`, `lifts/:id/propose`). `/settings` redirects to `/me`. Not mine: `/settings/integrations`,
`/integrations/*`, `/imports/upload` (first-run/integrations agent).

## 1. Short summary

- The hub is Norwegian; every sub-page is English (about 250 strings: titles, labels, buttons, toasts, server
  errors, validation messages, the change-email emails).
- The pages predate the design system: `rounded-lg`/`rounded-md`, `text-body-*` marketing steps, `font-mono`
  figures, `<details>` disclosures, `bg-background` "cards" that are invisible on the page background.
- Validation errors are 10px (`forms.tsx` `text-[10px]`): words at the field, but unreadable.
- Defects: `/settings/profile/connections` returns **500** when the GitHub lookup gets a non-JSON body; the profile
  photo's camera button lands under the avatar beside "Username"; the trainable-day chips are 34px; date inputs show
  `mm/dd/yyyy`; kilos and hours use `.` decimals; `Sign out of 123 other sessions`; `Registered 3 days ago` (English
  `date-fns`).

## 2. Spec / ADR table

| Ref | Verdict | Evidence | Note |
|---|---|---|---|
| #505 story 59 (Meg holds profile, training settings, connections, upload) | Built | `me.tsx`, `app-tabs.ts:43` | Sub-pages reached and back-link to Meg |
| ADR 0081 (Norwegian on these surfaces, words in `labels.ts`) | Deviates | every file in `settings/profile/*`, `settings/training/*` | ~250 inline English strings (inventory §2.3) |
| ADR 0085 (shadcn luma, radii, type steps) | Deviates | `analyze.tsx:270,290`, `history.tsx:130`, `lifts.$exerciseId.tsx:336,371`, `propose.tsx:211,229,387`, `index.tsx:428` (`rounded-md` chips) | old radii, `text-body-*`, `font-mono`, raw `<details>` |
| ADR 0028 (44px, 16px inputs) | Partial | report.json | inputs are 16px on touch; weekday chips 34px; `<summary>` 18px; inline text links 16–20px (`1Password`, `Training Settings`, session titles) |
| ADR 0050 (Weekly Capacity derived once, then authored) | Built | `profile/index.tsx:116-119` | Derivation sentence English (`format.ts:697`) |
| ADR 0054 (proposal shape, grades, refusals in place) | Built | `analyze.tsx`, `propose.tsx` | Keep the shape; only words/styling change |
| ADR 0083 (tabs; page header back to Meg) | Built | `_layout.tsx` | titles `Edit Profile`, `Training Settings` English |

## 3. Design deviations (design system)

| Where | Now | Should be |
|---|---|---|
| Profile | 208px avatar, camera `size-10` button positioned outside the avatar's box (renders below-left, beside "Username") | smaller avatar with the camera button on its corner, 44px |
| Profile | eight bare icon links + two filled primary buttons (`Sign out…`, `Delete all your data` both look like the primary action) | grouped list rows (Meg's row pattern), one primary per form, destructive actions quiet until confirmed |
| Profile | weekday chips `rounded-md` 34px | `ToggleGroup variant="outline" multiple`-look chips, `rounded-full`, 44px |
| Training | lead paragraphs `text-body-md` (marketing step, ~20px) | `text-footnote` / `text-body` |
| Analyze / history / lifts / propose | `bg-background rounded-lg` rows: no visible surface | `Card` (`rounded-4xl`, card tone) |
| Figures | `font-mono` | `tabular-nums` on Public Sans |
| Disclosures | `<details>`/`<summary>` 18px | `ui/collapsible`, 44px trigger |
| Estimator picker | `rounded-md border` links | pill links, `rounded-full`, selected = `bg-primary/10 text-primary` |
| Buttons | `size="sm"` outline buttons as the only action of a card | default size (44px) |
| Passkeys | `Card` per item with `size=sm` destructive Delete | list rows, quiet destructive |
| Error text | `text-[10px]` (`forms.tsx:50,71`) | `text-footnote text-destructive` at the field |

## 4. Craft (Emil format)

| Before | After | Why |
|---|---|---|
| `hover:underline` on links without press feedback | `active:bg-muted/60 duration-press ease-out` row press (Meg's own) | feedback on press, not on hover |
| `<summary>` 18px tall, no motion | `CollapsibleTrigger` `min-h-11`, panel `motion-collapse` | 44px; the sanctioned height animation, 200/150 on ease-out |
| `transition-colors` none on chips; `cursor-pointer` | `pressable` chips | one press curve app-wide |
| two primary-coloured buttons stacked (`Sign out of N`, `Delete all your data`) | outline/ghost, destructive only on the double check | one primary per screen; destructive colour is the confirmation |
| 10px error text | 13px `text-footnote` | legible at arm's length; AA |

Mobile-native: tap highlight, `touch-action`, hover gating and 16px inputs are app-wide and hold here. Missing per
field: `autocomplete` on username/name/new-email confirm, `inputmode` on HR/power/weight, `enterkeyhint`, and
`autocapitalize="none"` on username/email. OTP has `autocomplete=one-time-code` but no `inputmode=numeric`.

## 5. break-ui

| # | Severity | Field | Worst case | What happens | Fix |
|---|---|---|---|---|---|
| 1 | Broken | GitHub connection | lookup returns non-JSON (mock 404, rate limit page) | whole page 500 (`github.server.ts:119` `response.json()`) | **report only** (auth provider code); owner decision |
| 2 | Ugly | other sessions | 123 | `Sign out of 123 other sessions` as a filled primary button; `1` → "1 other sessions" | plural words; quiet button |
| 3 | Ugly | email | long email | `Change email from bartholomew…@…` overflows the row at 390 | email on its own line with `overflow-wrap:anywhere` |
| 4 | Ugly | exercise name / session title | long | links wrap fine, but the date column squeezes | `min-w-0` + `shrink-0` date |
| 5 | Ugly | kg | `61.25` | `.` decimal | `61,25` (owner decision: kilos with decimal comma) |
| 6 | Fragile | weekly hours | `0.1` | `0.1 h/wk` English | Norwegian sentence and comma |
| 7 | Fragile | 0 passkeys / 0 connections / 0 threshold changes | — | English empty states | Norwegian empty states |

## 6. English on these surfaces

See `audit-inventory.md` §2.3 Meg (profile, password, change-email, connections, passkeys, photo, two-factor,
training, analyze, gym, history, lifts, propose). Plus strings it missed: `Change email from …`, `2FA is enabled`,
`Manage connections`, `Integrations & activity sources`, `Manage passkeys`, `Timezone`, `Units`, `Birthdate`,
`Weight (kg)`, weekday chip labels `Mon…Sun`, `Name`, `Send Confirmation`, `Current Password`, `Disable 2FA`,
`Enable 2FA`, `2FA Disabled`, `Invalid code`, `Code`, `Submit`, `Reset`, `Device`/`Security Key`, `Registered … ago`,
`Failed to create passkey. Please try again.`, `Save Run`/`Save Bike`, `Max HR (bpm)`, `LTHR (bpm)`, `FTP (W)`,
`Critical running power (W)`, `Default`, recipe names (`Coggan power — 7 zones`), anchor names (`threshold pace`),
`Read from N activities…`, confidence words (`high confidence`), `Efforts used`, `Fit`, `Note`, history kinds/units,
the shared-util sentences these pages print (`oneRmRefusalText`, `repLoadBasisText`, equation text, plate refusals,
`plateLineText` `empty bar`), and the shared Zod messages from `user-validation.ts` (`Username is too short`…).

## 7. Performance

Nothing slow measured; all pages are server-rendered forms. No long tasks beyond hydration.

## 8. Fix list (this branch)

| # | What | Files | Effort |
|---|---|---|---|
| 1 | Norwegian everywhere, words in a bannered `labels.ts` section (`MEG_PAGES_*`) | all sub-pages, `passkey-item.tsx`, `change-email.server.tsx` | L |
| 2 | Shared Meg-page parts: section, row link, field with Norwegian errors at the field (13px), Norwegian Zod error map, translation of the shared schema messages at display | new `settings/__meg-ui.tsx`, `settings/__meg-text.ts` | M |
| 3 | Profile rebuilt as grouped sections; avatar camera fixed; 44px weekday chips; data export/delete grouped | `profile/index.tsx` | M |
| 4 | Cards, collapsibles, tabular figures, luma radii, type steps on the training pages | `settings/training/*` | M |
| 5 | Input attributes (`autocomplete`, `inputmode`, `enterkeyhint`, `autocapitalize`) | all forms | S |
| 6 | Norwegian number/date formats (kg and hours comma; `formatNbDate`) | all | S |
| 7 | `ProviderConnectionForm` takes an optional label (words only) | `utils/connections.tsx` | S |
| — | Connections 500 on non-JSON GitHub reply | `utils/providers/github.server.ts` | report to owner (auth code) |
