import { useCallback, useMemo, useState } from 'react'
import { useLoaderData, useNavigate, useRevalidator } from 'react-router'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type ConnectionsOutput,
	type GoalOutput,
	type SetupState,
} from '#app/lab/engine/setup.types.ts'
import { type Route } from './+types/endre.ts'
import { BASE } from './__api.ts'
import { Deck, type Card } from './__deck.tsx'
import {
	endreStart,
	type EndreData,
	type FlowCtx,
	type Topic,
} from './__flows.tsx'
import { athleteOrStart } from './__load.server.ts'
import { useUndo } from './__undo.tsx'

export const meta = () => [{ title: 'Endre noe · Tommel' }]

const TOPICS: Topic[] = [
	'days',
	'goal',
	'watch',
	'zones',
	'strength',
	'plan',
	'account',
]

export async function loader({ request }: Route.LoaderArgs) {
	const athlete = await athleteOrStart(request)
	const [setup, goal, connections] = await Promise.all([
		runCapability(request, 'get_setup', {}),
		runCapability(request, 'goal', {}),
		runCapability(request, 'connections', {}),
	])
	if (!setup.ok) throw new Response(setup.message, { status: 500 })
	if (!goal.ok) throw new Response(goal.message, { status: 500 })
	if (!connections.ok) throw new Response(connections.message, { status: 500 })
	const tema = new URL(request.url).searchParams.get('tema')
	const data: EndreData = {
		setup: setup.value as SetupState,
		goal: goal.value as GoalOutput,
		connections: connections.value as ConnectionsOutput,
		recordingsCount: athlete.recordings.count,
		adjustAuto: athlete.adjustMode === 'autopilot',
	}
	return {
		data,
		today: athlete.today,
		tema: TOPICS.includes(tema as Topic) ? (tema as Topic) : null,
	}
}

export default function Endre() {
	const { data, today, tema } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const revalidator = useRevalidator()
	const { offer } = useUndo()
	const ctx = useMemo<FlowCtx>(
		() => ({
			today,
			nav: (to) => {
				void revalidator.revalidate()
				void navigate(to)
			},
			offer,
			openSheet: async () => {},
		}),
		[today, navigate, offer, revalidator],
	)
	const [start] = useState<Card[]>(() => [
		endreStart(ctx, data, tema ?? undefined),
	])
	const onEnd = useCallback(() => void navigate(BASE), [navigate])
	return (
		<main aria-label="Endre noe om deg">
			<Deck
				start={start}
				onEnd={onEnd}
				topLeft={
					<button
						type="button"
						className="tm-iconbtn"
						onClick={() => void navigate(BASE)}
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							aria-hidden="true"
						>
							<path d="m6 9 6 6 6-6" />
						</svg>
						<span style={{ fontSize: 14 }}>Til dagen</span>
					</button>
				}
			/>
		</main>
	)
}
