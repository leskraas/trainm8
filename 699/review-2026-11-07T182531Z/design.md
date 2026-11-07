# Design review (codebase-design): PR #699

- The modules match the issue's Architecture: pure `activities-edit.ts` (splice, boundary week, digest) behind one server `computeActivitiesEdit` shared by preview (prisma) and apply ($transaction). Deep: callers pass a choice and get a preview or a refusal.
- Pull-outs done as asked: layStartFamily, cutPhasesAt, fillKeptSlots/stampWeekInput, draftFirstRunPlan's stamp input, readPlanStartAnswers, trackRetiredAt.
- No findings that need a change. Note (low): the route module `__activities-edit.server.ts` owns the digest-required rule only implicitly; the fix for the Spec finding puts it in the form schema, as the philosophy switch does.
