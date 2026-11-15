import { useCallback, useMemo, useRef, useState } from 'react'
import { redirect, useLoaderData, useNavigate } from 'react-router'
import { type AthleteOutput } from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type PlanPreviewOutput,
	type SetupState,
} from '#app/lab/engine/setup.types.ts'
import { type Route } from './+types/oppstart.ts'
import { BASE, wasSeen } from './__api.ts'
import { Deck, type Card, type Next } from './__deck.tsx'
import {
	connectStart,
	dayCard,
	goalStart,
	hoursCard,
	introCard,
	levelCard,
	planStart,
	strengthCard,
	type FlowCtx,
} from './__flows.tsx'
import { PreviewSheet } from './__plansheet.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const me = await runCapability(request, 'athlete', {})
	if (!me.ok) throw new Response(me.message, { status: 500 })
	const a = me.value as AthleteOutput
	if (a.setup.complete) throw redirect(BASE)
	const setup = await runCapability(request, 'get_setup', {})
	if (!setup.ok) throw new Response(setup.message, { status: 500 })
	return { athlete: a, setup: setup.value as SetupState }
}

function resume(
	ctx: FlowCtx,
	a: AthleteOutput,
	s: SetupState,
): Next | Promise<Next> {
	const ans = s.answers
	if (s.missing.includes('sports')) return introCard(ctx)
	if (s.missing.includes('level')) return levelCard(ctx)
	if (ans.currentHoursPerWeek === null) return hoursCard(ctx, 4)
	if (ans.availability.days === null) return dayCard(ctx, 0, [])
	if (!a.goal && a.setup.next !== 'plan' && !wasSeen('goal-open')) {
		if (ans.strengthPerWeek === null && !wasSeen('strength-asked'))
			return strengthCard(ctx)
		if (!a.setup.hasSessionSource && !wasSeen('connect-asked'))
			return connectStart(ctx, () =>
				goalStart(ctx, { sports: ans.sports ?? undefined }),
			)
		return goalStart(ctx, { sports: ans.sports ?? undefined })
	}
	return planStart(ctx)
}

export default function Oppstart() {
	const { athlete, setup } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const [sheet, setSheet] = useState<PlanPreviewOutput | null>(null)
	const closeSheet = useRef<(() => void) | null>(null)

	const ctx = useMemo<FlowCtx>(
		() => ({
			today: athlete.today,
			nav: (to) => void navigate(to),
			offer: () => {}, // getting started has nothing to take back yet
			openSheet: (p) =>
				new Promise<void>((resolve) => {
					closeSheet.current = resolve
					setSheet(p)
				}),
		}),
		[athlete.today, navigate],
	)

	const [start] = useState<Card[]>(() => {
		if (athlete.setup.firstOpen || setup.missing.includes('sports'))
			return [introCard(ctx)]
		return [
			{
				key: 'resume',
				topic: 'Om deg',
				question: 'Vi var i gang. Fortsette der vi slapp?',
				reason: 'Det du har svart, er lagret.',
				yes: () => resume(ctx, athlete, setup),
				no: () => introCard(ctx),
			},
		]
	})

	const onEnd = useCallback(() => void navigate(BASE), [navigate])

	return (
		<main aria-label="Kom i gang">
			<Deck start={start} onEnd={onEnd} lockAfterWrite={false} />
			{sheet ? (
				<PreviewSheet
					p={sheet}
					onClose={() => {
						setSheet(null)
						closeSheet.current?.()
					}}
				/>
			) : null}
		</main>
	)
}
