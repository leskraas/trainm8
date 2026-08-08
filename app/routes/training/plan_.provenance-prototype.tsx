/**
 * PROTOTYPE — throwaway route for wayfinder ticket #437, "How does a generated
 * week say where it came from?" (map #434).
 *
 * Four structurally different answers were built and compared at 390 × 844 —
 * an always-on cited line, a week-level claim with per-row marks, a receipt,
 * and a three-resolution inheritance model. They live in this branch's history
 * at commit 7042b2d. What survived is the one below: **provenance is
 * available, not asserted** — clean rows, everything a tap away in a drawer.
 *
 * Still throwaway. Delete this route, `__provenance-week.tsx` and the stub week
 * once the design is folded into the real review surface, which does not exist
 * yet (generation is #455 / #456, the Catalogue is #448 / #451).
 */
import { PROTOTYPE_WEEK } from './__provenance-prototype-data.ts'
import { ProvenanceWeek } from './__provenance-week.tsx'

export default function ProvenancePrototypeRoute() {
	return (
		<main className="bg-background min-h-screen pb-12">
			<ProvenanceWeek week={PROTOTYPE_WEEK} />
		</main>
	)
}
