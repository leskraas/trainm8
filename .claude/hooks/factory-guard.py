#!/usr/bin/env python3
"""The factory's guard: a Claude Code `PreToolUse` hook that turns the agent
rules every factory repo writes in AGENTS.md into a check the agent can't
argue past. `/factory-setup` copies it to `.claude/hooks/factory-guard.py`
and registers it in `.claude/settings.json`; both are guard files.

It holds in every phase: these rules protect the keys, the hooks and the
supply chain, not the users, so no phase loosens them.

- Reading `.env*` (but `.env.example` and the like). Making one passes:
  `cp .env.example .env`, `[ -f .env ]`, `ls`, `touch`, `rm`, a redirect
  into it, and the Write tool.
- `--no-verify` on a git command, and `git commit -n`.
- `git push --force` or `-f` (`--force-with-lease` is fine).
- `npx`, `npm exec`, `npm x`, `npm create`/`init <pkg>`, `pnpm dlx`,
  `yarn dlx` or `bunx` on a package without an exact
  version: `@latest`, a range and a bare name all run code nobody vetted,
  outside the lockfile and the release-age quarantine. `npx` and `bunx` on a
  bare name the project installed (`node_modules/.bin/<name>`) run that
  locked copy, so they pass, as does `npx --no-install`.
- A host from `prod-urls` in `docs/agents/factory.md`, over any scheme or
  none, outside a text search (`grep`, `rg`, `git grep`, `git log`).

Exit 2 blocks the call, and stderr tells the agent what to do instead.
Anything the guard can't parse passes: it is a fence, not a sandbox.
"""

import json
import os
import re
import shlex
import sys

ENV_SAFE = re.compile(r"\.env\.(?:example|sample|template|dist|schema)\b")
EXACT = re.compile(r"^(?:@[\w.-]+/)?[\w.-]+@\d+\.\d+\.\d+(?:[-+][\w.-]+)?$")
RUNNERS = {("npx",), ("bunx",), ("pnpm", "dlx"), ("yarn", "dlx"), ("pnpx",)}
# Flags of the runners that take a value, so the value is not read as the package.
VALUED = {"-p", "--package", "-c", "--call", "--cache", "--registry", "--userconfig"}
CONFIG = "docs/agents/factory.md"
# git's options before the subcommand, and those that take the next word.
GIT_VALUED = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}
# Commands that only read text, so a production host in them is a search term.
SEARCHES = {"grep", "egrep", "fgrep", "rg", "ag", "ack"}
GIT_SEARCHES = {"grep", "log", "show", "diff", "blame"}


def subcommand(words, valued=()):
    """The word after a tool's leading options, and the words after it."""
    i = 1
    while i < len(words) and words[i].startswith("-"):
        i += 2 if words[i] in valued else 1
    return (words[i], words[i + 1:]) if i < len(words) else (None, [])


def segments(command):
    """The simple commands in a shell line, split on ; && || | and newlines,
    each as its words and the `FOO=bar` assignments before it."""
    for part in re.split(r"&&|\|\||[;|\n]", command):
        try:
            words = shlex.split(part, comments=True)
        except ValueError:
            words = part.split()
        assigns = []
        while words and re.fullmatch(r"\w+=.*", words[0]):  # FOO=bar cmd
            assigns.append(words.pop(0))
        if words and words[0] in ("sudo", "env", "command", "exec", "time"):
            words = words[1:]
        if words:
            yield words, assigns


LOCAL_RUNNERS = {("npx",), ("bunx",), ("pnpx",)}  # these run an installed bin first
ENV_NAME = re.compile(r"\.env(?:[.*][\w.*-]*)?")
# Commands that look at an env file's name, never its contents.
ENV_HARMLESS = {"[", "[[", "test", "ls", "touch", "rm", "stat", "echo", "printf"}
ENV_READING = "Leave `.env*` files unread: take settings from the docs, the example file or the code that reads them."


def is_env(word):
    name = os.path.basename(word.lstrip("<>&0123456789$(`").rstrip("/)`;"))
    return bool(ENV_NAME.fullmatch(name)) and not ENV_SAFE.search(name)


def reads_env(words):
    """Whether a simple command reads an env file: it names one anywhere but as
    the target of a redirect (`> .env`), the destination of `cp`/`mv`/
    `install` (the last word), or under a command that only looks at the name."""
    if words[0] in ENV_HARMLESS and not any("$(" in w or "`" in w for w in words):
        return any(w.startswith("<") and is_env(w) or w == "<" and i + 1 < len(words)
                   and is_env(words[i + 1]) for i, w in enumerate(words))
    last = len(words) - 1 if words[0] in ("cp", "mv", "install") else None
    for i, w in enumerate(words):
        if i == last or not is_env(w):
            continue
        if re.match(r"\d?>{1,2}", w) or (i and re.fullmatch(r"\d?>{1,2}", words[i - 1])):
            continue
        return True
    return False


def npm_runner(words):
    """`npm exec`/`npm x` as npx, and `npm create`/`init <pkg>` as the
    create-<pkg> package npm would fetch."""
    if words[0] != "npm":
        return words
    sub, after = subcommand(words)
    if sub in ("exec", "x"):
        return ["npx", *[w for w in after if w != "--"]]
    if sub in ("create", "init", "innit"):
        names = [w for w in after if not w.startswith("-")]
        return ["pnpm", "dlx", names[0]] if names else words
    return words


def unpinned(words, root=".", moved=False):
    """The package a runner call would fetch without an exact version, or
    None. `moved` says an earlier `cd` left the project, so its installed
    bins no longer count."""
    words = npm_runner(words)
    if words[0] in ("pnpm", "yarn"):  # pnpm -s dlx x: read the options after dlx
        sub, after = subcommand(words)
        if sub:
            words = [words[0], sub, *words[1:len(words) - len(after) - 1], *after]
    for runner in RUNNERS:
        if tuple(words[:len(runner)]) != runner:
            continue
        # The runner's own options come first; the command and its arguments
        # after them are not the runner's.
        rest, explicit, no_install, i = words[len(runner):], [], False, 0
        while i < len(rest) and rest[i].startswith("-"):
            w = rest[i]
            if w == "--":
                i += 1
                break
            if w in ("--no-install", "--no"):
                no_install = True
            if w in ("-p", "--package"):
                explicit.append(rest[i + 1] if i + 1 < len(rest) else "")
                i += 2
                continue
            if w.startswith("--package="):
                explicit.append(w.split("=", 1)[1])
            elif w in VALUED:
                i += 2
                continue
            i += 1
        if no_install and runner in LOCAL_RUNNERS:
            return None
        command = rest[i] if i < len(rest) else None
        packages = explicit or ([command] if command else [])
        for p in packages:
            local = runner in LOCAL_RUNNERS and not moved and "@" not in p.lstrip("@") \
                and os.path.exists(os.path.join(root, "node_modules", ".bin", p))
            if not EXACT.match(p) and not local:
                return p
    return None


def prod_urls(root):
    try:
        with open(os.path.join(root, CONFIG), encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return []
    block = re.search(r"```factory\n(.*?)```", text, re.S)
    line = re.search(r"(?m)^prod-urls:\s*(.+)$", block.group(1)) if block else None
    return [u.strip() for u in line.group(1).split("#")[0].split(",") if u.strip()] if line else []


def host_pattern(url):
    """A prod URL as a pattern for its host and path over any scheme or none,
    so `http://`, `https://` and a bare host all match, while a subdomain such
    as `pr-7.<host>` does not."""
    bare = re.sub(r"^[a-z][\w+.-]*://", "", url.strip(), flags=re.I).rstrip("/")
    return re.compile(r"(?<![\w.-])" + re.escape(bare) + r"(?![\w-])", re.I)


def check_bash(command, urls, root="."):
    moved = False
    for words, assigns in segments(command):
        sub, args = subcommand(words, GIT_VALUED) if words[0] == "git" else (None, [])
        bundles = [w for w in args if re.fullmatch(r"-[a-zA-Z]+", w)]
        if words[0] == "git" and ("--no-verify" in words
                                  or sub == "commit" and any("n" in b for b in bundles)):
            return ("Commit and push with the hooks running: drop --no-verify, and fix "
                    "what the hook reports. A human may skip a hook and say so in the PR.")
        if sub == "push" and ("--force" in args or any(w.startswith("+") for w in args)
                              or any("f" in b for b in bundles)):
            return ("Push without rewriting the remote: drop --force, or use "
                    "--force-with-lease on your own branch.")
        package = unpinned(words, root, moved)
        moved = moved or words[0] in ("cd", "pushd")
        if package:
            return (f"Run `{package}` at an exact version that has passed the quarantine "
                    "(name@1.2.3, a week old or more), or `pnpm exec <bin>` for a tool the "
                    "project already installs.")
        if reads_env(words):
            return ENV_READING
        searching = words[0] in SEARCHES or (words[0] == "git" and sub in GIT_SEARCHES)
        if not searching:
            why = check_urls(" ".join(assigns + words), urls)
            if why:
                return why
    return None


def check_urls(text, urls):
    for url in urls:
        if url and host_pattern(url).search(text):
            return (f"Work against a local or test environment: `{url}` is production "
                    f"({CONFIG}, `prod-urls`).")
    return None


def check(event, root):
    tool, given = event.get("tool_name", ""), event.get("tool_input")
    if not isinstance(given, dict):
        return None
    urls = prod_urls(root)
    if tool == "Bash":
        return check_bash(given.get("command", ""), urls, root)
    if tool in ("Read", "Edit", "NotebookEdit", "Grep", "Glob"):
        paths = [given.get("file_path"), given.get("notebook_path"), given.get("path"),
                 given.get("glob")] + ([given.get("pattern")] if tool == "Glob" else [])
        for path in filter(None, map(str, paths)):
            if is_env(path):
                return ENV_READING
        return None
    if tool == "WebFetch":
        return check_urls(str(given.get("url", "")), urls)
    return None


def main():
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    if not isinstance(event, dict):
        return 0
    root = os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or os.getcwd()
    try:
        why = check(event, root)
    except Exception:  # a fence that can't parse the call lets it pass
        return 0
    if why:
        print(f"factory-guard: {why}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
