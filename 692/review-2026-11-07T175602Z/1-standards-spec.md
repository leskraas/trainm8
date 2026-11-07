# PR #692 — Standards and Spec (bredvid-code-review, run inline, no subagents)

Diff: `git diff origin/main...0ded74b` (27 files, +1276/-371). Spec: issue #503 (ACs, Architecture, Decisions), ADR 0112, ADR 0078, ADR 0086.
Standards sources: CLAUDE.md (incl. Rules for agents), docs/agents/*.md (factory.md human-paths/human-edits), GLOSSARY.md, docs/adr/, smell baseline.

## Standards

S1 (medium, hard, docs/agents/factory.md `human-paths: .github/`; CLAUDE.md guard files). `playwright.config.ts:31-41` adds a `webkit` project, but CI installs only Chromium (`.github/workflows/deploy.yml:111` `npx playwright install chromium`). The Playwright job will fail on `home-reading-position.test.ts` in WebKit ("Executable doesn't exist") until a human edits the guard file. Not an agent fix: human step. Also `playwright.config.ts` is a `human-edits` path, so the PR waits for a human at merge anyway.
S2 (low, hard-ish, consistency). `package.json:26` `test:e2e:install` still installs only chromium, so `npm run test:e2e:run` after it fails on the webkit project locally. Fix: install chromium and webkit.
S3 (low, judgement: Duplicated Code). `app/utils/athlete-calendar.ts:27` adds a second module-level formatter cache beside `nbParts`' `NB_PART_FORMATTERS` (`app/utils/format.ts:283`). Spec asked for "the pattern nbParts already uses", so endorsed; not flagged further.
S4 (low, judgement). `progressiveChunkSize: Number.POSITIVE_INFINITY` (`app/entry.server.tsx:116`) is a document-wide streaming setting chosen for one route. Today no other route server-renders a Suspense boundary (`training/sessions.$sessionId.tsx:1204` renders its boundary only after mount), so no other route changes behaviour now; a later server-rendered boundary on any route inherits it. Comment and ADR 0112 consequences record it. Leave, record as a decision.
No other documented-standard breaches found; no new dependencies; no `--no-verify`; renamed type alias `SessionEntryRow as SessionRow` in 4 files is a mild Mysterious Name (judgement, low; left).

## Spec

Architecture items 1–3, 6 implemented as written or as amended by implement Decisions (StreamWeek = memo(Suspense(WeekBlock)); bars built with the day; progressiveChunkSize). Item 4: `scripts/measure-home-stream.ts --nav` added. Item 5 (fallback) not built, per Decision.
P1 (medium): AC 7 "It holds in Chromium and in WebKit ... and an e2e test pins both" — file and project exist, but WebKit cannot run in CI until the human install step (S1). AC not demonstrably met in CI yet.
P2 (n/a here): AC 1–4 budgets are measurement criteria; implement's Decision says medians within budget on a loaded machine and asks for a quiet re-measure. QA's job; not re-measured here (instructed).
P3 (n/a here): AC 11 real-phone check is the owner's (human step).
P4 (low): AC 5 landing before first paint now depends on `progressiveChunkSize`; only the existing e2e `tests/e2e/home-timeline.test.ts:379` would notice it being dropped, and only if the seed page passes 12.8KB before today's week. No unit-level pin. Follow-up, not verified.
No scope creep beyond the measurement script and ADR text.

Summary: Standards 4 findings (worst: S1 CI cannot run WebKit — human step); Spec 4 (worst: P1 WebKit AC unproven in CI until that step).
