#!/usr/bin/env python3
"""The checks behind `/factory-setup`: is this repo ready for the factory?

`check` reads a clone of the target repo plus the facts the skill gathered
from GitHub and the runtime (a JSON file), and gives one green, red or
skipped line per check. A passing repo is all green, except the cloud check
a local run skips. Every red line names its fix:

  pr      an agent may write it, in the setup PR (never a guard file)
  local   an agent writes it in the clone, uncommitted: git ignores the path,
          so the setting is this person's alone
  labels  an agent creates the missing labels (`conductor.py labels`)
  migrate an agent moves the old factory:* labels (`conductor.py migrate`)
  wizard  only a human can do it; it becomes a stage in the wizard
  issue   real work for the factory itself, filed as an issue

The facts file holds:
  labels       label names on the repo (`gh label list --json name`)
  apps         app slugs from the default branch's check suites
  environment  `cloud` or `local`: where this run executes
  playwright   true/false: Chromium launched under the repo's own Playwright
               here; `absent` when the repo has no Playwright dependency
  design       `holds`, `fails` or null: the `/design` probe's result
  legacy       open issues and PRs still carrying factory:* labels
               (`conductor.py migrate --dry-run`, the length of `moved`)
  issues       true/false: GitHub Issues are on for the repo (`has_issues`)
  merge_methods  the merge methods the repo allows: `merge`, `squash`, `rebase`

`guarded` prints which of the given paths are guard files, by the target
repo's AGENTS.md (Q25), so the setup PR can leave them out.

Usage:
  readiness.py check <repo-dir> --facts facts.json [--json]
  readiness.py guarded <repo-dir> <path>...
"""

import argparse
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "factory", "scripts"))

import conductor  # noqa: E402  the conductor owns the labels and the config format

LABELS = list(conductor.LABELS)
# Labels of the factory before ADR-0011; `conductor.py migrate` moves them.
LEGACY = re.compile(r"^factory(:.+)?$")
CONFIG = "docs/agents/factory.md"

# The designer's tool when nobody has probed `/design` in this repo yet.
# Bredvid/skills#19 found `/design` unproven for unsupervised runs, so the
# designer publishes `bredvid-design-engineering:prototype` as an artifact.
# See references/runtime.md.
DESIGN_DEFAULT = "prototype"
DESIGN_TOOL = {"holds": "design", "fails": "prototype"}

GLOSSARIES = ("GLOSSARY.md", "CONTEXT.md", "CONTEXT-MAP.md")
# What PO and `/factory-propose` steer by, owned by the PO human. Setup
# drafts the first version (Q10, Q37).
VISION = "docs/product/vision.md"
# How QA starts and drives the app (references/verify.md). It lives under
# docs/agents/ rather than .claude/skills/, because .claude/** is a guard file.
VERIFY = "docs/agents/verify"
# Never touched by setup, whatever AGENTS.md lists: CI and the agent rules
# themselves are the human's (Q18, Q25).
ALWAYS_GUARDED = (".github/**", ".claude/**", "AGENTS.md", "CLAUDE.md")
GUARD_LINE = re.compile(r"vaktfil|guard file|guarded", re.I)
BACKTICKED = re.compile(r"`([^`\s]+)`")
EXACT_VERSIONS = re.compile(r"eksakt|exact|fast versjon|pinned|pin ", re.I)

SKIP_DIRS = {".git", "node_modules", "dist", "build", "vendor", ".venv", "venv", "target", ".next"}
TEST_FILE = re.compile(
    r"(\.(test|spec)\.[cm]?[jt]sx?$)|(^test_.*\.py$)|(_test\.(py|go)$)|(Tests?\.(cs|java|kt)$)")
TEST_COMMAND = re.compile(
    r"\b((pnpm|npm|yarn|bun)( run)? test|turbo( run)? test|nx (run-many|affected)( -\S+)* test"
    r"|vitest|jest|pytest|unittest|playwright test"
    r"|go test|cargo test|mvn( -\S+)* (test|verify)|gradlew? test|dotnet test)\b")


def result(id, title, ok, detail, fix=None, **extra):
    status = "green" if ok else "red"
    return {"id": id, "title": title, "status": status, "detail": detail,
            "fix": None if ok else fix, **extra}


def skipped(id, title, detail):
    return {"id": id, "title": title, "status": "skip", "detail": detail, "fix": None}


def read(repo, path):
    try:
        with open(os.path.join(repo, path)) as f:
            return f.read()
    except (FileNotFoundError, NotADirectoryError):
        return None


def exists(repo, path):
    return os.path.exists(os.path.join(repo, path))


def files(repo):
    for root, dirs, names in os.walk(repo):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            yield os.path.relpath(os.path.join(root, name), repo), name


def glob_to_regex(pattern):
    out = ""
    i = 0
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


RULE_FILES = ("AGENTS.md", "CLAUDE.md", "CLAUDE.local.md")


def agent_rules(repo):
    """The text of every file that holds the agents' rules, or None when
    there is none. CLAUDE.local.md holds one person's rules, which a
    personal setup (`tracker: local`) may keep there."""
    texts = [t for t in (read(repo, p) for p in RULE_FILES) if t is not None]
    return "\n".join(texts) if texts else None


def guard_patterns(repo):
    """The guard files the agent rules list, as globs: every backticked path
    on a line that names guard files (`Vaktfilene ...`, `Guard files ...`)."""
    listed = []
    for line in (agent_rules(repo) or "").splitlines():
        if GUARD_LINE.search(line):
            listed += [p for p in BACKTICKED.findall(line) if not p.startswith("-")]
    return listed


def as_glob(repo, pattern):
    """A listed directory (`infra/`, or a path that is one) guards everything
    inside it."""
    if pattern.endswith("/") or os.path.isdir(os.path.join(repo, pattern)):
        return pattern.rstrip("/") + "/**"
    return pattern


def in_repo(repo, path):
    """The path relative to the repo, whether it was given absolute, relative
    to the repo or relative to the working directory. None when it lies
    outside the repo."""
    if not os.path.isabs(path) and not os.path.lexists(os.path.join(repo, path)) \
            and os.path.lexists(path):
        path = os.path.abspath(path)
    rel = os.path.relpath(os.path.realpath(os.path.join(repo, path)), os.path.realpath(repo))
    return None if rel == ".." or rel.startswith("../") else rel


def guarded(repo, paths):
    """The paths setup may not commit. A path outside the repo is held back
    too: over-guarding only costs a wizard step."""
    globs = (as_glob(repo, p) for p in (*ALWAYS_GUARDED, *guard_patterns(repo)))
    patterns = [glob_to_regex(p) for p in globs]
    held = []
    for path in paths:
        rel = in_repo(repo, path)
        if rel is None or any(r.match(rel) for r in patterns):
            held.append(path)
    return held


def ignored(repo, path):
    """Whether git ignores the path in this clone, by .gitignore or by the
    clone's own .git/info/exclude."""
    done = subprocess.run(["git", "-C", repo, "check-ignore", "-q", path], capture_output=True)
    return done.returncode == 0


def suggested_tracker(repo, facts):
    """Where this repo's issues would live: in the scratch directory when
    GitHub Issues are off or the repo already keeps work there, else on GitHub."""
    if facts.get("issues") is False or os.path.isdir(os.path.join(repo, ".scratch")):
        return "local"
    return "github"


def check_tracker(repo, facts):
    """Where the factory's issues live: `tracker:` in the config, described
    for every skill in docs/agents/issue-tracker.md."""
    config = conductor.config_at(os.path.join(repo, CONFIG))
    doc = "docs/agents/issue-tracker.md"
    want = config.get("tracker") or suggested_tracker(repo, facts)
    if want not in conductor.TRACKERS:
        return result("tracker", "Tracker", False, f"tracker: {want} is not github or local",
                      "pr", path=CONFIG, value=suggested_tracker(repo, facts))
    gaps = []
    if not exists(repo, doc):
        gaps.append(f"{doc} is missing")
    if "tracker" not in config and want == "local":
        gaps.append(f"record `tracker: {want}` in {CONFIG}")
    if want == "github" and facts.get("issues") is False:
        gaps.append("tracker: github, but GitHub Issues are off: use `tracker: local` or turn them on")
    where = config.get("tracker-dir", ".scratch") if want == "local" else "GitHub Issues"
    return result("tracker", "Tracker", not gaps, f"{want} ({where})" if not gaps else "; ".join(gaps),
                  "pr", path=doc, value=want)


def check_schedule(repo):
    """A scheduled task runs in the cloud, which never sees a local tracker."""
    config = conductor.config_at(os.path.join(repo, CONFIG))
    try:
        local = conductor.tracker(config) == "local"
        when = conductor.schedule(config)
    except ValueError as error:
        return result("schedule", "Schedule", False, str(error), "pr", path=CONFIG)
    ok = not (local and when != "none")
    detail = f"schedule: {when}" if ok else \
        f"schedule: {when} needs the cloud, which never sees the local tracker: set schedule: none"
    return result("schedule", "Schedule", ok, detail, "pr", path=CONFIG)


def check_merge_method(repo, facts):
    """The factory merges the way the repo allows, or GitHub refuses it."""
    config = conductor.config_at(os.path.join(repo, CONFIG))
    allowed = facts.get("merge_methods")
    try:
        method = conductor.merge_method(config)
    except ValueError as error:
        return result("merge-method", "Merge method", False, str(error), "pr", path=CONFIG)
    if not allowed:
        return skipped("merge-method", "Merge method", f"merge-method: {method}; the repo's allowed methods unknown")
    ok = method in allowed
    detail = f"merge-method: {method}" if ok else \
        f"merge-method: {method}, but the repo allows only {', '.join(allowed)}: record one of them"
    return result("merge-method", "Merge method", ok, detail, "pr", path=CONFIG, value=allowed[0])


def check_labels(facts, kind="github"):
    """The labels the factory needs on GitHub: every one, or none under a
    local tracker, which keeps them in the tracker directory."""
    wanted = conductor.github_labels(kind)
    if not wanted:
        return result("labels", "Labels", True, "none on GitHub under tracker: local")
    missing = [name for name in wanted if name not in set(facts.get("labels") or [])]
    return result("labels", "Labels", not missing,
                  f"all {len(wanted)} present" if not missing else "missing " + ", ".join(missing),
                  "labels", missing=missing)


def check_roles(repo):
    config = conductor.config_at(os.path.join(repo, CONFIG))
    ok = bool(config.get("fallback") or (config.get("po") and config.get("dev")))
    if ok:
        detail = ", ".join(f"{k}: {config[k]}" for k in ("po", "dev", "fallback") if k in config)
    elif not exists(repo, CONFIG):
        detail = f"{CONFIG} is missing"
    else:
        detail = f"{CONFIG} maps nobody to po and dev and has no fallback"
    return result("roles", "Who answers waits", ok, detail, "pr", path=CONFIG)


def check_autonomy(repo):
    """The project chose how autonomous the factory is, on purpose: the
    default is not assumed for a project nobody asked. Its phase may be left
    at the default, `build`, but not misspelt."""
    config = conductor.config_at(os.path.join(repo, CONFIG))
    value = config.get("autonomy")
    try:
        level = conductor.autonomy(config) if value is not None else None
    except ValueError:
        level = None
    try:
        phase = conductor.phase(config)
    except ValueError:
        phase = None
    valid = level is not None and phase is not None
    if valid:
        detail = (f"autonomy: {level}, merge: {conductor.merge_policy(config)}, "
                  f"phase: {phase}")
    elif level is not None:
        detail = f"phase: {config['phase']} is not {', '.join(conductor.PHASES)}"
    elif value is None:
        detail = f"no autonomy level in {CONFIG}: ask supervised, doors or full"
    else:
        detail = f"autonomy: {value} is not supervised, doors or full"
    return result("autonomy", "Autonomy level", valid, detail, "pr", path=CONFIG)


def check_capacity(repo):
    """Parallel runs and the token budget, sized to the subscription the
    factory runs on (references/capacity.md)."""
    config = conductor.config_at(os.path.join(repo, CONFIG))
    missing = [k for k in ("parallel", "build-parallel", "budget") if k not in config]
    try:
        for key in ("parallel", "build-parallel", "budget"):
            conductor.number_setting(config, key, 0)
    except ValueError as error:
        return result("capacity", "Capacity", False, str(error), "pr", path=CONFIG)
    detail = ("parallel {}, build-parallel {}, budget {}".format(
        config.get("parallel"), config.get("build-parallel"), config.get("budget"))
        if not missing else "not sized yet: " + ", ".join(missing)
        + " (recommend from the subscription; the human picks)")
    return result("capacity", "Capacity", not missing, detail, "pr", path=CONFIG)


def check_legacy_labels(facts):
    """Open issues and PRs that still carry the labels of the factory before
    ADR-0011 (`conductor.py migrate --dry-run`). The old labels themselves
    may stay on the repo until a human deletes them."""
    left = facts.get("legacy") or 0
    return result("legacy-labels", "Old factory labels", not left,
                  "none on open issues or PRs" if not left
                  else f"{left} open issues or PRs still carry factory:* labels", "migrate",
                  legacy=left)


def check_glossary(repo):
    found = [g for g in GLOSSARIES if exists(repo, g)]
    return result("glossary", "Glossary", bool(found),
                  found[0] if found else "no " + " or ".join(GLOSSARIES), "pr", path="GLOSSARY.md")


def check_adrs(repo):
    try:
        adrs = [n for n in os.listdir(os.path.join(repo, "docs/adr")) if n.endswith(".md")]
    except FileNotFoundError:
        adrs = []
    return result("adrs", "ADRs", bool(adrs),
                  f"{len(adrs)} in docs/adr/" if adrs else "no ADRs in docs/adr/", "pr", path="docs/adr/")


def check_vision(repo):
    ok = exists(repo, VISION)
    return result("vision", "Product vision", ok, VISION if ok else f"{VISION} is missing", "pr", path=VISION)


def check_agent_rules(repo):
    """The three rules Q25 puts above everything: guard files, hooks always
    run, dependencies pinned. AGENTS.md is itself a guard file, so a gap here
    is the human's to fill."""
    text = agent_rules(repo)
    if text is None:
        return result("agent-rules", "Agent rules", False, "no AGENTS.md, CLAUDE.md or CLAUDE.local.md", "wizard")
    gaps = []
    if not guard_patterns(repo):
        gaps.append("no guard file list")
    if "--no-verify" not in text:
        gaps.append("nothing on --no-verify")
    if not EXACT_VERSIONS.search(text):
        gaps.append("nothing on exact dependency versions")
    return result("agent-rules", "Agent rules", not gaps,
                  "guard files, --no-verify, exact versions" if not gaps else "; ".join(gaps), "wizard")


GUARD_SOURCE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "guard.py")
GUARD = ".claude/hooks/factory-guard.py"
GUARD_SETTINGS = ".claude/settings.json"
GUARD_HOOK = {"matcher": "Bash|Read|Edit|Write|NotebookEdit|Grep|Glob|WebFetch",
              "hooks": [{"type": "command",
                         "command": 'python3 "$CLAUDE_PROJECT_DIR"/' + GUARD}]}


def check_guard(repo):
    """The agent rules hold as a hook, not only as text: the guard is in the
    repo at the version this skill ships, and `.claude/settings.json` runs it
    before every tool call it covers."""
    try:
        with open(os.path.join(repo, GUARD), encoding="utf-8") as f:
            copy = f.read()
    except OSError:
        copy = None
    with open(GUARD_SOURCE, encoding="utf-8") as f:
        shipped = f.read()
    try:
        with open(os.path.join(repo, GUARD_SETTINGS), encoding="utf-8") as f:
            settings = json.load(f)
    except (OSError, ValueError):
        settings = {}
    hooks = (settings.get("hooks") or {}).get("PreToolUse") or []
    # The entry setup writes, unchanged: a hook that matches fewer tools, or a
    # command that only names the file, leaves those calls unguarded.
    runs = GUARD_HOOK in hooks
    if copy is None:
        detail = f"{GUARD} is missing"
    elif copy != shipped:
        detail = f"{GUARD} differs from the version factory-setup ships"
    elif not runs:
        detail = (f"{GUARD_SETTINGS} does not run {GUARD} before every tool call it "
                  f"covers: add GUARD_HOOK from readiness.py unchanged")
    else:
        detail = f"{GUARD}, run from {GUARD_SETTINGS}"
    ok = copy == shipped and runs
    return result("guard", "Guard hook", ok, detail, "pr", path=GUARD)


def check_verify(repo):
    features = []
    try:
        features = [n for n in os.listdir(os.path.join(repo, VERIFY, "features")) if n.endswith(".md")]
    except (FileNotFoundError, NotADirectoryError):
        pass
    readme = exists(repo, f"{VERIFY}/README.md")
    # QA measures the budgets on every run (factory's references/qualities.md).
    budgets = readme and re.search(r"^## Budgets\s*$", read(repo, f"{VERIFY}/README.md") or "", re.M)
    if not readme:
        detail = f"{VERIFY}/README.md is missing"
    elif not features:
        detail = f"no feature in {VERIFY}/features/"
    elif not budgets:
        detail = f"no ## Budgets in {VERIFY}/README.md"
    else:
        detail = f"{VERIFY}/, {len(features)} features, budgets"
    ok = readme and bool(features) and bool(budgets)
    return result("verify", "Verification guide", ok, detail, "pr", path=f"{VERIFY}/")


def check_tests(repo):
    found = [path for path, name in files(repo) if TEST_FILE.search(name)]
    return result("tests", "Tests exist", bool(found),
                  f"{len(found)} test files" if found else "no test files found", "issue")


def check_ci_tests(repo):
    runs = []
    for path, name in files(repo):
        if path.startswith(os.path.join(".github", "workflows")) and name.endswith((".yml", ".yaml")):
            match = TEST_COMMAND.search(read(repo, path) or "")
            if match:
                runs.append(f"{path} runs `{match.group(0)}`")
    return result("ci-tests", "CI runs the tests", bool(runs),
                  runs[0] if runs else "no workflow in .github/workflows runs a test command", "wizard")


def check_github_app(facts):
    ok = "claude" in (facts.get("apps") or [])
    return result("github-app", "Claude GitHub App", ok,
                  "installed" if ok else "not seen on the repo's check suites", "wizard")


def check_playwright(facts):
    """A repo without its own Playwright gets it as the factory's first task
    (Q18), wherever this runs. Otherwise only a cloud run can check the cloud.
    Phase 1 runs locally, so a local run skips it; the cloud setup script
    comes with the routine."""
    title = "Playwright with Chromium in the cloud environment"
    here = facts.get("playwright")
    if here == "absent":
        return result("playwright", title, False,
                      "the repo has no Playwright dependency; adding it is the factory's first task",
                      "issue")
    if facts.get("environment") != "cloud":
        local = {True: "runs locally", False: "fails locally"}.get(here, "not tried locally")
        return skipped("playwright", title,
                       f"not checked: this run is local ({local}); rerun in the cloud environment")
    return result("playwright", title, here is True,
                  "Chromium launched" if here else "Chromium did not launch", "wizard")


def check_design(repo, facts):
    """Which tool the designer uses, recorded as `design:` in the config.
    A probe this run decides it; otherwise a recorded choice stands, and a
    repo with none gets the default."""
    recorded = conductor.config_at(os.path.join(repo, CONFIG)).get("design")
    want = DESIGN_TOOL.get(facts.get("design")) or (
        recorded if recorded in DESIGN_TOOL.values() else DESIGN_DEFAULT)
    ok = recorded == want
    probe = {"holds": "probe held", "fails": "probe failed"}.get(facts.get("design"), "not probed")
    detail = f"design: {want} ({probe})" if ok else f"record `design: {want}` in {CONFIG} ({probe})"
    return result("design", "/design without supervision", ok, detail, "pr", path=CONFIG, value=want)


def check(repo, facts):
    where = check_tracker(repo, facts)
    results = [
        where,
        check_labels(facts, where["value"] if where["value"] in conductor.TRACKERS else "github"),
        check_legacy_labels(facts),
        check_roles(repo),
        check_autonomy(repo),
        check_merge_method(repo, facts),
        check_capacity(repo),
        check_schedule(repo),
        check_glossary(repo),
        check_adrs(repo),
        check_vision(repo),
        check_agent_rules(repo),
        check_guard(repo),
        check_verify(repo),
        check_tests(repo),
        check_ci_tests(repo),
        check_github_app(facts),
        check_playwright(facts),
        check_design(repo, facts),
    ]
    for r in results:
        if r["fix"] == "pr" and r.get("path") and ignored(repo, r["path"]):
            r["fix"] = "local"
        # A personal setup keeps the rules it adds in the person's own file,
        # so the team's AGENTS.md waits for the team.
        if (r["id"] == "agent-rules" and r["status"] == "red" and where["value"] == "local"
                and exists(repo, "AGENTS.md") and ignored(repo, "CLAUDE.local.md")):
            r.update(fix="local", path="CLAUDE.local.md")
    return results


MARK = {"green": "✔", "red": "✘", "skip": "–"}


def line(r):
    text = f"{MARK[r['status']]} {r['title']}: {r['detail']}"
    return text + (f"  [fix: {r['fix']}]" if r["fix"] else "")


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    cmd = commands.add_parser("check")
    cmd.add_argument("repo")
    cmd.add_argument("--facts", required=True)
    cmd.add_argument("--json", action="store_true")
    cmd = commands.add_parser("guarded")
    cmd.add_argument("repo")
    cmd.add_argument("paths", nargs="+")
    args = parser.parse_args()

    if args.command == "guarded":
        hits = guarded(args.repo, args.paths)
        print("\n".join(hits))
        sys.exit(1 if hits else 0)
    else:
        with open(args.facts) as f:
            results = check(args.repo, json.load(f))
        if args.json:
            print(json.dumps(results, ensure_ascii=False, indent=2))
        else:
            print("\n".join(line(r) for r in results))
        sys.exit(1 if any(r["status"] == "red" for r in results) else 0)


if __name__ == "__main__":
    main()
