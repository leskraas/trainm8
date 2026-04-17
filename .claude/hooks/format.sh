#!/bin/bash
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

if [ -z "$file_path" ]; then
  exit 0
fi

if echo "$file_path" | grep -qE '\.(ts|tsx|js|jsx|json|css|md|html)$'; then
  cd "$CLAUDE_PROJECT_DIR"
  npx prettier --write "$file_path" 2>/dev/null || true
fi
