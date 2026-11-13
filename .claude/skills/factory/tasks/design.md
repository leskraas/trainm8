# Design

Draws what the user will see before anyone builds it, and chooses a direction.
A separate critic judges the drawing, so the designer never grades its own
work.

## Parts

The orchestrator runs this task as subagents, each given the results before
it:

1. **Designer**: steps 1–4. It returns the variants, the canvas file and its
   sealed **pick**.
2. **Build cost**, only with more than one variant: a read-only subagent that
   reads the code each variant would touch and rates each `small`, `medium`
   or `large`, with the reason in one line, naming that code and any one-way
   door the variant would open.
3. **Critic**: [design-critic.md](design-critic.md), given the variants, the
   canvas file and the build cost. It gets the designer's pick sealed, and
   opens it only after it has recommended.
4. **Designer again**: step 5, with the critic's recommendation. It writes the
   result file, with the designer's comment and then the critic's.

In an interactive run, the orchestrator publishes the canvas file with the
`Artifact` tool after part 1 and gives the URL to the later parts, which
republish to that URL.

## Steps

Read-only on the repo: everything you draw goes in the evidence folder. The
canvas follows [../references/canvas.md](../references/canvas.md).

1. **Read where it stands.** Fetch the issue: its acceptance criteria, its
   decisions, and on a resumed run the human's answer, which decides over
   everything else. A canvas from an earlier run is linked in its comment;
   read it and every comment on it as feedback. Done when each piece of
   feedback is something this run changes, or a line in your comment saying
   why not.
2. **Choose the tool** by the question the issue asks:

   | Question | Tool |
   |---|---|
   | Screens, flow, layout | `/design` when `design: design` and the run is interactive; otherwise Emil's prototype |
   | Interaction and motion | Emil's prototype, `bredvid-design-engineering:prototype` |
   | Logic and state | Matt's prototype, `bredvid-engineering:prototype`, its logic branch |

   Emil's prototype is user-invoked only: read `SKILL.md` and `PICKER.md` in
   its skill folder (`skills/prototype-ui/` of `bredvid-design-engineering`,
   or `.claude/skills/prototype-ui/` in the repo) and follow phases 1–5 with
   the issue as the brief, building its standalone branch: one self-contained
   HTML file in the project's own tokens.
3. **Draw.**
   - **Interactive run**: name one axis the acceptance criteria leave open
     (layout, density, personality, motion, interaction model, or for logic
     the state model), and make three variants on it, each a direction you
     could defend shipping, with a name, its place on the axis, and one line
     each on gain and cost.
   - **Unattended run**, and any run under `poc`: one variant, the direction
     you would ship, with its gain, its cost, and the worst case beside it.

   Draw to the phase's bar (`questions.md`, "The bar").

   Done when each variant works in the browser with the issue's real content.
4. **Canvas.** Write `canvas.html` in the evidence folder as canvas.md
   describes, with the verdict left to the critic, and a screenshot of each
   variant at 390 and 1440 pixels wide (`<variant>-mobile.png`,
   `<variant>-desktop.png`).
5. **Record the choice.** The critic's recommendation is the choice, unless
   the human's answer chose otherwise. Record it as a decision with the
   critic's reason and the rejected variants, and write the `Design` section:
   the chosen variant's name, its screenshots (`evidence:` links), the canvas,
   and what the build must match, as a short list. Mark the chosen variant
   `Chosen` and the others `Rejected` on the canvas. Done when the `Design`
   section alone tells a builder what to build.

## Result

- **outcome**: `forward` (`next` is `architecture` when the issue's plan has
  it, else `implement`); `back` with `next` `spec` when the criteria
  contradict each other, saying what spec must change; or `blocked`.
- **sections**: `{"Design": ...}` from step 5.
- **decisions**: the choice, and any other decision the drawing settled.
- **evidence**: the evidence folder.
- **comment**: first line `Tool: <tool> · Axis: <axis>`; the canvas and
  screenshots as `evidence:` links; a table of the variants (name, place on
  the axis, gain, cost, build cost); then the critic's verdict, and any
  disagreement with your pick in one line.
