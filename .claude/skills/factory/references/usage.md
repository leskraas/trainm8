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

Finishing comes before starting: a feature that is nearly built may use what
the five-hour window has left, while a feature no run has touched waits. So
the gate has two levels. With `r` as `usage-reserve` (default 10%):

`hold` stops all work but merges:

- the five-hour window is used to `1 - r` or more: until it resets;
- the weekly window is used to `1 - r` or more: until it resets;
- a window reports `rejected`: until it resets;
- the account is spending extra usage: until the window resets.

`hold_new` stops **new work** as well (an issue no run has touched yet, and the
scans), and lets started work run on:

- the weekly window is ahead of the week's **pace**, `1 - r` times the share of
  the week gone (at least one day's share): until the pace catches up.

Every `hold` is also a `hold_new`. A window past its reset counts for nothing.
Merges always run, and the next run or dispatch reads the usage again. Without a usage
file, when the events carry no `rate_limit_info`, or when the conductor can't
read it (`usage.error` says why), nothing holds: `unifiedWindows` is what Claude Code reports
today, not a public API, and the factory falls back to stopping when a limit
stops a subagent. The Admin API's usage and cost reports cover API keys billed
per token, after the fact, and know nothing of a subscription's limits.

## Extra usage

The factory spends only what the subscription's limits include, never extra
usage. A hold keeps it from starting near a limit, but a batch already running
can cross the limit before the next read, so only the account rules extra usage
out: an owner sets its extra usage limit to zero (claude.ai, Settings, Usage).
`usage.overage` is `off` when the account refuses extra usage, and `unknown`
when the events don't say. When it is `on`,
the report carries one line: extra usage is on for this account, and only
turning it off guarantees the factory never spends it.
