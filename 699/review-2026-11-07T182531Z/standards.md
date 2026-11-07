# Standards review: PR #699 at f4bab8f (diff: git diff origin/main...HEAD)
Skill: bredvid-code-review (Standards axis) run by hand in this agent (no subagents available).
Read: CLAUDE.md, ADR 0109, GLOSSARY diff, labels modules.

Findings
- None blocking. Words come from labels.ts (ACTIVITIES_EDIT_LABELS); no new dependencies; no guard files touched (diff stat: no .github/.claude/fly.toml/other changes).
- Low: `app/routes/settings/__activities-edit.server.ts` imports a component module (`../start/__start-option-card.tsx`) for `weekCardOf`; server helper reaching into a .tsx module. Existing pattern in start routes, left as is.
