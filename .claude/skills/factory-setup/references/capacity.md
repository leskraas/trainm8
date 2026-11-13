# Capacity

The factory runs on someone's Claude subscription, and shares its five-hour
and weekly limits with everything else that person does. Size it to the
subscription, or it spends the week's quota in a day and then stands still.

What Bredvid/tavla showed in its first week: fifteen sessions in parallel
spent a five-hour limit in two and a half hours and the weekly limit in 27
hours. A full vertical slice (spec, design, architecture, build, review, QA)
took 1.5–2.5M tokens, the design task about 0.5M of it.

## Recommend, then let the human pick

1. Ask which subscription the factory's runs bill to (the account the
   scheduled tasks run as, or the person's own under `tracker: local`), and
   whether that person also codes on it.
2. Recommend the row below, halving `parallel` (at least 1) when they code
   on it at the same time as the factory runs. Someone who starts each run
   by hand and waits for it, as under `tracker: local`, may keep the full
   row. Say it in one line, such as "parallel: 2, build-parallel: 1,
   scan-every: 10, for a Team premium seat you also code on; higher runs
   faster but reaches the five-hour limit sooner".
3. Write what the human picks. When they pick above their row, warn once with
   the Bredvid/tavla numbers above, and write their numbers anyway.

| Subscription | `parallel` | `build-parallel` | `scan-every` | Scheduled task |
|---|---|---|---|---|
| Pro | 1 | 1 | 0 (off) | none: run `/factory` by hand |
| Max 5x | 2 | 1 | 20 | every 3 hours, `/factory-dispatch` |
| Max 20x | 3 | 2 | 10 | every hour, `/factory-dispatch` |
| Team or Enterprise, premium seat | 3 | 2 | 10 | every hour, `/factory-dispatch` |
| API key, billed per token | 4 | 2 | 10 | every hour, `/factory-dispatch` |

The repo can cap `parallel` lower than the subscription does: a dev server
on fixed ports, or one dev stack per machine, lets one QA or design scan run
at a time (`serial`), and a machine runs only so many builds at once.

## Work in progress

`wip` caps the issues in flight at once, so the free sessions go to finishing
what is started before new features begin. It defaults to `parallel`.
Recommend `build-parallel` when the subscription is tight (Max 5x, or the
owner codes on it), so a five-hour window finishes one or two features instead
of moving many a step each.

## Budget

`budget` is a cost stop: how many tokens one issue may spend, its PR
included, before a human looks at it, which also catches an issue that goes
in circles. Recommend 6000000 whatever the subscription, since a full slice
took 1.5–2.5M tokens; more for a design-heavy product, less for one without
UI.

## Usage reserve

`usage-reserve` is the share of the subscription's limits the factory leaves
to its owner (`/factory`'s `references/usage.md`). Recommend `30%` when the owner
codes on the same subscription every day, and the default `10%` when the
factory has it to itself.

## After a week

These are starting points. Read the log issue (`Factory log`; under
`tracker: local`, the `local-*` issue labelled `agent:log`): the tokens per
issue in the close logs, and how often runs stopped on a usage limit. Raise
`parallel` when nothing stopped and the queue still had work; lower it when runs
stopped. A product without UI can drop `design` from `scans`.
