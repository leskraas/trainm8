import { useSearchParams } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PrototypeSwitcher } from '#app/components/prototype-switcher.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getActivePlan } from '#app/utils/training.server.ts'
import { AscentVariant } from './__proto-x-ascent.tsx'
import { BlockBuilderVariant } from './__proto-x-blockbuilder.tsx'
import { BuilderVariant } from './__proto-x-builder.tsx'
import { DeskVariant } from './__proto-x-desk.tsx'
import { LibraryVariant } from './__proto-x-library.tsx'
import { NegotiationVariant } from './__proto-x-negotiation.tsx'
import { SculptVariant } from './__proto-x-sculpt.tsx'
import { SequencerVariant } from './__proto-x-sequencer.tsx'

// ─────────────────────────────────────────────────────────────────────────────
// PROTOTYPE — clean-room second opinion for issue #366 (manual planning).
// Four radically different takes on how a self-coaching athlete authors the
// Plan Outline (season → phase → Training Week), switchable via ?variant=.
// All state is in-memory; nothing persists. Delete this route when #366 lands.
// ─────────────────────────────────────────────────────────────────────────────

export const meta = () => [{ title: 'Manual planning — prototype X | Trainm8' }]

export async function loader({ request }: { request: Request }) {
	const userId = await requireUserId(request)
	const activePlan = await getActivePlan(userId)
	return { activePlan }
}

const VARIANTS = [
	{ key: 'f', name: 'Block builder — bar chart, rail, week table' },
	{ key: 'h', name: 'Sculpt — the graph-first take on the Block builder' },
	{ key: 'g', name: 'Library — template gallery, apply then tweak' },
	{ key: 'e', name: 'Builder — professional ATP-style plan builder' },
	{ key: 'a', name: 'Sequencer — the season as a groovebox' },
	{ key: 'b', name: 'Ascent — the plan as an expedition map' },
	{ key: 'c', name: 'Desk — a paper planner with stamps' },
	{ key: 'd', name: 'Negotiation — a plan that talks back' },
]

export default function ManualPlanPrototypeX({
	loaderData,
}: {
	loaderData: Awaited<ReturnType<typeof loader>>
}) {
	const [searchParams] = useSearchParams()
	const variant = searchParams.get('variant') ?? 'f'
	const plan = loaderData.activePlan

	return (
		<div className="min-h-screen pb-24">
			<div className="border-b border-amber-500/30 bg-amber-500/15 px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
				Prototype — throwaway exploration for #366 · nothing you do here is
				saved
			</div>
			{variant === 'f' && <BlockBuilderVariant plan={plan} />}
			{variant === 'h' && <SculptVariant plan={plan} />}
			{variant === 'g' && <LibraryVariant plan={plan} />}
			{variant === 'e' && <BuilderVariant plan={plan} />}
			{variant === 'a' && <SequencerVariant plan={plan} />}
			{variant === 'b' && <AscentVariant plan={plan} />}
			{variant === 'c' && <DeskVariant plan={plan} />}
			{variant === 'd' && <NegotiationVariant plan={plan} />}
			<PrototypeSwitcher variants={VARIANTS} current={variant} />
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
