import { useEffect, useRef } from 'react'
import {
	Link,
	useLoaderData,
	useRevalidator,
	useSearchParams,
} from 'react-router'
import {
	type AthleteOutput,
	type PlanOutput,
	type ProgressOutput,
	type ProposalsOutput,
	type SessionCard,
	type TodayOutput,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import {
	type ConnectionsOutput,
	type GoalOutput,
	type ImportStatusOutput,
	type SetupState,
	type ThresholdsOutput,
} from '#app/lab/engine/setup.types.ts'
import { type Route } from './+types/index.ts'
import { Book, type BookData } from './__book.tsx'
import { allSessions, cap } from './__engine.server.ts'
import {
	addDays,
	dayShort,
	isDayKey,
	isoWeek,
	mondayOf,
	n0,
	n1,
	UNIT_LABEL,
} from './__format.ts'
import { SetupSheet } from './__sheet.tsx'
import { BASE, callCap, DEMO_REFUSED, ErrorBar, Shell, useHb } from './__ui.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	// `?demo=1`: the made-up demo athlete, said on screen. Writes do not work there.
	const demo = url.searchParams.get('demo') === '1'
	const D = demo ? { demo: true } : {}
	const me = await cap<AthleteOutput>(request, 'athlete', D)
	if (!me.ok) return { kind: 'error' as const, message: me.message }
	const a = me.value
	const today = a.today
	const fra = url.searchParams.get('fra')

	if (!a.setup.complete) {
		const [setup, conns, imp, goal] = await Promise.all([
			cap<SetupState>(request, 'get_setup'),
			cap<ConnectionsOutput>(request, 'connections'),
			cap<ImportStatusOutput>(request, 'import_status'),
			cap<GoalOutput>(request, 'goal'),
		])
		let history: SessionCard[] = []
		let from = mondayOf(addDays(today, -7 * 12))
		if (isDayKey(fra) && fra < from) from = mondayOf(fra)
		const errors: string[] = []
		if (a.recordings.count > 0) {
			const h = await allSessions(request, from, today)
			if (h.ok) history = h.value
			else errors.push(h.message)
		}
		for (const r of [setup, conns, imp, goal]) if (!r.ok) errors.push(r.message)
		return {
			kind: 'setup' as const,
			athlete: a,
			setup: setup.ok ? setup.value : null,
			conns: conns.ok ? conns.value : null,
			imp: imp.ok ? imp.value : null,
			goal: goal.ok ? goal.value : null,
			history,
			from,
			errors,
		}
	}

	const [plan, todayR, props, progress, goal, thr, w0, w1] = await Promise.all([
		cap<PlanOutput>(request, 'plan', D),
		cap<TodayOutput>(request, 'today', D),
		cap<ProposalsOutput>(request, 'proposals', D),
		cap<ProgressOutput>(request, 'progress', { weeks: 26, ...D }),
		demo ? Promise.resolve(null) : cap<GoalOutput>(request, 'goal'),
		demo ? Promise.resolve(null) : cap<ThresholdsOutput>(request, 'thresholds'),
		cap<WeekOutput>(request, 'week', { date: today, ...D }),
		cap<WeekOutput>(request, 'week', { date: addDays(today, 7), ...D }),
	])
	const p = plan.ok ? plan.value.plan : null
	const back12 = mondayOf(addDays(today, -7 * 12))
	// Start where the data does: twelve weeks back at most, this week at least.
	const firstData = [a.recordings.first, p?.firstWeek]
		.filter((x): x is string => !!x)
		.sort()[0]
	let from =
		firstData && firstData < mondayOf(today)
			? [back12, mondayOf(firstData)].sort()[1]!
			: mondayOf(today)
	if (p && p.firstWeek < from && p.firstWeek >= addDays(today, -364))
		from = p.firstWeek
	if (isDayKey(fra) && fra < from) from = mondayOf(fra)
	const goalDate =
		(goal?.ok ? goal.value.goal?.date : null) ?? p?.goal.date ?? null
	let to = addDays(mondayOf(today), 13)
	if (p && addDays(p.lastWeek, 6) > to) to = addDays(p.lastWeek, 6)
	if (goalDate && goalDate > to) to = addDays(mondayOf(goalDate), 6)
	if (to > addDays(today, 400)) to = addDays(today, 400)
	const sessions = await allSessions(request, from, to, demo)

	const errors: string[] = []
	for (const r of [plan, todayR, props, progress, goal, thr, sessions])
		if (r && !r.ok) errors.push(r.message)
	const eased: Record<string, boolean> = {}
	if (w0.ok) eased[w0.value.weekKey] = w0.value.eased
	if (w1.ok) eased[w1.value.weekKey] = w1.value.eased
	const run = thr?.ok ? thr.value.sports.find((s) => s.sport === 'run') : null

	const data: BookData = {
		today,
		from,
		to,
		sessions: sessions.ok ? sessions.value : [],
		plan: p,
		progressDays: progress.ok ? progress.value.days : [],
		progressWeekly: progress.ok ? progress.value.weekly : [],
		formTrust: progress.ok ? progress.value.formTrust : null,
		proposals: props.ok
			? props.value.proposals.filter((x) => x.state === 'waiting')
			: [],
		eased,
		goal: goal?.ok ? goal.value.goal : null,
		thresholdPace: run?.values.thresholdPacePerKm ?? null,
		canLoadOlder: !!a.recordings.first && a.recordings.first < from,
	}
	return {
		kind: 'book' as const,
		demo,
		athlete: a,
		data,
		today: todayR.ok ? todayR.value : null,
		proposals: props.ok ? props.value : null,
		progressGoal: progress.ok ? progress.value.goal : null,
		errors,
	}
}

export default function BookRoute() {
	const d = useLoaderData<typeof loader>()
	if (d.kind === 'error')
		return (
			<Shell title="Hovedbok">
				<ErrorBar message={d.message} />
			</Shell>
		)
	if (d.kind === 'setup') return <SetupSheet d={d} />
	return <BookView d={d} />
}

type BookLoader = Extract<Awaited<ReturnType<typeof loader>>, { kind: 'book' }>

function BookView({ d }: { d: BookLoader }) {
	const [params] = useSearchParams()
	const scrollRef = useRef<HTMLDivElement>(null)
	const { prefs, setPrefs, act, toast } = useHb()
	const revalidator = useRevalidator()
	const { data, today: t, proposals } = d
	const anchor = isDayKey(params.get('dato')) ? params.get('dato')! : data.today

	useEffect(() => {
		const n = params.get('nivaa')
		if (n === 'full' || n === 'enkel') setPrefs({ level: n })
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Let the plan catch up (closing a finished week) once per visit. Never
	// on demo data: that would write to the athlete's real plan.
	useEffect(() => {
		if (d.demo) return
		try {
			if (sessionStorage.getItem('hovedbok.refreshed')) return
			sessionStorage.setItem('hovedbok.refreshed', '1')
		} catch {
			/* no storage: refresh anyway */
		}
		void callCap<{ newProposals: boolean; appliedIds: string[] }>(
			'refresh_adaptation',
			{},
		).then((r) => {
			if (r.ok && (r.value.newProposals || r.value.appliedIds.length))
				void revalidator.revalidate()
		})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const flytt = params.get('flytt')
	const flyttS = flytt ? data.sessions.find((s) => s.id === flytt) : null
	const initialPlacing = flyttS
		? {
				sid: flyttS.id,
				title: flyttS.title,
				date: flyttS.date,
				mode: 'move' as const,
			}
		: null

	// The frozen top: the road to the goal and this week's volume.
	const p = data.plan
	const planDone = p
		? data.sessions.filter(
				(s) =>
					s.date >= p.firstWeek &&
					s.date <= data.today &&
					s.status !== 'recording-only',
			)
		: []
	const doneN = planDone.filter((s) => s.status === 'done').length
	const dueN = planDone.filter(
		(s) => s.date < data.today || s.status !== 'planned',
	).length
	const phase = t?.phase
	const goalName = data.goal?.name ?? p?.goal.name
	const days = data.goal?.daysLeft ?? p?.goal.daysToGo ?? null
	const waiting = data.proposals
	const changes = proposals?.changesMade

	const top = prefs.top ? (
		<div className="hb-top">
			<div>
				{p ? (
					<>
						{goalName
							? `${p.goal.kind === 'open-ended' ? '' : '◆ '}${goalName}`
							: ''}
						{days != null && days >= 0 ? ` · ${days} d` : ''}
						{phase
							? ` · uke ${phase.planWeek}/${phase.planWeeks} · ${phase.name}`
							: p.currentWeek
								? ` · uke ${p.currentWeek}/${p.totalWeeks}`
								: ''}
						{dueN ? ` · ${doneN}/${dueN} økter` : ''}
					</>
				) : (
					<span className="mute">Ingen plan.</span>
				)}
			</div>
			<div>
				U{isoWeek(data.today)}{' '}
				{t?.week.length ? (
					t.week
						.map((v) => {
							const u = UNIT_LABEL[v.unit] ?? v.unit
							const a = v.actual.value != null ? n1(v.actual.value) : '?'
							const goalV = v.target.value ?? v.planned.value
							const pct =
								v.actual.value != null && goalV
									? ` ${n0((v.actual.value / goalV) * 100)}%`
									: ''
							return `${v.sportName.slice(0, 2)} ${a}/${goalV != null ? n1(goalV) : '?'} ${u}${pct}`
						})
						.join(' · ')
				) : (
					<span className="mute">ingen mengde planlagt</span>
				)}
			</div>
			{t ? (
				<div className="wrap mute">
					{t.readiness.sentence}
					{t.readiness.nextSession.sentence
						? ` ${t.readiness.nextSession.sentence}`
						: ''}
				</div>
			) : null}
		</div>
	) : null

	const bars = (
		<>
			{d.demo ? (
				<div className="hb-bar warn" role="status">
					<span>
						<b>Demodata:</b> en oppdiktet utøver, ikke dine tall. Endringer
						virker ikke her.
					</span>
					<Link className="lnk" to={BASE}>
						Til dine tall →
					</Link>
				</div>
			) : null}
			{d.errors.map((m, i) => (
				<ErrorBar key={i} message={m} />
			))}
			{waiting.length ? (
				<div className="hb-bar draft" role="status">
					<span>
						<b>
							{waiting.length} {waiting.length === 1 ? 'forslag' : 'forslag'}
						</b>
						{proposals?.summary
							? ` fordi ${proposals.summary.charAt(0).toLowerCase()}${proposals.summary.slice(1).replace(/\.$/, '')}.`
							: '.'}
					</span>
					<button
						type="button"
						className="btn sm pri"
						onClick={() =>
							void act<{ accepted: string[]; failed: { because: string }[] }>(
								'accept_all_proposals',
								{},
								(v) => ({
									what: `Godtok ${v.accepted.length} forslag${v.failed.length ? `, ${v.failed.length} gikk ikke: ${v.failed[0]!.because}` : ''}`,
								}),
							)
						}
					>
						Godta alle
					</button>
					<Link
						className="btn sm"
						to={`?dato=${waiting.find((w) => w.session)?.session?.date ?? waiting[0]!.weekKey}`}
					>
						Gå gjennom
					</Link>
					<button
						type="button"
						className="btn sm"
						onClick={async () => {
							if (d.demo) {
								toast(DEMO_REFUSED, { error: true })
								return
							}
							let failed = 0
							for (const w of waiting) {
								const r = await callCap('answer_proposal', {
									proposalId: w.id,
									answer: 'no',
								})
								if (!r.ok) failed++
							}
							toast(
								failed
									? `Avviste ${waiting.length - failed}, ${failed} gikk ikke.`
									: `Avviste ${waiting.length} forslag.`,
							)
							void revalidator.revalidate()
						}}
					>
						Avvis
					</button>
				</div>
			) : null}
			{changes && changes.undoable > 0 ? (
				<div className="hb-bar" role="status">
					<span>
						Planen endret {changes.undoable}{' '}
						{changes.undoable === 1 ? 'ting' : 'ting'} selv.
					</span>
					<Link className="lnk" to={`${BASE}/logg`}>
						Se og angre i loggen →
					</Link>
				</div>
			) : null}
			{d.athlete.sources.some((s) => s.status === 'importing-history') ? (
				<ImportingBar />
			) : null}
		</>
	)

	return (
		<Shell
			title={
				<button
					type="button"
					onClick={() => setPrefs({ top: !prefs.top })}
					aria-expanded={prefs.top}
					style={{ fontWeight: 650 }}
				>
					Hovedbok {prefs.top ? '▾' : '▸'}
				</button>
			}
			sub={`${dayShort(data.today)} · ${d.athlete.name ?? d.athlete.username}`}
			top={top}
			bars={bars}
			scrollRef={scrollRef}
		>
			<Book
				data={data}
				anchor={anchor}
				scrollEl={scrollRef}
				olderHref={
					data.canLoadOlder
						? `?fra=${addDays(data.from, -84)}&dato=${data.from}`
						: null
				}
				initialPlacing={initialPlacing}
			/>
		</Shell>
	)
}

function ImportingBar() {
	const revalidator = useRevalidator()
	useEffect(() => {
		const t = setInterval(() => void revalidator.revalidate(), 5000)
		return () => clearInterval(t)
	}, [revalidator])
	return (
		<div className="hb-bar" role="status" aria-live="polite">
			Henter historikk fra klokka … boka fylles bakover.
		</div>
	)
}
