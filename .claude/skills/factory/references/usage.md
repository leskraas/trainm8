# Usage

The factory runs on a Claude subscription and shares its five-hour and weekly
limits with everything else the owner does. Before it starts work, it reads how
much of each is used, and `conductor.py` decides whether the factory **holds**:
starts nothing new until `usage.until`.

## Read it

1. `get_session` from the `claude-code-remote` MCP server, with no
   `session_id`: `ccr.id` is this session's id. Every session on the account
   sees the same limits, so this session's own events are enough.
2. `list_events` with that `session_id`, `kinds: ["rate_limit_event"]` and
   `limit: 100`. Claude Code writes one such event per turn, so a long turn can
   push it off the newest page: when `data` is empty and `has_more` is true,
   call again with `before_id` set to `first_id`, at most five times.
3. Write what the last call returned, as it came, to `$S/usage.json`. When no
   event came back, write the `get_session` result instead.

Done when `$S/usage.json` holds a `list_events` or `get_session` result.

## When the factory holds

With `r` as `usage-reserve` (default 10%):

- the five-hour window is used to `1 - r` or more: until it resets;
- the weekly window is ahead of the week's **pace**, `1 - r` times the share of
  the week gone (at least one day's share): until the pace catches up;
- a window reports `rejected`: until it resets;
- the account is spending extra usage: until the window resets.

A hold stops new work only: merges still run, and the next run or dispatch
reads the usage again. Without a usage file, or when the events carry no
`rate_limit_info`, nothing holds: `unifiedWindows` is what Claude Code reports
today, not a public API, and the factory falls back to stopping when a limit
stops a subagent. The Admin API's usage and cost reports cover API keys billed
per token, after the fact, and know nothing of a subscription's limits.

## Extra usage

The factory spends only what the subscription's limits include, never extra
usage. A hold keeps it from starting near a limit, but a batch already running
can cross the limit before the next read, so only the account rules extra usage
out: an owner sets its extra usage limit to zero (claude.ai, Settings, Usage).
`usage.overage` is `off` when the account refuses extra usage. When it is `on`,
the report carries one line: extra usage is on for this account, and only
turning it off guarantees the factory never spends it.
