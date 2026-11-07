# Design canvas

One canvas per issue: one self-contained HTML file, `canvas.html` in the design task's evidence folder. In an interactive run the orchestrator also publishes it as an artifact and later runs republish to the same URL. The designer draws the variants; the critic fills the verdict. A reader knows the verdict after five seconds and the whole canvas after two minutes.

## Boards, in order

1. **Overview**, always first:
   1. **Verdict strip**: one line of chips: the recommendation, the round, the open decisions, the risk. Example: `Recommended: Calm · run 2 · 1 decision · two-way door`. Until the critic has run, the first chip is `Critique pending`.
   2. **One picture**: the recommended variant at full size, or a before/after against today's screen, with a one-line caption.
   3. **Comparison table**: one column per variant; rows for axis position, gain, cost, criteria held, worst case, build cost and status. A cell holds a value or a short phrase.
   4. **Decisions**: one line each: the question, then the recommended answer.
   5. **Appendix**, collapsed (`<details>`): the critic's scoring per criterion, a disagreement from the designer, the method, and rejected directions.
2. **One board per variant**: the variant at full size in realistic context, working. With Emil's prototype this is its picker, one variant at a time. With Matt's logic prototype it is the state model and a transcript of a run.
3. **Worst case**: each variant with `break-ui`'s worst-case data, behind its "Demo data / Worst case" toggle.
4. **Earlier runs**, collapsed, newest first.

Say each point once: a recommendation in the strip gets no section of its own. Aim for 600 words or fewer above the appendix. Keep code paths, routes and variant codes in the appendix.

## Status chips

Every variant and every run carries one: `Current`, `Chosen`, `Rejected` or `Superseded`. A new run moves the last run's boards to **Earlier runs** as `Superseded`, and its own variants are `Current`. A choice marks one variant `Chosen` and the rest `Rejected`.

## Feedback

Feedback on the canvas is input to the next design run; only a comment on the
issue moves the flow on. Read every comment on the artifact since the last
run, and compare the published canvas with the file the last run wrote: a
board that differs was edited by a human, and is the clearest feedback of all.
When you can't read the artifact, say so in the comment rather than assume no
one commented.
