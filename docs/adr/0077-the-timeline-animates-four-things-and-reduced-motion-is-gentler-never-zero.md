# The timeline animates four things, and reduced motion is gentler rather than zero

Status: Accepted

Scope: `app/routes/_home/timeline/`, plus the easing scale and the `hover:`
variant in `app/styles/tailwind.css`, which are app-wide. Issue #502, under
[ADR 0028](./0028-mobile-first-ui-standard.md) §2 and
[ADR 0065](./0065-home-is-an-every-day-grid-and-tapping-an-empty-day-stamps-a-session.md).
Confirms and does not disturb #498's scroll-driven **Hero** fold.

## Context

Home is the screen the athlete opens every day, which argues for _less_ motion
rather than more: an animation on a daily surface is paid for daily. The
timeline had accumulated the usual set — a hover tint on every row, a
`transition-all` on the pane dots, `transition-colors` on the strip cells, the
shared button's own transition — none of which anybody chose, and no easing
scale to have chosen them with. The repo had `--animate-*` keyframes and reached
for built-in curves everywhere else, and the built-ins are too weak to read as
deliberate.

Two of the removals are worth stating as reasoning rather than as taste. The
**row hover tint** was killed because a touchscreen fires a false hover on every
tap: the row the finger has already left stays lit, which is worse than no
feedback at all. And the athlete's device is not reliably a touch device or a
pointer device — a tablet with a stylus answers `(hover: hover)` and still taps.

## Decision

### 1. Two easing tokens, and they replace the built-ins

```
--ease-out:    cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
```

They are declared in `@theme`, which _overrides_ Tailwind's own `--ease-out` and
`--ease-in-out` rather than sitting beside them. One scale, so `ease-out` means
one thing in this app and there is no second system to pick from. `--ease-in` is
left alone: nothing that answers a person should start slowly, so there is no
ease-in on UI here to give a curve to.

### 2. Four animations, each with a purpose it can name

| Element                  | Purpose        | Ingredients                                 |
| ------------------------ | -------------- | ------------------------------------------- |
| Empty cell → editor      | State          | height + opacity, 200ms ease-out            |
| **Past Band** → expanded | Jarring change | height + opacity, 200ms ease-out            |
| Row and cell press       | Feedback       | `scale(0.97)`, 160ms ease-out               |
| **Back-to-Today Pill**   | Jarring change | opacity + `translateY(8px)`, 200ms ease-out |

**Nothing else on the timeline animates**, and that is an enumerable claim
rather than an intention — `tests/e2e/home-timeline.test.ts` collects every
transition and keyframe the frame declares and compares the list against those
four. A fifth arriving later fails there, whatever it is attached to.

### 3. `height` is the sanctioned exception, and the only one

Only `transform` and `opacity` animate, apart from the two accordions. Those two
genuinely **reflow their neighbours** — the rows below really do move — and no
transform does that. It costs layout every frame, which is why both are 200ms
and neither goes longer, and why this is the only place in the app that animates
a layout property.

CSS cannot measure, so the two pixel values the transition interpolates between
are written to the node by `timeline/reflow.ts`; the curve, the duration and the
properties stay in the stylesheet. The cell grows from ADR 0028's 44px control
floor rather than from zero, so the row under the athlete's thumb never
collapses before it opens.

Both accordions **open** animated and close instantly. The jarring change is the
arrival; closing returns the reader to a shape they already had and just asked
for, and animating it out would mean holding a week of rows mounted for 200ms
after they left the model. The **Back-to-Today Pill** is the one departure that
earns an animation, and it pays for it by never unmounting — one small element
rather than seven rows.

The **Past Band**'s scroll compensation (ADR 0075 §6) therefore reads the run's
_content_ height rather than the band's box: mid-transition the box is a number
on its way somewhere, and the reading position has to be held against where the
run ends up.

### 4. The pill is always mounted

It enters from the bottom edge it lives on and leaves the same way — a surface
that arrives one way and departs another reads as two different things — and a
component that unmounts cannot animate out. So the pill stays in the frame and
`data-away="0"` is what makes it _not there_: transparent, 8px down, untappable,
`inert` and out of the accessibility tree, for the reason #487 gave the folded
Hero.

### 5. Reduced motion is gentler, never zero

`prefers-reduced-motion` drops **the transforms** and both smooth scrollers, and
**keeps the opacity halves**. The press-scale goes; the row still answers, in
ink. The pill's 8px lift goes and its fade stays. The Hero's parallax lift was
already the only movement in the fold and was already dropped (#498). The two
accordions are untouched: their ingredients are height and opacity, there is no
transform in them to drop, and the reflow _is_ the gentler answer — it is what
stops seven rows arriving at once.

### 6. Hover motion is gated; press feedback is not

The `hover:` variant is redefined app-wide as
`@media (hover: hover) and (pointer: fine)`. Tailwind v4 already supplies the
first half; the second is what keeps a hover style off a hybrid device that can
hover and still taps. Deliberately the variant rather than a hand-written query
on the few places that needed it — a rule only some hovers follow is not a rule.

`:active` is **not** gated the same way. It is a real press on a touchscreen —
the one state a thumb genuinely enters — so gating it would take the feedback
away from exactly the device that has no hover to fall back on.

### 7. What was removed, and why

- **Rows appearing as the stream window grows** — constant while scrolling; the
  reader is reading, not watching.
- **The smooth glide when a strip cell is tapped** — frequent navigation, and
  six months of smooth scroll is a long animation on a repeated action. It
  jumps, and the strip's own re-centring is what shows the athlete they moved.
  (Already true after #498; stated here so it stays true.)
- **The row hover tint** — touch fires a false hover on every tap.
- **The pane dots' `transition-all`** — the dots report where the pager landed;
  a width that eases into place lags the pane it is reporting on.
- **The strip cell's `transition-colors`** and **the creation menu's
  `transition-all`** — neither was chosen, both were on a built-in curve, and
  one of them was over `all`.

## Consequences

- The **Hero** fold is untouched. It is not an animation and has no duration
  (#498); this decision confirms that rather than giving it a curve.
- The strength runner's set circle keeps its 80ms press-scale — it is not on
  this surface — but its scale comes into the 0.95–0.98 band at `0.97`. Below
  that a press reads as a flinch.
- Redefining `hover:` is app-wide. Every hover affordance in the app now needs a
  device that can hover _and_ a pointer precise enough to mean it, which is the
  intent; it is called out here because the blast radius is larger than the
  issue that motivated it.
- Overriding `--ease-out` / `--ease-in-out` re-curves the two existing
  `motion-safe:ease-in-out` transitions in the token popover and the progress
  bar. That is the point of a scale.
