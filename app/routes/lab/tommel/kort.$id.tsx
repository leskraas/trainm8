import { useCallback, useState } from 'react'
import { useLoaderData, useNavigate, useRevalidator } from 'react-router'
import {
	type ProposalsOutput,
	type SessionOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { type Route } from './+types/kort.$id.ts'
import { BASE } from './__api.ts'
import { Deck, type Card } from './__deck.tsx'
import { dur, relDay } from './__format.ts'
import { athleteOrStart } from './__load.server.ts'
import { proposalCard } from './__ro-cards.tsx'
import {
	bigName,
	blockRows,
	feelingCards,
	resultCard,
	strengthRows,
} from './__session.tsx'
import { Rows } from './__ui.tsx'
import { useUndo } from './__undo.tsx'

export const meta = () => [{ title: 'Kort · Tommel' }]

/** A card by link: `okt.<sessionId>` for a session, else a proposal's id. */
export async function loader({ request, params }: Route.LoaderArgs) {
	const athlete = await athleteOrStart(request)
	const id = params.id
	if (id.startsWith('okt.')) {
		const s = await runCapability(request, 'session', {
			sessionId: id.slice(4),
		})
		return {
			today: athlete.today,
			session: s.ok ? (s.value as SessionOutput) : null,
			proposals: null,
			error: s.ok ? null : s.message,
			id,
		}
	}
	const p = await runCapability(request, 'proposals', {})
	return {
		today: athlete.today,
		session: null,
		proposals: p.ok ? (p.value as ProposalsOutput) : null,
		error: p.ok ? null : p.message,
		id,
	}
}

export default function KortById() {
	const { today, session, proposals, error, id } =
		useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const revalidator = useRevalidator()
	const { offer } = useUndo()
	const onEnd = useCallback(() => {
		void revalidator.revalidate()
		const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
		if (idx > 0) void navigate(-1)
		else void navigate(BASE)
	}, [navigate, revalidator])

	const [start] = useState<Card[]>(() => {
		if (session) {
			const s = session
			if (s.status === 'done' || s.status === 'recording-only') {
				const cards: Card[] = [resultCard(s)]
				if (
					s.status === 'done' &&
					s.feeling.rpe === null &&
					s.can.rateFeeling.allowed
				)
					cards.push(feelingCards(s, offer, { withResult: false }))
				return cards
			}
			const rows = s.strength ? strengthRows(s) : blockRows(s.structure)
			return [
				{
					key: `okt-${s.id}`,
					topic: `${relDay(s.date, today)}${s.time ? ` kl. ${s.time}` : ''}`,
					question: `${bigName(s)}.${s.planned.durationS.value ? ` ${dur(s.planned.durationS.value)}.` : ''}`,
					reason:
						s.status === 'missed'
							? `${s.title}. Ikke gjort.`
							: s.title !== bigName(s)
								? s.title
								: s.sportName,
					extra: rows.length ? (
						<Rows rows={rows} />
					) : s.description ? (
						<p className="tm-reason">{s.description}</p>
					) : undefined,
					kind: 'ok',
					why: s.adjustedBecause ? (
						<p>Justert: {s.adjustedBecause}</p>
					) : undefined,
				},
			]
		}
		const p = proposals?.proposals.find((x) => x.id === id)
		if (p && p.state === 'waiting')
			return [proposalCard(p, today, proposals?.summary ?? null, { offer })]
		return [
			{
				key: 'gone',
				topic: 'Kort',
				question: p ? 'Dette kortet er allerede besvart.' : 'Fant ikke kortet.',
				reason:
					p?.stateLabel ??
					error ??
					'Det kan være borte fordi det ikke lenger gjelder.',
				kind: 'ok',
			},
		]
	})

	return (
		<main aria-label="Kort">
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
