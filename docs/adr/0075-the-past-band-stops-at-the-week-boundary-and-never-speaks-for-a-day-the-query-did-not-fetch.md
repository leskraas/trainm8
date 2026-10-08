# The past band stops at the week boundary, and never speaks for a day the query did not fetch

Status: Accepted. **§1's scope is amended by
[ADR 0082](0082-i-dag-reads-like-a-printed-plan-and-the-season-strip-frames-the-reader.md)**
(#505 S9): a run of free days ahead of today folds into one row too, and §1's
rule — a run stops at the week boundary — holds for both kinds.

**Confirms
[ADR 0065](./0065-home-is-an-every-day-grid-and-tapping-an-empty-day-stamps-a-session.md)
§3** — behind today a run of consecutive empty days is one band, for both the
reasons stated there. What this decision adds is the two questions building it
turned up, neither of which §3 settles: **how far a run may reach**, and **what
a band is allowed to claim**. It amends §3's worked example (`4–12 · 9 days`)
and supersedes the **Start Cap**'s shipped copy.

Scope: `app/routes/_home/timeline/` — the presenter's band model, the stream's
disclosure, and the near end's one sentence. Issue #500, under ADR 0065 §3 and
[ADR 0028](./0028-mobile-first-ui-standard.md) §2.

## Context

ADR 0065 §3 drew the band as `4–12 · 9 days · nothing logged`, and 4–12 August
crosses a Monday. The stream it has to live in does not: `WeekBlock` is the unit
that mounts, that the window grows and drops a week at a time, that the strip
tracks as the active cell, and that the growth compensation marks and measures
against. A band spanning two of them would have to exist inside a week that is
not loaded.

The second question is quieter and worse. A band **states a fact** — that is the
first of §3's two reasons for it — and the fact it states is that nothing was
logged on nine dates. Home queries half a year (`TIMELINE_TRAILING_DAYS`).
Behind that bound the app has not been told anything about those dates, and the
**Start Cap** was already making exactly this mistake in words:
`Nothing logged before 7 Jul`, over `This is as far back as your history goes`.
For any athlete with more than half a year of training that was the query's own
bound dressed up as a fact about their life. Rendering bands over the same dates
would have turned one sentence's dishonesty into a row per week of it.

## Decision

### 1. A run stops at the week boundary

A band covers consecutive empty days **within one week**, so the longest band
there is is seven days and an empty fortnight reads as two bands under two week
headers.

This is not a compromise on §3's reasoning; it is §3's reasoning at the
granularity the stream actually has. _"Scrolling back through a season should
pass weeks, not empty days"_ — a week header plus one band **is** a week passed,
and the header is the thing that says which week it was. What a cross-week band
would buy is a slightly rounder number in the label; what it would cost is the
one structural invariant every scroll behaviour on the surface is built on.

**ADR 0065 §3's `4–12 · 9 days` is therefore not reachable**, and that example
is amended rather than quietly missed.

### 2. A band never speaks for a day the query did not fetch

No day behind `TIMELINE_TRAILING_DAYS` is built, so no band covers one. _Nothing
was fetched_ is not _nothing was logged_, and a row that cannot tell them apart
should say neither.

The bound lives in the presenter rather than in the loader precisely because two
things have to agree about it — what is built, and what the cap says — and
neither of them is the query.

A day the caller hands over is always built, whatever its date: what the bound
limits is the **claim that a day was empty**, never a session somebody actually
has.

### 3. The Start Cap states the reach, not the end of a history

`Home reads back to 22 Feb` /
`26 weeks of it, and the earliest session in that reach is 7 Jul. Older training is not on this screen — the strip stops here too.`

Both dates are stated and neither pretends to be the other. The bound is real,
worth saying, and the athlete cannot act on a limit they cannot see; whose limit
it is, is the whole of the fix.

### 4. Two days is the shortest run, and a single empty day is a day

A band over one row states nothing the row does not, and charges a tap for it.

### 5. The band is a disclosure that stays

Opening it does not replace it: the control keeps its place above the days,
carrying `aria-expanded` and the way back. A control that vanishes when it is
used has no expanded state to own and no way to undo.

### 6. Holding the reading position is the band's own job

The days are inserted **below** the control, so a band opened at or below the
reading edge moves nothing the athlete can see and `scrollTop` is not written at
all. The one case with arithmetic in it is a band whose own top has gone up past
that edge — then every visible pixel is below the insertion and the position
takes the delta back (`bandScrollTop`). Measured across the toggle in one
synchronous flush, because a measurement taken a paint later has already shown
the reader the jump it was meant to prevent.

## Alternatives considered

- **A run that crosses week boundaries, as §3 drew it.** Rejected — §1. It needs
  the week block to stop being the unit the stream mounts, which is the same
  responsibility fork #503 is already holding open.
- **Suppress the week header a band runs through.** Rejected. The header is what
  makes scrolling back read as weeks, the strip's active cell is read off those
  nodes, and the growth compensation marks one.
- **Build every day back to the first week of the season and band them all.**
  Rejected — §2. The first week of a long history sits at the query's bound, so
  the band most likely to be wrong would be the first one the athlete scrolls
  into.
- **Keep the old cap copy and add the band anyway.** Rejected — §3. The band
  makes the surface state absence _more_ often; shipping it over a cap that
  already overstated absence would compound the one dishonesty.
- **Replace the band with its days on tap.** Rejected — §5.
- **A band over a single empty day, for uniformity.** Rejected — §4.
- **Let the browser's scroll anchoring hold the position.** Rejected: the stream
  sets `overflow-anchor: none` deliberately, because the browser's anchoring
  fights the manual compensation a week loading in above needs.

## Consequences

- **The longest band is seven days**, and a month of nothing is four or five
  bands rather than one. The count in the label is a fact about a week now, not
  about an arbitrary run.
- **The current week can carry a band over its own past days** — Monday and
  Tuesday, read on a Wednesday. That is the rule applied uniformly, and it is
  the reading that keeps "behind today" from meaning two different things in two
  places.
- **The stream's height behind the reader is now bounded by weeks**, not by how
  long the athlete rested: at most one band row plus a header per empty week.
  That is the input §3 wanted the growth compensation to be given, and #503's
  virtualisation question is measured against a smaller number because of it.
- **`Rest day` will break a run when it has a producer.** The band says
  `nothing logged`; a day the **Plan Outline** prescribes recovery on has
  something said about it, and the rule is written now rather than left for
  whoever activates ADR 0065 §4's first branch to discover.
- **The reach is stated on screen, so the athlete can see what home is not
  showing them.** What it does not do is offer a way to see further; whether the
  stream should page past its own bound is unasked and unanswered here.
