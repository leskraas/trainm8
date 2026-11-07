# Explore

The cheap, read-only run before anyone builds: what the issue really asks,
whether its claims hold, how far the change reaches, and whether the factory
can build it straight away. Its comment is what a human reads instead of a
diff.

Read-only: you may run the app, its tests and throwaway scripts, and you
write only to the evidence folder.

1. **Read.** Fetch the issue with its comments, every issue it links, the
   glossary (`GLOSSARY.md` or `CONTEXT.md`), the ADRs in the area, and
   `.out-of-scope/` when it exists. Done when you can say in one line, in the
   glossary's words, what the issue asks for.
2. **Check the claims.** Reproduce a bug: a failing test, a command, or the
   app driven in a browser, with a screenshot in the evidence folder. Trace it
   to its root cause, with file and line. For a request, find what the code
   already does about it. A finding is **verified** when it traces to code you
   read or a command you ran; anything else is an open question. Done when
   each claim in the issue is `holds`, `fails` or `can't tell`, with its
   evidence.
3. **Look for duplicates** among open and recently closed issues
   (`conductor.py list 'repos/<o>/<r>/issues?state=all'`). An issue that is
   the same bug, root cause or request as an older one duplicates the
   oldest. Confirm it from the code, not the wording: issues that need
   separate changes are related, and both stay. Done when you have named the
   duplicate, or the issues you ruled out.
4. **Size the change.** The blast radius, in prose: the two or three places
   that matter (modules, routes, tables, public API), a schema change or
   migration first and loudly. Then one door, committed: `one-way` or
   `two-way`, with its reason.
5. **Choose the next task.**
   - `implement`: the right change is clear, nobody would disagree with any
     decision in it, it is a two-way door, and it touches a handful of files
     with no schema, API or dependency change. You would be happy for its PR
     to land without you.
   - `spec`: everything else. When you are weighing it up, that weighing is
     the answer.
   - A duplicate ends `done` with `duplicate_of`.
   - Information only the reporter has, with no assumption worth betting on:
     `blocked`, with the questions for them.

## Result

- **outcome**: `forward` with `next` `implement` or `spec`; `done` with
  `duplicate_of`; or `blocked`.
- **comment**, about twenty lines: the verdict and one line on why; whether
  the claims hold, with evidence; the blast radius; the door; the root cause
  or the approach you would take; last, the open questions a human or the
  spec must settle. An empty list of questions is a claim, and usually a
  wrong one. A duplicate's comment is one line: why it is the same issue.
