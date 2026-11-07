#!/usr/bin/env python3
"""The factory's deterministic half (ADR-0011).

Agents do the work of a task and return a JSON result. This script does
everything else: it reads GitHub, says what can run, claims a task by
deleting its label, writes each result back (push, PR, comment, decisions,
labels, proposals, evidence), merges, and logs. All state lives on the
tracker: `agent:*` labels, one comment per run carrying an `agent:run`
marker, and `## Decisions` in the issue body.

The tracker is GitHub Issues (`tracker: github`, the default), or folders
in the repo's scratch directory (`tracker: local`): issues then live in
`<tracker-dir>/<key>-<slug>/factory/`, keyed `seal-522`, while PRs, CI and
merges stay on GitHub. A number is a GitHub issue or PR, a key a local issue.

Every GitHub call is `gh api` on the REST API: a cloud session blocks
GraphQL, and the cloud proxy refuses the next links `gh api --paginate`
follows, so listings page themselves.

Usage:
  conductor.py labels <o>/<r>                      # create the labels the factory uses
  conductor.py queue <o>/<r> --me <login> [--max N] [--skip 3,5] [--only N | --scan <scan>]
  conductor.py dispatch <o>/<r> --me <login> [--live 208,design-scan]  # what each new session takes
  conductor.py sessions <o>/<r>                    # the sessions /factory-dispatch started
  conductor.py claim <o>/<r> <n> --label <label> --me <login>
  conductor.py fetch <o>/<r> <n> --me <login> [--for <task>]  # an issue or PR, as a task reads it
  conductor.py apply <o>/<r> <result.json> --me <login> --from <label> [--repo-dir .]
  conductor.py merge <o>/<r> <pr> --me <login> [--label <label>]
  conductor.py update <o>/<r> <pr> --me <login> --label <label> --resume qa|merge
                                                   # bring a PR up to date without a run, when it can
  conductor.py release <o>/<r> <n> --me <login>    # give a stale run's task back
  conductor.py log <o>/<r> <issue> --me <login>    # the close log, for an issue merged by hand
  conductor.py note <o>/<r> <file> [--session <for>=<id> ...]  # post a report on the log issue
  conductor.py migrate <o>/<r> [--dry-run]         # factory:* labels to agent:*
  conductor.py new <o>/<r> [<key>] --title <t> --body-file <f> --me <login> [--label <label>]
                                                   # a local issue (tracker: local); local-<n> without a key
  conductor.py list <repos/<o>/<r>/...>            # every page of a REST listing
  conductor.py config [--for <task>]               # the parsed factory block, or a task's part

Every command reads the project's settings from `--config`
(docs/agents/factory.md by default).
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlsplit

# ── Vocabulary ──────────────────────────────────────────────────────────────

ISSUE_TASKS = ["explore", "spec", "design", "architecture", "implement"]
PR_TASKS = ["implement", "update-branch", "review", "qa", "merge"]
SCANS = ["architecture-scan", "design-scan", "retro"]
AGENT_TASKS = ["explore", "spec", "design", "architecture", "implement",
               "review", "qa", "update-branch"] + SCANS  # run by a subagent
TASKS = AGENT_TASKS + ["merge"]
CHAIN = ["explore", "spec", "design", "architecture", "implement", "update-branch",
         "review", "qa", "merge"]  # furthest along first, when choosing

PREFIX = "agent:"
IN_PROGRESS = "agent:in-progress"
NEEDS_HUMAN = "agent:needs-human"
BLOCKED = "agent:blocked"
PROPOSAL = "agent:proposal"
LOG = "agent:log"
PR_LABEL = "agent"
# The triage role "fully specified, ready for an agent". `main` sets the
# repo's own string for it from `docs/agents/triage-labels.md`.
ENTRY = "ready-for-agent"

# A local issue's key: the tracker's id (SEAL-522) or the factory's own
# (local-7), lowercased. A GitHub issue or PR is a number.
KEY = r"[a-z][a-z0-9]*-\d+"
REF = rf"(\d+|{KEY})"  # what follows the `#` of a reference


def item_id(text):
    """A GitHub number as an int, a local key as lowercase text."""
    text = str(text).strip().removeprefix("#")
    if text.isdigit():
        return int(text)
    if re.fullmatch(KEY, text, re.I):
        return text.lower()
    raise ValueError(f"not an issue number or a key like SEAL-522: {text!r}")


def is_local(n):
    return isinstance(n, str)


def order(n):
    """Sorts GitHub numbers and local keys together: numbers first, then keys
    by prefix and number."""
    if isinstance(n, int):
        return (0, "", n)
    prefix, _, number = n.rpartition("-")
    return (1, prefix, int(number))

LABELS = {
    **{PREFIX + t: ("5319E7", f"Ask the factory to run {t}") for t in
       ["explore", "spec", "design", "architecture", "implement", "review", "qa",
        "update-branch", "merge"]},
    IN_PROGRESS: ("FBCA04", "A factory run is working on this now"),
    NEEDS_HUMAN: ("D93F0B", "The factory waits for a human: see its last comment"),
    BLOCKED: ("B60205", "A factory run cannot go on: see its last comment"),
    PROPOSAL: ("0E8A16", "A scan proposes this; set agent:spec to build it"),
    LOG: ("C5DEF5", "The factory's log: what unattended runs and scans did"),
    PR_LABEL: ("5319E7", "Opened by the factory"),
}

# Labels only an issue carries. Under `tracker: local` they live in the
# issue's files, so GitHub, which holds only the PRs, never gets them.


def github_labels(kind):
    """The labels the tracker `kind` needs on GitHub: none under a local
    tracker, which keeps a PR's labels in the tracker directory too."""
    return list(LABELS) if kind == "github" else []


# Per issue, counted since a human last lifted a limit.
MAX_RUNS = 25
MAX_RETURNS = 3          # back to implement
MAX_QA_FAILURES = 3      # on one acceptance criterion
DEFAULT_BUDGET = 6_000_000
LOCK_LIFETIME = timedelta(hours=6)
CHECKS_GRACE = timedelta(minutes=10)  # a fresh head with no checks yet may still get them
LOG_WINDOW = timedelta(days=30)
SESSION_WINDOW = timedelta(days=7)  # how far back /factory-dispatch looks for its sessions

AUTONOMY = ("supervised", "doors", "full")


def doors_wait(level):
    """Whether a one-way door waits for a human at this autonomy level."""
    return level in ("doors", "supervised")
AUTONOMY_ALIASES = {"gated": "supervised"}
MERGE = ("human", "agent")
MERGE_METHODS = ("merge", "squash", "rebase")

WRITE_ACCESS = {"OWNER", "MEMBER", "COLLABORATOR"}

TITLE = {
    "explore": "Explore", "spec": "Spec", "design": "Design", "architecture": "Architecture",
    "implement": "Implement", "update-branch": "Update branch", "review": "Review", "qa": "QA",
    "merge": "Merge", "architecture-scan": "Architecture scan", "design-scan": "Design scan",
    "retro": "Retro",
}

# ── Config ──────────────────────────────────────────────────────────────────

CONFIG_BLOCK = re.compile(r"```factory\n(.*?)```", re.S)


def read_config(text):
    """The `factory` block of the project's `docs/agents/factory.md`, as a
    dict of strings. A `# comment` after a value and a leading `@` on a login
    are dropped. Old keys are read under their new names."""
    match = CONFIG_BLOCK.search(text or "")
    if not match:
        return {}
    config = {}
    for line in match.group(1).splitlines():
        if ":" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split(":", 1)
        value = value.split(" #", 1)[0].strip()
        config[key.strip()] = value.removeprefix("@")
    if "token-budget" in config and "budget" not in config:
        config["budget"] = config.pop("token-budget")
    return config


def autonomy(config):
    value = config.get("autonomy", "doors")
    value = AUTONOMY_ALIASES.get(value, value)
    if value not in AUTONOMY:
        raise ValueError(f"autonomy must be one of {', '.join(AUTONOMY)}, not {value!r}")
    return value


SCHEDULES = ("hourly", "none")


def schedule(config):
    """`hourly` when a scheduled task runs `/factory-dispatch` every hour, else `none`:
    then nothing runs until someone types `/factory`."""
    value = config.get("schedule", "none")
    if value not in SCHEDULES:
        raise ValueError(f"schedule must be one of {', '.join(SCHEDULES)}, not {value!r}")
    return value


def merge_policy(config):
    value = config.get("merge") or ("human" if autonomy(config) == "supervised" else "agent")
    if value not in MERGE:
        raise ValueError(f"merge must be one of {', '.join(MERGE)}, not {value!r}")
    return value


def merge_method(config):
    value = config.get("merge-method", "merge")
    if value not in MERGE_METHODS:
        raise ValueError(f"merge-method must be one of {', '.join(MERGE_METHODS)}, not {value!r}")
    return value


MODELS = ("haiku", "sonnet", "opus", "fable")
EFFORTS = ("low", "medium", "high", "xhigh", "max")
# Parts of a task that can take their own model or effort, beside the tasks.
PARTS = ("review-read", "review-fix")


def per_task(config, key, allowed):
    """`models` or `effort`: `task=value` pairs, `*` for every task not named.
    Returns the dict as written, checked."""
    pairs = {}
    for part in config.get(key, "").split(","):
        if not part.strip():
            continue
        if "=" not in part:
            raise ValueError(f"{key} takes task=value pairs, not {part.strip()!r}")
        name, value = (s.strip() for s in part.split("=", 1))
        if name != "*" and name not in TASKS and name not in PARTS:
            name = name if name in TASKS else f"{name}-scan"
            if name not in TASKS:
                raise ValueError(f"{key} names an unknown task: {part.split('=')[0].strip()}")
        if value not in allowed:
            raise ValueError(f"{key} values are {', '.join(allowed)}, not {value!r}")
        pairs[name] = value
    return pairs


def run_settings(config, task):
    """The model and effort the orchestrator gives a task's subagent: the
    task's own, else `*`, else nothing (the subagent inherits the session's).
    Review's parts fall back to review's."""
    picked = {}
    for key, allowed, out in (("models", MODELS, "model"), ("effort", EFFORTS, "effort")):
        pairs = per_task(config, key, allowed)
        base = "review" if task in PARTS else task
        value = pairs.get(task) or pairs.get(base) or pairs.get("*")
        if value:
            picked[out] = value
    return picked


def number_setting(config, key, default):
    try:
        return int(str(config.get(key, default)).replace("_", "").replace(",", ""))
    except ValueError:
        raise ValueError(f"{key} must be a whole number, not {config.get(key)!r}")


def scans_enabled(config):
    listed = config.get("scans", ", ".join(SCANS))
    names = {s.strip() for s in listed.split(",") if s.strip()} - {"none"}
    names = {n if n.endswith("-scan") or n == "retro" else f"{n}-scan" for n in names}
    unknown = names - set(SCANS)
    if unknown:
        raise ValueError(f"unknown scans: {', '.join(sorted(unknown))}")
    return [s for s in SCANS if s in names]


def addressee(config, owner):
    """Who a wait is for: `po` for product calls, `dev` for the rest."""
    return config.get(owner) or config.get("fallback")


# ── Time ────────────────────────────────────────────────────────────────────

def parse_time(stamp):
    return datetime.fromisoformat(stamp.replace("Z", "+00:00"))


def stamp(when):
    return when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── Markers ─────────────────────────────────────────────────────────────────
# `<!-- agent:<kind> key=value ... -->`. A marker without its required fields,
# such as an example pasted from the docs, is not state.

MARKER = re.compile(r"<!--\s*agent:([a-z-]+)((?:\s+[a-z-]+=\S*)*)\s*-->")
REQUIRED = {
    "run": ("task", "outcome", "next", "tokens", "at"),
    "wait": ("reason", "resume", "at"),
    "scan": ("kind", "at"),
    "session": ("id", "for", "at"),
    "log": (),
}


def markers_in(comment, kind=None):
    found = []
    for match in MARKER.finditer(comment["body"]):
        fields = dict(pair.split("=", 1) for pair in match.group(2).split())
        fields["kind_"] = match.group(1)
        fields["comment_at"] = comment["createdAt"]
        if kind is not None and fields["kind_"] != kind:
            continue
        if fields["kind_"] not in REQUIRED:
            continue
        if any(key not in fields for key in REQUIRED[fields["kind_"]]):
            continue
        try:
            if "tokens" in fields:
                int(fields["tokens"])
            if "at" in fields:
                parse_time(fields["at"])
        except ValueError:
            continue
        found.append(fields)
    return found


def markers(comments, kind=None):
    """Every marker in comments from people with write access, oldest first.
    The factory writes as one of them; anyone else's marker is only text."""
    ordered = sorted((c for c in comments if c.get("association") in WRITE_ACCESS),
                     key=lambda c: parse_time(c["createdAt"]))
    return [m for c in ordered for m in markers_in(c, kind)]


def trusted(comments, me):
    """The comments `me` or someone with write access wrote. The rest are
    data for a task to read, never state or answers."""
    return [c for c in comments if c["author"] == me or c.get("association") in WRITE_ACCESS]


def is_factory_comment(comment):
    """A comment carrying a well-formed `agent:` marker. Quoting `<!-- agent:`
    in prose is not enough."""
    return MARKER.search(comment["body"]) is not None


def human_after(comments, me, when):
    """Comments a person with write access wrote after `when`, other than the
    factory's own run comments. The person running the factory counts too:
    the factory writes as them, and its comments carry markers theirs don't."""
    return [c for c in comments
            if c.get("association") in WRITE_ACCESS
            and not is_factory_comment(c) and parse_time(c["createdAt"]) > when]


# ── What a task sees ────────────────────────────────────────────────────────
# A task reads its item through `fetch --for <task>`: enough to do the task,
# and nothing that argues it toward an earlier run's conclusion. Humans'
# comments and the issue body always stay. Of the factory's own comments a
# task sees the runs named below, the wait it resumes, and, for implement,
# everything since its own last run. Review and QA judge the PR cold, so the
# builder's PR body is out of their view.

SEES_RUNS = {
    "explore": set(),
    "spec": {"explore", "spec"},
    "design": {"design"},
    "architecture": {"architecture"},
    "implement": None,  # every factory comment after its own last run
    "review": set(),
    "qa": set(),
    "update-branch": set(),
}
COLD = {"review", "qa"}
REFRESH_BODY = {"implement", "update-branch"}  # tasks that see the PR body and may rewrite it

# The settings each task's brief carries, beside `autonomy`.
TASK_SETTINGS = {
    "explore": ["start"],
    "spec": [],
    "design": ["design"],
    "architecture": [],
    "implement": ["check", "regenerate"],
    "review": ["check"],
    "qa": ["start", "deploy-check"],
    "update-branch": ["check", "regenerate"],
    "architecture-scan": [],
    "design-scan": ["start"],
    "retro": [],
}


def view(item, task, me):
    """The item as `task` should read it: the comments it sees, the PR body
    only when it is not cold, and `hidden` saying what was left out. A
    comment is the factory's only when `me` or someone with write access
    wrote it; anyone else's marker is text, so it can neither hide a run's
    findings nor stand in for one."""
    if task not in SEES_RUNS:
        raise ValueError(f"no view for task {task!r}")
    comments = sorted(item["comments"], key=lambda c: parse_time(c["createdAt"]))

    def ours(c):
        return (c["author"] == me or c.get("association") in WRITE_ACCESS) and is_factory_comment(c)

    since = None
    if SEES_RUNS[task] is None:
        own = [c for c in comments
               if ours(c) and any(m["task"] == task for m in markers_in(c, "run"))]
        since = parse_time(own[-1]["createdAt"]) if own else None
    kept, hidden = [], 0
    for c in comments:
        if not ours(c):
            kept.append(c)
            continue
        runs = {m["task"] for m in markers_in(c, "run")}
        resumes = any(w["resume"] == task for w in markers_in(c, "wait"))
        if SEES_RUNS[task] is None:
            seen = since is None or parse_time(c["createdAt"]) >= since
        else:
            seen = bool(runs & SEES_RUNS[task])
        if seen or resumes:
            kept.append(c)
        else:
            hidden += 1
    cold = task in COLD and item["kind"] == "pr"
    out = {**item, "comments": kept, "body": "" if cold else item["body"]}
    out["hidden"] = {"factory_comments": hidden, "pr_body": cold}
    return out


def task_settings(config, task):
    if task not in TASK_SETTINGS:
        raise ValueError(f"no settings for task {task!r}")
    picked = {"autonomy": autonomy(config)}
    picked.update({k: config[k] for k in TASK_SETTINGS[task] if k in config})
    return picked


# ── Items ───────────────────────────────────────────────────────────────────

LINKS = re.compile(rf"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#{REF}\b", re.I)
DEPENDS = re.compile(rf"\b(?:blocked by|depends on)\b:?((?:\s*,?\s*(?:and\s+)?#(?:\d+|{KEY}))+)", re.I)


def closes(body):
    """The issues a PR body closes with one of GitHub's keywords."""
    return [item_id(n) for n in LINKS.findall(body or "")]


ISSUE_OF_PR = re.compile(rf"<!--\s*agent-issue:\s*{REF}\s*-->", re.I)


def pr_issue(body):
    """The issue a PR is for: the factory's own marker, else the first issue
    its body closes (a PR that closes a parent and its tickets names the
    parent first)."""
    match = ISSUE_OF_PR.search(body or "")
    if match:
        return item_id(match.group(1))
    found = closes(body)
    return found[0] if found else None


def only_closes(body, n):
    """A PR body that closes issue `n` and no other: other closing keywords
    become plain references, so merging never closes an issue by accident."""
    def keep(match):
        return match.group(0) if item_id(match.group(1)) == n else f"Refs #{match.group(1)}"
    return LINKS.sub(keep, body or "")


def factory_pr_body(text, n):
    """The PR body as the factory writes it: closing issue `n` and no other,
    with the marker that binds the PR to its issue at the end. A local issue
    gets the marker alone: GitHub can't close it, and a tracker's key after a
    closing word may close the tracker's ticket on merge."""
    body = only_closes(text, n)
    body = re.sub(rf"(?im)^\s*closes #{re.escape(str(n))}\s*$|<!--\s*agent-issue:\s*\S+?\s*-->",
                  "", body).rstrip()
    if is_local(n):
        return f"{body}\n\n<!-- agent-issue: {n} -->\n"
    return f"{body}\n\nCloses #{n}\n<!-- agent-issue: {n} -->\n"


def dependencies(body):
    found = []
    for group in DEPENDS.findall(body or ""):
        found += [item_id(n) for n in re.findall(rf"#{REF}", group, re.I)]
    return found


def labels_of(item):
    return set(item["labels"])


def trigger(item):
    """The `agent:<task>` label on an item, the one furthest along."""
    names = labels_of(item)
    tasks = [t for t in CHAIN if PREFIX + t in names]
    return tasks[-1] if tasks else None


def last_wait(comments):
    waits = markers(comments, "wait")
    return waits[-1] if waits else None


def answered(item, me):
    """The latest wait on the item, once a human has answered it in a comment.
    None while it waits."""
    wait = last_wait(item["comments"])
    if not wait:
        return None
    if human_after(item["comments"], me, parse_time(wait["at"])):
        return wait
    return None


def history(issue, pr):
    """Run markers on the issue and its PR, oldest first."""
    comments = (issue or {}).get("comments", []) + (pr or {}).get("comments", [])
    return markers(comments, "run")


def since_limit_lifted(issue, pr, me):
    """The run markers that count toward the limits. A human who answers a
    limit takes responsibility for another lap, so counting restarts."""
    comments = (issue or {}).get("comments", []) + (pr or {}).get("comments", [])
    runs = markers(comments, "run")
    limits = [w for w in markers(comments, "wait") if w["reason"] == "limit"]
    if not limits:
        return runs
    lifted = None
    for wait in limits:
        if human_after(comments, me, parse_time(wait["at"])):
            lifted = parse_time(wait["at"])
    if lifted is None:
        return runs
    return [r for r in runs if parse_time(r["at"]) > lifted]


def plan_of(issue):
    """The tasks spec planned before implement. Read from the latest spec
    run's marker; from the body only when its author has write access, since
    anyone else can edit their own issue after a collaborator labelled it.
    None (every task runs) when neither says."""
    if not issue:
        return None
    specs = [m for m in markers(issue.get("comments", []), "run")
             if m["task"] == "spec" and "plan" in m]
    if specs:
        return [t for t in specs[-1]["plan"].split(",") if t and t != "none"]
    if issue.get("association") not in WRITE_ACCESS:
        return None
    match = re.search(r"<!--\s*agent-plan:\s*([^>]*?)\s*-->", issue.get("body", ""))
    if not match:
        return None
    return [t.strip() for t in match.group(1).split(",") if t.strip()]


# ── Transitions ─────────────────────────────────────────────────────────────

def next_after_spec(plan):
    for task in ("design", "architecture"):
        if plan is None or task in plan:
            return task
    return "implement"


def default_next(task, plan):
    return {
        "explore": "spec",
        "spec": next_after_spec(plan),
        "design": "architecture" if plan is None or "architecture" in plan else "implement",
        "architecture": "implement",
        "implement": "review",
        "update-branch": "review",
        "review": "qa",
        "qa": "merge",
    }.get(task)


ALLOWED_NEXT = {
    "explore": {"spec", "implement"},
    # review and qa only when spec rewrote a criterion of an issue with a PR
    "spec": {"design", "architecture", "implement", "review", "qa"},
    "design": {"architecture", "implement"},
    "architecture": {"implement"},
    "implement": {"review"},
    "update-branch": {"review", "qa", "merge"},
    "review": {"qa"},
    "qa": {"merge"},
}
ALLOWED_BACK = {
    "design": {"spec"},
    "architecture": {"spec", "design"},
    "implement": {"spec", "design", "architecture"},
    "review": {"implement", "spec"},
    "qa": {"implement", "review"},
    "update-branch": {"implement"},
}
# Tasks whose decision on an acceptance criterion sends the issue to spec
# before QA judges the old text.
CRITERION_TASKS = {"architecture", "implement", "review"}
# A token count this round was guessed, not read from the Agent tool.
ROUND_TOKENS = 10_000
ON_PR = {"update-branch", "review", "qa", "merge"}


def reviewed_head(pr):
    """True when the PR's latest code-changing or reviewing run is a review
    that went forward at the PR's current head."""
    for run in reversed(markers((pr or {}).get("comments", []), "run")):
        if run["task"] in ("implement", "update-branch", "review"):
            return run["task"] == "review" and run["outcome"] == "forward" \
                and run.get("head") == (pr or {}).get("head")
    return False


def limit_hit(runs, task, outcome, target, tokens, budget, failed):
    returns = sum(1 for r in runs if r["outcome"] == "back" and r["next"] == "implement")
    returns += outcome == "back" and target == "implement"
    fails = [n for r in runs for n in r.get("failed", "").split(",") if n] + [str(n) for n in failed]
    repeated = sorted({n for n in fails if fails.count(n) >= MAX_QA_FAILURES}, key=int)
    spent = sum(int(r["tokens"]) for r in runs) + tokens
    if repeated:
        return f"QA failed acceptance criterion {repeated[0]} {MAX_QA_FAILURES} times."
    if len(runs) + 1 > MAX_RUNS:
        return f"Hit the limit of {MAX_RUNS} runs on one issue."
    if returns > MAX_RETURNS:
        return f"Hit the limit of {MAX_RETURNS} returns to implement."
    if spent > budget:
        return f"Spent {spent} of {budget} tokens on this issue."
    return None


def resumes_gate(issue, pr, task):
    """True when this run of `task` follows its own gate, which a human has
    answered since, with no return to the task in between: the answer is the
    approval."""
    comments = (issue or {}).get("comments", []) + (pr or {}).get("comments", [])
    waits = markers(comments, "wait")
    if not waits:
        return False
    wait = waits[-1]
    if wait["reason"] != "gate" or wait["resume"] != task:
        return False
    at = parse_time(wait["at"])
    if not human_after(comments, None, at):
        return False
    return not any(r["outcome"] == "back" and r["next"] == task and parse_time(r["at"]) > at
                   for r in markers(comments, "run"))


def approvers(issue, pr):
    """Who answered the latest door or gate wait on the issue or its PR."""
    comments = (issue or {}).get("comments", []) + (pr or {}).get("comments", [])
    waits = [w for w in markers(comments, "wait") if w["reason"] in ("door", "gate")]
    if not waits:
        return set()
    return {c["author"] for c in human_after(comments, None, parse_time(waits[-1]["at"]))}


def pending_doors(decisions, approved=frozenset()):
    """One-way doors no human has approved. An approval counts only when the
    login it names answered the latest wait."""
    return [d for d in decisions if d.get("door") == "one-way"
            and (not d.get("approved_by") or d["approved_by"] not in approved)]


NEEDS_HEAD = {"implement", "review", "qa", "update-branch"}


def validate(result):
    """Refuse a result `apply` could only half carry out, before it writes."""
    task, outcome = result.get("task"), result.get("outcome")
    if not isinstance(result.get("comment", ""), str):
        raise ValueError("comment must be Markdown text")
    for d in result.get("decisions") or []:
        if not isinstance(d, dict) or not all(isinstance(d.get(k), str) and d[k].strip()
                                              for k in ("title", "answer", "reason")):
            raise ValueError("each decision needs a title, an answer and a reason")
        if d.get("door", "two-way") not in ("one-way", "two-way"):
            raise ValueError(f"door must be one-way or two-way, not {d.get('door')!r}")
        if d.get("criterion") is not None and not str(d["criterion"]).isdigit():
            raise ValueError("a decision's criterion is the acceptance criterion's number")
    for q in result.get("questions") or []:
        if not isinstance(q, dict) or not all(isinstance(q.get(k), str) for k in ("question", "recommended", "reason")):
            raise ValueError("each question needs question, recommended and reason")
    for i, t in enumerate(result.get("tickets") or []):
        if not isinstance(t, dict) or not t.get("title") or not t.get("body"):
            raise ValueError("each ticket needs a title and a body")
        if any(not isinstance(d, int) or not 0 <= d < i for d in t.get("depends_on") or []):
            raise ValueError("depends_on counts tickets from 0 and names only earlier ones")
    for c in result.get("inline") or []:
        if not isinstance(c, dict) or not c.get("path") or not str(c.get("line", "")).isdigit() or not c.get("body"):
            raise ValueError("each inline finding needs path, line and body")
    for p in result.get("proposals") or []:
        if not isinstance(p, dict) or not p.get("title") or not p.get("body"):
            raise ValueError("each proposal needs a title and a body")
        if p.get("door") is not None and p["door"] not in ("one-way", "two-way"):
            raise ValueError(f"a proposal's door is one-way or two-way, not {p['door']!r}")
        if p.get("size") is not None and p["size"] not in ("S", "M", "L"):
            raise ValueError(f"a proposal's size is S, M or L, not {p['size']!r}")
        if not isinstance(p.get("paths", []), list) or \
                not all(isinstance(x, str) and x.strip() for x in p.get("paths", [])):
            raise ValueError("a proposal's paths is a list of the files or folders it would change")
    for r in result.get("resolved") or []:
        if not isinstance(r, dict) or not str(r.get("number", "")).strip() or not r.get("reason"):
            raise ValueError("each resolved proposal needs its number and a reason")
    if (result.get("proposals") or result.get("resolved")) and task not in SCANS:
        raise ValueError("only a scan files or resolves proposals")
    steps = result.get("human_steps") or []
    if not isinstance(steps, list) or not all(isinstance(x, str) and x.strip() for x in steps):
        raise ValueError("human_steps is a list of steps, each one line of text")
    if outcome in ("forward", "back") and task in NEEDS_HEAD and task != "implement" \
            and not result.get("head"):
        raise ValueError(f"{task} must return the head it verified or produced")
    if outcome == "forward" and task in ("implement", "update-branch") and not result.get("branch"):
        raise ValueError(f"{task} must return the branch it committed to")


def decide(result, issue, pr, config, me, now, resume=None):
    """What a run's result does to GitHub: the next label and where it goes,
    the run marker, and any wait. Pure: `apply` carries it out, and refuses a
    result this raises on before it writes anything.

    `issue` is the issue the work is for, `pr` its PR or None, `resume` the
    task an `update-branch` run interrupted."""
    task, outcome = result.get("task"), result.get("outcome")
    if task not in AGENT_TASKS:
        raise ValueError(f"unknown task {task!r}")
    validate(result)
    level = autonomy(config)
    plan = result["plan"] if result.get("plan") is not None else plan_of(issue)
    tokens = int(result.get("tokens") or 0)
    failed = [int(n) for n in result.get("failed") or []]
    approved = approvers(issue, pr)
    doors = pending_doors(result.get("decisions") or [], approved)
    wait = None
    target = None

    if task in SCANS:
        if outcome not in ("done", "blocked"):
            raise ValueError(f"a scan ends done or blocked, not {outcome!r}")
    elif outcome in ("forward", "back") and task in CRITERION_TASKS and \
            any(d.get("criterion") is not None for d in result.get("decisions") or []):
        # A decision that changes what a criterion asks goes to spec now, so
        # QA never judges the old text against a build that differs by design.
        outcome, target = "back", "spec"
    elif outcome == "forward":
        target = result.get("next") or (resume if task == "update-branch" and resume else None) \
            or default_next(task, plan)
        if target not in ALLOWED_NEXT.get(task, set()):
            raise ValueError(f"{task} cannot go forward to {target!r}")
        if task == "spec" and target in ("review", "qa") and pr is None:
            raise ValueError("spec goes forward to review or qa only on an issue with an open PR")
        if task == "spec" and target == "qa" and not reviewed_head(pr):
            target = "review"  # review always runs: QA only on a head review checked
        if task == "explore" and target == "implement" and level == "supervised":
            target = "spec"
        if target == "design" and config.get("design") == "off":
            target = "architecture" if plan is None or "architecture" in plan else "implement"
    elif outcome == "back":
        target = result.get("next")
        if target not in ALLOWED_BACK.get(task, set()):
            raise ValueError(f"{task} cannot go back to {target!r}")
        if task == "review" and target == "spec" and \
                not any(d.get("criterion") is not None for d in result.get("decisions") or []):
            raise ValueError("review goes back to spec only with a decision on a criterion")
    elif outcome == "done":
        if task != "explore" or not result.get("duplicate_of"):
            raise ValueError("only explore ends done, when it closes a duplicate")
    elif outcome != "blocked":
        raise ValueError(f"outcome must be forward, back, done or blocked, not {outcome!r}")
    if failed and task != "qa":
        raise ValueError("failed criteria come from QA")

    if outcome == "blocked":
        wait = {"reason": "blocked", "resume": task,
                "why": "This run cannot go on until a human unblocks it."}
    elif outcome == "done" and task == "explore" and level == "supervised" \
            and not resumes_gate(issue, pr, task):
        wait = {"reason": "gate", "resume": task,
                "why": f"Explore found this a duplicate of #{result['duplicate_of']}. Say "
                       "\"yes\" to close it, or say why it isn't one."}
    elif task == "spec" and outcome == "forward" and level == "supervised" \
            and not resumes_gate(issue, pr, "spec"):
        wait = {"reason": "gate", "resume": "spec",
                "why": "The spec is ready for a human's approval before anything is built."
                       + (" Approving it approves its one-way doors too." if doors else "")}
    elif doors_wait(level) and doors:
        wait = {"reason": "door", "resume": task,
                "why": f"{len(doors)} one-way door{'s' if len(doors) > 1 else ''} "
                       "need a human's approval before the factory builds on "
                       f"{'them' if len(doors) > 1 else 'it'}."}
    elif task == "qa" and outcome == "forward" and merge_policy(config) == "human":
        wait = {"reason": "gate", "resume": "implement",
                "why": "QA passed. The PR is ready for a human to review and merge. "
                       "Merge it, or say in a comment what to change."}

    if task not in SCANS:
        runs = since_limit_lifted(issue, pr, me)
        budget = number_setting(config, "budget", DEFAULT_BUDGET)
        why = limit_hit(runs, task, outcome, target, tokens, budget, failed)
        if why:
            again = task if (wait or task == "spec" and result.get("tickets")) else (target or task)
            wait = {"reason": "limit", "resume": again,
                    "why": why + (" " + wait["why"] if wait else "")}

    shown_next = "human" if wait else (target or "none")
    marker = (f"<!-- agent:run task={task} outcome={outcome} next={shown_next}"
              f" tokens={tokens} at={stamp(now)}")
    if result.get("tokens_estimated") or (tokens and tokens % ROUND_TOKENS == 0):
        marker += " estimated=1"
    if result.get("head"):
        marker += f" head={result['head']}"
    if failed:
        marker += " failed=" + ",".join(str(n) for n in failed)
    if result.get("clean"):
        marker += " clean=1"
    if resume:
        marker += f" resume={resume}"
    if task == "spec" and result.get("plan") is not None:
        marker += " plan=" + (",".join(result["plan"]) or "none")
    marker += " -->"
    if wait:
        marker += f"\n<!-- agent:wait reason={wait['reason']} resume={wait['resume']} at={stamp(now)} -->"

    has_pr = pr is not None or (task == "implement" and bool(result.get("branch")))
    if task in SCANS:
        where = "log"
    elif outcome == "back" and target in ISSUE_TASKS and target != "implement":
        where = "issue"  # the task it goes back to reads the issue
    elif task in ON_PR or (task == "implement" and has_pr):
        where = "pr"
    else:
        where = "issue"
    add = None
    if wait:
        add = BLOCKED if wait["reason"] == "blocked" else NEEDS_HUMAN
    elif target and not (task == "spec" and result.get("tickets")):
        add = PREFIX + target
    # A wait's label goes where its comment is, so the answer is read there.
    # The next task runs on the PR once there is one, on the issue before.
    if wait:
        label_where = where if where != "log" else None
    elif target:
        label_where = "pr" if (target in ON_PR or (target == "implement" and has_pr)) else "issue"
    else:
        label_where = None
    return {
        "task": task,
        "target": target,
        "wait": wait,
        "marker": marker,
        "comment_on": where,
        "add_label": add,
        "label_on": label_where,
        "owner": owner_of(result, wait, approved),
        "doors": doors,
        # An approval stands only when its login answered the wait.
        "decisions": [{**d, "approved_by": d.get("approved_by") if d.get("approved_by") in approved
                       else None} for d in result.get("decisions") or []],
    }


def owner_of(result, wait, approved=frozenset()):
    """`po` answers product calls, `dev` the rest."""
    if not wait:
        return None
    doors = pending_doors(result.get("decisions") or [], approved)
    if wait["reason"] == "door" and doors:
        return "po" if all(d.get("owner") == "po" for d in doors) else "dev"
    if wait["reason"] == "gate" and wait["resume"] == "spec":
        return "po"
    return "dev"


# ── Comments and decisions ──────────────────────────────────────────────────

def run_number(comments, task):
    return sum(1 for m in markers(comments, "run") if m["task"] == task) + 1


def decision_line(decision, task, level="doors"):
    """One decision as a line under `## Decisions`. Under autonomy `full` a
    one-way door is the factory's call, so it waits for nobody."""
    door = decision.get("door", "two-way")
    if door == "one-way":
        door_text = f"One-way door: {decision.get('locks') or 'hard to walk back'}"
    else:
        door_text = "Two-way door"
    status = ""
    if door == "one-way":
        if decision.get("approved_by"):
            status = f" Approved by @{decision['approved_by']}."
        elif not doors_wait(level):
            status = " Decided by the factory (autonomy `full`)."
        else:
            status = " **Awaiting approval.**"
    rejected = decision.get("rejected")
    rejected = f" Rejected: {rejected}." if rejected else ""
    criterion = decision.get("criterion")
    task = f"{task}, changes acceptance criterion {criterion}" if criterion is not None else task
    return (f"- **{decision['title'].strip()}** ({task}): {decision['answer'].strip()}, "
            f"because {decision['reason'].strip().rstrip('.')}.{rejected} {door_text}.{status}")


DECISIONS_HEADING = "## Decisions"
ORIGINAL = "<details><summary>Original input"


def split_original(body):
    """The body's own part and the collapsed original input below it, as two
    lists of lines. Headings inside the original input are the reporter's
    text, never sections of the issue."""
    lines = (body or "").rstrip("\n").split("\n") if (body or "").strip() else []
    at = next((i for i, line in enumerate(lines) if line.startswith(ORIGINAL)), len(lines))
    head, tail = lines[:at], lines[at:]
    while head and not head[-1].strip():
        head.pop()
    return head, tail


def joined(head, tail):
    return "\n".join(head + ([""] if head and tail else []) + tail).rstrip() + "\n"


def section_end(lines, start):
    return next((i for i in range(start, len(lines)) if lines[i].startswith("## ")), len(lines))


def with_decisions(body, decisions, task, level="doors"):
    """The issue body with each decision recorded under `## Decisions`: a
    decision with the title of one already there replaces it."""
    if not decisions:
        return body
    head, tail = split_original(body)
    if DECISIONS_HEADING not in head:
        head += ([""] if head else []) + [DECISIONS_HEADING, ""]
    start = head.index(DECISIONS_HEADING) + 1
    end = section_end(head, start)
    section = [line for line in head[start:end]]
    for decision in decisions:
        title = f"- **{decision['title'].strip()}**"
        line = decision_line(decision, task, level)
        for i, existing in enumerate(section):
            if existing.startswith(title):
                section[i] = line
                break
        else:
            while section and not section[-1].strip():
                section.pop()
            section = (section or [""]) + [line]
    if section[0].strip():
        section = [""] + section
    return joined(head[:start] + section + ([""] if end < len(head) else []) + head[end:], tail)


def with_section(body, heading, text):
    """The issue body with `## <heading>` holding `text`, replacing the
    section when it is there, else placed above `## Decisions`."""
    head, tail = split_original(body)
    title = f"## {heading}"
    block = [title, "", text.strip()]
    if title in head:
        start = head.index(title)
        end = section_end(head, start + 1)
        head = head[:start] + block + ([""] if end < len(head) else []) + head[end:]
    else:
        at = head.index(DECISIONS_HEADING) if DECISIONS_HEADING in head else len(head)
        before = head[:at]
        while before and not before[-1].strip():
            before.pop()
        head = before + ([""] if before else []) + block + ([""] if at < len(head) else []) + head[at:]
    return joined(head, tail)


def wait_section(decision, result, config):
    wait = decision["wait"]
    who = addressee(config, decision["owner"])
    lines = ["", "### Waiting for a human", "", wait["why"]]
    doors = decision["doors"]
    if wait["reason"] in ("door", "gate") and doors:
        lines += ["", "Approve or change each one-way door:", ""]
        for i, d in enumerate(doors, 1):
            lines.append(f"{i}. **{d['title']}**: {d['answer']}. "
                         f"Locks in: {d.get('locks') or 'hard to walk back'}. "
                         f"_Recommended: yes, because {d['reason'].rstrip('.')}._")
    for i, q in enumerate(result.get("questions") or [], 1):
        if i == 1:
            lines += ["", "Questions:", ""]
        lines.append(f"{i}. {q['question']} _Recommended: {q['recommended']}, "
                     f"because {q['reason'].rstrip('.')}._")
    return "\n".join(lines)


def handoff(decision, config, n, steps=None, proposals=None):
    """The comment's last lines: what runs next on its own, what a human does,
    and what follows once they have. Every run comment ends with them, so a
    reader knows whether to act and what their action sets off. `steps` is
    the issue holding the steps only a human can take outside the factory."""
    hourly = schedule(config) == "hourly"
    wait, target = decision["wait"], decision["target"]
    after = None
    if wait:
        who = addressee(config, decision.get("owner"))
        # Under a local tracker every comment, a PR's too, sits in a file: the
        # answer is text typed below them.
        where = "below the last comment in this file" if tracker(config) == "local" else "in a comment here"
        answer = (f"{'@' + who + ': ' if who else ''}answer {where}; `yes` accepts "
                  "every recommendation")
        auto = "nothing until a human answers here."
        if n is None:
            you = answer + "."
            after = f"the next `{decision['task']}` reads the answer when it runs."
        elif hourly:
            you = answer + "."
            after = (f"the next factory run, within the hour, resumes at `{wait['resume']}` "
                     "and carries the work on from there.")
        else:
            you = f"1. {answer}. 2. Type `/factory {n}`."
            after = f"the factory resumes at `{wait['resume']}` and carries the work on from there."
    elif target and n is not None:
        if hourly:
            auto, you = f"`{target}` at the next factory run, within the hour.", "nothing."
        else:
            auto = "nothing: no scheduled task runs the factory."
            you = f"type `/factory {n}`."
            after = f"the factory runs `{target}` and carries the work on from there."
    else:
        auto, you = "nothing.", "nothing; this run finished the work."
    started = (proposals or {}).get("started") or []
    waiting = (proposals or {}).get("waiting") or []
    if started:
        refs = ", ".join(f"#{p}" for p in started)
        auto = (f"{refs} {'start' if len(started) > 1 else 'starts'} at `spec` "
                + ("at the next factory run, within the hour." if hourly
                   else "when someone types `/factory`."))
    if waiting:
        refs = ", ".join(f"#{p}" for p in waiting)
        who = addressee(config, "po")
        you = (f"{'@' + who + ': ' if who else ''}choose which of {refs} to build: add "
               "`agent:spec` to each you want, and close the rest. They change what a "
               "human decides (a one-way door, a large change or a guarded file), so the "
               "factory waits for you.")
    if steps:
        outside = f"the steps in #{steps}, which only a human can take; they hold up nothing here."
        you = (f"nothing for the factory. Outside it: {outside}" if you.startswith("nothing")
               else f"{you} Outside the factory: {outside}")
    lines = ["", "### Next", "", f"- **Automatic:** {auto}", f"- **You:** {you}"]
    if after:
        lines.append(f"- **After that:** {after}")
    return "\n".join(lines)


def comment_body(decision, result, comments, config, n=None, steps=None, proposals=None):
    task = decision["task"]
    heading = f"## {TITLE[task]} · run {run_number(comments, task)}"
    parts = [decision["marker"], heading, "", result.get("comment", "").strip()]
    if result.get("decisions"):
        parts += ["", "### Decisions", ""]
        parts += [decision_line(d, task, autonomy(config)) for d in decision["decisions"]]
    if proposals and any(proposals.values()):
        parts += ["", "### Proposals", ""]
        for p in proposals.get("started") or []:
            parts.append(f"- #{p}: a two-way door of size S or M that touches no guarded file, "
                         "so the factory builds it.")
        for p in proposals.get("waiting") or []:
            parts.append(f"- #{p}: waits for a human to choose it.")
        for p in proposals.get("closed") or []:
            parts.append(f"- #{p}: closed, it no longer holds.")
    if decision["wait"]:
        parts.append(wait_section(decision, result, config))
    parts.append(handoff(decision, config, n, steps, proposals))
    return "\n".join(parts).rstrip() + "\n"


# ── Queue ───────────────────────────────────────────────────────────────────

def choose(items, issues, prs, me, config, now, deps_open, scans_due=(), skip=frozenset()):
    """What can run now, in order: work on PRs first, the furthest along
    first, then issues, then new issues and due scans. `items` are the open
    items with an agent label; `deps_open` holds issue numbers with an open
    dependency. A PR counts only when it carries the factory's `agent` label:
    `review-pr` puts `agent:review` on other people's PRs for a moment while
    it claims them."""
    entries, waiting, running = [], [], []
    for item in items:
        n = item["number"]
        names = labels_of(item)
        if n in skip or (item["kind"] == "pr" and PR_LABEL not in names):
            continue
        if IN_PROGRESS in names:
            running.append(n)
            continue
        if NEEDS_HUMAN in names or BLOCKED in names:
            wait = answered(item, me)
            if not wait:
                waiting.append(n)
                continue
            entry = {"number": n, "task": wait["resume"],
                     "label": NEEDS_HUMAN if NEEDS_HUMAN in names else BLOCKED,
                     "why": "A human answered the wait."}
        else:
            task = trigger(item)
            if task is None:
                if item["kind"] == "issue" and ENTRY in names:
                    entries.append({"number": n, "task": "spec", "label": ENTRY,
                                    "why": f"Labelled {ENTRY}."})
                continue
            if item["kind"] == "issue" and n in deps_open:
                waiting.append(n)
                continue
            entry = {"number": n, "task": task, "label": PREFIX + task,
                     "why": f"Labelled {PREFIX}{task}."}
        if item["kind"] == "pr" and entry["task"] in ("qa", "merge") and item.get("behind"):
            entry.update(task="update-branch", resume=entry["task"],
                         why=entry["why"] + " The branch is behind the default branch first.")
            if entry["label"] == PREFIX + entry["resume"]:
                entry["try_update"] = True  # the conductor tries it before a run does
        if entry["task"] == "merge":
            entry["deterministic"] = True
        if item["kind"] == "pr" and item.get("issue"):
            entry["issue"] = item["issue"]
        entries.append(entry)

    def rank(entry):
        resumed = entry["label"] in (NEEDS_HUMAN, BLOCKED)
        return (-CHAIN.index(entry["task"]), not resumed, order(entry["number"]))

    entries.sort(key=rank)
    entries += [{"number": None, "task": s, "label": None, "why": "Due after enough merges."}
                for s in scans_due]
    return {"run": entries, "waiting": sorted(waiting, key=order),
            "running": sorted(running, key=order)}


def task_list(config, key):
    names = {t.strip() for t in config.get(key, "").split(",") if t.strip()}
    names = {n if n in TASKS else f"{n}-scan" for n in names}
    unknown = names - set(TASKS)
    if unknown:
        raise ValueError(f"{key} names unknown tasks: {', '.join(sorted(unknown))}")
    return names


def batch(entries, config):
    """The first batch to run at once: at most `parallel` tasks, of which at
    most `build-parallel` write code, and at most one of each task named in
    `serial` (tasks that share one running app, such as QA)."""
    size = number_setting(config, "parallel", 3)
    builds = number_setting(config, "build-parallel", 2)
    serial = task_list(config, "serial")
    chosen, building, taken = [], 0, set()
    for entry in entries:
        writes = entry["task"] in ("implement", "update-branch")
        if writes and building >= builds:
            continue
        if entry["task"] in serial and entry["task"] in taken:
            continue
        chosen.append(entry)
        building += writes
        taken.add(entry["task"])
        if len(chosen) >= size:
            break
    return chosen


def scans_due(config, merged_since):
    """The scans whose `scan-every` merges have happened. `merged_since` maps
    each scan to the merges since it last ran."""
    every = number_setting(config, "scan-every", 10)
    if every <= 0:
        return []
    return [s for s in scans_enabled(config) if merged_since.get(s, 0) >= every]


# ── Merge ───────────────────────────────────────────────────────────────────

def checks_state(check_runs, statuses):
    """`success`, `pending` or `failure` over a commit's check runs and
    commit statuses."""
    states = []
    for run in check_runs:
        if run["status"] != "completed":
            states.append("pending")
        elif run.get("conclusion") in ("success", "neutral", "skipped"):
            states.append("success")
        else:
            states.append("failure")
    for status in statuses:
        states.append({"success": "success", "pending": "pending"}.get(status["state"], "failure"))
    if "failure" in states:
        return "failure"
    if "pending" in states:
        return "pending"
    return "success" if states else "none"


NOT_STARTED = "was not started"


def never_ran(gh, check_runs):
    """The reason CI failed without running, when every failed check run is
    a job GitHub never started (billing, a spending limit, no runner); else
    None. A check that ran and failed is the code's; one that never started
    says nothing about it."""
    failed = [r for r in check_runs if r["status"] == "completed"
              and r.get("conclusion") not in ("success", "neutral", "skipped")]
    reasons = []
    for run in failed:
        if not run.get("id"):
            return None
        notes = [a.get("message", "") for a in gh.list(gh.r(f"check-runs/{run['id']}/annotations"))]
        reason = next((m for m in notes if NOT_STARTED in m), None)
        if not reason:
            return None
        reasons.append(reason)
    return reasons[0] if reasons else None


def verified_head(pr):
    """The head QA verified, carried forward through clean `update-branch`
    runs after it. None when no QA has passed since the last change."""
    head = None
    for run in markers(pr["comments"], "run"):
        if run["task"] == "qa" and run["outcome"] == "forward":
            head = run.get("head")
        elif run["task"] == "update-branch" and run["outcome"] == "forward" and run.get("clean") \
                and head is not None:
            head = run.get("head")
        elif run["task"] in ("implement", "update-branch", "review"):
            head = None
    return head


def glob_to_regex(pattern):
    out, i = "", 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out, i = out + "(?:.*/)?", i + 3
        elif pattern.startswith("**", i):
            out, i = out + ".*", i + 2
        elif pattern[i] == "*":
            out, i = out + "[^/]*", i + 1
        elif pattern[i] == "?":
            out, i = out + "[^/]", i + 1
        else:
            out, i = out + re.escape(pattern[i]), i + 1
    return re.compile(out + "$")


def human_paths(config):
    """The globs a human must see change before a merge (`human-paths`): a
    directory ending in `/` covers everything inside it."""
    globs = [g.strip() for g in config.get("human-paths", "").split(",") if g.strip()]
    return [g.rstrip("/") + "/**" if g.endswith("/") else g for g in globs]


def human_edits(config):
    """The globs where a change to an existing file waits for a human, while
    a new file merges like any other (`human-edits`): guard tests, say, where
    adding one only makes the guard stricter."""
    globs = [g.strip() for g in config.get("human-edits", "").split(",") if g.strip()]
    return [g.rstrip("/") + "/**" if g.endswith("/") else g for g in globs]


def touched(files, globs):
    patterns = [glob_to_regex(g) for g in globs]
    return sorted(f for f in files if any(p.match(f) for p in patterns))


def merge_verdict(pr, checks, me, files=(), globs=(), edited=(), edit_globs=(), merged_only=False):
    """Whether the factory may merge the PR now: `merge`, `pending` (try
    again later), `update`, or `back`/`human` with the reason. A PR that
    changes a path in `globs`, or changes or removes an existing file in
    `edit_globs`, merges only once a human has answered the gate that names
    them."""
    names = labels_of(pr)
    if pr["state"] != "open":
        return {"verdict": "human", "why": "The PR is no longer open."}
    if NEEDS_HUMAN in names or BLOCKED in names:
        return {"verdict": "human", "why": "The PR waits for a human."}
    if pr.get("mergeable") is None:
        return {"verdict": "pending", "why": "GitHub is still computing mergeability."}
    if not pr["mergeable"]:
        return {"verdict": "update", "why": "The PR conflicts with the default branch."}
    head = verified_head(pr)
    if head != pr["head"] and merged_only:
        return {"verdict": "back", "next": "update-branch",
                "why": f"QA verified {head}, and since then only merges of the default branch "
                       f"moved the PR to {pr['head']}. `update-branch` checks they needed no "
                       "judgement and carries QA forward, so no new QA run is needed."}
    if head != pr["head"]:
        return {"verdict": "back", "next": "qa",
                "why": f"QA verified {head or 'no head'}, but the PR is at {pr['head']}."}
    if pr.get("draft"):
        return {"verdict": "human", "why": "The PR is a draft, and GitHub merges no draft. "
                "Mark it ready for review on GitHub, then answer here."}
    if checks == "pending":
        return {"verdict": "pending", "why": "Checks are still running on the head."}
    if checks == "failure":
        return {"verdict": "back", "next": "implement",
                "why": "A check failed on the head QA verified."}
    guarded = sorted(set(touched(files, globs)) | set(touched(edited, edit_globs)))
    if guarded and not resumes_gate(None, pr, "merge"):
        return {"verdict": "gate", "files": guarded,
                "why": "The PR changes files a human reads before a merge: "
                       + ", ".join(f"`{f}`" for f in guarded)
                       + ". Read them, and answer here to let the factory merge."}
    return {"verdict": "merge", "why": "QA passed on the head, checks are green."}


# ── Close log ───────────────────────────────────────────────────────────────

def report(issue, pr, now):
    runs = history(issue, pr)
    comments = issue["comments"] + (pr or {}).get("comments", [])
    waits = markers(comments, "wait")
    by_task = {}
    for r in runs:
        by_task[r["task"]] = by_task.get(r["task"], 0) + 1
    reasons = {}
    for w in waits:
        reasons[w["reason"]] = reasons.get(w["reason"], 0) + 1
    tokens = sum(int(r["tokens"]) for r in runs)
    estimated = any(r.get("estimated") for r in runs)
    returns = sum(1 for r in runs if r["outcome"] == "back")
    # Only the lines this factory wrote: `- **title** (<task>): ...`. An older
    # factory's lines in the same section name roles, not tasks.
    ours = re.compile(rf"^- \*\*.+?\*\* \((?:{'|'.join(map(re.escape, AGENT_TASKS))})\): .*$", re.M)
    lines = ours.findall(decision_block(issue.get("body", "")))
    decisions = len(lines)
    doors = sum("One-way door" in line for line in lines)
    first = parse_time(runs[0]["at"]) if runs else None
    end = parse_time(pr["mergedAt"]) if pr and pr.get("mergedAt") else now
    hours = f"{(end - first).total_seconds() / 3600:.1f} h" if first else "–"
    waited = sum(len(human_after(comments, "", parse_time(w["at"]))) > 0 for w in waits)
    outcome = "closed without a PR"
    if pr:
        outcome = ("merged" if pr.get("merged") else "PR closed unmerged") + f" (#{pr['number']})"
    rows = [
        ("First run to merge", hours),
        ("Runs", ", ".join(f"{t} {c}" for t, c in by_task.items()) or "0"),
        ("Returns", str(returns)),
        ("Waits", ", ".join(f"{c} {r}" for r, c in reasons.items()) + f" ({waited} answered)"
         if waits else "0"),
        ("Decisions", f"{decisions} ({doors} one-way doors)"),
        ("Tokens", f"{tokens}{' (some estimated)' if estimated else ''}"),
        ("Outcome", outcome),
    ]
    table = "\n".join(f"| {name} | {value} |" for name, value in rows)
    return f"<!-- agent:log -->\n## Factory · log\n\n| Measure | Value |\n|---|---|\n{table}\n"


def decision_block(body):
    if DECISIONS_HEADING not in body:
        return ""
    rest = body.split(DECISIONS_HEADING, 1)[1]
    return re.split(r"\n## |\n<details>", rest, maxsplit=1)[0]


# ── Label migration ─────────────────────────────────────────────────────────

OLD_STAGE = {"spec": "spec", "design": "design", "architecture": "architecture",
             "build": "implement", "review": "review", "qa": "qa"}


def migration(item, has_pr):
    """The label changes that move an item from the factory:* labels to
    agent:*. PR stages move to the PR when the issue has one."""
    remove, add_issue, add_pr = [], [], []
    for name in item["labels"]:
        if name.startswith("factory:"):
            remove.append(name)
            stage = name.split(":", 1)[1]
            if stage == "waiting-human":
                add_issue.append(NEEDS_HUMAN)
            elif stage in OLD_STAGE:
                new = PREFIX + OLD_STAGE[stage]
                (add_pr if has_pr and stage in ("build", "review", "qa") else add_issue).append(new)
        elif name == "factory" and item["kind"] == "pr":
            remove.append(name)
            add_issue.append(PR_LABEL)
        elif name in ("ask-po", "ask-dev"):
            pass  # answered through comments now; the old ask issues stay as they are
    return {"remove": remove, "add": add_issue, "add_pr": add_pr}


# ── GitHub ──────────────────────────────────────────────────────────────────

class GitHubError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


EMPTY_BODY = "unexpected end of JSON input"


class GitHub:
    """`gh api` on the REST API."""

    def __init__(self, repo):
        if not re.fullmatch(r"[\w.-]+/[\w.-]+", repo):
            sys.exit("error: expected <owner>/<repo>")
        self.repo = repo

    def call(self, method, path, body=None):
        command = ["gh", "api", "-X", method, path, "-H", "Accept: application/vnd.github+json"]
        stdin = None
        if body is not None:
            command += ["--input", "-"]
            stdin = json.dumps(body)
        done = subprocess.run(command, input=stdin, capture_output=True, text=True)
        if done.returncode != 0 and method != "GET" and EMPTY_BODY in done.stderr:
            return None  # GitHub answered a write with an empty body, which gh can't parse
        if done.returncode != 0:
            match = re.search(r"HTTP (\d{3})", done.stderr + done.stdout)
            raise GitHubError(int(match.group(1)) if match else 0,
                              f"{method} {path}: {(done.stderr or done.stdout).strip()}")
        return json.loads(done.stdout) if done.stdout.strip() else None

    def get(self, path):
        return self.call("GET", path)

    def list(self, path):
        url = urlsplit(path)
        query = [(k, v) for k, v in parse_qsl(url.query) if k not in ("page", "per_page")]
        items, page = [], 1
        while True:
            chunk = self.get(url.path + "?" + urlencode(query + [("per_page", 100), ("page", page)]))
            items += chunk
            if len(chunk) < 100:
                return items
            page += 1

    def r(self, path):
        return f"repos/{self.repo}/{path}"

    # Labels -------------------------------------------------------------
    kind = "github"

    def ensure_labels(self):
        made = []
        for name in github_labels(self.kind):
            color, description = LABELS[name]
            try:
                self.call("POST", self.r("labels"),
                          {"name": name, "color": color, "description": description})
                made.append(name)
            except GitHubError as error:
                if error.status != 422:
                    raise
        return made

    def add_labels(self, n, names):
        if names:
            self.call("POST", self.r(f"issues/{n}/labels"), {"labels": list(names)})

    def remove_label(self, n, name):
        """True when this call removed the label: the claim."""
        try:
            self.call("DELETE", self.r(f"issues/{n}/labels/{quote(name, safe='')}"))
            return True
        except GitHubError as error:
            if error.status == 404:
                return False
            raise

    # Items --------------------------------------------------------------
    def comments(self, n):
        return [{
            "id": c["id"],
            "url": c["html_url"],
            "author": (c.get("user") or {}).get("login", "ghost"),
            "association": c.get("author_association"),
            "body": c.get("body") or "",
            "createdAt": c["created_at"],
        } for c in self.list(self.r(f"issues/{n}/comments"))]

    def item(self, n, with_comments=True):
        raw = self.get(self.r(f"issues/{n}"))
        item = {
            "number": raw["number"],
            "kind": "pr" if raw.get("pull_request") else "issue",
            "title": raw["title"],
            "state": raw["state"],
            "createdAt": raw["created_at"],
            "closedAt": raw.get("closed_at"),
            "labels": [label["name"] for label in raw["labels"]],
            "body": raw.get("body") or "",
            "author": (raw.get("user") or {}).get("login"),
            "association": raw.get("author_association"),
            "comments": self.comments(n) if with_comments else [],
        }
        if item["kind"] == "pr":
            pr = self.get(self.r(f"pulls/{n}"))
            item.update({
                "head": pr["head"]["sha"],
                "branch": pr["head"]["ref"],
                "base": pr["base"]["ref"],
                "fork": pr["head"]["repo"] is None or pr["head"]["repo"]["full_name"] != self.repo,
                "merged": bool(pr.get("merged_at")),
                "mergedAt": pr.get("merged_at"),
                "draft": pr.get("draft", False),
                "mergeable": pr.get("mergeable"),
                "issue": pr_issue(item["body"]),
            })
        return item

    def behind(self, pr):
        compare = self.get(self.r(f"compare/{quote(pr['head'])}...{quote(pr['base'])}"))
        return compare.get("ahead_by", 0) > 0  # commits on the base the head lacks

    def pr_for(self, issue_number, labels=(PR_LABEL,)):
        """The open factory PR that closes the issue, or else a closed one."""
        found = None
        for label in labels:
            for raw in self.list(self.r(f"issues?state=all&labels={label}")):
                body = raw.get("body")
                if raw.get("pull_request") and (issue_number in closes(body)
                                                or pr_issue(body) == issue_number):
                    if raw["state"] == "open":
                        return raw["number"]
                    found = found or raw["number"]
        return found

    def default_branch(self):
        return self.get(f"repos/{self.repo}")["default_branch"]

    def comment(self, n, body):
        return self.call("POST", self.r(f"issues/{n}/comments"), {"body": body})["html_url"]

    def set_body(self, n, body):
        self.call("PATCH", self.r(f"issues/{n}"), {"body": body})

    def log_issue(self):
        found = self.list(self.r(f"issues?state=open&labels={quote(LOG)}"))
        found = [i for i in found if not i.get("pull_request")]
        if found:
            return min(found, key=lambda i: i["number"])["number"]
        body = ("The factory posts here what each unattended run did, and the scans post "
                "their reports. Keep it open.\n\n<!-- agent:log-issue -->\n")
        return self.call("POST", self.r("issues"),
                         {"title": "Factory log", "body": body, "labels": [LOG]})["number"]


# ── Local tracker ───────────────────────────────────────────────────────────
# `tracker: local`: each issue is a folder under the tracker directory,
# `<key>-<slug>/factory/`, holding three files a human can read and edit:
#
#   issue.md       `# <title>`, then `Key: value` lines (Labels, State, ...),
#                  a blank line, and the body
#   comments.md    each comment between `<!-- comment ... -->` and
#                  `<!-- end -->`; text a human adds after an end line
#                  becomes their comment, stamped when the conductor reads it
#   events.jsonl   label events, for claims and stale locks
#
# `Local` answers the issue routes of the REST API from these files, so every
# command runs unchanged, and passes everything else (PRs, CI, merges) to
# GitHub. Issues GitHub itself holds are left out of its listings.

LOCAL_HEADER = ("Labels", "State", "Created", "Closed", "Author", "Assignees")
COMMENT_START = re.compile(r"<!-- comment id=(\d+) by=(\S+) at=(\S+) -->\n")
COMMENT_END = "<!-- end -->"


def slug(title):
    return re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")[:40].rstrip("-") or "issue"


def parse_issue_file(text):
    lines = text.splitlines()
    title = lines[0][2:].strip() if lines and lines[0].startswith("# ") else ""
    header, i = {}, 1 if title else 0
    while i < len(lines) and lines[i].strip():
        key, sep, value = lines[i].partition(":")
        if not sep or key.strip() not in LOCAL_HEADER:
            break
        header[key.strip()] = value.strip()
        i += 1
    body = "\n".join(lines[i:]).strip("\n")
    return title, header, body + "\n" if body else ""


def write_issue_file(title, header, body):
    lines = [f"# {title}"] + [f"{k}: {header[k]}" for k in LOCAL_HEADER if header.get(k)]
    return "\n".join(lines) + "\n\n" + (body or "").rstrip("\n") + "\n"


def safe_comment(body):
    """A comment body can't end the comment it sits in or start another."""
    return (body or "").replace(COMMENT_END, "&lt;!-- end -->").replace("<!-- comment ", "&lt;!-- comment ")


class Local(GitHub):
    """Issues from the tracker directory, and everything the factory writes
    about a PR (labels, comments, events, review findings) beside its issue
    in `<issue folder>/factory/pr-<n>/`. GitHub sees only the PR, its pushes
    and its merge, so nothing the factory does shows to the rest of a team."""

    kind = "local"

    def __init__(self, repo, root, me="factory", human="human", clock=None):
        super().__init__(repo)
        self.root = root
        self.me = me
        self.human = human  # who a comment a human typed in is from
        self.time = clock or (lambda: datetime.now(timezone.utc))
        self.cache = {}

    # Files --------------------------------------------------------------
    def folder(self, key):
        """The issue's folder: `<key>` or `<key>-<slug>`, one with a factory
        issue in it first."""
        if not os.path.isdir(self.root):
            return None
        found = [name for name in sorted(os.listdir(self.root))
                 if name.lower() == key or name.lower().startswith(key + "-")]
        found.sort(key=lambda name: not os.path.isfile(os.path.join(self.root, name, "factory", "issue.md")))
        return os.path.join(self.root, found[0]) if found else None

    def pr_dir(self, n):
        """The folder for what the factory writes about PR `n`: beside the
        issue its body names, else under `.factory/` in the tracker directory."""
        for base in [os.path.join(self.root, name, "factory") for name in self.listdir()] \
                + [os.path.join(self.root, ".factory")]:
            if os.path.isdir(os.path.join(base, f"pr-{n}")):
                return os.path.join(base, f"pr-{n}")
        key = pr_issue(self.remote(n).get("body") or "")
        folder = self.folder(key) if is_local(key) else None
        base = os.path.join(folder, "factory") if folder else os.path.join(self.root, ".factory")
        os.makedirs(os.path.join(base, f"pr-{n}"), exist_ok=True)
        return os.path.join(base, f"pr-{n}")

    def listdir(self):
        return sorted(os.listdir(self.root)) if os.path.isdir(self.root) else []

    def pr_numbers(self):
        """Every PR the factory wrote about."""
        found = set()
        for base in [os.path.join(self.root, name, "factory") for name in self.listdir()] \
                + [os.path.join(self.root, ".factory")]:
            if os.path.isdir(base):
                found |= {int(d[3:]) for d in os.listdir(base) if re.fullmatch(r"pr-\d+", d)}
        return sorted(found)

    def remote(self, n):
        """PR `n` as GitHub has it, read once per run until a write."""
        if n not in self.cache:
            self.cache[n] = super().call("GET", self.r(f"issues/{n}"))
        return self.cache[n]

    def load_header(self, key):
        if isinstance(key, int):
            path = self.path(key, "state.json")
            if not os.path.isfile(path):
                return {}
            with open(path) as f:
                return json.load(f)
        return self.read(key)[1]

    def save_header(self, key, header):
        if isinstance(key, int):
            with open(self.path(key, "state.json"), "w") as f:
                json.dump(header, f, indent=1)
            return
        title, _, text = self.read(key)
        self.write(key, title, header, text)

    def pr_raw(self, n):
        """PR `n` with the labels and assignees the tracker directory holds."""
        raw = dict(self.remote(n))
        if not raw.get("pull_request"):
            return raw
        header = self.load_header(n)
        raw["labels"] = [{"name": x} for x in self.labels_in(header)]
        raw["assignees"] = [{"login": x.strip()} for x in header.get("Assignees", "").split(",") if x.strip()]
        return raw

    def path(self, key, name):
        if isinstance(key, int):
            return os.path.join(self.pr_dir(key), name)
        folder = self.folder(key)
        path = folder and os.path.join(folder, "factory", name)
        if name == "issue.md" and not (path and os.path.isfile(path)):
            raise GitHubError(404, f"no local issue {key} under {self.root}")
        return path

    @contextmanager
    def locked(self, key):
        """One writer at a time per issue, across sessions."""
        import fcntl
        with open(os.path.join(os.path.dirname(self.path(key, "issue.md")), ".lock"), "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def keys(self):
        if not os.path.isdir(self.root):
            return []
        keys = []
        for name in os.listdir(self.root):
            match = re.match(KEY, name.lower())
            if match and os.path.isfile(os.path.join(self.root, name, "factory", "issue.md")):
                keys.append(match.group(0))
        return sorted(set(keys), key=order)

    def read(self, key):
        path = self.path(key, "issue.md")
        with open(path) as f:
            title, header, body = parse_issue_file(f.read())
        if not header.get("Created"):
            header["Created"] = stamp(datetime.fromtimestamp(os.path.getmtime(path), timezone.utc))
        return title, header, body

    def write(self, key, title, header, body):
        with open(self.path(key, "issue.md"), "w") as f:
            f.write(write_issue_file(title, header, body))

    def labels_in(self, header):
        return [x.strip() for x in header.get("Labels", "").split(",") if x.strip()]

    def raw(self, key):
        title, header, body = self.read(key)
        return {"number": key, "title": title, "state": header.get("State", "open"),
                "labels": [{"name": n} for n in self.labels_in(header)], "body": body,
                "created_at": header["Created"], "closed_at": header.get("Closed"),
                "user": {"login": header.get("Author") or self.human},
                "author_association": "OWNER",
                "html_url": os.path.relpath(self.path(key, "issue.md"))}

    def read_comments(self, key):
        """The comments, after stamping any a human typed in since the last read."""
        path = self.path(key, "comments.md")
        if not os.path.isfile(path):
            return []
        with open(path) as f:
            text = f.read()
        found, typed, pos = [], [], 0
        starts = list(COMMENT_START.finditer(text))
        for i, match in enumerate(starts):
            gap = text[pos:match.start()]
            if gap.strip():
                typed.append((pos, match.start()))
            end = text.find(COMMENT_END, match.end())
            end = end if end >= 0 and (i + 1 == len(starts) or end < starts[i + 1].start()) \
                else (starts[i + 1].start() if i + 1 < len(starts) else len(text))
            found.append({"id": int(match.group(1)), "by": match.group(2), "at": match.group(3),
                          "body": text[match.end():end].strip("\n") + "\n"})
            pos = end + len(COMMENT_END) if text.startswith(COMMENT_END, end) else end
        if text[pos:].strip():
            typed.append((pos, len(text)))
        if typed:
            # A human's text: give it a start and an end line, stamped now, so
            # its time never moves again.
            next_id = max([c["id"] for c in found] + [0])
            out, last = [], 0
            for start, end in typed:
                next_id += 1
                out.append(text[last:start])
                out.append(f"\n<!-- comment id={next_id} by={self.human} at={stamp(self.time())} -->\n"
                           f"{safe_comment(text[start:end].strip())}\n{COMMENT_END}\n")
                last = end
            out.append(text[last:])
            with open(path, "w") as f:
                f.write("".join(out))
            return self.read_comments(key)
        return found

    def raw_comments(self, key):
        url = os.path.relpath(self.path(key, "comments.md"))
        return [{"id": c["id"], "html_url": f"{url}#c{c['id']}", "user": {"login": c["by"]},
                 "author_association": "OWNER", "body": c["body"], "created_at": c["at"]}
                for c in self.read_comments(key)]

    def add_comment(self, key, body):
        comments = self.read_comments(key)
        cid = max([c["id"] for c in comments] + [0]) + 1
        with open(self.path(key, "comments.md"), "a") as f:
            f.write(f"\n<!-- comment id={cid} by={self.me} at={stamp(self.time())} -->\n"
                    f"{safe_comment(body).rstrip()}\n{COMMENT_END}\n")
        return {"html_url": f"{os.path.relpath(self.path(key, 'comments.md'))}#c{cid}"}

    def add_event(self, key, kind, name):
        with open(self.path(key, "events.jsonl"), "a") as f:
            f.write(json.dumps({"event": kind, "label": {"name": name},
                                "created_at": stamp(self.time())}) + "\n")

    def local_events(self, key):
        path = self.path(key, "events.jsonl")
        if not os.path.isfile(path):
            return []
        with open(path) as f:
            return [json.loads(line) for line in f if line.strip()]

    def create(self, title, body, labels=(), key=None, author=None, assignees=()):
        """A new issue: under the tracker's key, or the next `local-<n>`."""
        if key is None:
            taken = [int(k.rpartition("-")[2]) for k in self.keys() if k.startswith("local-")]
            key = f"local-{max(taken + [0]) + 1}"
        folder = self.folder(key) or os.path.join(self.root, f"{key}-{slug(title)}")
        if os.path.isfile(os.path.join(folder, "factory", "issue.md")):
            raise ValueError(f"local issue {key} already exists: {folder}")
        os.makedirs(os.path.join(folder, "factory"), exist_ok=True)
        header = {"Labels": ", ".join(labels), "State": "open", "Created": stamp(self.time()),
                  "Author": author or self.me, "Assignees": ", ".join(assignees)}
        with open(os.path.join(folder, "factory", "issue.md"), "w") as f:
            f.write(write_issue_file(title, header, body))
        for name in labels:
            self.add_event(key, "labeled", name)
        return key

    def matches(self, raw, query):
        state = query.get("state", "open")
        wanted = [x for x in query.get("labels", "").split(",") if x]
        names = {label["name"] for label in raw["labels"]}
        return (state == "all" or raw["state"] == state) and all(x in names for x in wanted)

    # The API ------------------------------------------------------------
    def list(self, path):
        url = urlsplit(path)
        if unquote(url.path) != self.r("issues"):
            return super().list(path)
        query = dict(parse_qsl(url.query))
        prs = [raw for raw in (self.pr_raw(n) for n in self.pr_numbers())
               if raw.get("pull_request") and self.matches(raw, query)]
        local = [raw for raw in (self.raw(k) for k in self.keys()) if self.matches(raw, query)]
        return prs + local

    def call(self, method, path, body=None):
        url = urlsplit(path)
        route = unquote(url.path)
        prefix = self.r("")
        rest = route[len(prefix):] if route.startswith(prefix) else None
        if rest == "issues" and method == "POST":
            return {"number": self.create(body["title"], body.get("body", ""), body.get("labels", ()),
                                          assignees=body.get("assignees", ()))}
        review = rest is not None and re.fullmatch(r"pulls/(\d+)/reviews", rest)
        if review and method == "POST":
            # Findings stay beside the PR's other comments, not on GitHub.
            n = int(review.group(1))
            lines = [f"- `{c['path']}:{c['line']}`: {c['body']}" for c in body.get("comments", [])]
            with self.locked(n):
                return self.add_comment(n, "\n".join([body.get("body", ""), ""] + lines))
        pr = rest is not None and re.fullmatch(r"issues/(\d+)/(comments|events|assignees|labels(?:/.*)?)", rest)
        if pr:
            n = int(pr.group(1))
            if not self.remote(n).get("pull_request"):
                return super().call(method, path, body)
            with self.locked(n):
                return self.issue_call(method, n, pr.group(2), body)
        if rest is not None and re.fullmatch(r"issues/\d+", rest) and method == "GET":
            return self.pr_raw(int(rest[len("issues/"):]))
        match = rest is not None and re.fullmatch(rf"issues/({KEY})(?:/(.*))?", rest, re.I)
        if not match:
            if method != "GET":
                self.cache.clear()
            return super().call(method, path, body)
        key, sub = match.group(1).lower(), match.group(2) or ""
        with self.locked(key):
            return self.issue_call(method, key, sub, body)

    def issue_call(self, method, key, sub, body):
        if sub == "" and method == "GET":
            return self.raw(key)
        if sub == "" and method == "PATCH":
            title, header, text = self.read(key)
            if "body" in body:
                text = body["body"]
            if body.get("state") in ("open", "closed"):
                header["State"] = body["state"]
                header["Closed"] = stamp(self.time()) if body["state"] == "closed" else ""
            self.write(key, body.get("title", title), header, text)
            return self.raw(key)
        if sub == "comments":
            return self.add_comment(key, body["body"]) if method == "POST" else self.raw_comments(key)
        if sub == "events":
            return self.local_events(key)
        if sub == "assignees" and method == "POST":
            header = self.load_header(key)
            names = [x.strip() for x in header.get("Assignees", "").split(",") if x.strip()]
            header["Assignees"] = ", ".join(dict.fromkeys(names + list(body["assignees"])))
            self.save_header(key, header)
            return {}
        if sub == "labels" and method == "POST":
            header = self.load_header(key)
            names = self.labels_in(header)
            for name in body["labels"]:
                if name not in names:
                    names.append(name)
                    self.add_event(key, "labeled", name)
            header["Labels"] = ", ".join(names)
            self.save_header(key, header)
            return []
        if sub.startswith("labels/") and method == "DELETE":
            name = unquote(sub[len("labels/"):])
            header = self.load_header(key)
            names = self.labels_in(header)
            if name not in names:
                raise GitHubError(404, "Label does not exist")
            header["Labels"] = ", ".join(n for n in names if n != name)
            self.save_header(key, header)
            self.add_event(key, "unlabeled", name)
            return []
        raise GitHubError(404, f"{method} issues/{key}/{sub}: not supported for a local issue")


def git_root():
    """The main worktree's root, so every worktree shares one tracker
    directory; the current directory outside git."""
    done = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
                          capture_output=True, text=True)
    if done.returncode != 0:
        return os.getcwd()
    return os.path.dirname(done.stdout.strip())


TRACKERS = ("github", "local")


def tracker(config):
    kind = config.get("tracker", "github")
    if kind not in TRACKERS:
        raise ValueError(f"tracker must be github or local, not {kind!r}")
    return kind


def tracker_for(repo, config, me=None):
    if tracker(config) == "github":
        return GitHub(repo)
    root = os.path.join(git_root(), config.get("tracker-dir", ".scratch"))
    return Local(repo, root, me=me or "factory",
                 human=config.get("dev") or config.get("fallback") or "human")


def triage_entry(path):
    """The repo's string for the `ready-for-agent` role, from the label table
    in `docs/agents/triage-labels.md`; the role's own name without one."""
    try:
        with open(path) as f:
            text = f.read()
    except FileNotFoundError:
        return "ready-for-agent"
    for line in text.splitlines():
        cells = [c.strip().strip("`").strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 2 and cells[0] == "ready-for-agent" and cells[1]:
            return cells[1]
    return "ready-for-agent"


# ── Commands ────────────────────────────────────────────────────────────────

def config_at(path):
    try:
        with open(path) as f:
            return read_config(f.read())
    except FileNotFoundError:
        return {}


def family(open_items, only):
    """`only` and the items that belong with it: an issue's factory PRs, or a
    PR's issue and that issue's other PRs. A session started for one number
    takes its issue from spec to merge."""
    def parent(raw):
        return pr_issue(raw.get("body") or "") if raw.get("pull_request") else None
    root = parent(open_items[only]) if only in open_items else None
    root = root or only
    return {n for n, raw in open_items.items() if n in (only, root) or parent(raw) == root}


def scan_name(name):
    name = name if name in SCANS else f"{name}-scan"
    if name not in SCANS:
        raise ValueError(f"unknown scan: {name}")
    return name


def settle(entry, config):
    """Put the model and effort for the entry's subagent on it, and for
    review the settings of its two parts."""
    if entry["task"] == "merge":
        return entry
    entry.update(run_settings(config, entry["task"]))
    if entry["task"] == "review":
        entry["parts"] = {p: run_settings(config, p) for p in PARTS}
    return entry


def cmd_queue(gh, config, me, limit, skip, now, only=None, scan=None):
    if scan is not None:
        scan = scan_name(scan)
        _, since = merges_since_scans(gh, config, now)
        entry = {"number": None, "task": scan, "label": None, "since": since[scan],
                 "why": "Asked for with --scan."}
        settle(entry, config)
        return {"run": [entry], "batch": [entry], "waiting": [], "running": [],
                "logs": [], "stale": []}
    open_items = {}
    for name in [PREFIX + t for t in TASKS] + [NEEDS_HUMAN, BLOCKED, IN_PROGRESS, ENTRY]:
        for raw in gh.list(gh.r(f"issues?state=open&labels={quote(name)}")):
            open_items[raw["number"]] = raw
    items, issues, prs, deps_open = [], {}, {}, set()
    dep_state = {}
    if only is not None:
        keep = family(open_items, only)
        open_items = {n: raw for n, raw in open_items.items() if n in keep}
    for n in sorted(open_items, key=order):
        item = gh.item(n)
        if item["kind"] == "pr" and item.get("fork"):
            continue
        if item["kind"] == "pr":
            prs[n] = item
            if trigger(item) in ("qa", "merge"):
                item["behind"] = gh.behind(item)
        else:
            issues[n] = item
            for d in dependencies(item["body"]):
                if d not in dep_state:
                    dep_state[d] = gh.get(gh.r(f"issues/{d}"))["state"]
                if dep_state[d] == "open":
                    deps_open.add(n)
        items.append(item)
    for item in items:
        if item["kind"] == "pr" and item.get("issue") and item["issue"] not in issues:
            try:
                issues[item["issue"]] = gh.item(item["issue"])
            except GitHubError:
                pass
    due, since = [], {}
    if only is None and scans_enabled(config) and number_setting(config, "scan-every", 10) > 0:
        counts, since = merges_since_scans(gh, config, now)
        due = scans_due(config, counts)
    chosen = choose(items, issues, prs, me, config, now, deps_open, due, skip)
    for entry in chosen["run"]:
        if entry["task"] in SCANS:
            entry["since"] = since.get(entry["task"])
    chosen["logs"] = missing_logs(gh, now)
    for entry in chosen["run"]:
        settle(entry, config)
    chosen["batch"] = batch(chosen["run"], config)
    if limit:
        chosen["run"] = chosen["run"][:limit]
        chosen["batch"] = chosen["batch"][:limit]
    chosen["stale"] = stale_locks(gh, chosen["running"], now)
    chosen["parents"] = {n: pr["issue"] for n, pr in prs.items() if pr.get("issue")}
    return chosen


def session_key(number, parents):
    """The `for` of the session that holds `number`: its issue when it is a
    PR with one, else the number itself."""
    return str(parents.get(number) or number)


def cmd_dispatch(gh, config, me, live, now):
    """What /factory-dispatch starts: one session per issue (with its PRs) and
    per due scan, up to `parallel` sessions alive at once. `live` holds the
    `for` keys of sessions still working. Merges need no session: the
    dispatcher runs them itself."""
    chosen = cmd_queue(gh, config, me, 0, set(), now)
    parents = chosen["parents"]
    capacity = max(0, number_setting(config, "parallel", 3) - len(live))
    # An item a run still holds keeps its whole issue out of a new session,
    # and a live session's lock is never stale, however long it runs.
    stale = [n for n in chosen["stale"] if session_key(n, parents) not in live]
    start, merges = [], []
    taken = set(live) | {session_key(n, parents) for n in chosen["running"]}
    for entry in chosen["run"]:
        key = entry["task"] if entry["number"] is None else session_key(entry["number"], parents)
        if key in taken:
            continue
        taken.add(key)
        if entry.get("deterministic"):
            merges.append({"number": entry["number"], "label": entry["label"]})
        elif len(start) < capacity:
            start.append({"for": key, "task": entry["task"], "number": entry["number"],
                          "why": entry["why"]})
    if config.get("session-model"):
        for entry in start:
            entry["model"] = config["session-model"]
    return {"start": start, "merges": merges, "capacity": capacity, "live": sorted(live),
            "waiting": chosen["waiting"], "running": chosen["running"],
            "stale": stale, "logs": chosen["logs"]}


def cmd_sessions(gh, now):
    """The sessions /factory-dispatch started in the last week, newest last,
    from the `agent:session` markers in its notes on the log issue."""
    found = {}
    for m in markers(gh.comments(gh.log_issue()), "session"):
        if now - parse_time(m["at"]) <= SESSION_WINDOW:
            found[m["id"]] = {"id": m["id"], "for": m["for"], "at": m["at"]}
    return list(found.values())


def session_markers(pairs, now):
    lines = []
    for pair in pairs:
        key, sep, sid = pair.partition("=")
        if not sep or not re.fullmatch(r"[\w-]+", key) or not re.fullmatch(r"[\w-]+", sid):
            raise ValueError(f"expected --session <for>=<session id>, got {pair!r}")
        lines.append(f"<!-- agent:session id={sid} for={key} at={stamp(now)} -->")
    return lines


def merges_since_scans(gh, config, now):
    log = gh.log_issue()
    comments = gh.comments(log)
    created = parse_time(gh.get(gh.r(f"issues/{log}"))["created_at"])
    last = {}
    for m in markers(comments, "scan"):
        last[m["kind"]] = parse_time(m["at"])
    default = gh.default_branch()
    merged = [parse_time(p["merged_at"]) for p in
              gh.list(gh.r(f"pulls?state=closed&base={quote(default)}&sort=updated&direction=desc"))
              if p.get("merged_at")]
    counts = {s: sum(1 for t in merged if t > last.get(s, created)) for s in SCANS}
    since = {s: stamp(last.get(s, created)) for s in SCANS}
    return counts, since


def missing_logs(gh, now):
    since = stamp(now - LOG_WINDOW)
    found = []
    for raw in gh.list(gh.r(f"issues?state=closed&labels={PR_LABEL}&since={since}")):
        if not raw.get("pull_request") or not raw.get("pull_request", {}).get("merged_at"):
            continue
        marker = ISSUE_OF_PR.search(raw.get("body") or "")
        numbers = [item_id(marker.group(1))] if marker else closes(raw.get("body"))
        on_pr = markers(gh.comments(raw["number"]), "run")
        for n in numbers:
            try:
                comments = gh.comments(n)
            except GitHubError:
                continue  # a local issue removed by hand
            if (markers(comments, "run") or on_pr) and not markers(comments, "log"):
                found.append(n)
    return sorted(set(found), key=order)


def stale_locks(gh, numbers, now):
    stale = []
    for n in numbers:
        events = gh.list(gh.r(f"issues/{n}/events"))
        locked = [e for e in events if e["event"] == "labeled" and e["label"]["name"] == IN_PROGRESS]
        if locked and now - parse_time(locked[-1]["created_at"]) > LOCK_LIFETIME:
            stale.append(n)
    return stale


def cmd_claim(gh, n, label):
    if label is None:
        return {"claimed": True}
    if gh.remove_label(n, label):
        gh.add_labels(n, [IN_PROGRESS])
        return {"claimed": True}
    return {"claimed": False, "why": f"Another run took {label} first."}


def cmd_release(gh, n, me):
    """Give a stale run's task back: the trigger label the run took when it
    locked the item goes back on, and the lock comes off."""
    triggers = [PREFIX + t for t in TASKS] + [NEEDS_HUMAN, BLOCKED, ENTRY]
    taken = lock_taken = None
    for event in gh.list(gh.r(f"issues/{n}/events")):
        name = (event.get("label") or {}).get("name")
        if event["event"] == "unlabeled" and name in triggers:
            taken = name
        elif event["event"] == "labeled" and name == IN_PROGRESS:
            lock_taken = taken
    if lock_taken:
        gh.add_labels(n, [lock_taken])
    gh.remove_label(n, IN_PROGRESS)
    return {"released": n, "label": lock_taken}


def push(repo_dir, branch, default):
    if branch in (default, "main", "master") or not re.fullmatch(r"[\w./-]+", branch):
        raise ValueError(f"refusing to push {branch!r}")
    done = subprocess.run(["git", "-C", repo_dir, "push", "origin", f"{branch}:refs/heads/{branch}"],
                          capture_output=True, text=True)
    if done.returncode != 0:
        raise ValueError(f"push of {branch} failed: {done.stderr.strip()}")


EVIDENCE_BRANCH = "agent-evidence"


def git(repo_dir, *args, env=None, stdin=None):
    done = subprocess.run(["git", "-C", repo_dir, *args], capture_output=True, text=True,
                          input=stdin, env={**os.environ, **(env or {})})
    if done.returncode != 0:
        raise ValueError(f"git {' '.join(args)}: {done.stderr.strip()}")
    return done.stdout.strip()


def identity(repo_dir):
    """The repo's git identity, or the factory's own when none is set (a CI
    runner has none), for the evidence commit."""
    has = subprocess.run(["git", "-C", repo_dir, "config", "user.email"],
                         capture_output=True, text=True).returncode == 0
    if has:
        return {}
    return {"GIT_AUTHOR_NAME": "factory", "GIT_AUTHOR_EMAIL": "factory@users.noreply.github.com",
            "GIT_COMMITTER_NAME": "factory", "GIT_COMMITTER_EMAIL": "factory@users.noreply.github.com"}


EVIDENCE_MAX = 50 * 1024 * 1024  # GitHub refuses a push with a file over 100 MB


def evidence_files(folder, big=False):
    """The files to publish: plain files in the folder, never dotfiles, each
    at most EVIDENCE_MAX. With `big`, the files left out for their size."""
    if not folder or not os.path.isdir(folder):
        return []
    plain = [name for name in sorted(os.listdir(folder))
             if not name.startswith(".") and os.path.isfile(os.path.join(folder, name))]
    return [name for name in plain
            if (os.path.getsize(os.path.join(folder, name)) > EVIDENCE_MAX) == big]


def publish_evidence(gh, folder, prefix, repo_dir="."):
    """Commit each file in `folder` to the `agent-evidence` branch under
    `prefix`, with git plumbing and a normal push (the cloud proxy refuses
    the REST git-data routes), and return {file name: URL}. git runs in
    `repo_dir`, so the folder's paths are made absolute first."""
    folder = os.path.abspath(folder)
    names = evidence_files(folder)
    if not names:
        return {}
    for attempt in range(3):
        fetched = subprocess.run(["git", "-C", repo_dir, "fetch", "-q", "origin",
                                  f"+refs/heads/{EVIDENCE_BRANCH}:refs/remotes/origin/{EVIDENCE_BRANCH}"],
                                 capture_output=True, text=True).returncode == 0
        parent = git(repo_dir, "rev-parse", f"origin/{EVIDENCE_BRANCH}") if fetched else None
        index = os.path.join(folder, ".agent-evidence-index")
        env = {"GIT_INDEX_FILE": index}
        try:
            if parent:
                git(repo_dir, "read-tree", parent, env=env)
            else:
                git(repo_dir, "read-tree", "--empty", env=env)
            for name in names:
                sha = git(repo_dir, "hash-object", "-w", os.path.join(folder, name))
                git(repo_dir, "update-index", "--add", "--cacheinfo", f"100644,{sha},{prefix}/{name}",
                    env=env)
            tree = git(repo_dir, "write-tree", env=env)
        finally:
            if os.path.exists(index):
                os.remove(index)
        commit = git(repo_dir, "commit-tree", tree, *(["-p", parent] if parent else []),
                     "-m", f"Evidence: {prefix}", env=identity(repo_dir))
        pushed = subprocess.run(["git", "-C", repo_dir, "push", "-q", "origin",
                                 f"{commit}:refs/heads/{EVIDENCE_BRANCH}"],
                                capture_output=True, text=True)
        if pushed.returncode == 0:
            return {name: f"https://github.com/{gh.repo}/blob/{EVIDENCE_BRANCH}/{quote(prefix + '/' + name)}"
                    for name in names}
    raise ValueError(f"could not push evidence to {EVIDENCE_BRANCH}: {pushed.stderr.strip()}")


def keep_evidence(gh, folder, n, name):
    """Under a local tracker: copy the evidence beside the item it proves,
    in `evidence/<name>/`, and link each file by its path."""
    import shutil
    dest = os.path.join(os.path.dirname(gh.path(n, "comments.md")), "evidence", name)
    os.makedirs(dest, exist_ok=True)
    urls = {}
    for file in sorted(evidence_files(folder) + evidence_files(folder, big=True)):
        shutil.copy2(os.path.join(folder, file), os.path.join(dest, file))
        urls[file] = os.path.relpath(os.path.join(dest, file))
    return urls


EVIDENCE_LINK = re.compile(r"evidence:([\w.-]+)")


HUMAN_STEPS = "<!-- agent:human-steps -->"


def file_human_steps(gh, config, issue, steps, me):
    """The one open issue holding every step only a human can take (Azure,
    DNS, secrets), so they are in one place: created once, then added to,
    each batch naming the issue it is for. Returns its number, or None when
    there are no steps. It carries no `agent:*` label, so it holds up nothing
    in the factory."""
    if not steps:
        return None
    lines = "\n".join(f"- [ ] {step.strip()}" for step in steps)
    # The issue number alone: GitHub renders its title, and a title is anyone's text.
    batch = f"For #{issue['number']}:\n\n{lines}\n"
    for raw in gh.list(gh.r("issues?state=open")):
        body = raw.get("body") or ""
        trusted = (raw.get("user") or {}).get("login") == me \
            or raw.get("author_association") in WRITE_ACCESS
        if not raw.get("pull_request") and trusted \
                and (HUMAN_STEPS in body or "<!-- agent:human-steps for=" in body):
            gh.comment(raw["number"], batch)
            return raw["number"]
    who = addressee(config, "dev")
    created = gh.call("POST", gh.r("issues"), {
        "title": "Steps only a human can take",
        "body": ("Every step the factory needs a human for outside the repo, in one place. The "
                 "factory built what it could and left these switched off; they hold up nothing "
                 f"in the factory.\n\n{batch}\n{HUMAN_STEPS}\n"),
        **({"assignees": [who]} if who else {})})
    return created["number"]


def guarded_paths(paths, config):
    """The paths a proposal would change that a human reads before a merge:
    a path inside a guarded glob, or a folder that holds one."""
    globs = human_paths(config) + human_edits(config)
    hit = set(touched(paths, globs))
    for p in paths:
        folder = p.rstrip("*").rstrip("/")
        if folder in ("", ".") or any(g.split("*")[0].startswith(folder + "/") for g in globs):
            hit.add(p)
    return sorted(hit)


def builds_itself(proposal, config):
    """Whether a scan's proposal goes straight to `agent:spec`: the autonomy
    lets the factory take two-way doors, the proposal is one (`door`), small
    enough (`size` S or M), names the paths it changes, and none of them is a
    file a human reads before a merge. Everything else waits for a human."""
    return (autonomy(config) != "supervised"
            and proposal.get("door") == "two-way"
            and proposal.get("size") in ("S", "M")
            and bool(proposal.get("paths"))
            and not guarded_paths(proposal["paths"], config))


def file_proposals(gh, config, result, task, me):
    """File a scan's proposals and close the ones it found resolved. A
    proposal the factory may build itself is labelled `agent:spec`; the rest
    `agent:proposal`, for a human to choose. Returns the numbers by fate."""
    out = {"started": [], "waiting": [], "closed": []}
    proposals = result.get("proposals") or []
    if proposals:
        mine = re.compile(r"<!--\s*agent:proposal-from\s")
        open_titles = {i["title"] for i in gh.list(gh.r("issues?state=open"))
                       if not i.get("pull_request") and mine.search(i.get("body") or "")}
    for proposal in proposals:
        if proposal["title"] in open_titles:
            continue
        start = builds_itself(proposal, config)
        meta = []
        if proposal.get("door") or proposal.get("size"):
            meta.append(f"**Door:** {proposal.get('door', '?')} · **Size:** {proposal.get('size', '?')}")
        if proposal.get("paths"):
            meta.append("**Paths:** " + ", ".join(f"`{p}`" for p in proposal["paths"]))
        body = proposal["body"].rstrip()
        if meta:
            body += "\n\n" + "\n".join(meta)
        created = gh.call("POST", gh.r("issues"), {
            "title": proposal["title"],
            "body": body + f"\n\n<!-- agent:proposal-from {task} -->\n",
            "labels": [PREFIX + "spec" if start else PROPOSAL]})
        out["started" if start else "waiting"].append(created["number"])
        open_titles.add(proposal["title"])
    for r in result.get("resolved") or []:
        n = item_id(r["number"])
        raw = gh.get(gh.r(f"issues/{n}"))
        # Only an open proposal a scan filed, and nothing a run holds now.
        if raw.get("state") != "open" or raw.get("pull_request") \
                or "agent:proposal-from" not in (raw.get("body") or "") \
                or (raw.get("user") or {}).get("login") != me \
                or PROPOSAL not in {lb["name"] for lb in raw.get("labels", [])} \
                or any(lb["name"].startswith(PREFIX) and lb["name"] != PROPOSAL
                       or lb["name"] == ENTRY for lb in raw.get("labels", [])):
            continue  # a run took it, or someone asked for it: not the scan's to close
        gh.comment(n, f"The {TITLE[task].lower()} found that this no longer holds: "
                      f"{r['reason'].strip()}\n")
        gh.call("PATCH", gh.r(f"issues/{n}"), {"state": "closed", "state_reason": "not_planned"})
        out["closed"].append(n)
    return out


def cmd_apply(gh, config, me, result, label, repo_dir, now):
    task = result["task"]
    resume = None
    if task == "update-branch" and label and label.startswith(PREFIX):
        taken = label[len(PREFIX):]
        resume = taken if taken in ("qa", "merge") else None
    n = result.get("item")
    item = gh.item(n) if n else None
    if task == "update-branch" and resume is None and item:
        # Merge sent the PR here because only merges of the default branch
        # moved its head after QA: bring QA forward and go back to merge.
        runs = markers(item["comments"], "run")
        if runs and runs[-1]["task"] == "merge" and runs[-1].get("resume") == "merge":
            resume = "merge"
    issue = pr = None
    if item and item["kind"] == "pr":
        pr = item
        issue = gh.item(item["issue"]) if item.get("issue") else None
    elif item:
        issue = item
        pr_number = gh.pr_for(n)
        pr = gh.item(pr_number) if pr_number else None
        if pr and pr["state"] != "open":
            pr = None
    decision = decide(result, issue, pr, config, me, now, resume)

    if result.get("branch"):
        # Work is pushed even when the run waits, so nothing is lost.
        if pr and pr["state"] != "open":
            raise ValueError(f"PR #{pr['number']} is no longer open; nothing was pushed")
        push(repo_dir, result["branch"], gh.default_branch())
    if task == "implement" and result.get("branch") and pr is None:
        body = factory_pr_body(result.get("pr_body") or "", issue["number"])
        created = gh.call("POST", gh.r("pulls"), {
            "title": result.get("pr_title") or issue["title"], "head": result["branch"],
            "base": gh.default_branch(), "body": body, "draft": False})
        gh.add_labels(created["number"], [PR_LABEL])
        pr = gh.item(created["number"])
    elif task in REFRESH_BODY and result.get("pr_body") and pr and issue:
        # The PR changed since it was opened; the body says what it does now.
        gh.call("PATCH", gh.r(f"pulls/{pr['number']}"),
                {"body": factory_pr_body(result["pr_body"], issue["number"])})

    comment = result.get("comment", "")
    if result.get("evidence") and gh.kind == "local":
        urls = keep_evidence(gh, result["evidence"], n if n is not None else gh.log_issue(),
                             f"{task}-{stamp(now).replace(':', '')}")
        comment = EVIDENCE_LINK.sub(lambda m: urls.get(m.group(1), m.group(0)), comment)
    elif result.get("evidence"):
        key = n or "repo"
        urls = publish_evidence(gh, result["evidence"], f"{key}/{task}-{stamp(now).replace(':', '')}",
                                repo_dir)
        comment = EVIDENCE_LINK.sub(lambda m: urls.get(m.group(1), m.group(0)), comment)
        left = evidence_files(result["evidence"], big=True)
        if left:
            comment += ("\n\nLeft out of the evidence, over 50 MB: "
                        + ", ".join(f"`{name}`" for name in left) + ".")
    result = {**result, "comment": comment}

    next_n = pr["number"] if decision["label_on"] == "pr" and pr else (issue or {}).get("number")
    steps = file_human_steps(gh, config, issue, result.get("human_steps"), me) if issue else None
    proposals = file_proposals(gh, config, result, task, me) if task in SCANS else None
    if decision["comment_on"] == "log":
        target_n = gh.log_issue()
        comments = gh.comments(target_n)
        body = comment_body(decision, result, comments, config, next_n, steps, proposals)
        body = f"<!-- agent:scan kind={task} at={stamp(now)} -->\n" + body
    else:
        target_n = pr["number"] if decision["comment_on"] == "pr" and pr else issue["number"]
        comments = (pr or issue)["comments"] if decision["comment_on"] == "pr" and pr else issue["comments"]
        body = comment_body(decision, result, comments, config, next_n, steps)
    url = gh.comment(target_n, body)

    if issue and task == "spec" and result.get("body"):
        body = re.sub(r"<!--\s*agent-plan:[^>]*-->\n?", "", result["body"]).rstrip() + "\n"
        if result.get("plan"):
            body += f"\n<!-- agent-plan: {', '.join(result['plan'])} -->\n"
        gh.set_body(issue["number"], with_decisions(body, decision["decisions"], task, autonomy(config)))
    elif issue and decision["decisions"]:
        fresh = gh.get(gh.r(f"issues/{issue['number']}"))["body"] or ""
        gh.set_body(issue["number"], with_decisions(fresh, decision["decisions"], task, autonomy(config)))

    tickets = []
    if issue and task == "spec" and result.get("tickets") and decision["wait"] is None:
        plan = result.get("plan") if result.get("plan") is not None else plan_of(issue)
        for t in result["tickets"]:
            deps = [tickets[i] for i in t.get("depends_on", []) if i < len(tickets)]
            body = t["body"].rstrip() + f"\n\nPart of #{issue['number']}\n"
            if deps:
                body += "Blocked by " + ", ".join(f"#{d}" for d in deps) + "\n"
            body += f"\n<!-- agent-plan: {', '.join(plan or [])} -->\n"
            created = gh.call("POST", gh.r("issues"), {
                "title": t["title"], "body": body, "labels": [PREFIX + decision["target"]]})
            tickets.append(created["number"])
    if issue and result.get("sections"):
        fresh = gh.get(gh.r(f"issues/{issue['number']}"))["body"] or ""
        for heading, text in result["sections"].items():
            fresh = with_section(fresh, heading, text)
        gh.set_body(issue["number"], fresh)
    if pr and result.get("inline"):
        comments = [{"path": c["path"], "line": int(c["line"]), "side": "RIGHT", "body": c["body"]}
                    for c in result["inline"]]
        try:
            gh.call("POST", gh.r(f"pulls/{pr['number']}/reviews"), {
                "commit_id": result.get("head") or pr["head"], "event": "COMMENT",
                "body": "The findings this review left for a decision, on their lines.",
                "comments": comments})
        except GitHubError:
            pass  # a line outside the diff; the findings are in the run's comment too

    if result.get("duplicate_of") and decision["wait"] is None and issue:
        gh.call("PATCH", gh.r(f"issues/{issue['number']}"),
                {"state": "closed", "state_reason": "not_planned"})

    # Labels: the lock comes off where the run took it; the next label goes on
    # the issue or the PR.
    if item:
        gh.remove_label(item["number"], IN_PROGRESS)
    if decision["add_label"] and decision["label_on"]:
        on = pr["number"] if decision["label_on"] == "pr" and pr else issue["number"]
        gh.add_labels(on, [decision["add_label"]])
        who = addressee(config, decision["owner"]) if decision["owner"] else None
        if who:
            try:
                gh.call("POST", gh.r(f"issues/{on}/assignees"), {"assignees": [who]})
            except GitHubError:
                pass
    return {"comment": url, "next": decision["target"], "wait": decision["wait"],
            "label": decision["add_label"],
            "proposals": (proposals or {}).get("started", []) + (proposals or {}).get("waiting", []),
            "started": (proposals or {}).get("started", []),
            "closed": (proposals or {}).get("closed", []), "tickets": tickets,
            "pr": pr["number"] if pr else None}


MAX_MERGE_WALK = 20


def only_merges(gh, base, head, default):
    """True when the first-parent chain from `head` back to `base` holds only
    merges whose second parent is on the default branch: GitHub's «Update
    branch», or the factory's own update. Anything else on that chain, a fix
    pushed after QA say, is not. The commits the merges brought in from the
    default branch are not on the chain, so they are not inspected."""
    try:
        sha = head
        for _ in range(MAX_MERGE_WALK):
            if sha == base:
                return sha != head
            parents = [p["sha"] for p in gh.get(gh.r(f"commits/{quote(sha)}")).get("parents") or []]
            if len(parents) != 2:
                return False
            status = gh.get(gh.r(f"compare/{quote(parents[1])}...{quote(default)}")).get("status")
            if status not in ("ahead", "identical"):
                return False
            sha = parents[0]
    except GitHubError:
        return False
    return False


NUMBERED = re.compile(r"^(\d+)[-_]")


def numbered_clash(ours, theirs):
    """Files both sides added in one folder under one number (two ADRs 0012,
    two migrations 0013): a merge git calls clean that still needs a run to
    renumber. Returns the clashing pairs."""
    def key(path):
        folder, _, name = path.rpartition("/")
        match = NUMBERED.match(name)
        return (folder, int(match.group(1))) if match else None
    seen = {key(f): f for f in theirs if key(f)}
    return sorted((f, seen[key(f)]) for f in ours if key(f) in seen)


def cmd_update(gh, config, me, n, now, label, resume):
    """Bring a PR that is only behind the default branch up to date without a
    run: GitHub merges the default branch in, the factory records a clean
    `update-branch` at the new head, so QA's verdict carries forward, and the
    label goes back for `resume`. Returns `agent: true` when a run must do it:
    a conflict, a numbered file both sides added, or GitHub refusing."""
    if not gh.remove_label(n, label):
        return {"updated": False, "why": f"Another run took {label} first."}
    gh.add_labels(n, [IN_PROGRESS])
    try:
        return update_now(gh, config, me, n, now, resume)
    finally:
        gh.remove_label(n, IN_PROGRESS)
        gh.add_labels(n, [label])


def update_now(gh, config, me, n, now, resume, wait=2, tries=10):
    if getattr(gh, "kind", "github") == "local":
        return {"updated": False, "agent": True, "why": "A local tracker updates in a run."}
    pr = gh.item(n)
    if not pr.get("mergeable"):
        return {"updated": False, "agent": True,
                "why": "The PR conflicts with the default branch, or GitHub can't tell yet."}
    default = gh.default_branch()
    ours = [f["filename"] for f in gh.list(gh.r(f"pulls/{n}/files")) if f.get("status") == "added"]
    compare = gh.get(gh.r(f"compare/{quote(pr['head'])}...{quote(default)}"))
    theirs = [f["filename"] for f in compare.get("files") or [] if f.get("status") == "added"]
    clash = numbered_clash(ours, theirs)
    if clash:
        return {"updated": False, "agent": True,
                "why": "Both sides added a numbered file: "
                       + ", ".join(f"`{a}` and `{b}`" for a, b in clash) + "."}
    try:
        gh.call("PUT", gh.r(f"pulls/{n}/update-branch"), {"expected_head_sha": pr["head"]})
    except GitHubError as error:
        return {"updated": False, "agent": True, "why": f"GitHub refused the update: {error}"}
    head = pr["head"]
    for _ in range(tries):
        head = gh.get(gh.r(f"pulls/{n}"))["head"]["sha"]
        if head != pr["head"]:
            break
        if wait:
            import time
            time.sleep(wait)
    if head != pr["head"] and not only_merges(gh, pr["head"], head, default):
        # Something besides GitHub's merge landed while it ran (a push in the
        # window): nobody verified it, so a run must look.
        return {"updated": False, "agent": True,
                "why": f"The head moved to {head}, and not only by GitHub's merge."}
    if head == pr["head"]:
        # GitHub merges in the background. The next merge sees that only a
        # merge moved the head, and a cheap update-branch run carries QA on.
        return {"updated": True, "pending": True,
                "why": "GitHub is still merging; the head has not moved yet."}
    gh.comment(n, f"<!-- agent:run task=update-branch outcome=forward next={resume} tokens=0"
                  f" at={stamp(now)} head={head} clean=1 resume={resume} -->\n"
                  f"## Update branch · by the conductor\n\nGitHub merged `{default}` into the "
                  f"branch at `{head}` without a conflict, and no numbered file clashed, so no run "
                  "was needed. CI checks the new head before the merge.\n"
                  + handoff({"task": "update-branch", "wait": None, "target": resume}, config, n)
                  + "\n")
    return {"updated": True, "head": head}


def cmd_merge(gh, config, me, n, now, label=PREFIX + "merge"):
    """Merge a PR the factory may merge, or say why not. `label` is the label
    the queue entry names: `agent:merge`, or the wait a human answered."""
    if not gh.remove_label(n, label):
        return {"merged": False, "why": f"Another run took {label} first."}
    gh.add_labels(n, [IN_PROGRESS])
    try:
        return merge_now(gh, config, me, n, now)
    finally:
        gh.remove_label(n, IN_PROGRESS)


def merge_now(gh, config, me, n, now):
    pr = gh.item(n)

    def stop(why, label, outcome="blocked", nxt=None, reason="blocked"):
        marker = (f"<!-- agent:run task=merge outcome={outcome} next={nxt or 'human'}"
                  f" tokens=0 at={stamp(now)}"
                  + (" resume=merge" if nxt == "update-branch" else "") + " -->")
        if not nxt:
            marker += f"\n<!-- agent:wait reason={reason} resume=merge at={stamp(now)} -->"
        wait = None if nxt else {"resume": "merge"}
        gh.comment(n, f"{marker}\n## Merge · not merged\n\n{why}\n"
                      + handoff({"task": "merge", "wait": wait, "target": nxt, "owner": "dev"}, config, n) + "\n")
        gh.add_labels(n, [label])
        return {"merged": False, "why": why}

    if pr["state"] == "open" and gh.behind(pr):
        gh.add_labels(n, [PREFIX + "merge"])
        return {"merged": False, "pending": True,
                "why": "The branch is behind the default branch; the queue updates it first."}
    runs = gh.get(gh.r(f"commits/{pr['head']}/check-runs?per_page=100"))["check_runs"]
    statuses = gh.get(gh.r(f"commits/{pr['head']}/status"))["statuses"]
    state = checks_state(runs, statuses)
    if state == "none":
        commit = gh.get(gh.r(f"commits/{pr['head']}"))["commit"]
        young = now - parse_time(commit["committer"]["date"]) < CHECKS_GRACE
        state = "pending" if young else "success"
    if state == "failure":
        reason = never_ran(gh, runs)
        if reason:
            gh.add_labels(n, [PREFIX + "merge"])
            return {"merged": False, "pending": True,
                    "why": f"CI never ran on the head: {reason} The merge waits until CI runs."}
    changed = gh.list(gh.r(f"pulls/{n}/files")) if human_paths(config) or human_edits(config) else []
    files = [f["filename"] for f in changed]
    # A rename counts as a change to the old path too.
    edited = [f["filename"] for f in changed if f.get("status", "modified") != "added"] \
        + [f["previous_filename"] for f in changed if f.get("previous_filename")]
    verified = verified_head(pr)
    merged_only = bool(verified) and verified != pr["head"] and pr.get("mergeable") \
        and only_merges(gh, verified, pr["head"], gh.default_branch())
    verdict = merge_verdict(pr, state, me, files, human_paths(config),
                            edited, human_edits(config), merged_only)
    if verdict["verdict"] == "pending":
        gh.add_labels(n, [PREFIX + "merge"])
        return {"merged": False, "pending": True, "why": verdict["why"]}
    if verdict["verdict"] == "update":
        gh.add_labels(n, [PREFIX + "update-branch"])
        return {"merged": False, "why": verdict["why"]}
    if verdict["verdict"] == "back":
        return stop(verdict["why"], PREFIX + verdict["next"], "back", verdict["next"])
    if verdict["verdict"] == "gate":
        return stop(verdict["why"], NEEDS_HUMAN, reason="gate")
    if verdict["verdict"] != "merge":
        return stop(verdict["why"], NEEDS_HUMAN)
    try:
        gh.call("PUT", gh.r(f"pulls/{n}/merge"),
                {"sha": pr["head"], "merge_method": merge_method(config)})
    except GitHubError as error:
        return stop(f"GitHub refused the merge: {error}. A branch rule may ask for a "
                    "review or a check the factory can't give; merge it by hand, or "
                    "change the rule.", NEEDS_HUMAN)
    gh.comment(n, f"<!-- agent:run task=merge outcome=done next=none tokens=0 at={stamp(now)}"
                  f" head={pr['head']} -->\n## Merge\n\nMerged at `{pr['head']}`: QA passed on "
                  f"this head and every check is green.\n"
                  + handoff({"task": "merge", "wait": None, "target": None}, config, n) + "\n")
    if pr.get("issue"):
        write_log(gh, pr["issue"], now, me)
    return {"merged": True, "pr": n, "issue": pr.get("issue")}


PART_OF = re.compile(rf"(?mi)^Part of #{REF}\s*$")


def close_finished_parent(gh, issue, me):
    """Close the issue `issue` is a ticket of (`Part of #p`, written when spec
    split it) once every other ticket of it is closed, so no human has to.
    Only a ticket the factory wrote counts, only an issue is closed, and a
    parent a human or a run still holds, or one the factory never ran on,
    stays open. `issue` itself counts as done: GitHub may not have closed it
    yet when its PR has just merged. Returns the parent's number when closed."""
    match = PART_OF.search(issue["body"])
    if not match or issue["author"] != me:
        return None
    p = item_id(match.group(1))
    parent = gh.item(p)
    if parent["kind"] != "issue" or parent["state"] != "open" \
            or any(l.startswith(PREFIX) for l in parent["labels"]) \
            or not markers(parent["comments"], "run"):
        return None
    tickets = re.compile(rf"(?mi)^Part of #{re.escape(str(p))}\s*$")
    for raw in gh.list(gh.r("issues?state=open")):
        if raw.get("pull_request") or raw["number"] == issue["number"]:
            continue
        if tickets.search(raw.get("body") or "") and (raw.get("user") or {}).get("login") == me:
            return None
    gh.comment(p, "Every ticket of this issue is closed, so the factory closes it.\n")
    gh.call("PATCH", gh.r(f"issues/{p}"), {"state": "closed", "state_reason": "completed"})
    return p


def write_log(gh, issue_number, now, me):
    """The close log for a merged issue, then its parent closed when this was
    its last open ticket. GitHub closes an issue its merged PR closes; a local
    issue is closed here, whether the factory or a human merged."""
    issue = gh.item(issue_number)
    if is_local(issue_number) and issue["state"] == "open":
        merged = gh.pr_for(issue_number)
        if merged and gh.item(merged, with_comments=False).get("merged"):
            gh.call("PATCH", gh.r(f"issues/{issue_number}"),
                    {"state": "closed", "state_reason": "completed"})
    if markers(issue["comments"], "log"):
        return None
    pr_number = gh.pr_for(issue_number)
    pr = gh.item(pr_number) if pr_number else None
    url = gh.comment(issue_number, report(issue, pr, now))
    close_finished_parent(gh, issue, me)
    return url


def cmd_note(gh, path, sessions=(), now=None):
    with open(path) as f:
        # The report quotes issue titles and comments; a marker copied from
        # them would become state once posted as `me`. Only the markers below
        # are the conductor's.
        text = f.read().replace("<!--", "&lt;!--").rstrip() + "\n"
    lines = session_markers(sessions, now or datetime.now(timezone.utc))
    if lines:
        text += "\n" + "\n".join(lines) + "\n"
    return gh.comment(gh.log_issue(), text)


def cmd_migrate(gh, dry_run=False):
    made = [] if dry_run else gh.ensure_labels()
    moved = []
    names = ["factory:" + s for s in list(OLD_STAGE) + ["waiting-human"]] + ["factory"]
    seen = {}
    for name in names:
        for raw in gh.list(gh.r(f"issues?state=open&labels={quote(name)}")):
            seen[raw["number"]] = raw
    for n in sorted(seen):
        item = gh.item(n, with_comments=False)
        pr_number = gh.pr_for(n, (PR_LABEL, "factory")) if item["kind"] == "issue" else None
        change = migration(item, pr_number is not None)
        if dry_run:
            moved.append({"number": n, **change, "pr": pr_number})
            continue
        for name in change["remove"]:
            gh.remove_label(n, name)
        gh.add_labels(n, change["add"])
        if pr_number:
            gh.add_labels(pr_number, change["add_pr"])
        moved.append({"number": n, **change, "pr": pr_number})
    return {"labels_created": made, "moved": moved}


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", default="docs/agents/factory.md")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("labels").add_argument("repo")
    q = sub.add_parser("queue")
    q.add_argument("repo")
    q.add_argument("--me", required=True)
    q.add_argument("--max", type=int, default=0)
    q.add_argument("--skip", default="")
    q.add_argument("--only", type=item_id)
    q.add_argument("--scan")
    d = sub.add_parser("dispatch")
    d.add_argument("repo")
    d.add_argument("--me", required=True)
    d.add_argument("--live", default="")
    sub.add_parser("sessions").add_argument("repo")
    c = sub.add_parser("claim")
    c.add_argument("repo")
    c.add_argument("number", type=item_id)
    c.add_argument("--label", required=True)
    c.add_argument("--me", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("repo")
    f.add_argument("number", type=item_id)
    f.add_argument("--me", required=True)
    f.add_argument("--for", dest="task")
    a = sub.add_parser("apply")
    a.add_argument("repo")
    a.add_argument("result")
    a.add_argument("--me", required=True)
    a.add_argument("--from", dest="label")
    a.add_argument("--repo-dir", default=".")
    m = sub.add_parser("merge")
    m.add_argument("repo")
    m.add_argument("number", type=item_id)
    m.add_argument("--me", required=True)
    m.add_argument("--label", default=PREFIX + "merge")
    u = sub.add_parser("update")
    u.add_argument("repo")
    u.add_argument("number", type=item_id)
    u.add_argument("--me", required=True)
    u.add_argument("--label", required=True)
    u.add_argument("--resume", required=True, choices=["qa", "merge"])
    r = sub.add_parser("release")
    r.add_argument("repo")
    r.add_argument("number", type=item_id)
    r.add_argument("--me", required=True)
    lg = sub.add_parser("log")
    lg.add_argument("repo")
    lg.add_argument("number", type=item_id)
    lg.add_argument("--me", required=True)
    mg = sub.add_parser("migrate")
    mg.add_argument("repo")
    mg.add_argument("--dry-run", action="store_true")
    nt = sub.add_parser("note")
    nt.add_argument("repo")
    nt.add_argument("file")
    nt.add_argument("--session", action="append", default=[])
    nw = sub.add_parser("new")
    nw.add_argument("repo")
    nw.add_argument("key", type=item_id, nargs="?")
    nw.add_argument("--title", required=True)
    nw.add_argument("--body-file", required=True)
    nw.add_argument("--me", required=True)
    nw.add_argument("--label", action="append", default=[])
    sub.add_parser("list").add_argument("path")
    sub.add_parser("config").add_argument("--for", dest="task")

    args = parser.parse_args()
    config = config_at(args.config)
    global ENTRY
    ENTRY = triage_entry(os.path.join(os.path.dirname(args.config), "triage-labels.md"))
    now = datetime.now(timezone.utc)

    def out(value):
        print(json.dumps(value, ensure_ascii=False, indent=2))

    try:
        if args.command == "config" and args.task:
            out(task_settings(config, args.task))
            return
        if args.command == "config":
            task_list(config, "serial")
            per_task(config, "models", MODELS)
            per_task(config, "effort", EFFORTS)
            out({**config, "tracker": tracker(config), "entry": ENTRY,
                 "autonomy": autonomy(config), "merge": merge_policy(config),
                 "human-paths": human_paths(config),
                 "merge-method": merge_method(config),
                 "budget": number_setting(config, "budget", DEFAULT_BUDGET),
                 "scans": scans_enabled(config), "schedule": schedule(config)})
            return
        if args.command == "list":
            match = re.fullmatch(r"repos/([\w.-]+/[\w.-]+)/\S+", args.path)
            if not match:
                sys.exit("error: expected a REST path under repos/<owner>/<repo>/")
            out(GitHub(match.group(1)).list(args.path))
            return
        gh = tracker_for(args.repo, config, getattr(args, "me", None))
        if args.command in ("dispatch", "sessions") and tracker(config) == "local":
            raise ValueError("tracker: local keeps issues in the clone's tracker directory, which a "
                             "cloud session never sees; run /factory in the clone instead")
        if args.command == "labels":
            out({"created": gh.ensure_labels()})
        elif args.command == "queue":
            skip = {item_id(x) for x in args.skip.split(",") if x}
            if args.only is not None and args.scan:
                raise ValueError("--only and --scan exclude each other")
            out(cmd_queue(gh, config, args.me, args.max, skip, now, args.only, args.scan))
        elif args.command == "dispatch":
            live = {x for x in args.live.split(",") if x}
            out(cmd_dispatch(gh, config, args.me, live, now))
        elif args.command == "sessions":
            out(cmd_sessions(gh, now))
        elif args.command == "claim":
            label = None if args.label in ("", "none") else args.label
            out(cmd_claim(gh, args.number, label))
        elif args.command == "fetch":
            item = gh.item(args.number)
            item["trusted"] = item.get("association") in WRITE_ACCESS
            for comment in item["comments"]:
                comment["trusted"] = comment["author"] == args.me or \
                    comment.get("association") in WRITE_ACCESS
            out(view(item, args.task, args.me) if args.task else item)
        elif args.command == "apply":
            with open(args.result) as fh:
                result = json.load(fh)
            out(cmd_apply(gh, config, args.me, result, args.label, args.repo_dir, now))
        elif args.command == "merge":
            out(cmd_merge(gh, config, args.me, args.number, now, args.label))
        elif args.command == "update":
            out(cmd_update(gh, config, args.me, args.number, now, args.label, args.resume))
        elif args.command == "release":
            out(cmd_release(gh, args.number, args.me))
        elif args.command == "log":
            out({"comment": write_log(gh, args.number, now, args.me)})
        elif args.command == "migrate":
            out(cmd_migrate(gh, args.dry_run))
        elif args.command == "new":
            if tracker(config) != "local" or (args.key is not None and not is_local(args.key)):
                raise ValueError("new makes a local issue, keyed like SEAL-522 or numbered "
                                 "local-<n> without a key, under tracker: local")
            with open(args.body_file) as fh:
                body = fh.read()
            key = gh.create(args.title, body, args.label, key=args.key, author=args.me)
            out({"number": key, "folder": gh.folder(key)})
        elif args.command == "note":
            out({"comment": cmd_note(gh, args.file, args.session, now)})
    except (ValueError, KeyError, TypeError, GitHubError) as error:
        sys.exit(f"error: {error.__class__.__name__}: {error}")


if __name__ == "__main__":
    main()
