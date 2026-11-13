# Qualities

What the product must be besides correct: how fast it is, how it fails, who
can use it, what it leaks, what it tells the people who run it. A user meets
a missing quality as surely as a missing feature (every page that loads
again on the way back, a form that hangs when a service is down), yet no
acceptance criterion names it unless someone writes it down. This file is
that list, for every task that writes, builds, judges or scans.

Each quality has its **measure**: a number or an observation someone else
can repeat. A quality without a measure is a wish.

| Quality | Ask | Measure |
|---|---|---|
| **Speed** | Does each screen fetch only what it needs, once? Is data the user just saw reused, on the way back and across screens that share it? Do requests run side by side rather than one after another (no waterfall)? Does the server ask the database once per list, not once per row (no N+1)? | Data requests per navigation, counted in the browser (a return within the cache window: zero); queries per request; bundle size; time until the screen shows its data. |
| **Failure** | What does the user see when a service is slow, down or says no? Does every outbound call have a timeout, and does a retry stay safe to repeat? Do loading, empty and error states exist where the user can meet them? | The screen with the service stopped or slowed; the call's timeout in the code. |
| **Access** | Can someone use it with the keyboard alone and with a screen reader? Does the text keep its contrast? | axe on each screen QA visits: no `serious` or `critical`; a keyboard-only walk of the flow. |
| **Security** | Does each read and write check who asks and what they own? Does input reach a query, a shell or the page unescaped? Does anything secret reach the client or a log? | The request made as another user, or as nobody; the response and the log. |
| **Insight** | When it fails in production, can someone see what failed, for whom, and why, without a debugger? | The log line or trace the failure leaves, read back. |
| **Data** | Does a migration keep every row, run on a table of production size without locking it, and run before and after the code that needs it? | The migration against seed data shaped like production; a migration linter where the project has one. |

## How each task uses it

- **Spec** names the qualities the change touches, and turns each into an
  acceptance criterion with its measure, starting **Quality:**. The others
  stay unnamed: a quality the change can't move costs nothing to leave out.
- **Implement** builds the measure in where it is cheap: a test that counts
  requests or queries, a timeout beside the call.
- **Review** reads the diff for every quality, named or not: an N+1 or a
  missing timeout is a finding whatever the issue says.
- **QA** measures each **Quality:** criterion like any other, and the
  project's **budgets** on every run.
- **The architecture scan** walks the qualities across the whole product,
  where one change at a time never sees them.

## Budgets

A **budget** is a quality the project measures on every QA run, with its
limit: data requests per navigation on the main flows, axe findings, errors
in the console, bundle size. The project keeps them in
`docs/agents/verify/README.md`, under `## Budgets`, each with the command
that measures it and its limit (`factory-setup`'s `references/verify.md`).
A broken budget fails QA like a failed criterion, whatever the issue asked.
Request counts, query counts and bytes are stable enough to gate on; timings
from a lab run are not, so time stays a finding, never a gate.

## The bar

The phase (`questions.md`, "The bar") sets how far a task goes. Under `poc`,
a quality counts when the people who judge the demo would meet it: a screen
that loads again on every click is one, a missing trace is a debt. Under
`build` and later, every quality the change touches counts, and security and
data hold at every phase.
