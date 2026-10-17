# Three tabs, and a calm I dag that shows today and this week

Status: Accepted · Owner decision 2 of spec #558 (_Levende start_, 2026-10-17) ·
Recorded in ticket #559; built in #558 S4 (I dag) and S9 (_Plan_ and the tabs)

**Amends
[ADR 0083](./0083-four-tabs-are-the-persistent-chrome-and-old-urls-keep-working.md)
§1** (three tabs, not four), and with it §5–§6 and §8 (_Sesong_ becomes _Plan_;
_Bibliotek_ is a section of _Plan_, not a tab). **Amends
[ADR 0090](./0090-sesong-leads-with-the-season-picture-fills-its-own-weeks-and-is-two-columns-on-a-large-screen.md)
§2's order** (what _Plan_ leads with). **Reverses
[ADR 0086](./0086-i-dag-has-no-hero-reads-like-a-calendar-and-the-scroll-engine-never-writes-under-a-reader.md)
§1 for I dag's default view**: a today card returns. **Amends
[ADR 0082](./0082-i-dag-reads-like-a-printed-plan-and-the-season-strip-frames-the-reader.md)
§5 and
[ADR 0087](./0087-on-a-large-screen-i-dag-is-three-panes-the-season-the-list-and-the-day.md)
for the default view**: the **Week Strip**, the **Stream** and the three panes
move behind _Se hele sesongen_, where they stay unchanged. **Follows
[ADR 0081](./0081-the-planning-redesign-speaks-norwegian-and-labels-ts-still-owns-every-word.md)**
(every word in `labels.ts`) and
[ADR 0085](./0085-the-design-system-is-shadcn-base-luma-on-base-ui-and-motion-follows-one-scale.md)
(the design system and its motion scale).

## Context

I dag shows everything at once: the season strip, a calendar of every week back
to the start of history, the writing line, popovers on every row and the
_Ukeskiftet_ card. What an athlete needs on a normal day is today's session, a
way to say "done", and how the week is going, and those are buried. An audit of
the shipped surface also found the list opening 26 empty weeks back, _Marker som
ikke gjort_ as the main action on a session not yet due, and a done session with
no Workout opening a 404.

_Sesong_ is an expert's page: philosophy, week targets, phases, Training Tracks,
the Week Pattern and the season chart. All of it is useful, and none of it is
what an athlete wants to see first. _Bibliotek_ has a tab of its own, yet an
athlete mostly reaches for it when they want another session for today.

## Decision

### 1. Three tabs: _I dag_, _Plan_, _Meg_

- **_I dag_** (`/`), **_Plan_** (today's `/training/plan`, renamed in the UI)
  and **_Meg_** (`/me`). `app/utils/app-tabs.ts` stays the one place the tabs
  change, and `labels.ts` owns their words.
- **_Bibliotek_ has no tab.** It is a section of _Plan_ (the Catalogue, programs
  and exercises, unchanged inside) and is also reached from _Bytt økt_ on I dag.
- **Old addresses keep working** (ADR 0083 §4 stands). Every Sesong and
  Bibliotek URL lands in _Plan_, or in its Bibliotek section, with the _Plan_
  tab marked. A page inside Bibliotek backs out to _Plan_.
- **_Meg_** gains the athlete's **Training Level**, activities, strength
  frequency, **Session Preferences** and the **Autopilot** switch (_Spør meg
  først_, ADR 0100).

### 2. _Plan_ leads with the plan in plain words

In order:

- the plan's plain name, and its family's name small;
- the season as one curve with this week marked (ADR 0090 §1's curve);
- _Legg til et løp_ (ADR 0079 §4);
- _Bytt treningsform_, which shows the **Start Options** again for the plan's
  tracks and days (ADR 0102). Applying one is today's philosophy switch, behind
  its preview (ADR 0079 as built in #505 S7);
- the _Bibliotek_ section;
- a closed _Avansert_ section holding everything else on today's Sesong page,
  unchanged: philosophy, week targets, phases, tracks, the Week Pattern and the
  season chart. ADR 0090 §2's two columns from `lg` apply inside it.

### 3. I dag's default view: today, then this week

In order:

- a top line: the date and the plan's name;
- the **today card**: name, activity, duration, effort word and one plain
  sentence of what to do, with _Gjort_, the **Juster** chips and _Bytt økt_. The
  coach line may live on it;
- the **Autopilot Notice** when there is one (ADR 0100 §5);
- this week as seven rows, with _n av m økter gjort_ in its heading;
- _Se hele sesongen_.

It reads the same ledger and week model the **Home Timeline** reads, so the
week's numbers cannot disagree with the full view. From `lg` up the card and the
week sit side by side.

**The today card is accepted against ADR 0086 §1.** That ADR removed the hero
because its four panes and its fold fought the list. The card is one card, not a
pager, and nothing folds: it is the "today first" block the default view exists
for. "No hero" still holds for the full view.

### 4. The rules on the default view

- **_fri_ on a free day, never _hvile_**, except where the plan prescribes
  recovery (the **Every-Day Grid** rule).
- **Actions by time.** _Gjort_ only on today's session and on past sessions not
  yet done. No done or missed action on a session still ahead. _Marker som ikke
  gjort_ is never a primary action.
- **Every row opens its detail.** A done session with no Workout opens a detail
  that says what is known, never a 404. A free day opens the composer, with the
  same undo as today (ADR 0088).
- **Before the Plan Start Week** the card says when the plan starts and names
  the first session, and the athlete can still add a session today.
- **No plan**: I dag invites the athlete to the simple start (the **First Run**)
  instead of showing an empty calendar.

### 5. The full Home Timeline stays, behind _Se hele sesongen_

The **Week Strip**, the **Stream**, the **Writing Line**, the composer, the Week
Change Card and the autopilot history are kept unchanged as the _Se hele
sesongen_ view. On a large screen it opens the three panes (ADR 0087). It lands
on today (the **Landing Position**, ADR 0086 §4); an empty week months back is
never the first thing it shows.

## Considered options

- **Keep four tabs.** Rejected: _Bibliotek_ is reached when the athlete wants a
  session for today or is shaping the plan, so it belongs beside those. A fourth
  tab is one more place to look.
- **Bring the hero back.** Rejected for ADR 0086's reasons: a pager and a fold
  fight the list. One card answers "what do I do today" and nothing more.
- **Delete the Stream and the strip.** Rejected: an athlete who plans ahead or
  writes sessions relies on them. They move one tap away; nothing is lost.
- **Move pages under new `/plan/…` URLs.** Rejected for ADR 0083's reason: every
  link and bookmark would break for a gain the tab registry already gives.

## Consequences

- ADR 0083, 0086, 0082, 0087 and 0090 carry a note pointing here.
- `docs/design/ui-conventions.md` §3.3's top-level screens become _I dag_,
  _Plan_ and _Meg_; Bibliotek's landing is no longer one.
- The full view's top bar (the Ukeskiftet badge, "+ Ny" and the I dag pill) is
  unchanged. The default view's top line carries only the date and the plan's
  name.
- E2E motion audits for the default view are new (#558 S10); the full view's
  declared-motion list is unchanged.
