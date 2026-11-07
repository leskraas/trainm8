# Todo (design task, part 1: Designer, steps 1–4)

1. [x] **Read where it stands.** Fetch the issue: its acceptance criteria, its decisions, and on a resumed run the human's answer, which decides over everything else. A canvas from an earlier run is linked in its comment; read it and every comment on it as feedback. Done when each piece of feedback is something this run changes, or a line in your comment saying why not.
   - Fetched #672: 9 acceptance criteria, no comments, no earlier canvas, not a resumed run (no human answer). No feedback to act on.
2. [x] **Choose the tool** by the question the issue asks: Screens, flow, layout -> `/design` when `design: design` and the run is interactive; otherwise Emil's prototype. Interaction and motion -> Emil's prototype. Logic and state -> Matt's prototype, its logic branch. Emil's prototype is user-invoked only: read `SKILL.md` and `PICKER.md` in its skill folder and follow phases 1–5 with the issue as the brief, building its standalone branch: one self-contained HTML file in the project's own tokens.
   - Question is placement/layout; settings `design: prototype`, unattended -> Emil's prototype (bredvid-design-engineering prototype-ui), standalone branch.
3. [x] **Draw.** Unattended run: one variant, the direction you would ship, with its gain, its cost, and the worst case beside it. Done when each variant works in the browser with the issue's real content.
4. [x] **Canvas.** Write `canvas.html` in the evidence folder as canvas.md describes, with the verdict left to the critic, and a screenshot of each variant at 390 and 1440 pixels wide (`<variant>-mobile.png`, `<variant>-desktop.png`).
5. skip: part 4 (Designer again) records the choice after the critic.
