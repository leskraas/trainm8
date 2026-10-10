/**
 * `/design` — the design system, live (ADR 0085).
 *
 * Tokens and components only: colour roles in both themes, the type scale,
 * radii, elevation, spacing, the motion tokens with a demo per curve, and
 * every `app/components/ui` primitive in its states. No athlete data is read,
 * so unlike the `__prototype-*` pages (which read a real athlete's training
 * and are therefore development-only) this page is open to any logged-in
 * user: it is the reference a reviewer opens on the deployed app, on a real
 * phone, which is where the motion and touch rules can actually be judged.
 *
 * Not linked from the tabs. The written half is
 * `docs/design/design-system.md`.
 */
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { type Route } from './+types/design.ts'
import { ComponentsSection } from './__design-components.tsx'
import {
	ColourSection,
	MotionSection,
	ShapeSection,
	TypeSection,
} from './__design-tokens.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: 'Designsystem | Trainm8' },
	{ name: 'robots', content: 'noindex, nofollow' },
]

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return null
}

const CONTENTS = [
	['farger', 'Farger'],
	['typografi', 'Typografi'],
	['radius', 'Radius'],
	['hoyde', 'Høyde'],
	['avstand', 'Avstand'],
	['bevegelse', 'Bevegelse'],
	['komponenter', 'Komponenter'],
] as const

export default function DesignRoute() {
	return (
		<main className="space-y-12 container max-w-6xl py-6 md:py-8">
			<header className="space-y-3">
				<p className="text-overline text-primary uppercase">Trainm8</p>
				<h1 className="text-display">Designsystem</h1>
				<p className="text-body text-foreground max-w-prose">
					Rundere og roligere. Flater skilles med tone, ikke streker; tall står
					i tabellsifre; alt som trykkes svarer med en gang. Base UI under,
					tokens i <code className="text-callout">tailwind.css</code>.
				</p>
				<nav aria-label="Innhold" className="-mx-1 flex flex-wrap gap-1">
					{CONTENTS.map(([id, label]) => (
						<a
							key={id}
							href={`#${id}`}
							className="text-footnote text-muted-foreground hover:bg-muted hover:text-foreground pressable rounded-full inline-flex min-h-11 items-center px-3 select-none"
						>
							{label}
						</a>
					))}
				</nav>
			</header>
			<ColourSection />
			<TypeSection />
			<ShapeSection />
			<MotionSection />
			<ComponentsSection />
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
