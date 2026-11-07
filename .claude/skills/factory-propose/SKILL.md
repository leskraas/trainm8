---
name: factory-propose
description: "Propose the factory's three best next steps from the vision, the backlog, the maps and the scans' proposals, as one questionnaire for the PO. Drafts `docs/product/vision.md` when it is missing."
disable-model-invocation: true
---

You keep the factory moving between issues. Each run proposes the **three best next steps** to the PO, as one issue labelled `agent:proposal`, and starts the steps the PO chose last time. Run it on request in a clone of the target repo; a weekly routine runs it the same way (Q11).

Below, `$D` means `python3 <base directory>/../factory/scripts/conductor.py`. Every GitHub call is `gh api` on the REST API, or `$D list`, which wraps it, as in `/factory`: a cloud session blocks GraphQL, and with it `gh issue`, `gh pr` and `gh search`, and refuses the next links `gh api --paginate` follows ([`factory-setup`'s `references/runtime.md`](../factory-setup/references/runtime.md)). `<o>/<r>` is the repo: the last two parts of `git remote get-url origin`, without `.git`; its default branch is `gh api repos/<o>/<r> --jq .default_branch`. Write every body to a file and pass it as `-F body=@<file>`, so the shell never runs what issue text holds. Read `AGENTS.md`, `CLAUDE.md`, `docs/agents/*.md` and the glossary first; their rules bind you. Without `docs/agents/factory.md`, stop and point the human at `/factory-setup`. Under `tracker: local` (`$D config`), issues live in the clone's tracker folder: open each issue below with `$D new <o>/<r> --title <title> --body-file <file> --me <login> [--label <label>]`, read one with `$D fetch`, and label one on the `Labels:` line of its `issue.md` (the `factory` skill's `references/config.md`, "A local issue").

## 1. Start what the PO chose

Find the last proposal: `$D list 'repos/<o>/<r>/issues?labels=agent:proposal&state=all' | jq '[.[] | select(.pull_request == null and (.body // "" | contains("<!-- factory-propose -->")))] | max_by(.created_at) | .number'`, then read it and its comments with `$D fetch <o>/<r> <number> --me <me>`.

- **Open**: the PO hasn't answered. Link it, end with the handoff (step 6), and stop; one open proposal at a time.
- **Closed, answered**: only an answer from someone with write access to the repo counts, as in `/factory`: the comment's `association` (as `$D fetch` prints it) is `OWNER`, `MEMBER` or `COLLABORATOR`. A proposal closed without such an answer starts nothing. For each step that person accepted ("yes" accepts the recommended ones), add `agent:spec` to its backlog issue (`gh api -X POST repos/<o>/<r>/issues/<n>/labels -f 'labels[]=agent:spec'`), or open a new issue with the step as body and that label (`gh api -X POST repos/<o>/<r>/issues -f title=<title> -F body=@<file> -f 'labels[]=agent:spec' --jq .number`). Skip a step that already carries an `agent:*` label other than `agent:proposal`.
- **None**: go on.

Done when every accepted step has an issue labelled `agent:spec`. Name them in your report, with the handoff for each (step 6).

## 2. Make sure there is a vision

The vision is `docs/product/vision.md`, owned by the PO human (Q10, Q37). When it exists, read it and go to step 3.

When it is missing, draft it from the README, the open `wayfinder:map` issues (destination and decisions so far) and the glossary:

```markdown
# Vision

**For whom:** <the users, in the glossary's words>

**The problem:** <what they can't do today, and what it costs them>

**The goal:** <what is true for them when the product works, in 1–3 lines>

**Not now:** <what the product deliberately leaves out>

**Next horizon:** <the next one or two big moves, from the maps>
```

Write only what the sources say, and mark every inference with "(draft: assumed)". Open a PR labelled `agent` that adds the file (`gh api -X POST repos/<o>/<r>/pulls -f head=<branch> -f base=<default> -f title=<title> -F body=@<file>`), and propose from the draft. The proposal issue says the vision is a draft and links the PR.

## 3. Gather the candidates

- **Backlog**: open issues without an `agent:*` label, with their labels, age and reactions, from `$D list 'repos/<o>/<r>/issues?state=open'`. That list holds PRs too; drop those with `.pull_request`.
- **Maps**: the frontier of each open `wayfinder:map` (open, unblocked, unclaimed children).
- **Scans**: open issues labelled `agent:proposal` that a scan filed (their body ends with `<!-- agent:proposal-from <scan> -->`), and the scans' latest reports on the log issue (labelled `agent:log`).

Done when each candidate has a one-line summary and its source.

## 4. Pick the top three

Rank by how far a step moves the product toward the vision's goal, against its size. Prefer a step that unblocks others, and a finding that gets costlier the longer it waits. One feature at a time (Q16): a step that runs beside a feature already in the factory comes last.

Done when you hold three steps, each with what it is, why now, its size (S/M/L), and its source.

## 5. Ask the PO

Find the PO in the `factory` block (`$D config`: `po`, else `fallback`). Open one issue titled "Next steps (factory-propose)", labelled `agent:proposal` and assigned to the PO, with `<!-- factory-propose -->` as the body's last line. Under a short **Context** and a **How to answer** line (answer under each question and close the issue; "yes" accepts the recommendation), ask one question per step, each under its own heading, "Should the factory take <step>?", recommended "Yes" for the steps you'd take first, each with its reason, size and source. Put the vision's goal, and the draft PR when there is one, under **Context**.

Then get the answers:

- **The PO is in this session** (an interactive run, and the human is the PO or speaks for them): ask the three questions here, with the AskUserQuestion tool when it is available, each with its recommendation first. Post the answers as one comment on the proposal, opening with "Answered in a Claude session by <login>", close the proposal, and run step 1 on it now.
- **Otherwise**, the PO answers on GitHub, and the next `/factory-propose` run starts the steps they accepted.

Done when the proposal is answered and its steps started, or it is assigned and waits for the PO.

## 6. Report

In the human's language: the proposal's link, the three steps, and for each started step its issue. End with the **handoff** from `/factory`'s [references/handoff.md](../factory/references/handoff.md), with `schedule` from `$D config`:

- Steps started: **Automatic** is when `/factory` takes each `agent:spec` issue; **You** is "nothing" under `schedule: hourly`, else "type `/factory`", and **After that** says the factory writes each spec, then builds it, and stops for a human only where the project's `autonomy` says.
- Proposal waiting: **Automatic** is "nothing"; **You** is the two actions in order: answer under each question in the proposal and close it, then type `/factory-propose`; **After that** says that run opens an `agent:spec` issue for each step accepted, and what `/factory` then does with them.
