#!/usr/bin/env python3
"""The factory's guard: a Claude Code `PreToolUse` hook that turns the agent
rules every factory repo writes in AGENTS.md into a check the agent can't
argue past. `/factory-setup` copies it to `.claude/hooks/factory-guard.py`
and registers it in `.claude/settings.json`; both are guard files.

It holds in every phase: these rules protect the keys, the hooks and the
supply chain, not the users, so no phase loosens them.

- Reading `.env*` (but `.env.example` and the like).
- `--no-verify` on a git command.
- `git push --force` (`--force-with-lease` is fine).
- `npx`, `pnpm dlx`, `yarn dlx` or `bunx` on a package without an exact
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

ENV_FILE = re.compile(r"(?:^|[\s/'\"=<:])\.env(?:\.[\w.-]+)?(?=$|[\s'\";|&)>])")
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
    """The simple commands in a shell line, split on ; && || | and newlines."""
    for part in re.split(r"&&|\|\||[;|\n]", command):
        try:
            words = shlex.split(part, comments=True)
        except ValueError:
            words = part.split()
        while words and re.fullmatch(r"\w+=.*", words[0]):  # FOO=bar cmd
            words = words[1:]
        if words and words[0] in ("sudo", "env", "command", "exec", "time"):
            words = words[1:]
        if words:
            yield words


LOCAL_RUNNERS = {("npx",), ("bunx",), ("pnpx",)}  # these run an installed bin first


def unpinned(words, root="."):
    """The package a runner call would fetch without an exact version, or None."""
    if words[0] in ("pnpm", "yarn"):  # pnpm -s dlx x: read the options after dlx
        sub, after = subcommand(words)
        if sub:
            words = [words[0], sub, *words[1:len(words) - len(after) - 1], *after]
    for runner in RUNNERS:
        if tuple(words[:len(runner)]) != runner:
            continue
        rest, packages, skip = words[len(runner):], [], False
        if runner in LOCAL_RUNNERS and {"--no-install", "--no"} & set(rest):
            return None
        for w in rest:
            if skip:
                packages.append(w)
                skip = False
            elif w in VALUED:
                skip = w in ("-p", "--package")
            elif w.startswith("--package="):
                packages.append(w.split("=", 1)[1])
            elif w.startswith("-"):
                continue
            else:
                packages.append(w)
                break
        for p in packages:
            local = runner in LOCAL_RUNNERS and "@" not in p.lstrip("@") \
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
    for words in segments(command):
        sub, args = subcommand(words, GIT_VALUED) if words[0] == "git" else (None, [])
        if words[0] == "git" and "--no-verify" in words:
            return ("Commit and push with the hooks running: drop --no-verify, and fix "
                    "what the hook reports. A human may skip a hook and say so in the PR.")
        if sub == "push" and any(w in ("-f", "--force") or w.startswith("+") for w in args):
            return ("Push without rewriting the remote: drop --force, or use "
                    "--force-with-lease on your own branch.")
        package = unpinned(words, root)
        if package:
            return (f"Run `{package}` at an exact version that has passed the quarantine "
                    "(name@1.2.3, a week old or more), or `pnpm exec <bin>` for a tool the "
                    "project already installs.")
        searching = words[0] in SEARCHES or (words[0] == "git" and sub in GIT_SEARCHES)
        if not searching:
            why = check_urls(" ".join(words), urls)
            if why:
                return why
    if ENV_FILE.search(ENV_SAFE.sub("", command)):
        return ("Leave `.env*` files unread: take settings from the docs, the example "
                "file or the code that reads them.")
    return None


def check_urls(text, urls):
    for url in urls:
        if url and host_pattern(url).search(text):
            return (f"Work against a local or test environment: `{url}` is production "
                    f"({CONFIG}, `prod-urls`).")
    return None


def check(event, root):
    tool, given = event.get("tool_name", ""), event.get("tool_input") or {}
    urls = prod_urls(root)
    if tool == "Bash":
        return check_bash(given.get("command", ""), urls, root)
    if tool in ("Read", "Edit", "Write", "NotebookEdit", "Grep", "Glob"):
        paths = [given.get("file_path"), given.get("notebook_path"), given.get("path"),
                 given.get("glob")] + ([given.get("pattern")] if tool == "Glob" else [])
        for path in filter(None, map(str, paths)):
            name = os.path.basename(path.rstrip("/"))
            if re.fullmatch(r"\.env(?:[.*][\w.*-]*)?", name) and not ENV_SAFE.search(name):
                return ("Leave `.env*` files unread: take settings from the docs, the "
                        "example file or the code that reads them.")
        return None
    if tool == "WebFetch":
        return check_urls(str(given.get("url", "")), urls)
    return None


def main():
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    root = os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or os.getcwd()
    why = check(event, root)
    if why:
        print(f"factory-guard: {why}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
