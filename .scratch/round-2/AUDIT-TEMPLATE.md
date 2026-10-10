# Audit template (round 2) — read-only

You audit ONE area of the trainm8 app (repo /home/user/trainm8, branch `main` at 326fc7f, deployed). Do NOT
edit, commit or push anything in the repo. Write your report to the path you are given.

Read first:
- /tmp/claude-0/-home-user-trainm8/b43bd67b-c9f6-5676-a3f3-8e6892822cae/scratchpad/BRIEF.md (all sections; "Round 2" at the end)
- CLAUDE.md, docs/agents/*.md, GLOSSARY.md, docs/design/design-system.md, ADR 0085 (design system), ADR 0081
  (Norwegian surfaces), ADR 0028 (mobile-first), ADR 0083 (tabs), plus the ADRs your area names.
- Spec: GitHub issue leskraas/trainm8#505 + its comment (ToolSearch "select:mcp__github__issue_read").
  Also search earlier issues for your area if useful (mcp__github__search_issues, repo leskraas/trainm8).
- Design: Arket prototype. Local copies in scratchpad/arket/ (variants c,d,i,l,o,p,q; notes/HANDOFF.md,
  notes/mobile-walkthrough.md). Other files can be fetched with the Artifact tool (ToolSearch "select:Artifact"),
  action "read", url https://claude.ai/artifact/UrHykJw7PibKYZnGUijxEY, `paths` e.g. ["variants/j.js",
  "variants/k.js","variants/n.js","variants/e.js","variants/m.js","notes/VISION.md","notes/SYNTHESIS.md",
  "notes/desktop-planner.md"], out_dir scratchpad/arket. Render a variant with
  file://…/scratchpad/arket/harness.html?v=J&s=goal (Chromium flag --allow-file-access-from-files).
  "Use it for ideas, not for its look" — the look is our design system (ADR 0085).
- Emil Kowalski's skills: scratchpad/ext/skills/skills/{emil-design-eng,apple-design,review-animations
  (+STANDARDS.md),mobile-native,break-ui (+CATALOG.md)}/SKILL.md and scratchpad/ext/skills/performance-cheatsheet.md.

Run the app: `npm run build` is already fresh on main? — check `build/` timestamp vs HEAD; if stale, build in a
COPY is not possible, so just run `PORT=<your port> NODE_ENV=production MOCKS=true node index.ts` from the repo
root after confirming build/ exists (do not rebuild if another agent might be using it; if build/ is missing,
run `npm run build` once). Log in kody/kodylovesyou. Playwright at
/home/user/trainm8/node_modules/playwright/index.mjs, executablePath '/opt/pw-browsers/chromium'.
Screenshot your area at 390×844 (isMobile, hasTouch) and 1280×860, light + dark, key states; save to
scratchpad/shots/r2-<area>-*.png and LOOK at them (Read tool). Measure anything that feels slow (long tasks,
layout shifts). Stop your server at the end (kill only your own PID).

Report format (Markdown, Norwegian prose is fine, tables preferred):
1. Kort oppsummering (5 linjer).
2. Spec-tabell: story/ADR-ref | Verdict (Built/Partial/Deviates/Missing) | Evidence file:line | Note.
3. Design-avvik vs Arket + designsystem (tokens, radius, type, components that should be ui/* primitives).
4. Håndverk: Emil-format Before/After/Why table (animations, press, hover gating, 44px, mobile-native, contrast).
5. break-ui-funn (severity table).
6. Engelsk tekst på norske flater (exact strings + file:line).
7. Ytelse (if measured).
8. Prioritert fiksliste: # | What | Files | Effort S/M/L | Needs owner decision? — and a proposed PR split
   (which items can run in parallel without touching the same files).
Be skeptical: verify by reading code paths and by looking at the running app, not by trusting comments/ADRs.
