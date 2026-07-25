/**
 * PROTOTYPE — throwaway route for #366, clean-room second pass.
 *
 * Question: how should MANUAL training planning look and feel — how does a
 * self-coaching athlete see and edit the season → phase → week structure?
 *
 * Four variants on one route, switchable with `?variant=`, each written as if a
 * different company's design team owned the feature. All four edit the *same*
 * in-memory plan, so switching mid-edit shows the same state through four
 * design languages. Nothing persists; no mutation is wired.
 *
 * Grounding: the athlete's real seeded Target Event, read-only. Vocabulary is
 * the app's (ADR 0039) — Training Plan / Plan Outline phase / Training Week.
 *
 * Delete this route and its `__manual-prototype-x-*` siblings once the design
 * question is answered.
 */
import { useLoaderData, useSearchParams } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { PrototypeSwitcher } from '#app/components/prototype-switcher.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/plan.manual-prototype-x.ts'
import { APPLE_NAME, VariantApple } from './__manual-prototype-x-apple.tsx'
import { GOOGLE_NAME, VariantGoogle } from './__manual-prototype-x-google.tsx'
import { HYBRID_NAME, VariantHybrid } from './__manual-prototype-x-hybrid.tsx'
import { PEAKS_NAME, VariantPeaks } from './__manual-prototype-x-peaks.tsx'
import { usePlanStore } from './__manual-prototype-x-state.ts'
import { STRAVA_NAME, VariantStrava } from './__manual-prototype-x-strava.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: 'Manual planning · prototype X | Trainm8' },
]

const VARIANTS = [
	{ key: 'a', name: APPLE_NAME },
	{ key: 'b', name: GOOGLE_NAME },
	{ key: 'c', name: STRAVA_NAME },
	{ key: 'd', name: PEAKS_NAME },
	{ key: 'e', name: HYBRID_NAME },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	// Real seeded grounding: the nearest upcoming Event. Read-only — the
	// prototype never writes back.
	const event = await prisma.event.findFirst({
		where: {
			athleteId: userId,
			status: 'planned',
			startDate: { gt: new Date() },
		},
		orderBy: { startDate: 'asc' },
		select: { name: true, startDate: true },
	})
	return {
		seedEvent: {
			name: event?.name ?? 'Spring Half Marathon',
			date: (event?.startDate ?? new Date(Date.now() + 84 * 864e5))
				.toISOString()
				.slice(0, 10),
		},
	}
}

export default function ManualPlanningPrototypeX() {
	const { seedEvent } = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()
	const variant = searchParams.get('variant') ?? 'a'
	// A fixed "today" keeps every screenshot and every variant comparable.
	const store = usePlanStore(seedEvent, new Date())

	return (
		<div className="bg-background min-h-screen">
			<div className="mx-auto max-w-[1500px] px-4 pt-4">
				<PageHeader
					title="Manual planning — prototype X"
					back={{ to: '/', label: 'Home' }}
					actions={
						<span className="bg-destructive text-destructive-foreground rounded-full px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase">
							Prototype
						</span>
					}
				/>
				<p className="text-muted-foreground mt-1 mb-2 text-xs">
					Throwaway (#366). Four design languages over one in-memory Plan
					Outline — edits are shared between variants and nothing is saved.
				</p>
			</div>

			{variant === 'a' ? <VariantApple store={store} /> : null}
			{variant === 'b' ? <VariantGoogle store={store} /> : null}
			{variant === 'c' ? <VariantStrava store={store} /> : null}
			{variant === 'd' ? <VariantPeaks store={store} /> : null}
			{variant === 'e' ? <VariantHybrid store={store} /> : null}

			<PrototypeSwitcher variants={VARIANTS} current={variant} />
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
