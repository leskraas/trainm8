# Icon Workflow Eval Prompts

Canonical eval definitions live in `evals/evals.json`. This file summarizes intent.

## Should trigger

1. **Shadcn + lucide cleanup** — `npx shadcn add breadcrumb` left `lucide-react` imports; normalize to `Icon` + Sly + build.
2. **Sly calendar icon** — add via Tabler-first pipeline, render with `Icon`.
3. **Library choice** — Tabler vs Hugeicons vs Radix; expect Tabler primary, Hugeicons fallback.

## Should not trigger (out of scope)

1. **Prisma query optimization** — no Sly/sprite steps; stay on database/loader performance.

## Running the eval viewer

From repo root (paths are inside the skill folder):

```bash
SC="$HOME/.claude/plugins/cache/claude-plugins-official/skill-creator/unknown/skills/skill-creator"
WS=".claude/skills/icon-workflow/icon-workflow-workspace/iteration-1"
python3 "$SC/scripts/aggregate_benchmark.py" "$WS" --skill-name icon-workflow \
  --skill-path ".claude/skills/icon-workflow"
python3 "$SC/eval-viewer/generate_review.py" "$WS" \
  --skill-name icon-workflow \
  --benchmark "$WS/benchmark.json" \
  --static "$WS/review.html"
```

Open `review.html` in a browser for the combined Outputs + Benchmark tabs.
