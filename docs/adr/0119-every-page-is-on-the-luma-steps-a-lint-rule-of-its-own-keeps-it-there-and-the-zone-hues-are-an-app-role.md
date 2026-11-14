# Every page is on the luma steps, a lint rule of its own keeps it there, and the zone hues are an app role

Status: Accepted

**Amends**
[ADR 0085](0085-the-design-system-is-shadcn-base-luma-on-base-ui-and-motion-follows-one-scale.md)
§2 (`zone-*` listed as a temporary token) and its Scope, which left every page
but I dag on the old classes. Issue #528 (story 86, "Look").

## Context

ADR 0085 moved the primitives and I dag onto shadcn `base-luma`, its radius
steps and its type scale. Every other page kept `rounded-lg`/`rounded-xl` and
raw `text-xs`…`text-2xl`, which the 6px radius base renders sharper than before.
The Training Zone hues `zone-1…5` (profile bars, the Workout Shape strip, the
season chart, the score's chips) had no dark values, and four of the five light
ones measured 2.0–2.8:1 on `card`, under the 3:1 a graphical mark needs.

## Decision

1. **Pages use the luma steps by role.** Radius goes by what the element is
   (cards, sheets, list groups `rounded-4xl`; fields, popovers, toggles,
   steppers and wells `rounded-3xl`; items inside them `rounded-2xl`; pills,
   tabs and chips `rounded-full`; data marks `rounded-[3px]`). Type goes by what
   the text does (one page title at `text-title`; section and card titles
   `text-heading`; row titles `text-callout`; row facts, descriptions and field
   errors `text-footnote`; labels and units `text-caption`; inputs and running
   text `text-body`), not by nearest size, so the three reading steps stay
   distinct. `docs/design/design-system.md` holds the map. This applies to every
   page and shared component outside `app/components/ui`, admin included (by
   hand: the rule in §2 leaves admin out, as the native-`<select>` guard does).
   The marketing and auth pages keep the Epic marketing scale, and the throwaway
   prototype files are left as they are.

2. **A local ESLint rule, `trainm8/luma-steps`, keeps page code there.** It
   reads every string and template literal in its files and reports each bare
   `rounded`, `rounded(-side)-xs/sm/md/lg/xl` and `text-xs…9xl` class token
   (with any variant prefix), naming the luma step to use and pointing at the
   design system doc. It is its own rule, not another `no-restricted-syntax`
   entry: flat config replaces a rule's options per matching block instead of
   merging them, and this guard's files (all of `app/`, minus its exemptions)
   differ from both the native-`<select>` guard's (route files) and the
   user-delete guard's (all code), so sharing the rule would need one block per
   overlap, each listing every restriction, and a missed block silently drops a
   guard. A rule of its own has one block and cannot shadow the others or be
   shadowed. Like the native-`<select>` guard it leaves out the admin,
   marketing, SEO and auth routes (and the auth shell), and it also leaves out
   `app/components/ui`, the prototype files and tests. A deliberate exception is
   an `eslint-disable-next-line trainm8/luma-steps` with its reason.

3. **`zone-1…5` is a permanent app role with light and dark values.** shadcn has
   no intensity role, and `chart-1…5` are categorical, so mapping zones onto
   them would lose the 1→5 hue ladder the marks are read by. Both themes' values
   were chosen together: each zone is at least 3:1 on `card` as a mark (a bar, a
   strip cell, a chart fill). The hues are never text. The values and their
   contrast numbers live in `design-system.md`, and `/design` shows them beside
   the track and status roles.

## Consequences

- The light zone hues change too (zone 3 reads mustard rather than sunny
  yellow), because 3:1 on `card` could not hold with the old light values.
- `/design` renders the radius scale as data, so its rows carry a named
  `eslint-disable-next-line`. The exercise picker's trigger mirrors the
  `ui/select` trigger's `text-base md:text-sm` under a named disable too.
- A future guard with its own scope gets its own rule name in the same way.

## Considered options

- **Another `no-restricted-syntax` entry composed into shared blocks**: the
  pattern the other guards use, but three guards with three scopes need a block
  per overlap, and each new guard multiplies them.
- **Re-registering the core `no-restricted-syntax` under a second name**: needs
  `eslint/use-at-your-own-risk`, which ESLint keeps outside semver.
- **A test that scans source files**: reports later than lint and is a structure
  test.
- **Removing `zone-*` for `chart-1…5`**, as ADR 0085 §2 foresaw: loses the
  ladder. **Dark values only**: leaves light zones 1–4 under 3:1.
