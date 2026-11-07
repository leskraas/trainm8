# Designer's pick (sealed until the critic has recommended)

**Pick: Målt.**

Why: the athlete notices a missing result on the Event page, right after the race, so the fix belongs there. Choosing a distance is one tap on a pill, and it settles both the no-distance case and the wrong-distance case. The Edit page stays planned-only, as it is today. Saying why there is no result ("Klokka målte 11,4 km, men løpet er 10 km") instead of showing nothing is what criterion 8 asks for. It is also what keeps the athlete from typing the race again on Løpsresultater, the problem the issue starts from.

What I would hold the build to, beyond the canvas:
- The credit line must be `recordingSource(...)` output beside the figure, never a separate component. ADR 0098 §3 is about placement, and a second credit path would drift from the one the session page uses.
- `Lagre distansen` on the Event page and the form's field must go through one writer, so that "set on a done Event writes the result then" has one code path.
- The effect line ("Øktene med 10 km-fart regner farten fra denne tida") must read the resolver's actual choice (newest, typed wins the same day), not restate the rule.
