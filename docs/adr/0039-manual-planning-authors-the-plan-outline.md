# Manual planning authors the Plan Outline; a plan stays a view

Manual training planning (map #362, decided in #364) is built on the existing
model rather than a parallel one, in three linked decisions:

1. **Vocabulary.** The existing terms stay canonical — **Training Plan** →
   **Plan Outline** phase → **Training Week**. Periodization theory's
   macrocycle / mesocycle / microcycle map onto them one-to-one and are
   recorded in `CONTEXT.md` as recognized synonyms, never as UI/code terms.
   The literature itself is inconsistent (Bompa's "macrocycle" is most
   coaches' "mesocycle"), and the platforms athletes know (TrainingPeaks ATP,
   intervals.icu) surface Friel-style words, not the Greek-rooted ones.

2. **One structure.** The **Plan Outline** stored on the **Event** is the
   single authored periodization structure. Manual authoring becomes a second
   producer of the same Outline that **Plan Generation** writes on approve —
   generation is "a way to fill in an Outline," not the Outline's owner. The
   #363 research gaps (athlete-controlled per-week load targets, loading vs
   recovery week structure, an explicit taper rule) extend the Outline's
   schema; the exact stored shape and migration are a follow-on ticket,
   decided once the V1 authoring scope (#365) is known. Rejected: a separate
   manual-plan structure (forks every downstream consumer — Plan card,
   Fitness Projection, Week Replan — and defeats the one-foundation goal);
   normalizing the JSON blob into relational entities now (may still happen,
   but in the data-model ticket with scope known, not here).

3. **Plan identity.** A manually authored plan is still a concept/view —
   Event (including a self-set `fitness-goal` Event for plans without a race)
   + its Outline + the Workout Sessions anchored to it — never a stored
   `Plan` entity. The owner's requirements that pushed on this (general plans
   without a specific event; repeatable/shareable plans; a plan library
   adaptable per athlete) are met without one: no-event plans anchor to a
   fitness-goal Event, and reuse/sharing/library belong to a future **Plan
   Template** entity — the template/instance split the domain already uses
   for Workout Template vs Workout Session, with sharing owned by the social
   layer (#337). The template carries identity; the applied plan does not.
