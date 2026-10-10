# Fix-PR template (round 2)

Read: scratchpad/BRIEF.md (all, esp. "Round 2"), CLAUDE.md, docs/agents/*.md, docs/design/design-system.md,
ADR 0081 (Norwegian; words live in app/utils/labels.ts), ADR 0085 (design system), the audit report you are
given, and Emil's skills under scratchpad/ext/skills/skills/ relevant to UI work (emil-design-eng,
review-animations, mobile-native). Use TDD (.claude/skills/tdd/SKILL.md) for behaviour.

Setup (you are in your own git worktree): `git fetch origin claude/round-2 && git checkout -B <branch> origin/claude/round-2` (ONE big PR for round 2: everything lands on `claude/round-2`),
`npm install`, copy /home/user/trainm8/.env, symlink /home/user/trainm8/prisma/data.db. For anything that writes
data while exploring, use a COPY of the DB (DATABASE_URL to a scratchpad copy).

Other agents run in parallel on other areas. Stay strictly inside your listed files; in shared files
(labels.ts, tailwind.css, format.ts) touch only your own block/section and add rather than reorder.

Verify before pushing: `npm run lint` (0 errors), `npm run typecheck`, `npx vitest run <touched dirs>`;
`npm run build`, then `PORT=<your port> NODE_ENV=production MOCKS=true MOCK_INTERVALSICU=true node index.ts`
and `PLAYWRIGHT_TEST_BASE_URL=http://localhost:<port> PORT=<port> npx playwright test <relevant e2e files>`.
Screenshot changed surfaces at 390×844 (touch) and 1280, light+dark → scratchpad/shots/<branch>-*.png and look.
Stop your server (only your PID).

Commit with trailers:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DAvBhPqhzsh2nymW3FmfBf
Push: `git push -u origin <branch>`. Do NOT open a PR. Report: branch, commits, verification, screenshots,
anything left or needing an owner decision.

## Emil Kowalski's skills are MANDATORY (owner, 2026-10-10)
Read in full before touching UI: scratchpad/ext/skills/skills/emil-design-eng/SKILL.md, apple-design/SKILL.md,
review-animations/SKILL.md + STANDARDS.md, mobile-native/SKILL.md, break-ui/SKILL.md + CATALOG.md,
animate/SKILL.md (+RECIPES.md) and scratchpad/ext/skills/performance-cheatsheet.md.
Before pushing, run each against your changed surfaces and put in your report:
- review-animations: Emil's Before | After | Why table + verdict (Block/Approve); fix every Block.
- mobile-native: checklist result (tap highlight, touch-action, 44px, 16px inputs, safe areas, hover gating,
  overscroll) and what needs a real phone.
- emil-design-eng/apple-design: hierarchy, tracking, tabular-nums, radii from the scale, contrast AA.
- break-ui: worst-case data table (long names, 0/1/huge counts, missing fields) for your surfaces.
