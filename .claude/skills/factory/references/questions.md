# Open questions and decisions

An open question is anything you, or a skill you run, would check with the
user. Settle each one in this order.

## The bar

The project's `phase` (in the settings) sets the bar every task builds to,
and what a mistake costs. Decide at the risk the phase allows: a choice you
leave open costs a human's time, whatever the phase. How fast a run finishes
breaks ties between options the bar rates the same, and nothing else.

- **`poc`**: the project proves an idea, and its code may be thrown away once
  it has. Build the **quickest** solution that shows the idea working to the
  people who judge it: the happy path, end to end, in the running app. Every
  shortcut you take (a hard-coded value, a skipped error state, a strained
  seam, an untested branch) is a **debt**: write it in your comment as a line
  starting `Debt:`, so the move to `build` finds it. A mistake costs a rerun:
  nothing runs in production and nobody relies on it. Be **bold**: take the
  bet you would make, record it, and move on; a wrong guess the demo exposes
  is the PoC doing its job. The bar of `build` still holds where the PoC
  reaches past itself: data someone keeps, a secret, an API or a service
  outside the repo.
- **`build`**, the default: nobody outside the team relies on the product
  yet: data can be reseeded, and every client of its API is ours. Build the
  **durable** solution, the one the team would still choose with a year of
  hindsight, once the codebase has grown and the next features sit on top of
  it. Weigh each option by what it costs over the product's life: the
  restructuring the change needs to sit cleanly, the migration done properly,
  the test that pins the behaviour, the error path users will hit. When the
  durable option costs more this run, name the cost and pay it. A mistake
  costs rework that grows with what is built on it: **decide**.
- **`live`**: users and their data are there, and the product still grows.
  The bar of `build`, and a mistake is an incident. Make each change
  **reversible**, then decide: a change users see behind a release flag that
  is off, a migration as expand now and contract in a later issue, a new API
  version beside the old one.
- **`maintain`**: users rely on what the product does today, and few changes
  are ahead. Build the **surgical** solution: the smallest change that fixes
  the cause, keeps every behaviour no criterion names exactly as it is, and
  that a reviewer can trust at a glance. A mistake breaks something users
  rely on. Be **careful**: take the smallest change you can walk back, pin
  today's behaviour with a test before you change it, and still finish the
  issue.

What the bar asks of each task:

| Task | `poc` | `build` | `live` | `maintain` |
|---|---|---|---|---|
| spec | The happy path the idea must prove, in at most five criteria; error and empty states are out of scope unless the demo meets them. Plan `design` only when the look is what is judged, and `architecture` only for a one-way door. | Solve the problem properly for the user: the error and empty states they will meet, the data that must survive, the cases next to the happy path. | As `build`, and a criterion for what happens to existing users and their data. | The change, and as criteria the behaviour next to it that must stay as it is. |
| design | One variant, the plainest that shows the idea. | As `design.md` says. | As `build`; a new way to do something users already know is a one-way door. | The existing patterns; a new one is a one-way door. |
| architecture | Settle one-way doors only; a strained seam is a debt in your comment. | Name every strained seam with its restructuring, for the build to make. | As `build`, and the rollout: the flag, the expand and contract steps, their order. | Restructure only where the change cannot sit cleanly without it; the rest becomes a proposal in your comment. |
| implement | A test that drives the happy path end to end. | Make the restructuring the change needs to sit cleanly, so the new code reads as if the structure had always held it, and a test that fails without each criterion. | As `build`, behind a flag that is off when users see the change, with tests for the flag off and on, and a migration both the old and the new code run against. | The smallest diff; a failing test first for the change and for the behaviour beside it. |
| review | Back to `implement` only for a high or critical finding on the happy path, a secret or a one-way door; the rest are debts in your comment. | As `review.md` says. | Also back for a change users see without a flag, a migration the old code can't run against, or a broken client of the API. | Also back for any behaviour the diff changes that no criterion names. |
| scans | Propose only what blocks the next demo. | As the scan's file says. | As `build`, and the flags older than two weeks and the contract steps still waiting. | Propose only what lowers risk or running cost. |

A human sets the phase in `docs/agents/factory.md`, and the retro proposes a
move when the signs say so (`retro.md`). When it moves from `poc` to `build`,
the debts the PoC named are the first work: `/factory --scan architecture`
reads the `Debt:` lines in the runs' comments and proposes the hardening.

## 1. Probe

When the answer is a fact you could observe by running something (how the app
behaves, what a layout looks like, how fast something is, what a library
does), settle it with a probe: a script, a test, a look at the code, or a
throwaway prototype. Note it in your comment as "Settled by probe: <the
question>, <what you ran>, <what it showed>".

## 2. Decide

What remains is a product or preference call, a one-way door, or a fact only
a human knows. Decide it: take the answer you would recommend to a human,
chosen by **The bar**, and return it as a decision. A fact only a human knows
becomes a decision on the assumption you would bet on, saying it is one. A
step only a human can take (a cloud console, DNS, a secret) never stops you:
build what you can, leave it switched off, and return the step in
`human_steps`; `apply` collects them in one issue for a human. You
decide at every autonomy level; the conductor decides from `autonomy` which
decisions wait for a human before the issue goes on.

**Make it two-way.** Before a one-way door becomes a wait, make it reversible
where you can: a change users see behind a release flag that is off, a
migration as expand now and contract in a later issue, a new API version beside
the old one. A door you made reversible is `two-way`; say how in `reason`.

A decision in `decisions`:

```json
{
  "title": "Drop the legacy column",
  "answer": "drop it in this PR",
  "reason": "nothing reads it since ADR-0012",
  "rejected": "keep it, which costs a second migration later",
  "door": "one-way",
  "locks": "the data in that column",
  "owner": "dev",
  "approved_by": null
}
```

- **`door`**: `one-way` when the decision is costly to walk back given what
  relies on it today. The usual cases: a migration on existing data, a new or
  changed external API, a default users build on, something users see that no
  acceptance criterion names, a new dependency or service, a change to an ADR.
  Check each against the phase: before anyone outside the team relies on the
  product (`poc`, `build`), a migration, an API and a default are `two-way`; a
  new dependency, a service and an ADR change bind the team, and stay
  `one-way` outside `poc`. When you are weighing which it is: `two-way` under
  `poc` and `build`; under `live`, make it reversible, then `two-way`, else
  `one-way`; `one-way` under `maintain`. The conductor also finds migrations,
  new dependencies, changed ADRs and the project's `door-paths` in the diff,
  and holds the merge for those the phase counts.
- **`locks`**: for a one-way door, what it locks in, in a few words.
- **`owner`**: `po` when the answer changes what the product does for
  someone, `dev` when it changes how it is built.
- **`approved_by`**: on a resumed run, the login of the human who approved a
  one-way door in a comment. "Yes" approves every recommendation. When they
  chose another answer, return the decision with their answer and their login.

Record only decisions a reviewer would want to see: a choice between real
alternatives. A name the glossary already fixes, a merge method or a number is
no decision. Name each decision in your comment too.

## Blocked

A block is no question: the run cannot go on whatever anyone decides (an app
that won't start, a missing credential, a tool the environment refuses).
Return `blocked` with `questions`: what blocks, what you tried, and how a human
unblocks it, with your recommendation.

Route around a block where you can, and return `blocked` only when nothing of
the issue can be built:

- **`poc`**: a stand-in, written as a debt: a fake for a missing service or
  credential, seed data for a missing source, so the idea runs end to end.
- **`build`**: a fake adapter behind a seam, which the durable design has
  anyway; the real setup goes in `human_steps`.
- **`live`** and **`maintain`**: stand-ins only in tests. Build what you can,
  leave it switched off, and put the rest in `human_steps`.
