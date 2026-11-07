#!/bin/bash
# Cloud sessions only: install npm dependencies and the Chromium that the
# repo's pinned @playwright/test expects (the image ships another revision).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Run npm install only if a listed file has changed since it last succeeded.
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  npm install --no-audit --no-fund
  sha256sum .claude/hooks/session-start.sh package.json package-lock.json > "$hashes" || rm -f "$hashes"
fi

# Idempotent: returns at once when this Playwright's Chromium is already there.
npx playwright install chromium
