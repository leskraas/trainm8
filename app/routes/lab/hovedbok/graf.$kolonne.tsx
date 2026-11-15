import { Link, useLoaderData } from 'react-router'
import {
	type AthleteOutput,
	type ProgressOutput,
	type SessionCard,
} from '#app/lab/engine/reads.types.ts'
import { type Route } from './+types/graf.$kolonne.ts'
import { allSessions, cap } from './__engine.server.ts'
import { addDays, dateMedium, isoWeek, mondayOf, n0, n1 } from './__format.ts'
import { BASE, ErrorBar, Q, Shell } from './__ui.tsx'

const COLS = {
	form: {
		label: 'Form',
		unit: 'TSB',
		daily: true,
		why: 'Grunnform minus slitenhet. Over 0: uthvilt. Under −10: sliten.',
	},
	grunnform: {
		label: 'Grunnform',
		unit: 'CTL',
		daily: true,
		why: 'Snittet av belastningen de siste ~6 ukene.',
	},
	slitenhet: {
		label: 'Slitenhet',
		unit: 'ATL',
		daily: true,
		why: 'Snittet av belastningen den siste uka.',
	},
	belastning: {
		label: 'Belastning',
		unit: 'TSS/dag',
		daily: true,
		why: 'Belastningen hver dag.',
	},
	faktisk: {
		label: 'Faktisk',
		unit: 't/uke',
		daily: false,
		why: 'Timer gjort per uke.',
	},
	plan: {
		label: 'Plan',
		unit: 't/uke',
		daily: false,
		why: 'Timer planlagt per uke.',
	},
	km: { label: 'km', unit: 'km/uke', daily: false, why: 'Distanse per uke.' },
	tyngde: {
		label: 'Tyngde',
		unit: 'snitt 1–10',
		daily: false,
		why: 'Snitt av tyngden du har oppgitt per uke.',
	},
	avvik: {
		label: 'Avvik',
		unit: '% av plan',
		daily: false,
		why: 'Gjort mot planlagt belastning per uke.',
	},
} as const
type ColKey = keyof typeof COLS

export async function loader({ request, params }: Route.LoaderArgs) {
	const key = (
		Object.hasOwn(COLS, params.kolonne) ? params.kolonne : 'form'
	) as ColKey
	const me = await cap<AthleteOutput>(request, 'athlete')
	if (!me.ok) return { kind: 'error' as const, message: me.message }
	const today = me.value.today
	const from = mondayOf(addDays(today, -7 * 25))
	const to = addDays(mondayOf(today), 6 + 7 * 4)
	const [progress, sessions] = await Promise.all([
		cap<ProgressOutput>(request, 'progress', { weeks: 26 }),
		COLS[key].daily ? Promise.resolve(null) : allSessions(request, from, to),
	])
	if (!progress.ok) return { kind: 'error' as const, message: progress.message }
	if (sessions && !sessions.ok)
		return { kind: 'error' as const, message: sessions.message }
	return {
		kind: 'graph' as const,
		key,
		today,
		from,
		to,
		progress: progress.value,
		sessions: sessions?.value ?? null,
	}
}

export const meta = () => [{ title: 'Graf · Hovedbok' }]

type Point = { x: string; v: number | null; why?: string | null }

function weekly(
	key: ColKey,
	sessions: SessionCard[],
	p: ProgressOutput,
	from: string,
	to: string,
	today: string,
): Point[] {
	const out: Point[] = []
	for (let wk = from; wk <= to; wk = addDays(wk, 7)) {
		const ss = sessions.filter((s) => s.date >= wk && s.date <= addDays(wk, 6))
		const future = wk > today
		if (future && key !== 'plan') continue
		if (key === 'faktisk') {
			out.push({
				x: wk,
				v: future
					? null
					: ss.reduce(
							(a, s) =>
								a +
								(s.status === 'done' || s.status === 'recording-only'
									? (s.actual.durationS.value ?? 0)
									: 0),
							0,
						) / 3600,
				why: future ? 'Ikke skjedd ennå.' : null,
			})
		} else if (key === 'plan') {
			const pl = ss.filter((s) => s.status !== 'recording-only')
			out.push({
				x: wk,
				v: pl.length
					? pl.reduce((a, s) => a + (s.planned.durationS.value ?? 0), 0) / 3600
					: 0,
			})
		} else if (key === 'km') {
			out.push({
				x: wk,
				v: future
					? null
					: ss.reduce((a, s) => a + (s.actual.distanceM.value ?? 0), 0) / 1000,
				why: future ? 'Ikke skjedd ennå.' : null,
			})
		} else if (key === 'tyngde') {
			const r = ss.map((s) => s.rpe).filter((x): x is number => x != null)
			out.push({
				x: wk,
				v: r.length ? r.reduce((a, b) => a + b, 0) / r.length : null,
				why: r.length ? null : 'Ingen tyngde oppgitt.',
			})
		} else if (key === 'avvik') {
			const w = p.weekly.find((x) => x.weekKey === wk)
			const pl = w?.plannedLoad.value
			const ac = w?.actualLoad.value
			out.push({
				x: wk,
				v: pl && ac != null ? (ac / pl) * 100 : null,
				why: !w
					? 'Utenfor de 26 ukene.'
					: (w.verdict.why ??
						w.plannedLoad.why ??
						w.actualLoad.why ??
						'Kan ikke vites.'),
			})
		}
	}
	return out
}

export default function GraphRoute() {
	const d = useLoaderData<typeof loader>()
	if (d.kind === 'error')
		return (
			<Shell title="Graf">
				<ErrorBar message={d.message} />
			</Shell>
		)
	const col = COLS[d.key]
	const p = d.progress
	const k =
		d.key === 'grunnform'
			? 'fitness'
			: d.key === 'slitenhet'
				? 'fatigue'
				: d.key === 'belastning'
					? 'load'
					: 'form'
	const points: Point[] = col.daily
		? p.days.map((x) => ({ x: x.date, v: x[k].value, why: x[k].why }))
		: weekly(d.key, d.sessions ?? [], p, d.from, d.to, d.today)
	const known = points.filter((x) => x.v != null)
	return (
		<Shell title="Graf" sub={`${col.label} · ${col.unit}`}>
			<div className="hb-page">
				<div className="seg" role="tablist" aria-label="Kolonne">
					{(Object.keys(COLS) as ColKey[]).map((c) => (
						<Link
							key={c}
							to={`${BASE}/graf/${c}`}
							replace
							aria-current={c === d.key}
							role="tab"
							aria-selected={c === d.key}
						>
							{COLS[c].label}
						</Link>
					))}
				</div>
				<p className="why" style={{ margin: '6px 0' }}>
					{col.why}
				</p>
				{d.key === 'form' && !p.formTrust.trusted ? (
					<p className="say">
						<span className="q">?</span> = kan ikke vites ennå.{' '}
						{p.formTrust.why ??
							`Form trenger ${p.formTrust.requiredDays} dager, du har ${p.formTrust.daysOfHistory ?? 0}.`}
					</p>
				) : null}
				{known.length < 2 ? (
					<p className="say" style={{ padding: '24px 0' }}>
						For lite å tegne ennå. {points.find((x) => x.why)?.why ?? ''}
					</p>
				) : (
					<Chart
						points={points}
						bars={!col.daily}
						today={d.today}
						zeroLine={d.key === 'form' || d.key === 'avvik'}
						refLine={d.key === 'avvik' ? 100 : null}
					/>
				)}
				<table className="sub" style={{ marginTop: 16 }}>
					<thead>
						<tr>
							<th>{col.daily ? 'Uke (søndag)' : 'Uke'}</th>
							<th className="num">{col.label}</th>
						</tr>
					</thead>
					<tbody>
						{(col.daily
							? points.filter(
									(x, i) =>
										i === points.length - 1 ||
										new Date(`${x.x}T00:00:00Z`).getUTCDay() === 0,
								)
							: points
						)
							.slice()
							.reverse()
							.map((x) => (
								<tr
									key={x.x}
									style={
										x.x > d.today
											? { fontStyle: 'italic', color: 'var(--mute)' }
											: undefined
									}
								>
									<td>
										U{isoWeek(x.x)}{' '}
										<span className="mute">{dateMedium(x.x, false)}</span>
									</td>
									<td className="num">
										{x.v != null ? (
											d.key === 'avvik' ? (
												`${n0(x.v)}%`
											) : col.daily ? (
												n0(x.v)
											) : (
												n1(x.v)
											)
										) : x.why ? (
											<Q why={x.why} />
										) : (
											''
										)}
									</td>
								</tr>
							))}
					</tbody>
				</table>
				{p.goal ? (
					<p className="say mono" style={{ fontSize: 13 }}>
						◆ {p.goal.goal.name}
						{p.goal.weeksToGo != null
							? ` · ${p.goal.weeksToGo} uker igjen`
							: ''}
						{p.goal.planWeek
							? ` · uke ${p.goal.planWeek}/${p.goal.planWeeks}`
							: ''}
						{p.goal.phase ? ` · ${p.goal.phase}` : ''} · grunnform nå{' '}
						{p.goal.fitnessToday.value != null
							? n0(p.goal.fitnessToday.value)
							: '?'}{' '}
						→ på løpsdagen{' '}
						{p.goal.projectedFitnessOnGoalDay.value != null
							? n0(p.goal.projectedFitnessOnGoalDay.value)
							: '?'}
						{p.goal.projectedFitnessOnGoalDay.why ? (
							<span className="why">
								{' '}
								({p.goal.projectedFitnessOnGoalDay.why})
							</span>
						) : null}
					</p>
				) : null}
				{p.trend ? (
					<p className="say">
						{p.trend.weeks} uker på rad{' '}
						{p.trend.direction === 'under' ? 'under' : 'over'} planen.
					</p>
				) : null}
			</div>
		</Shell>
	)
}

function Chart({
	points,
	bars,
	today,
	zeroLine,
	refLine,
}: {
	points: Point[]
	bars: boolean
	today: string
	zeroLine: boolean
	refLine: number | null
}) {
	const W = 360
	const H = 170
	const padL = 30
	const padB = 18
	const vals = points.map((p) => p.v).filter((v): v is number => v != null)
	let min = Math.min(...vals, bars || zeroLine ? 0 : Infinity)
	let max = Math.max(...vals, refLine ?? -Infinity)
	if (min === max) {
		min -= 1
		max += 1
	}
	const y = (v: number) => H - padB - ((v - min) / (max - min)) * (H - padB - 8)
	const step = (W - padL) / Math.max(1, points.length - (bars ? 0 : 1))
	const x = (i: number) => padL + i * step + (bars ? step / 2 : 0)
	let d = ''
	let pen = false
	points.forEach((p, i) => {
		if (p.v == null) {
			pen = false
			return
		}
		d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`
		pen = true
	})
	const ti = points.findIndex(
		(p) => p.x >= today && (bars ? true : p.x === today),
	)
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			width="100%"
			role="img"
			aria-label={`Graf fra ${points[0]?.x} til ${points.at(-1)?.x}`}
			style={{ display: 'block', maxWidth: 720, font: '10px var(--mono)' }}
		>
			<line x1={padL} x2={W} y1={y(max)} y2={y(max)} stroke="var(--grid)" />
			<line x1={padL} x2={W} y1={y(min)} y2={y(min)} stroke="var(--grid)" />
			{zeroLine && min < 0 && max > 0 ? (
				<line
					x1={padL}
					x2={W}
					y1={y(0)}
					y2={y(0)}
					stroke="var(--mute)"
					strokeDasharray="2 3"
				/>
			) : null}
			{refLine != null ? (
				<line
					x1={padL}
					x2={W}
					y1={y(refLine)}
					y2={y(refLine)}
					stroke="var(--hit)"
					strokeDasharray="2 3"
				/>
			) : null}
			<text x={padL - 4} y={y(max) + 3} textAnchor="end" fill="var(--mute)">
				{n0(max)}
			</text>
			<text x={padL - 4} y={y(min) + 3} textAnchor="end" fill="var(--mute)">
				{n0(min)}
			</text>
			{ti >= 0 ? (
				<line
					x1={x(ti)}
					x2={x(ti)}
					y1={4}
					y2={H - padB}
					stroke="var(--ink)"
					strokeWidth="1"
				/>
			) : null}
			{bars ? (
				points.map((p, i) =>
					p.v == null ? (
						<text
							key={p.x}
							x={x(i)}
							y={H - padB - 3}
							textAnchor="middle"
							fill="var(--unk)"
						>
							?
						</text>
					) : (
						<rect
							key={p.x}
							x={x(i) - step * 0.35}
							width={step * 0.7}
							y={Math.min(y(p.v), y(Math.max(0, min)))}
							height={Math.abs(y(p.v) - y(Math.max(0, min)))}
							fill={p.x > today ? 'none' : 'var(--ink)'}
							stroke="var(--ink)"
							strokeDasharray={p.x > today ? '2 2' : undefined}
						/>
					),
				)
			) : (
				<path
					d={d}
					fill="none"
					stroke="var(--ink)"
					strokeWidth="1.6"
					strokeLinejoin="round"
				/>
			)}
			<text x={padL} y={H - 4} fill="var(--mute)">
				{points[0] ? dateMedium(points[0].x, false) : ''}
			</text>
			<text x={W} y={H - 4} textAnchor="end" fill="var(--mute)">
				{points.at(-1) ? dateMedium(points.at(-1)!.x, false) : ''}
			</text>
		</svg>
	)
}
