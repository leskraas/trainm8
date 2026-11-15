import { useMemo } from 'react'
import { Link, useLoaderData, useNavigate } from 'react-router'
import {
	type AthleteOutput,
	type TodayOutput,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import { type Route } from './+types/dag.$dato.ts'
import { SessionDetail, useSessionActs, type DetailCtx } from './__book.tsx'
import { cap } from './__engine.server.ts'
import {
	actualText,
	addDays,
	dayLong,
	dayShort,
	deviation,
	isDayKey,
	planText,
} from './__format.ts'
import { BASE, ErrorBar, Shell } from './__ui.tsx'

export async function loader({ request, params }: Route.LoaderArgs) {
	const me = await cap<AthleteOutput>(request, 'athlete')
	if (!me.ok) return { kind: 'error' as const, message: me.message }
	const today = me.value.today
	const date =
		params.dato === 'i-dag' || !isDayKey(params.dato) ? today : params.dato
	const [week, t] = await Promise.all([
		cap<WeekOutput>(request, 'week', { date }),
		date === today ? cap<TodayOutput>(request, 'today') : Promise.resolve(null),
	])
	if (!week.ok) return { kind: 'error' as const, message: week.message }
	return {
		kind: 'day' as const,
		date,
		today,
		day: week.value.days.find((x) => x.date === date) ?? null,
		phase: week.value.phase,
		t: t && t.ok ? t.value : null,
	}
}

export const meta = () => [{ title: 'Bare i dag · Hovedbok' }]

export default function DayRoute() {
	const d = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const { doDone, doSkip } = useSessionActs()
	const ctx: DetailCtx | null = useMemo(
		() =>
			d.kind === 'day'
				? {
						data: { today: d.today },
						onDayPage: true,
						doDone,
						doSkip,
						setPlacing: (p) =>
							p && void navigate(`${BASE}?dato=${p.date}&flytt=${p.sid}`),
					}
				: null,
		[d, doDone, doSkip, navigate],
	)
	if (d.kind === 'error' || !ctx)
		return (
			<Shell title="Bare i dag">
				<ErrorBar
					message={d.kind === 'error' ? d.message : 'Fant ikke dagen.'}
				/>
			</Shell>
		)
	const sessions = d.day?.sessions ?? []
	const isToday = d.date === d.today
	return (
		<Shell
			title={isToday ? 'Bare i dag' : dayShort(d.date)}
			sub={
				d.phase
					? `${d.phase.name} · uke ${d.phase.planWeek}/${d.phase.planWeeks}`
					: undefined
			}
		>
			<div className="hb-page">
				<nav
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						marginBottom: 8,
					}}
					aria-label="Dager"
				>
					<Link
						className="btn sm"
						to={`${BASE}/dag/${addDays(d.date, -1)}`}
						aria-label="Dagen før"
					>
						← {dayShort(addDays(d.date, -1))}
					</Link>
					<Link className="btn sm" to={`${BASE}?dato=${d.date}`}>
						I boka
					</Link>
					<Link
						className="btn sm"
						to={`${BASE}/dag/${addDays(d.date, 1)}`}
						aria-label="Dagen etter"
					>
						{dayShort(addDays(d.date, 1))} →
					</Link>
				</nav>
				<h1
					style={{
						font: '700 26px/1.15 var(--sans)',
						letterSpacing: '-0.02em',
						margin: '8px 0 4px',
					}}
				>
					{dayLong(d.date)}
				</h1>
				{d.t ? (
					<p className="why" style={{ margin: '0 0 12px' }}>
						{d.t.readiness.sentence}
					</p>
				) : null}
				{!sessions.length ? (
					<>
						<p
							className="mono"
							style={{ fontSize: 28, fontWeight: 700, margin: '16px 0 4px' }}
						>
							Hvile
						</p>
						{d.t?.next ? (
							<p className="say">
								Neste: {dayShort(d.t.next.date)}{' '}
								<span className="mono">{planText(d.t.next)}</span>
							</p>
						) : null}
					</>
				) : (
					sessions.map((s) => {
						const dev = deviation(s, d.today)
						return (
							<section
								key={s.id}
								style={{
									borderTop: '2px solid var(--ink)',
									padding: '10px 0 18px',
								}}
							>
								<div
									className="mono"
									style={{
										fontSize: 22,
										fontWeight: 700,
										lineHeight: 1.2,
										overflowWrap: 'anywhere',
									}}
								>
									{planText(s) || s.title}
								</div>
								<div
									className="mono"
									style={{ fontSize: 15, margin: '4px 0 8px' }}
								>
									<span className="mute">Faktisk</span>{' '}
									{actualText(s, d.today) || '–'}{' '}
									{dev.sign ? (
										<b className={`t-${dev.tone}`}>{dev.sign}</b>
									) : null}
									{s.rpe != null ? (
										<span className="mute"> · tyngde {s.rpe}</span>
									) : null}
								</div>
								<SessionDetail s={s} ctx={ctx} />
							</section>
						)
					})
				)}
				<p className="why" style={{ marginTop: 24 }}>
					Fest denne siden på hjem-skjermen (Del → Legg til på Hjem-skjerm) for
					å åpne rett på dagen. Adressen{' '}
					<span className="mono">{BASE}/dag/i-dag</span> viser alltid dagens
					dato.
				</p>
			</div>
		</Shell>
	)
}
