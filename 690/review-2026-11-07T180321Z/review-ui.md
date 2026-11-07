# PR #690 review: UI (emil-design-eng, break-ui report-only, mobile-native)

emil-design-eng:
- Landing motion matches the house pattern (`duration-collapse` 200ms, `--ease-out` override, `starting:` translate-y-1/opacity-0, reduced motion keeps the fade) and runs only when the saved id changes after first render. Good.
- Credit sits under the figure, never folded (ADR 0098 §3). Good.
- U1 (low, needs design call): once *Endre distansen* opens the fix under a saved result or a mismatch, nothing closes it again except saving (the button hides while open, no *Avbryt*). Design spec is silent; leave for a decision.
- U2 (low): *Lagre distansen* is disabled with no choice, so the result section can never clear a distance (the form can). Matches "a second tap clears it" only in the form; leave, spec silent.

break-ui (report only, not rendered):
- 120-char Event name in Løpsresultater link: `[overflow-wrap:anywhere]` wraps; chevron inline. OK.
- Long credit ("Målt av klokka · Garmin Forerunner 965 Solar ..."): wraps. OK.
- 500 km ultra: time `52:10:00` in text-display, pace line wraps via flex-wrap. OK.
- km field: "abc", "0,5", "501" refused with the km message; "21,1" snaps to Halvmaraton. OK.
- Seven pills at 320px wrap to three rows at h-11. OK.

mobile-native:
- Pills h-11 (44px), Event link hit area extended via `::after`; `inputMode="decimal"`, `enterKeyHint="done"`, autocomplete off; Input uses the shared component (16px, no zoom). Hover underline is Tailwind v4 hover-media gated. OK.
- Needs a real phone: the decimal pad's comma on iOS nb-NO, and the collapse of the km field with the keyboard open.
