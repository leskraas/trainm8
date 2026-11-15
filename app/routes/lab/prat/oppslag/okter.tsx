import { Link, useLoaderData, useNavigate } from 'react-router'
import {
	type AthleteOutput,
	type SessionsOutput,
} from '#app/lab/engine/reads.types.ts'
import { run } from '../__data.server.ts'
import { addDays, dur, km, mondayOf, shortDate } from '../__fmt.ts'
import { setOrigin } from '../__overlay.tsx'
import { SportBadge, VerdictTag } from '../__ui.tsx'
import { type Route } from './+types/okter.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const weeks = Math.min(
		52,
		Math.max(4, Number(url.searchParams.get('uker')) || 8),
	)
	const me = await run<AthleteOutput>(request, 'athlete', {})
	if (!me.ok) return { error: me.message, sessions: [], weeks, more: false }
	const today = me.value.today
	const from = addDays(today, -weeks * 7)
	const sessions = []
	let cursor: string | undefined
	let pages = 0
	do {
		const r = await run<SessionsOutput>(request, 'sessions', {
			from,
			to: today,
			limit: 100,
			cursor,
		})
		if (!r.ok) return { error: r.message, sessions: [], weeks, more: false }
		sessions.push(...r.value.sessions)
		cursor = r.value.nextCursor ?? undefined
		pages++
	} while (cursor && pages < 5)
	return {
		error: null,
		sessions: sessions.reverse(),
		weeks,
		more: weeks < 52,
		firstRecording: me.value.recordings.first,
		from,
	}
}

const STATUS: Record<string, string> = {
	done: 'gjort',
	missed: 'ikke gjort',
	'recording-only': 'ekstra',
	planned: 'planlagt',
}

export default function OppslagOkter() {
	const data = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	if (data.error) return <p className="prat-err">{data.error}</p>
	const groups = new Map<string, typeof data.sessions>()
	for (const s of data.sessions) {
		const k = mondayOf(s.date)
		groups.set(k, [...(groups.get(k) ?? []), s])
	}
	return (
		<>
			<h2 className="prat-h2">Økter</h2>
			<p className="prat-note" style={{ margin: 0 }}>
				De siste {data.weeks} ukene, nyeste først. Planlagt mot gjort.
			</p>
			{!data.sessions.length ? <p>Ingen økter i denne perioden ennå.</p> : null}
			{[...groups.entries()].map(([monday, list]) => (
				<div
					key={monday}
					style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
				>
					<h3 className="prat-h3">Uka fra {shortDate(monday)}</h3>
					<div className="prat-list">
						{list.map((s) => (
							<button
								key={s.id}
								type="button"
								className="prat-row"
								onClick={(e) => {
									setOrigin(e.currentTarget)
									void navigate(`/lab/prat/okt/${s.id}`)
								}}
							>
								<SportBadge sport={s.sport} />
								<span className="prat-row-main">
									<span className="prat-row-title">{s.title}</span>
									<span className="prat-row-sub">
										{[
											shortDate(s.date),
											s.actual.durationS.value !== null
												? dur(s.actual.durationS.value)
												: s.planned.durationS.value !== null
													? `${dur(s.planned.durationS.value)} planlagt`
													: null,
											s.actual.distanceM.value
												? km(s.actual.distanceM.value)
												: null,
											STATUS[s.status],
											s.rpe !== null ? `tung ${s.rpe}/10` : null,
										]
											.filter(Boolean)
											.join(' · ')}
									</span>
								</span>
								<VerdictTag v={s.verdict} />
							</button>
						))}
					</div>
				</div>
			))}
			{data.more ? (
				<Link
					className="prat-chip quiet"
					style={{ alignSelf: 'center' }}
					to={`/lab/prat/oppslag/okter?uker=${Math.min(52, data.weeks * 2)}`}
					preventScrollReset
					replace
				>
					<span>Vis eldre</span>
				</Link>
			) : null}
		</>
	)
}
