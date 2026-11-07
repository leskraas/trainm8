# Architecture

Checks the issue against the glossary, the ADRs and the code before anyone
builds: finds drift, strained seams and one-way doors, settles each, and
commits the ADR or glossary change for what it settled on the issue's branch,
so it lands in the same PR as the code.

Read `bredvid-engineering:domain-modeling` first: it says where the glossary
and the ADRs live, and the format of each.

1. **Read where it stands.** Fetch the issue with its decisions and its
   `Design` section. On a resumed run, return each door the human approved
   with `approved_by` set to their login, and settle each door they changed
   again with their answer. Done when you know which doors are already
   settled.
2. **Check the issue against the domain.** Read the glossary and every ADR in
   the area the issue touches, then the code there, for:
   - **Drift**: a term the glossary defines differently or not at all, or a
     plan that contradicts an ADR.
   - **Strained seams**: places where the change fits the current structure
     only through a workaround (a flag threaded through, a special case in
     shared code, a duplicated rule), each with the restructuring that would
     let it fit, in `bredvid-engineering:codebase-design`'s vocabulary.
   - **One-way doors**, each with the code or ADR it touches.

   Done when every term in the acceptance criteria maps to the glossary, and
   every door and strained seam is named.
3. **Settle them.** Each door is a decision: the alternatives with what each
   locks in, and your answer, the durable one. Reversibility breaks ties
   between options that are otherwise equally sound. Settle drift by renaming
   in the issue, and say so. A restructuring with no door goes into the
   `Architecture` section as work the build does in the same PR.
4. **Write it down.** For each decision that warrants one (hard to reverse,
   surprising without context, a real trade-off), write a new ADR file or the
   glossary change, as `bredvid-engineering:domain-modeling` describes, and
   commit it on the issue's branch. Write the `Architecture` section: what
   the build must follow, each ADR by path. Done when every settled door has
   its ADR, its glossary line, or a line in your comment on why it needs
   neither.

## Result

- **outcome**: `forward` (next `implement`); `back` with `next` `spec` when
  the issue itself is wrong, saying what spec must change; or `blocked`.
- **decisions**: every door and meaning change, each with its `door` and
  `owner`.
- **sections**: `{"Architecture": ...}`.
- **branch**: the issue's branch, when you committed.
- **comment**: the doors and how each was settled, the drift fixed, the
  restructurings the build must make, and the files you committed.
