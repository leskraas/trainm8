# Open questions and decisions

An open question is anything you, or a skill you run, would check with the
user. Settle each one in this order.

## The bar

Every task recommends and builds the **durable** solution: the one the team
would still choose with a year of hindsight, once the codebase has grown and
the next features sit on top of it. Weigh each option by what it costs over
the product's life: the restructuring the change needs to sit cleanly, the
migration done properly, the test that pins the behaviour, the error path
users will hit. When the durable option costs more this run, name the cost
and pay it. How fast a run finishes breaks ties between options that are
equally sound, and nothing else.

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

- **`door`**: `one-way` when the decision is costly to walk back: a new or
  changed external API, a migration that changes or drops existing data, a
  new dependency or service, a change to an ADR, a default users will build
  on, or something users see that no acceptance criterion names. Everything
  else is `two-way`. When you are weighing which it is, it is `one-way`.
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
