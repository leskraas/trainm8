/**
 * PROTOTYPE — throwaway route for wayfinder ticket #437, "How does a generated
 * week say where it came from?" (map #434).
 *
 * Four structurally different answers to *where the provenance line lives*,
 * switchable via `?variant=A|B|C|D`, all rendering the same generated Build
 * week at 390 px:
 *
 *   A — Cited line: every session states its own source, always visible.
 *   B — The week is the citation: the week header makes the claim, sessions
 *       carry a one-word mark that taps into a fixed inspect panel.
 *   C — Receipt: rows carry no provenance ink at all; one strip opens the
 *       week's sources as a bibliography.
 *   D — Three resolutions: block says the model, week says its role in it, a
 *       session speaks only when it disagrees with the week or has a caveat.
 *
 * Delete this route and its `__provenance-*` siblings once the answer is
 * folded into the real review surface.
 */
import { useSearchParams } from 'react-router'
import { PrototypeSwitcher } from '#app/components/prototype-switcher.tsx'
import { PROTOTYPE_WEEK } from './__provenance-prototype-data.ts'
import { VariantA } from './__provenance-variant-a.tsx'
import { VariantB } from './__provenance-variant-b.tsx'
import { VariantC } from './__provenance-variant-c.tsx'
import { VariantD } from './__provenance-variant-d.tsx'
import { VariantE } from './__provenance-variant-e.tsx'

const VARIANTS = [
	{ key: 'E', name: 'Clean + drawer' },
	{ key: 'A', name: 'Cited line' },
	{ key: 'B', name: 'Week is the citation' },
	{ key: 'C', name: 'Receipt' },
	{ key: 'D', name: 'Three resolutions' },
]

export default function ProvenancePrototypeRoute() {
	const [searchParams] = useSearchParams()
	const variant = (searchParams.get('variant') ?? 'E').toUpperCase()
	const week = PROTOTYPE_WEEK

	return (
		<main className="bg-background min-h-screen pb-24">
			{variant === 'A' ? (
				<VariantA week={week} />
			) : variant === 'B' ? (
				<VariantB week={week} />
			) : variant === 'C' ? (
				<VariantC week={week} />
			) : variant === 'D' ? (
				<VariantD week={week} />
			) : (
				<VariantE week={week} />
			)}
			<PrototypeSwitcher variants={VARIANTS} current={variant} />
		</main>
	)
}
