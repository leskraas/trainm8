import { Fragment, useRef, useState } from 'react'
import { Link, redirect, useLoaderData, useNavigate } from 'react-router'
import { type AthleteOutput } from '#app/lab/engine/reads.types.ts'
import {
	type AcceptPlanOutput,
	type OutlookWeek,
	type PlanPreviewOutput,
	type PreviewWeek,
	type SetupState,
	type StartOptionsOutput,
} from '#app/lab/engine/setup.types.ts'
import { type Route } from './+types/utkast.ts'
import { cap } from './__engine.server.ts'
import {
	addDays,
	dateMedium,
	dayShort,
	hm,
	isoWeek,
	n1,
	WD,
	WEEKDAY_KEYS,
} from './__format.ts'
import { NumCell, SRow } from './__setup.tsx'
import { BASE, Confirm, ErrorBar, Shell, useFlash, useHb } from './__ui.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const me = await cap<AthleteOutput>(request, 'athlete')
	if (!me.ok) return { kind: 'error' as const, message: me.message }
	if (me.value.setup.complete) throw redirect(BASE)
	const url = new URL(request.url)
	const [setup, opts] = await Promise.all([
		cap<SetupState>(request, 'get_setup'),
		cap<StartOptionsOutput>(request, 'start_options'),
	])
	if (!setup.ok) return { kind: 'error' as const, message: setup.message }
	if (!opts.ok) return { kind: 'error' as const, message: opts.message }
	const want = url.searchParams.get('stil')
	const style =
		opts.value.options.find((o) => o.style === want)?.style ??
		opts.value.options[0]?.style
	const preview = await cap<PlanPreviewOutput>(
		request,
		'plan_preview',
		style ? { style } : {},
	)
	if (!preview.ok) return { kind: 'error' as const, message: preview.message }
	return {
		kind: 'draft' as const,
		athlete: me.value,
		setup: setup.value,
		opts: opts.value,
		preview: preview.value,
	}
}

const EFFORT: Record<string, string> = {
	easy: 'rolig',
	moderate: 'middels',
	hard: 'hardt',
}

export default function DraftRoute() {
	const d = useLoaderData<typeof loader>()
	if (d.kind === 'error')
		return (
			<Shell title="Utkast">
				<ErrorBar message={d.message} />
				<p className="hb-page">
					<Link className="lnk" to={BASE}>
						← Tilbake til oppsettet
					</Link>
				</p>
			</Shell>
		)
	return <Draft d={d} />
}

function Draft({
	d,
}: {
	d: Extract<Awaited<ReturnType<typeof loader>>, { kind: 'draft' }>
}) {
	const { act } = useHb()
	const navigate = useNavigate()
	const scrollRef = useRef<HTMLDivElement>(null)
	const [adjust, setAdjust] = useState(true)
	const [sure, setSure] = useState(false)
	const [accepting, setAccepting] = useState(false)
	const { preview: p, opts, setup } = d
	const outlook =
		p.towardGoal && !p.towardGoal.problem ? p.towardGoal.outlook : p.outlook
	const phases =
		p.towardGoal && !p.towardGoal.problem ? p.towardGoal.phases : p.phases
	const hrs = outlook.map((w) => w.hours).filter((h): h is number => h != null)
	const option = opts.options.find((o) => o.style === p.style)
	const a = setup.answers
	const days =
		a.availability.days ??
		(a.availability.blockedDays
			? WEEKDAY_KEYS.filter((x) => !a.availability.blockedDays!.includes(x))
			: null)

	const summary = `Utkast: ${outlook.length} uker, ${phases.length} ${phases.length === 1 ? 'fase' : 'faser'}${hrs.length ? `, ${n1(Math.min(...hrs))}–${n1(Math.max(...hrs))} t/uke` : ''}.`

	return (
		<Shell
			title="Hovedbok"
			sub="utkast"
			bars={
				<div className="hb-bar draft" role="status">
					<span>
						<b>{summary}</b>
					</span>
					<button
						type="button"
						className="btn sm pri"
						onClick={() => setSure(true)}
						disabled={accepting}
					>
						{accepting ? 'Lager …' : 'Godta'}
					</button>
					<Link className="btn sm" to={BASE}>
						Forkast
					</Link>
					<button
						type="button"
						className="btn sm"
						aria-expanded={adjust}
						onClick={() => setAdjust(!adjust)}
					>
						Juster
					</button>
				</div>
			}
			scrollRef={scrollRef}
		>
			<div className="hb-page" style={{ paddingBottom: 4 }}>
				{adjust ? (
					<table className="sheet-t" aria-label="Parametere">
						<tbody>
							<tr>
								<td colSpan={2} className="sec">
									Parametere · regnes om når du endrer
								</td>
							</tr>
							<SRow q="Intensitets­fordeling" why={option?.styleName} filled>
								<div className="seg" role="group" aria-label="Planstil">
									{opts.options.map((o) => (
										<Link
											key={o.style}
											to={`?stil=${o.style}`}
											replace
											preventScrollReset
											aria-current={o.style === p.style}
										>
											{o.name}
											{o.badge ? ' ★' : ''}
										</Link>
									))}
								</div>
							</SRow>
							<SRow
								q="Timer/uke nå"
								why={assumedWhy(opts, 'currentHoursPerWeek')}
								filled={a.currentHoursPerWeek != null}
							>
								<NumCell
									label="Timer per uke nå"
									value={a.currentHoursPerWeek}
									placeholder={
										setup.suggested
											? `forslag ${n1(setup.suggested.currentHoursPerWeek)}`
											: ''
									}
									min={setup.choices.hoursPerWeek.min}
									max={setup.choices.hoursPerWeek.max}
									step={setup.choices.hoursPerWeek.step}
									suffix="t"
									onSave={(v) =>
										v == null
											? Promise.resolve()
											: act(
													'set_current_volume',
													{ hoursPerWeek: v },
													() => null,
												)
									}
								/>
							</SRow>
							<SRow
								q="Dager"
								why={assumedWhy(opts, 'days')}
								filled={days != null}
							>
								<div
									className="seg"
									role="group"
									aria-label="Dager du kan trene"
								>
									{WEEKDAY_KEYS.map((k, i) => {
										const on = days ? days.includes(k) : false
										return (
											<button
												key={k}
												type="button"
												aria-pressed={on}
												style={{ minWidth: 36, padding: 0 }}
												onClick={() => {
													const cur = days ?? []
													const next = on
														? cur.filter((x) => x !== k)
														: [...cur, k]
													if (!next.length) return
													void act(
														'set_availability',
														{ days: next },
														() => null,
													)
												}}
											>
												{WD[i]}
											</button>
										)
									})}
								</div>
							</SRow>
							<SRow q="Styrke/uke" filled>
								<div className="seg" role="group" aria-label="Styrke per uke">
									{[0, 1, 2, 3].map((n) => (
										<button
											key={n}
											type="button"
											aria-pressed={(a.strengthPerWeek ?? 0) === n}
											onClick={() =>
												void act('set_strength', { perWeek: n }, () => null)
											}
										>
											{n}
										</button>
									))}
								</div>
							</SRow>
						</tbody>
					</table>
				) : null}
				{option ? <p className="say">{option.why}</p> : null}
				{[
					...opts.notes,
					...p.notes,
					...(option?.strengthNotes ?? []),
					option?.shortOfHours?.note,
					option?.notFitted,
				]
					.filter(Boolean)
					.map((n, i) => (
						<p key={i} className="why" style={{ margin: '2px 0' }}>
							{n}
						</p>
					))}
				{opts.assumed.length ? (
					<p className="why" style={{ margin: '2px 0' }}>
						Antatt:{' '}
						{opts.assumed
							.map(
								(x) =>
									(x.question === 'days'
										? `${(x.value as string[]).length} dager`
										: `${n1(x.value as number)} t/uke`) +
									(x.from === 'history' ? ' (fra klokka)' : ' (fra nivået)'),
							)
							.join(', ')}
						. Endre over.
					</p>
				) : null}
				{p.towardGoal?.problem ? (
					<p className="why">{p.towardGoal.problem}</p>
				) : null}
			</div>
			<DraftTable p={p} outlook={outlook} />
			{sure ? (
				<Confirm
					title="Godta planen?"
					yes="Godta"
					onNo={() => setSure(false)}
					onYes={async () => {
						setSure(false)
						setAccepting(true)
						const r = await act<AcceptPlanOutput>(
							'accept_plan',
							{ style: p.style },
							(v) => ({
								what: `Plan laget: ${v.sessionsLaid} økter lagt ut fra ${dayShort(v.startsOn)}${v.goalProblem ? `. ${v.goalProblem}` : ''}`,
							}),
						)
						setAccepting(false)
						if (r.ok) void navigate(BASE)
					}}
				>
					Utkastet blir planen, og de to første ukene legges ut. Selve planen
					kan ikke angres, men hver økt kan flyttes, kortes og hoppes over
					etterpå.
				</Confirm>
			) : null}
		</Shell>
	)
}

function assumedWhy(o: StartOptionsOutput, q: 'currentHoursPerWeek' | 'days') {
	const x = o.assumed.find((a) => a.question === q)
	if (!x) return undefined
	return x.from === 'history' ? 'Antatt fra klokka.' : 'Antatt fra nivået.'
}

function DraftTable({
	p,
	outlook,
}: {
	p: PlanPreviewOutput
	outlook: OutlookWeek[]
}) {
	const laid = new Set(p.weeks.map((w) => w.weekStart))
	let lastPhase = ''
	const goal = p.towardGoal && !p.towardGoal.problem ? p.towardGoal.goal : null
	return (
		<table className="hb-t" style={{ width: '100%' }} aria-label="Planutkast">
			<colgroup>
				<col style={{ width: 64 }} />
				<col />
				<col style={{ width: 72 }} />
				<col style={{ width: 52 }} />
			</colgroup>
			<thead>
				<tr>
					<th className="lk">
						<button type="button" tabIndex={-1}>
							Dag
						</button>
					</th>
					<th>
						<button type="button" tabIndex={-1}>
							Plan
						</button>
					</th>
					<th>
						<button type="button" tabIndex={-1}>
							Innsats
						</button>
					</th>
					<th className="num">
						<button type="button" tabIndex={-1}>
							′
						</button>
					</th>
				</tr>
			</thead>
			<tbody>
				{outlook.map((w) => {
					const phaseRow =
						w.phase !== lastPhase ? (
							<tr className="ph">
								<td colSpan={4}>
									{w.phase} ·{' '}
									{plural(
										outlook.filter((x) => x.phase === w.phase).length,
										'uke',
										'uker',
									)}
								</td>
							</tr>
						) : null
					lastPhase = w.phase
					const week = p.weeks.find((x) => x.weekStart === w.weekStart)
					return (
						<Fragment key={w.weekStart}>
							{phaseRow}
							{week ? <DraftDays week={week} /> : null}
							<DraftWeekRow
								w={w}
								week={week ?? null}
								laid={laid.has(w.weekStart)}
							/>
						</Fragment>
					)
				})}
				{goal ? (
					<tr className="goal">
						<td colSpan={4}>
							◆ {dayShort(goal.date)} MÅL {goal.name}
						</td>
					</tr>
				) : null}
			</tbody>
		</table>
	)
}

function DraftDays({ week }: { week: PreviewWeek }) {
	return (
		<>
			{week.days.map((day) => {
				const items = [
					...day.sessions.map((s) => ({
						t: s.title,
						e: EFFORT[s.effort] ?? s.effort,
						m: s.minutes,
					})),
					...day.strength.map((s) => ({
						t: `${s.title}: ${s.lifts.join(', ')}`,
						e: 'styrke',
						m: null as number | null,
					})),
				]
				if (!items.length)
					return (
						<DraftRow
							key={day.date}
							date={day.date}
							first
							t="Hvile"
							e=""
							m={null}
						/>
					)
				return items.map((it, i) => (
					<DraftRow
						key={`${day.date}-${i}`}
						date={day.date}
						first={i === 0}
						t={it.t}
						e={it.e}
						m={it.m}
					/>
				))
			})}
		</>
	)
}

function DraftRow({
	date,
	first,
	t,
	e,
	m,
}: {
	date: string
	first: boolean
	t: string
	e: string
	m: number | null
}) {
	const ref = useFlash<HTMLTableCellElement>([t, e, m])
	return (
		<tr className="draft" data-date={date}>
			<td className="lk">{first ? dayShort(date) : ''}</td>
			<td ref={ref} className={t === 'Hvile' ? 'mute' : ''} title={t}>
				{t}
			</td>
			<td className={e === 'hardt' ? 't-over' : ''}>{e}</td>
			<td className="num">{m ?? ''}</td>
		</tr>
	)
}

function DraftWeekRow({
	w,
	week,
	laid,
}: {
	w: OutlookWeek
	week: PreviewWeek | null
	laid: boolean
}) {
	const ref = useFlash<HTMLTableCellElement>([w.hours, week?.totals.minutes])
	return (
		<tr className="wk draft">
			<td className="lk">U{isoWeek(w.weekStart)}</td>
			<td ref={ref}>
				{week
					? `Σ ${hm(week.totals.minutes * 60)} · ${week.totals.sessions} økter`
					: `${dateMedium(w.weekStart, false)}–${dateMedium(addDays(w.weekStart, 6), false)}`}
				{w.role !== 'loading' ? (
					<span className="mark">{w.roleLabel}</span>
				) : null}
				{!laid ? <span className="mark">legges ut uka før</span> : null}
			</td>
			<td>{week ? `${week.totals.hardSessions} harde` : ''}</td>
			<td className="num">
				{w.hours != null ? (
					`${n1(w.hours)}t`
				) : (
					<span className="q" title={w.why}>
						?
					</span>
				)}
			</td>
		</tr>
	)
}

function plural(n: number, one: string, many: string) {
	return `${n} ${n === 1 ? one : many}`
}
