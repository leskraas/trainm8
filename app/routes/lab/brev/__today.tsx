/**
 * The day's notes: Lappen for each session, the rest-day note, and the
 * stamp for what the watch brought in without a plan.
 */
import { useEffect, useState } from 'react'
import {
	type SessionCard,
	type SessionOutput,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import {
	type LinkOptionsOutput,
	type LinkRecordingOutput,
	type SkipSessionOutput,
} from '#app/lab/engine/sessions.types.ts'
import { Lapp, headline } from './__lapp.tsx'
import {
	DAY_NAME,
	dateText,
	cap,
	known,
	minText,
	mondayOf,
	n1,
	timeOf,
	weekdayOf,
} from './__lib.ts'
import { addPs } from './__ps.ts'
import { ErrorLine, N, SportMark, Stamp, useWrite } from './__ui.tsx'

export function DayNotes({
	date,
	today,
	sessions,
	details,
	week,
	next,
	timeZone,
	openFirst,
	label,
	planStarts,
}: {
	date: string
	today: string
	sessions: SessionCard[]
	details: Record<string, SessionOutput | null>
	week: WeekOutput | null
	next?: SessionCard | null
	timeZone?: string
	openFirst?: boolean
	label?: string
	/** The plan's first Monday, when the plan has not started yet. */
	planStarts?: string | null
}) {
	const planned = sessions.filter((s) => s.status !== 'recording-only')
	const extras = sessions.filter((s) => s.status === 'recording-only')
	const dayLabel =
		label ?? (date === today ? 'I dag' : cap(DAY_NAME[weekdayOf(date)]))
	return (
		<div style={{ display: 'grid', gap: 22 }}>
			{planned.length === 0 ? (
				<div className="b-lapp b-lapp-yellow b-pin">
					<p className="b-p" style={{ margin: 0 }}>
						<strong style={{ fontWeight: 600 }}>{dayLabel}: ingenting.</strong>{' '}
						{planStarts && date < planStarts
							? `Planen starter ${DAY_NAME[weekdayOf(planStarts)]} ${dateText(planStarts)}. Til da kan du trene som du vil, eller hvile.`
							: 'Det er en del av planen.'}
					</p>
					{next ? (
						<p className="b-small" style={{ margin: '8px 0 0' }}>
							Neste: {cap(DAY_NAME[weekdayOf(next.date)])}, {next.title}
							{known(next.planned.durationS) ? (
								<>
									{' '}
									<N>{minText(next.planned.durationS.value / 60)}</N>
								</>
							) : null}
							.
						</p>
					) : null}
				</div>
			) : (
				planned.map((s, i) => (
					<Lapp
						key={s.id}
						card={s}
						detail={details[s.id] ?? null}
						week={week}
						today={today}
						timeZone={timeZone}
						defaultOpen={openFirst && i === 0}
						dayLabel={dayLabel}
					/>
				))
			)}
			{extras.map((x) => (
				<ExtraNote
					key={x.id}
					card={x}
					detail={details[x.id] ?? null}
					planned={planned.filter((p) => p.status === 'planned')}
					timeZone={timeZone}
				/>
			))}
		</div>
	)
}

const DISMISS = 'brev-not-instead'

/**
 * A recording no plan asked for. When it lands on a day with a planned
 * session of another kind, the note asks whether it was instead of it.
 */
function ExtraNote({
	card,
	detail,
	planned,
	timeZone,
}: {
	card: SessionCard
	detail: SessionOutput | null
	planned: SessionCard[]
	timeZone?: string
}) {
	const [dismissed, setDismissed] = useState(true)
	useEffect(() => {
		try {
			const list = JSON.parse(
				window.localStorage.getItem(DISMISS) ?? '[]',
			) as string[]
			setDismissed(list.includes(card.id))
		} catch {
			setDismissed(false)
		}
	}, [card.id])
	const options = useWrite<{ recordingId: string }, LinkOptionsOutput>(
		'link_options',
	)
	const link = useWrite<
		{ recordingId: string; sessionId: string },
		LinkRecordingOutput
	>('link_recording')
	const skip = useWrite<{ sessionId: string }, SkipSessionOutput>(
		'skip_session',
	)
	const [answer, setAnswer] = useState<string | null>(null)
	const target = planned[0]
	const actualMin = known(card.actual.durationS)
		? card.actual.durationS.value / 60
		: null
	const dist = known(card.actual.distanceM)
		? card.actual.distanceM.value / 1000
		: null
	const t = detail?.recording?.startedAt
		? timeOf(detail.recording.startedAt, timeZone)
		: card.time
	const { noun } = headline(card)
	const recId = detail?.recording?.id ?? null

	function forget() {
		try {
			const list = JSON.parse(
				window.localStorage.getItem(DISMISS) ?? '[]',
			) as string[]
			window.localStorage.setItem(
				DISMISS,
				JSON.stringify([...list, card.id].slice(-100)),
			)
		} catch {
			// fine
		}
		setDismissed(true)
	}

	async function yes() {
		if (!target) return
		if (recId) {
			const o = await options.call(
				{ recordingId: recId },
				{ revalidate: false },
			)
			if (o.ok && o.value.options.some((x) => x.id === target.id)) {
				const r = await link.call({ recordingId: recId, sessionId: target.id })
				if (r.ok) {
					addPs({
						weekKey: mondayOf(card.date),
						text: `${card.sportName} kl. ${t ?? ''} koblet til ${target.title}.`,
						token: r.value.undo,
						noUndoBecause: r.value.noUndoBecause,
					})
					setAnswer('Da kobler jeg den til dagens økt.')
				}
				return
			}
		}
		const r = await skip.call({ sessionId: target.id })
		if (r.ok) {
			addPs({
				weekKey: mondayOf(card.date),
				text: `${target.title} byttet ut med ${card.sportName.toLowerCase()} (${actualMin !== null ? minText(actualMin) : 'ukjent lengde'}).`,
				token: r.value.undo,
				noUndoBecause: r.value.noUndoBecause,
			})
			setAnswer(
				`Da står ${target.title} som ikke gjort, og ${noun}en teller for seg selv.`,
			)
		}
	}

	const asks = target && target.sport !== card.sport && !dismissed && !answer
	return (
		<div className="b-lapp" style={{ paddingTop: 16 }}>
			<p className="b-p" style={{ margin: 0 }}>
				<Stamp>Mottatt{t ? ` ${t}` : ''}</Stamp>{' '}
				<SportMark sport={card.sport} />
				{card.title}
				{actualMin !== null ? (
					<>
						, <N>{minText(actualMin)}</N>
					</>
				) : null}
				{dist !== null ? (
					<>
						, <N>{n1(dist)} km</N>
					</>
				) : null}
				. Uten plan.
			</p>
			{asks ? (
				<div className="b-fade-in" style={{ marginTop: 10 }}>
					<p className="b-p" style={{ marginBottom: 8 }}>
						Var denne {noun === 'sykkel' ? 'turen' : 'økta'} i stedet for{' '}
						{target.title.toLowerCase()}?
					</p>
					<div className="b-row">
						<button
							type="button"
							className="b-btn"
							disabled={link.pending || skip.pending || options.pending}
							onClick={() => void yes()}
						>
							Ja
						</button>
						<button
							type="button"
							className="b-btn b-btn-ghost"
							onClick={forget}
						>
							Nei
						</button>
					</div>
				</div>
			) : null}
			{answer ? <p className="b-small b-fade-in">{answer}</p> : null}
			<ErrorLine message={options.error ?? link.error ?? skip.error} />
		</div>
	)
}
