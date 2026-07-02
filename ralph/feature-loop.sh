#!/bin/bash
# Feature Loop heartbeat — LOCAL mode (no Orca).
#
# One stage per run: the /feature-loop skill derives state from GitHub and does
# the next thing (generate 3 candidates, design, slice, build, ship). Fire it on
# a schedule with cron/launchd, e.g. every 30 min:
#
#   */30 * * * * cd /ABS/PATH/to/trainm8 && ralph/feature-loop.sh >> /tmp/feature-loop.log 2>&1
#
# The skill also self-locks; this dir-lock just avoids spawning a second claude
# while one is still running.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCK=".git/feature-loop.lock.d"
# Clear a stale lock (>2h) left by a crashed run.
if [ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
  rmdir "$LOCK" 2>/dev/null || true
fi
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(date -u +%FT%TZ) feature-loop: lock held, skipping this fire."
  exit 0
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

echo "$(date -u +%FT%TZ) feature-loop: firing one stage"
claude --permission-mode acceptEdits "Run /feature-loop"
