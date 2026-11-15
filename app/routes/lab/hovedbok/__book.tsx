import {
	Fragment,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react'
import { Link } from 'react-router'
import {
	type FormTrust,
	type PlanOutput,
	type ProgressDay,
	type ProgressWeek,
	type ProposalItem,
	type SessionCard,
	type SessionOutput,
	type Verdict,
} from '#app/lab/engine/reads.types.ts'
import {
	type LinkOptionsOutput,
	type StrengthLoad,
	type StrengthSessionOutput,
} from '#app/lab/engine/sessions.types.ts'
import { type Goal as SetupGoal } from '#app/lab/engine/setup.types.ts'
import {
	actualText,
	addDays,
	dateMedium,
	dayLong,
	dayShort,
	deviation,
	hm,
	isoWeek,
	km,
	minutes,
	mondayOf,
	n0,
	n1,
	pace,
	planText,
	rowSentence,
	UNIT_LABEL,
} from './__format.ts'
import {
	BASE,
	callCap,
	Confirm,
	cx,
	type FULL_COLS,
	Layer,
	NumPad,
	Q,
	Sparkline,
	useFlash,
	useHb,
	useRead,
} from './__ui.tsx'

// ── data → rows ──────────────────────────────────────────────────────────────

export type BookData = {
	today: string
	from: string
	to: string
	sessions: SessionCard[]
	plan: NonNullable<PlanOutput['plan']> | null
	progressDays: ProgressDay[]
	progressWeekly: ProgressWeek[]
	formTrust: FormTrust | null
	proposals: ProposalItem[]
	eased: Record<string, boolean>
	goal: SetupGoal | null
	thresholdPace: number | null
	canLoadOlder: boolean
}

type PlanPhase = NonNullable<PlanOutput['plan']>['phases'][number]
type PlanWeek = NonNullable<PlanOutput['plan']>['weeks'][number]

type DayRow = {
	kind: 'day'
	key: string
	date: string
	s: SessionCard | null
	first: boolean
	last: boolean
	isToday: boolean
	rest: boolean
	sameDay: SessionCard[]
}
type WeekRow = {
	kind: 'week'
	key: string
	weekKey: string
	iso: number
	pw: PlanWeek | null
	collapsed: boolean
	plannedS: number | null
	plannedUnknown: number
	actualS: number
	planCount: number
	doneCount: number
	missedCount: number
	verdict: Verdict | null
	sessions: SessionCard[]
	props: ProposalItem[]
	eased: boolean
}
type PhaseRow = { kind: 'phase'; key: string; phase: PlanPhase }
type GoalRow = { kind: 'goal'; key: string; date: string }
type Row = DayRow | WeekRow | PhaseRow | GoalRow

export function buildRows(d: BookData): Row[] {
	const rows: Row[] = []
	const byDate = new Map<string, SessionCard[]>()
	for (const s of d.sessions) {
		const l = byDate.get(s.date) ?? []
		l.push(s)
		byDate.set(s.date, l)
	}
	for (const l of byDate.values())
		l.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
	const plan = d.plan
	const planStart = plan?.firstWeek ?? null
	const planEnd = plan ? addDays(plan.lastWeek, 6) : null
	const laidUntil = d.sessions
		.filter((s) => s.status !== 'recording-only' && s.whose === 'plan')
		.reduce<string | null>((m, s) => (m && m > s.date ? m : s.date), null)
	const horizon = [
		laidUntil ?? d.today,
		addDays(mondayOf(d.today), 13),
	].sort()[1]!
	const weeklyBy = new Map(d.progressWeekly.map((w) => [w.weekKey, w]))
	const pwBy = new Map((plan?.weeks ?? []).map((w) => [w.weekKey, w]))
	const phaseStarts = new Map((plan?.phases ?? []).map((p) => [p.firstWeek, p]))
	const goalDate = d.goal?.date ?? plan?.goal.date ?? null

	for (let wk = mondayOf(d.from); wk <= d.to; wk = addDays(wk, 7)) {
		const phase = phaseStarts.get(wk)
		if (phase) rows.push({ kind: 'phase', key: `ph-${wk}`, phase })
		const pw = pwBy.get(wk) ?? null
		const inPlan = !!(planStart && planEnd && wk >= planStart && wk <= planEnd)
		const collapsed = wk > horizon && !(byDate.size && hasAny(byDate, wk))
		const weekSessions: SessionCard[] = []
		for (let i = 0; i < 7; i++) {
			const date = addDays(wk, i)
			if (date < d.from || date > d.to) continue
			const list = byDate.get(date) ?? []
			weekSessions.push(...list)
			if (goalDate === date)
				rows.push({ kind: 'goal', key: `goal-${date}`, date })
			if (collapsed) continue
			if (!list.length) {
				rows.push({
					kind: 'day',
					key: `d-${date}`,
					date,
					s: null,
					first: true,
					last: true,
					isToday: date === d.today,
					rest: inPlan && date <= horizon,
					sameDay: [],
				})
			} else
				list.forEach((s, i2) =>
					rows.push({
						kind: 'day',
						key: `s-${s.id}-${date}-${i2}`,
						date,
						s,
						first: i2 === 0,
						last: i2 === list.length - 1,
						isToday: date === d.today,
						rest: false,
						sameDay: list,
					}),
				)
		}
		const planned = weekSessions.filter((s) => s.status !== 'recording-only')
		let plannedS: number | null = 0
		let plannedUnknown = 0
		for (const s of planned) {
			const v = s.planned.durationS.value
			if (v == null) plannedUnknown++
			else plannedS += v
		}
		if (!planned.length) plannedS = collapsed ? null : 0
		rows.push({
			kind: 'week',
			key: `w-${wk}`,
			weekKey: wk,
			iso: isoWeek(wk),
			pw,
			collapsed,
			plannedS,
			plannedUnknown,
			actualS: weekSessions.reduce(
				(a, s) =>
					a +
					(s.status === 'done' || s.status === 'recording-only'
						? (s.actual.durationS.value ?? 0)
						: 0),
				0,
			),
			planCount: planned.length,
			doneCount: planned.filter((s) => s.status === 'done').length,
			missedCount: planned.filter((s) => s.status === 'missed').length,
			verdict: weeklyBy.get(wk)?.verdict ?? null,
			sessions: weekSessions,
			props: d.proposals.filter((p) => p.weekKey === wk && !p.session),
			eased: !!d.eased[wk],
		})
	}
	return rows
}
function hasAny(byDate: Map<string, SessionCard[]>, wk: string) {
	for (let i = 0; i < 7; i++) if (byDate.has(addDays(wk, i))) return true
	return false
}

// ── columns ──────────────────────────────────────────────────────────────────

type ColKey =
	| 'dag'
	| 'plan'
	| 'forslag'
	| 'faktisk'
	| 'avvik'
	| 'tyngde'
	| (typeof FULL_COLS)[number]['key']

const COL_INFO: Record<
	ColKey,
	{
		label: string
		w: number
		wide?: number
		num?: boolean
		legend: string
		graf?: string
	}
> = {
	dag: { label: 'Dag', w: 70, legend: 'Dagen. Låst til venstre.' },
	plan: {
		label: 'Plan ′',
		w: 120,
		wide: 300,
		legend: 'Det planen sier. Trykk for å se økta og endre den.',
		graf: 'plan',
	},
	forslag: {
		label: 'Forslag',
		w: 170,
		wide: 280,
		legend: 'Det planen vil endre. Kursiv til du sier ja.',
	},
	faktisk: {
		label: 'Faktisk ′ /km',
		w: 100,
		wide: 160,
		legend: 'Det som ble gjort: minutter, og fart for løping.',
		graf: 'faktisk',
	},
	avvik: {
		label: '±',
		w: 38,
		legend: 'Avvik, plan mot faktisk. Trykk på tegnet i en rad for detaljer.',
		graf: 'avvik',
	},
	tyngde: {
		label: '1–10',
		w: 40,
		num: true,
		legend: 'Tyngde: hvor hardt det kjentes, 1–10. Tom = ikke oppgitt.',
		graf: 'tyngde',
	},
	tidp: {
		label: 'Plan ′',
		w: 58,
		num: true,
		legend: 'Planlagt tid i minutter.',
		graf: 'plan',
	},
	tidf: {
		label: 'Fakt ′',
		w: 58,
		num: true,
		legend: 'Faktisk tid i minutter.',
		graf: 'faktisk',
	},
	km: { label: 'km', w: 58, num: true, legend: 'Distanse i km.', graf: 'km' },
	tss: {
		label: 'Belast.',
		w: 64,
		num: true,
		legend: 'Belastning (TSS) for dagen.',
		graf: 'belastning',
	},
	grunn: {
		label: 'Grunnf.',
		w: 72,
		num: true,
		legend: 'Grunnform (CTL): treningen over 6 uker.',
		graf: 'grunnform',
	},
	slit: {
		label: 'Sliten',
		w: 72,
		num: true,
		legend: 'Slitenhet (ATL): treningen siste uka.',
		graf: 'slitenhet',
	},
	form: {
		label: 'Form',
		w: 64,
		num: true,
		legend:
			'Form (TSB) = grunnform − slitenhet. Trenger 42 dager med historikk.',
		graf: 'form',
	},
}

function useWide() {
	const [wide, setWide] = useState(false)
	useEffect(() => {
		const m = window.matchMedia('(min-width: 760px)')
		const f = () => setWide(m.matches)
		f()
		m.addEventListener('change', f)
		return () => m.removeEventListener('change', f)
	}, [])
	return wide
}

// ── the table ────────────────────────────────────────────────────────────────

type Expand = {
	key: string
	mode: 'detail' | 'cmp' | 'rpe' | 'prop' | 'link' | 'week' | 'goal'
}
export type Placing = {
	sid: string
	title: string
	date: string
	mode: 'move' | 'swap'
} | null

export function Book({
	data,
	anchor,
	scrollEl,
	olderHref,
	initialPlacing = null,
}: {
	data: BookData
	anchor: string
	scrollEl: React.RefObject<HTMLDivElement | null>
	olderHref: string | null
	initialPlacing?: Placing
}) {
	const { prefs, act, toast } = useHb()
	const wide = useWide()
	const rows = useMemo(() => buildRows(data), [data])
	const [expand, setExpand] = useState<Expand | null>(null)
	const [placing, setPlacing] = useState<Placing>(initialPlacing)
	const [lifted, setLifted] = useState<string | null>(null)
	const [legend, setLegend] = useState<ColKey | null>(null)
	const tableRef = useRef<HTMLTableElement>(null)
	const propBySid = useMemo(() => {
		const m = new Map<string, ProposalItem>()
		for (const p of data.proposals) {
			if (p.session) m.set(p.session.id, p)
			if (p.otherSession) m.set(p.otherSession.id, p)
		}
		return m
	}, [data.proposals])
	const dayVals = useMemo(
		() => new Map(data.progressDays.map((p) => [p.date, p])),
		[data.progressDays],
	)

	const cols: ColKey[] = useMemo(() => {
		const c: ColKey[] = ['dag', 'plan']
		if (data.proposals.some((p) => p.session)) c.push('forslag')
		c.push('faktisk', 'avvik', 'tyngde')
		if (prefs.level === 'full')
			for (const x of prefs.cols) if (x.on) c.push(x.key as ColKey)
		return c
	}, [prefs, data.proposals])
	const widths = cols.map((c) =>
		wide ? (COL_INFO[c].wide ?? COL_INFO[c].w + 8) : COL_INFO[c].w,
	)
	const tableW = widths.reduce((a, b) => a + b, 0)

	// Width of the visible area, for expanded rows that stay put when the
	// table scrolls sideways.
	const [sw, setSw] = useState(390)
	useEffect(() => {
		const el = scrollEl.current
		if (!el) return
		const ro = new ResizeObserver(() => setSw(el.clientWidth))
		ro.observe(el)
		return () => ro.disconnect()
	}, [scrollEl])
	const fits = tableW <= sw

	// Open on the anchor (today), placed a third down the screen.
	const jump = useCallback(
		(date: string) => {
			const el = scrollEl.current
			const t = tableRef.current
			if (!el || !t) return
			const rowsAt = [...t.querySelectorAll<HTMLElement>('tr[data-date]')]
			const row =
				rowsAt.find((r) => r.dataset.date === date) ??
				rowsAt.find((r) => (r.dataset.date ?? '') >= date) ??
				rowsAt.at(-1)
			if (!row) return
			const top =
				row.getBoundingClientRect().top -
				el.getBoundingClientRect().top +
				el.scrollTop
			el.scrollTop = Math.max(0, top - el.clientHeight / 3)
		},
		[scrollEl],
	)
	useEffect(() => {
		if (anchor) jump(anchor)
	}, [anchor, jump])
	useEffect(() => {
		const f = () => jump(data.today)
		window.addEventListener('hb:today', f)
		return () => window.removeEventListener('hb:today', f)
	}, [jump, data.today])

	const toggle = (key: string, mode: Expand['mode']) =>
		setExpand((e) => (e?.key === key && e.mode === mode ? null : { key, mode }))

	// ── move / swap by placing ────────────────────────────────────────────────
	const place = useCallback(
		async (targetDate: string, target: SessionCard | null) => {
			if (!placing) return
			const p = placing
			setPlacing(null)
			if (targetDate === p.date && (!target || target.id === p.sid)) return
			const swapWith =
				target &&
				target.id !== p.sid &&
				target.status === 'planned' &&
				target.date >= data.today
					? target
					: null
			if (p.mode === 'swap' && !swapWith) {
				toast('Velg en dag med en økt som ikke er gjort, for å bytte.', {
					error: true,
				})
				return
			}
			if (swapWith) {
				await act(
					'swap_sessions',
					{ sessionId: p.sid, otherSessionId: swapWith.id },
					() => ({
						what: `Byttet «${p.title}» og «${swapWith.title}»`,
						before: `${dayShort(p.date)} / ${dayShort(swapWith.date)}`,
						after: `${dayShort(swapWith.date)} / ${dayShort(p.date)}`,
					}),
				)
			} else {
				await act<{ clashes: { text: string }[]; leftItsWeek: boolean }>(
					'move_session',
					{ sessionId: p.sid, date: targetDate },
					(v) => ({
						what: `Flyttet «${p.title}» til ${dayShort(targetDate)}${v.clashes.length ? ` (obs: ${v.clashes.map((c) => c.text).join(', ')})` : ''}${v.leftItsWeek ? ', annen uke' : ''}`,
						before: dayShort(p.date),
						after: dayShort(targetDate),
					}),
				)
			}
		},
		[placing, act, toast, data.today],
	)

	// ── gestures: swipe right = done, left = skip, long press = lift ─────────
	const gesture = useRef<{
		id: number
		x: number
		y: number
		row: HTMLTableRowElement
		s: SessionCard
		mode: 'idle' | 'swipe' | 'lift'
		dx: number
		timer: ReturnType<typeof setTimeout> | null
	} | null>(null)
	const suppressClick = useRef(false)
	const [hint, setHint] = useState<{
		top: number
		dir: 1 | -1
		armed: boolean
	} | null>(null)
	const dropRef = useRef<HTMLElement | null>(null)

	useEffect(() => {
		const el = scrollEl.current
		if (!el) return
		const block = (e: TouchEvent) => {
			const g = gesture.current
			if (g && (g.mode === 'lift' || g.mode === 'swipe')) e.preventDefault()
		}
		el.addEventListener('touchmove', block, { passive: false })
		return () => el.removeEventListener('touchmove', block)
	}, [scrollEl])

	function setTx(row: HTMLElement, x: number, y: number) {
		// Follow the finger 1:1 while it moves; glide back (CSS, 150 ms) on release.
		const following = !!(x || y)
		row.querySelectorAll<HTMLElement>('td').forEach((td) => {
			td.style.transition = following ? 'none' : ''
			td.style.transform = following ? `translate3d(${x}px, ${y}px, 0)` : ''
		})
	}
	function rowTop(row: HTMLElement) {
		const el = scrollEl.current!
		return (
			row.getBoundingClientRect().top -
			el.getBoundingClientRect().top +
			el.scrollTop
		)
	}

	function onDown(
		e: React.PointerEvent<HTMLTableRowElement>,
		s: SessionCard | null,
	) {
		if (!s || placing || e.button !== 0) return
		const fromLk = !!(e.target as HTMLElement).closest('td.lk')
		if (!fits && !fromLk) return
		const row = e.currentTarget
		const movable = s.status === 'planned' && s.date >= data.today
		gesture.current = {
			id: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			row,
			s,
			mode: 'idle',
			dx: 0,
			timer: movable
				? setTimeout(() => {
						const g = gesture.current
						if (!g || g.mode !== 'idle') return
						g.mode = 'lift'
						setLifted(s.id)
						try {
							row.setPointerCapture(g.id)
						} catch {
							/* ignore */
						}
						navigator.vibrate?.(10)
						setPlacing({
							sid: s.id,
							title: s.title,
							date: s.date,
							mode: 'move',
						})
					}, 450)
				: null,
		}
	}
	function onMove(e: React.PointerEvent<HTMLTableRowElement>) {
		const g = gesture.current
		if (!g || g.id !== e.pointerId) return
		const dx = e.clientX - g.x
		const dy = e.clientY - g.y
		if (g.mode === 'idle') {
			if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
				if (g.timer) clearTimeout(g.timer)
				if (Math.abs(dx) > Math.abs(dy) * 1.4) {
					g.mode = 'swipe'
					try {
						g.row.setPointerCapture(g.id)
					} catch {
						/* ignore */
					}
				} else {
					gesture.current = null
					return
				}
			} else return
		}
		if (g.mode === 'swipe') {
			const can = dx > 0 ? canDone(g.s, data.today) : canSkip(g.s)
			const eff = can ? dx : dx / 4
			g.dx = eff
			setTx(g.row, Math.max(-160, Math.min(160, eff)), 0)
			setHint({
				top: rowTop(g.row),
				dir: dx > 0 ? 1 : -1,
				armed: can && Math.abs(eff) > 90,
			})
		} else if (g.mode === 'lift') {
			setTx(g.row, 0, dy)
			const under = document
				.elementsFromPoint(e.clientX, e.clientY)
				.map((x) => x.closest<HTMLTableRowElement>('tr[data-date]'))
				.find((x) => x && x !== g.row)
			if (dropRef.current !== under) {
				dropRef.current?.classList.remove('drop')
				;(under as HTMLElement | undefined)?.classList.add('drop')
				dropRef.current = (under as HTMLElement) ?? null
			}
		}
	}
	function onUp(e: React.PointerEvent<HTMLTableRowElement>) {
		const g = gesture.current
		if (!g || g.id !== e.pointerId) return
		if (g.timer) clearTimeout(g.timer)
		gesture.current = null
		if (g.mode === 'swipe') {
			suppressClick.current = true
			setTx(g.row, 0, 0)
			setHint(null)
			if (g.dx > 90) void doDone(g.s)
			else if (g.dx < -90) void doSkip(g.s)
		} else if (g.mode === 'lift') {
			suppressClick.current = true
			setLifted(null)
			setTx(g.row, 0, 0)
			const drop = dropRef.current
			drop?.classList.remove('drop')
			dropRef.current = null
			if (drop?.dataset.date && drop.dataset.date !== g.s.date) {
				const target =
					data.sessions.find((x) => x.id === drop.dataset.sid) ?? null
				// placing state is set; run with the explicit values
				setPlacing(null)
				void placeExplicit(g.s, drop.dataset.date, target)
			}
			// else: stays in placing mode, tap a day
		}
	}
	/**
	 * A cancelled gesture (the system took the pointer) puts everything back
	 * and does nothing: no done, no skip, no move.
	 */
	function onCancel(e: React.PointerEvent<HTMLTableRowElement>) {
		const g = gesture.current
		if (!g || g.id !== e.pointerId) return
		if (g.timer) clearTimeout(g.timer)
		gesture.current = null
		setTx(g.row, 0, 0)
		setHint(null)
		if (g.mode === 'lift') {
			setLifted(null)
			dropRef.current?.classList.remove('drop')
			dropRef.current = null
			setPlacing(null)
		}
	}
	async function placeExplicit(
		s: SessionCard,
		date: string,
		target: SessionCard | null,
	) {
		const swapWith =
			target &&
			target.id !== s.id &&
			target.status === 'planned' &&
			target.date >= data.today
				? target
				: null
		if (swapWith)
			await act(
				'swap_sessions',
				{ sessionId: s.id, otherSessionId: swapWith.id },
				() => ({
					what: `Byttet «${s.title}» og «${swapWith.title}»`,
					before: `${dayShort(s.date)} / ${dayShort(swapWith.date)}`,
					after: `${dayShort(swapWith.date)} / ${dayShort(s.date)}`,
				}),
			)
		else
			await act<{ clashes: { text: string }[] }>(
				'move_session',
				{ sessionId: s.id, date },
				(v) => ({
					what: `Flyttet «${s.title}» til ${dayShort(date)}${v.clashes.length ? ` (obs: ${v.clashes.map((c) => c.text).join(', ')})` : ''}`,
					before: dayShort(s.date),
					after: dayShort(date),
				}),
			)
	}
	const { doDone, doSkip } = useSessionActs()

	const ctx: RowCtx = {
		data,
		cols,
		expand,
		toggle,
		placing,
		setPlacing,
		place,
		propBySid,
		dayVals,
		doDone,
		doSkip,
		suppressClick,
		onDown,
		onMove,
		onUp,
		onCancel,
		fits,
		lifted,
	}

	return (
		<div style={{ ['--sw' as string]: `${sw}px` }}>
			{placing ? (
				<Layer>
					<div className="hb-bar draft hb-float" role="status">
						<span>
							{placing.mode === 'swap' ? 'Bytt' : 'Flytt'}{' '}
							<b>«{placing.title}»</b> ({dayShort(placing.date)}): trykk på
							dagen den skal til.
						</span>
						<button
							type="button"
							className="btn sm"
							onClick={() => setPlacing(null)}
						>
							Avbryt
						</button>
					</div>
				</Layer>
			) : null}
			<table
				ref={tableRef}
				className="hb-t"
				style={{ width: Math.max(tableW, sw) }}
				aria-label="Hovedboka: én rad per dag"
			>
				<colgroup>
					{cols.map((c, i) => (
						<col
							key={c}
							style={{
								width:
									i === 1 && tableW < sw
										? widths[i]! + (sw - tableW)
										: widths[i],
							}}
						/>
					))}
				</colgroup>
				<thead>
					<tr>
						{cols.map((c) => (
							<th
								key={c}
								scope="col"
								className={cx(c === 'dag' && 'lk', COL_INFO[c].num && 'num')}
							>
								<button
									type="button"
									aria-expanded={legend === c}
									aria-label={
										c === 'avvik'
											? 'Avvik'
											: c === 'tyngde'
												? 'Tyngde 1 til 10'
												: undefined
									}
									onClick={() => setLegend((l) => (l === c ? null : c))}
								>
									{COL_INFO[c].label}
								</button>
							</th>
						))}
					</tr>
					{legend ? (
						<tr>
							<th colSpan={cols.length} style={{ top: 32, height: 'auto' }}>
								<div
									className="hb-x"
									style={{ fontWeight: 400, color: 'var(--ink)' }}
								>
									<b>{COL_INFO[legend].label}</b>: {COL_INFO[legend].legend}{' '}
									{COL_INFO[legend].graf ? (
										<Link
											className="lnk"
											to={`${BASE}/graf/${COL_INFO[legend].graf}`}
										>
											Vis over tid →
										</Link>
									) : null}
									{legend === 'avvik' || legend === 'tyngde' ? (
										<Legend />
									) : null}
								</div>
							</th>
						</tr>
					) : null}
				</thead>
				<tbody>
					{olderHref ? (
						<tr>
							<td colSpan={cols.length} className="x">
								<div
									className="hb-x"
									style={{ animation: 'none', padding: '4px 12px' }}
								>
									<Link className="lnk" to={olderHref}>
										↑ Vis 12 uker til
									</Link>
								</div>
							</td>
						</tr>
					) : null}
					{rows.map((r) => (
						<RowView key={r.key} r={r} ctx={ctx} />
					))}
				</tbody>
			</table>
			{hint ? (
				<div
					aria-hidden
					style={{
						position: 'absolute',
						top: hint.top,
						left: 0,
						height: 36,
						width: sw,
						display: 'flex',
						alignItems: 'center',
						justifyContent: hint.dir > 0 ? 'flex-start' : 'flex-end',
						padding: '0 12px',
						pointerEvents: 'none',
						zIndex: 0,
						font: '600 13px var(--sans)',
						color: hint.armed ? '#fff' : 'var(--mute)',
						background: hint.armed
							? hint.dir > 0
								? 'var(--hit)'
								: 'var(--unk)'
							: 'var(--week)',
					}}
				>
					{hint.dir > 0 ? 'Gjort →' : '← Hopp over'}
				</div>
			) : null}
			<p
				className="why"
				style={{
					width: sw,
					padding: '16px 12px 40px',
					margin: 0,
					position: 'sticky',
					left: 0,
				}}
			>
				Sveip en rad mot høyre for gjort, mot venstre for å hoppe over. Hold
				inne for å flytte. Trykk på et kolonnenavn for forklaring og graf.
			</p>
		</div>
	)
}

export function useSessionActs() {
	const { act } = useHb()
	const doDone = useCallback(
		async (s: SessionCard) => {
			if (s.sport === 'strength')
				return act('log_strength_as_planned', { sessionId: s.id }, () => ({
					what: `«${s.title}» ført som planlagt`,
					before: 'ikke gjort',
					after: 'gjort',
				}))
			return act('mark_done', { sessionId: s.id }, () => ({
				what: `«${s.title}» ${dayShort(s.date)} gjort`,
				before: 'ikke gjort',
				after: 'gjort (uten data)',
			}))
		},
		[act],
	)
	const doSkip = useCallback(
		async (s: SessionCard) =>
			act<{ state: string }>('skip_session', { sessionId: s.id }, (v) => ({
				what: `«${s.title}» ${dayShort(s.date)} hoppet over`,
				before: planText(s),
				after: v.state === 'missed' ? 'ikke gjort' : 'hoppet over',
			})),
		[act],
	)
	return { doDone, doSkip }
}

export type DetailCtx = {
	data: { today: string }
	doDone: (s: SessionCard) => Promise<unknown>
	doSkip: (s: SessionCard) => Promise<unknown>
	setPlacing: (p: Placing) => void
	onDayPage?: boolean
}

function sessionInput(id: string) {
	return id.startsWith('demo-')
		? { sessionId: id, demo: true }
		: { sessionId: id }
}

function canDone(s: SessionCard, today: string) {
	return (s.status === 'planned' || s.status === 'missed') && s.date <= today
}
function canSkip(s: SessionCard) {
	return s.status === 'planned'
}

export function Legend() {
	return (
		<dl className="legend">
			<dt className="t-hit">=</dt>
			<dd style={{ margin: 0 }}>traff planen</dd>
			<dt className="t-under">−</dt>
			<dd style={{ margin: 0 }}>under: lettere eller ikke gjort</dd>
			<dt className="t-over">+</dt>
			<dd style={{ margin: 0 }}>over: hardere enn planlagt</dd>
			<dt className="t-unknown">?</dt>
			<dd style={{ margin: 0 }}>kan ikke vites ennå (trykk for hvorfor)</dd>
			<dt className="mute">tom</dt>
			<dd style={{ margin: 0 }}>ingenting skjedde, eller ikke oppgitt</dd>
		</dl>
	)
}

type RowCtx = {
	data: BookData
	cols: ColKey[]
	expand: Expand | null
	toggle: (key: string, mode: Expand['mode']) => void
	placing: Placing
	setPlacing: (p: Placing) => void
	place: (date: string, target: SessionCard | null) => Promise<void>
	propBySid: Map<string, ProposalItem>
	dayVals: Map<string, ProgressDay>
	doDone: (s: SessionCard) => Promise<unknown>
	doSkip: (s: SessionCard) => Promise<unknown>
	suppressClick: React.MutableRefObject<boolean>
	onDown: (
		e: React.PointerEvent<HTMLTableRowElement>,
		s: SessionCard | null,
	) => void
	onMove: (e: React.PointerEvent<HTMLTableRowElement>) => void
	onUp: (e: React.PointerEvent<HTMLTableRowElement>) => void
	onCancel: (e: React.PointerEvent<HTMLTableRowElement>) => void
	fits: boolean
	lifted: string | null
}

function RowView({ r, ctx }: { r: Row; ctx: RowCtx }) {
	if (r.kind === 'phase') return <PhaseRowView r={r} n={ctx.cols.length} />
	if (r.kind === 'goal') return <GoalRowView r={r} ctx={ctx} />
	if (r.kind === 'week') return <WeekRowView r={r} ctx={ctx} />
	return <DayRowView r={r} ctx={ctx} />
}

function PhaseRowView({ r, n }: { r: PhaseRow; n: number }) {
	const p = r.phase
	return (
		<tr className="ph">
			<td colSpan={n}>
				<span style={{ position: 'sticky', left: 8 }}>
					{p.name} · {p.weeks} {p.weeks === 1 ? 'uke' : 'uker'} ·{' '}
					<span className="mono" style={{ fontWeight: 400 }}>
						{dateMedium(p.firstWeek, false)}–
						{dateMedium(addDays(p.lastWeek, 6), false)}
					</span>
					{p.rhythm && p.rhythm !== 'none' ? ` · ${p.rhythm}` : ''}
					{p.tapers ? ' · nedtrapping' : ''}
					{p.isCurrent ? ' · nå' : ''}
				</span>
			</td>
		</tr>
	)
}

function GoalRowView({ r, ctx }: { r: GoalRow; ctx: RowCtx }) {
	const { data, cols } = ctx
	const g = data.goal
	const pg = data.plan?.goal
	const name = g?.name ?? pg?.name ?? 'Mål'
	const open = ctx.expand?.key === r.key
	const days = g?.daysLeft ?? pg?.daysToGo ?? null
	const goalPace =
		g?.targetTime && g.distanceKm ? g.targetTime.seconds / g.distanceKm : null
	return (
		<>
			<tr className="goal" data-date={r.date}>
				<td colSpan={cols.length} className="c">
					<button
						type="button"
						aria-expanded={open}
						onClick={() => ctx.toggle(r.key, 'goal')}
						style={{
							position: 'sticky',
							left: 0,
							width: 'var(--sw)',
							fontWeight: 650,
						}}
					>
						◆ {dayShort(r.date)} MÅL {name}
						{g?.distanceKm ? ` · ${n1(g.distanceKm)} km` : ''}
						{g?.targetTime
							? ` · ${g.targetTime.text}`
							: pg?.aim
								? ` · ${pg.aim}`
								: ''}
						{days != null ? ` · ${days} d` : ''}
					</button>
				</td>
			</tr>
			{open ? (
				<XRow n={cols.length}>
					<table className="sub">
						<tbody>
							<tr>
								<th>Dato</th>
								<td>{dayLong(r.date)}</td>
							</tr>
							<tr>
								<th>Distanse</th>
								<td>
									{g?.distanceKm != null ? (
										`${n1(g.distanceKm)} km`
									) : (
										<Q why="Ingen distanse satt for målet." />
									)}
								</td>
							</tr>
							<tr>
								<th>Måltid</th>
								<td>
									{g?.targetTime?.text ?? (
										<span className="mute">ingen (fullføre)</span>
									)}
								</td>
							</tr>
							<tr>
								<th>Målfart</th>
								<td>
									{goalPace != null ? (
										`${pace(goalPace)} /km`
									) : (
										<Q why="Trenger både distanse og måltid." />
									)}
								</td>
							</tr>
							<tr>
								<th>Terskelfart</th>
								<td>
									{data.thresholdPace != null ? (
										`${pace(data.thresholdPace)} /km`
									) : (
										<Q why="Terskelfart er ikke satt. Sett den under Innstillinger → Terskler." />
									)}
								</td>
							</tr>
							<tr>
								<th>Realistisk?</th>
								<td>
									<Q why="Appen har ingen vurdering av måltiden. Den sier ikke ja når den ikke vet." />
								</td>
							</tr>
						</tbody>
					</table>
					<Link className="lnk" to={`${BASE}/innstillinger/maal`}>
						Endre målet →
					</Link>
				</XRow>
			) : null}
		</>
	)
}

function XRow({ n, children }: { n: number; children: ReactNode }) {
	return (
		<tr>
			<td colSpan={n} className="x">
				<div className="hb-x">{children}</div>
			</td>
		</tr>
	)
}

function WeekRowView({ r, ctx }: { r: WeekRow; ctx: RowCtx }) {
	const { cols, data } = ctx
	const open = ctx.expand?.key === r.key
	const pct = r.planCount ? Math.round((r.doneCount / r.planCount) * 100) : null
	const isPast = addDays(r.weekKey, 6) < data.today
	const days = Array.from({ length: 7 }, (_, i) =>
		ctx.dayVals.get(addDays(r.weekKey, i)),
	)
	const runTarget = r.pw?.sports.find((s) => s.sport !== 'strength')
	const actualFlash = useFlash<HTMLTableCellElement>([r.actualS, pct])
	const planFlash = useFlash<HTMLTableCellElement>(r.plannedS)
	const dev = r.verdict
	const sign =
		dev?.call === 'on-target'
			? '='
			: dev?.call === 'under'
				? '−'
				: dev?.call === 'over'
					? '+'
					: null
	const tone =
		dev?.call === 'on-target'
			? 'hit'
			: dev?.call === 'under'
				? 'under'
				: dev?.call === 'over'
					? 'over'
					: 'unknown'
	const cell = (c: ColKey): ReactNode => {
		switch (c) {
			case 'dag':
				return (
					<td key={c} className="lk c">
						<button
							type="button"
							aria-expanded={open}
							onClick={() => ctx.toggle(r.key, 'week')}
						>
							U{r.iso}
							<span className="sr">
								Uke {r.iso}: planlagt{' '}
								{r.plannedS != null ? hm(r.plannedS) : 'ukjent'} timer, gjort{' '}
								{hm(r.actualS)}
								{pct != null ? `, ${pct} prosent gjennomført` : ''}
							</span>
						</button>
					</td>
				)
			case 'plan':
				return (
					<td key={c} ref={planFlash} className="c">
						<button type="button" onClick={() => ctx.toggle(r.key, 'week')}>
							{r.collapsed ? (
								<span className="mute">
									{runTarget?.target.value != null
										? `mål ${n0(runTarget.target.value)} ${UNIT_LABEL[runTarget.unit]} · `
										: ''}
									legges ut uka før
								</span>
							) : r.plannedS != null && r.planCount ? (
								<>
									Σ {r.plannedS ? hm(r.plannedS) : ''}
									{r.plannedUnknown ? (
										<span className="mark">+{r.plannedUnknown} uten tid</span>
									) : null}
									{r.eased ? <span className="mark">lettere</span> : null}
								</>
							) : null}
							{r.props.length ? <span className="mark">· forslag</span> : null}
						</button>
					</td>
				)
			case 'forslag':
				return (
					<td key={c} className={r.props.length ? 'prop' : ''}>
						{r.props[0]?.headline ?? ''}
					</td>
				)
			case 'faktisk':
				return (
					<td key={c} ref={actualFlash}>
						{r.collapsed ? (
							''
						) : (
							<>
								{r.actualS || isPast ? hm(r.actualS) : ''}
								{pct != null && (isPast || r.doneCount) ? ` ${pct}%` : ''}
							</>
						)}
					</td>
				)
			case 'avvik':
				return (
					<td key={c} className={`dev t-${tone}`}>
						{sign ?? (dev?.why && isPast ? <Q why={dev.why} /> : '')}
					</td>
				)
			case 'tyngde': {
				const rp = r.sessions
					.map((s) => s.rpe)
					.filter((x): x is number => x != null)
				return (
					<td key={c} className="num mute">
						{rp.length ? n1(rp.reduce((a, b) => a + b, 0) / rp.length) : ''}
					</td>
				)
			}
			case 'tidp':
				return (
					<td key={c} className="num">
						{r.plannedS != null && !r.collapsed
							? Math.round(r.plannedS / 60)
							: ''}
					</td>
				)
			case 'tidf':
				return (
					<td key={c} className="num">
						{r.collapsed ? '' : Math.round(r.actualS / 60)}
					</td>
				)
			case 'km': {
				const m = r.sessions.reduce(
					(a, s) => a + (s.actual.distanceM.value ?? 0),
					0,
				)
				return (
					<td key={c} className="num">
						{m ? km(m) : ''}
					</td>
				)
			}
			case 'tss': {
				const known = days.filter((x) => x?.load.value != null)
				return (
					<td key={c} className="num">
						{known.length
							? n0(known.reduce((a, x) => a + (x!.load.value ?? 0), 0))
							: ''}
					</td>
				)
			}
			case 'grunn':
			case 'slit':
			case 'form': {
				const k = c === 'grunn' ? 'fitness' : c === 'slit' ? 'fatigue' : 'form'
				return (
					<td key={c} className="num">
						<Sparkline
							values={days.map((x) => x?.[k].value ?? null)}
							width={52}
						/>
					</td>
				)
			}
		}
	}
	return (
		<>
			<tr className="wk" data-week={r.weekKey}>
				{cols.map(cell)}
			</tr>
			{open ? (
				<XRow n={cols.length}>
					<WeekDetail r={r} data={data} />
				</XRow>
			) : null}
		</>
	)
}

function WeekDetail({ r, data }: { r: WeekRow; data: BookData }) {
	const { act } = useHb()
	const [confirm, setConfirm] = useState(false)
	const weekly = data.progressWeekly.find((w) => w.weekKey === r.weekKey)
	const sports = r.pw?.sports ?? weekly?.sports ?? []
	const isCurrentOrNext =
		r.weekKey === mondayOf(data.today) ||
		r.weekKey === addDays(mondayOf(data.today), 7)
	const bySport = new Map<string, { p: number; a: number; n: number }>()
	for (const s of r.sessions) {
		const x = bySport.get(s.sportName) ?? { p: 0, a: 0, n: 0 }
		x.n++
		if (s.status !== 'recording-only') x.p += s.planned.durationS.value ?? 0
		if (s.status === 'done' || s.status === 'recording-only')
			x.a += s.actual.durationS.value ?? 0
		bySport.set(s.sportName, x)
	}
	return (
		<>
			<div className="say">
				<b>Uke {r.iso}</b>
				{r.pw
					? ` · planuke ${r.pw.number} · ${r.pw.phase ?? ''}${r.pw.role === 'recovery' ? ' · lett uke' : r.pw.role === 'taper' ? ' · nedtrapping' : ''}`
					: ''}
				{' · '}
				{r.doneCount}/{r.planCount} økter gjort
				{r.missedCount ? `, ${r.missedCount} bommet` : ''}
			</div>
			{weekly?.verdict.sentence ? (
				<div className="say">{weekly.verdict.sentence}.</div>
			) : null}
			{sports.length ? (
				<table className="sub">
					<thead>
						<tr>
							<th>Idrett</th>
							<th className="num">Mål</th>
							<th className="num">Planlagt</th>
							<th className="num">Faktisk</th>
						</tr>
					</thead>
					<tbody>
						{sports.map((s) => (
							<tr key={s.sport}>
								<td>
									{s.sportName}{' '}
									<span className="mute">{UNIT_LABEL[s.unit]}</span>
								</td>
								<NumTd n={s.target} f={n1} />
								<NumTd n={s.planned} f={n1} />
								<NumTd n={s.actual} f={n1} />
							</tr>
						))}
					</tbody>
				</table>
			) : null}
			{bySport.size ? (
				<table className="sub">
					<thead>
						<tr>
							<th>Tid per idrett</th>
							<th className="num">Planlagt</th>
							<th className="num">Faktisk</th>
						</tr>
					</thead>
					<tbody>
						{[...bySport].map(([name, x]) => (
							<tr key={name}>
								<td>{name}</td>
								<td className="num">{x.p ? hm(x.p) : ''}</td>
								<td className="num">{x.a ? hm(x.a) : ''}</td>
							</tr>
						))}
					</tbody>
				</table>
			) : (
				<div className="why">Ingen økter denne uka.</div>
			)}
			{r.props.map((p) => (
				<ProposalBox key={p.id} p={p} />
			))}
			{isCurrentOrNext && data.plan ? (
				<div className="acts" style={{ alignItems: 'center' }}>
					<span className="mono">Lettere ×0,85</span>
					{r.eased ? (
						<span className="why">Uka er allerede gjort lettere.</span>
					) : (
						<button
							type="button"
							className="btn sm"
							onClick={() => setConfirm(true)}
						>
							Gjør uka lettere
						</button>
					)}
				</div>
			) : null}
			{confirm ? (
				<Confirm
					title={`Gjøre uke ${r.iso} lettere?`}
					yes="Gjør lettere"
					onNo={() => setConfirm(false)}
					onYes={() => {
						setConfirm(false)
						void act<{
							sessionsChanged: number
							volume: {
								sport: string
								unit: string
								before: number | null
								after: number | null
							}[]
						}>('ease_week', { week: r.weekKey }, (v) => ({
							what: `Uke ${r.iso} lettere: ${v.sessionsChanged} økter kortet ned`,
							before: v.volume
								.map(
									(x) =>
										`${x.sport} ${x.before != null ? n1(x.before) : '?'} ${UNIT_LABEL[x.unit] ?? x.unit}`,
								)
								.join(', '),
							after: v.volume
								.map(
									(x) =>
										`${x.sport} ${x.after != null ? n1(x.after) : '?'} ${UNIT_LABEL[x.unit] ?? x.unit}`,
								)
								.join(', '),
						}))
					}}
				>
					Alle økter som ikke er gjort blir 15 % kortere. Én gang per uke. Kan
					angres til uka begynner.
				</Confirm>
			) : null}
		</>
	)
}

function NumTd({
	n,
	f,
}: {
	n: { value: number | null; why: string | null }
	f: (v: number) => string
}) {
	return (
		<td className="num">
			{n.value != null ? f(n.value) : n.why ? <Q why={n.why} /> : ''}
		</td>
	)
}

// ── the day row ──────────────────────────────────────────────────────────────

function DayRowView({ r, ctx }: { r: DayRow; ctx: RowCtx }) {
	const { cols, data, expand, placing } = ctx
	const s = r.s
	const today = data.today
	const prop = s ? ctx.propBySid.get(s.id) : undefined
	const open = expand?.key === r.key ? expand.mode : null
	const pv = r.first ? ctx.dayVals.get(r.date) : undefined
	const plan = s ? planText(s) : r.rest ? 'Hvile' : ''
	const actual = s ? actualText(s, today) : ''
	const dev = s ? deviation(s, today) : null
	const ambiguous =
		s &&
		s.status === 'recording-only' &&
		r.sameDay.some(
			(o) => o.id !== s.id && o.status === 'planned' && o.sport === s.sport,
		)
	const planRef = useFlash<HTMLTableCellElement>(plan)
	const actRef = useFlash<HTMLTableCellElement>(actual)
	const devRef = useFlash<HTMLTableCellElement>(dev?.sign)
	const rpeRef = useFlash<HTMLTableCellElement>(s?.rpe)
	const cls = [
		'r',
		r.isToday ? 'td' : '',
		r.isToday && r.first ? 'td-first' : '',
		r.isToday && r.last ? 'td-last' : '',
		placing ? 'placing' : '',
		s && ctx.lifted === s.id ? 'lifted' : '',
	].join(' ')
	const tap = (mode: Expand['mode']) => (e: React.MouseEvent) => {
		if (ctx.suppressClick.current) {
			ctx.suppressClick.current = false
			e.preventDefault()
			return
		}
		if (placing) {
			e.preventDefault()
			void ctx.place(r.date, s)
			return
		}
		ctx.toggle(r.key, mode)
	}
	const canRate = !!s && s.date <= today && s.status !== 'missed'
	const cell = (c: ColKey): ReactNode => {
		switch (c) {
			case 'dag':
				return (
					<td key={c} className="lk c" style={{ touchAction: 'pan-y' }}>
						<button
							type="button"
							onClick={tap('detail')}
							aria-label={
								s
									? rowSentence(s, today)
									: `${dayLong(r.date)}${plan ? `, ${plan}` : ''}`
							}
						>
							{r.first ? dayShort(r.date) : ''}
						</button>
					</td>
				)
			case 'plan':
				return (
					<td key={c} ref={planRef} className="c">
						<button
							type="button"
							aria-expanded={open === 'detail'}
							onClick={tap('detail')}
							className={!s ? 'empty' : ''}
						>
							{prop ? <span className="strike">{plan}</span> : plan}
							{s?.adjustedBecause ? (
								<span className="mark" title={s.adjustedBecause}>
									*
								</span>
							) : null}
							{s?.whose === 'athlete' && s.status !== 'recording-only' ? (
								<span
									className="mark"
									title="Din egen økt: planen endrer den ikke uten å spørre."
								>
									egen
								</span>
							) : null}
						</button>
					</td>
				)
			case 'forslag':
				return (
					<td key={c} className={cx('c', prop && 'prop')}>
						{prop ? (
							<button
								type="button"
								aria-expanded={open === 'prop'}
								onClick={tap('prop')}
							>
								→ {prop.headline}
							</button>
						) : null}
					</td>
				)
			case 'faktisk':
				return (
					<td key={c} ref={actRef} className={cx('c', ambiguous && 'amb')}>
						{ambiguous ? (
							<button
								type="button"
								aria-expanded={open === 'link'}
								onClick={tap('link')}
							>
								{r.sameDay.length} økter?
							</button>
						) : (
							<button
								type="button"
								onClick={tap('cmp')}
								className={s?.status === 'missed' ? 'mute' : ''}
							>
								{actual}
							</button>
						)}
					</td>
				)
			case 'avvik':
				return (
					<td key={c} ref={devRef} className={`c dev t-${dev?.tone ?? 'none'}`}>
						{dev?.sign ? (
							<button
								type="button"
								aria-label={`Avvik: ${dev.why}`}
								aria-expanded={open === 'cmp'}
								onClick={tap('cmp')}
								style={{ textAlign: 'center' }}
								className={dev.sign === '?' ? 'q' : ''}
							>
								{dev.sign}
							</button>
						) : null}
					</td>
				)
			case 'tyngde':
				return (
					<td key={c} ref={rpeRef} className="c num">
						{canRate ? (
							<button
								type="button"
								aria-label={
									s!.rpe != null ? `Tyngde ${s!.rpe}, endre` : 'Sett tyngde'
								}
								aria-expanded={open === 'rpe'}
								onClick={tap('rpe')}
								style={{ textAlign: 'right' }}
							>
								{s!.rpe ?? (
									<span className="mute" aria-hidden>
										·
									</span>
								)}
							</button>
						) : (
							<button
								type="button"
								onClick={tap('detail')}
								tabIndex={-1}
								aria-hidden
							/>
						)}
					</td>
				)
			case 'tidp':
				return (
					<td key={c} className="num">
						{s &&
						s.status !== 'recording-only' &&
						s.planned.durationS.value != null
							? Math.round(s.planned.durationS.value / 60)
							: ''}
					</td>
				)
			case 'tidf':
				return (
					<td key={c} className="num">
						{s?.actual.durationS.value != null
							? Math.round(s.actual.durationS.value / 60)
							: ''}
					</td>
				)
			case 'km':
				return (
					<td key={c} className="num">
						{s?.actual.distanceM.value ? km(s.actual.distanceM.value) : ''}
					</td>
				)
			case 'tss':
				return <ProgTd key={c} v={pv?.load} show={!!pv} f={n0} />
			case 'grunn':
				return <ProgTd key={c} v={pv?.fitness} show={!!pv} f={n0} />
			case 'slit':
				return <ProgTd key={c} v={pv?.fatigue} show={!!pv} f={n0} />
			case 'form':
				return <ProgTd key={c} v={pv?.form} show={!!pv} f={signed} />
		}
	}
	return (
		<>
			<tr
				className={cls}
				data-date={r.date}
				data-sid={s?.id}
				onPointerDown={(e) => ctx.onDown(e, s)}
				onPointerMove={ctx.onMove}
				onPointerUp={ctx.onUp}
				onPointerCancel={ctx.onCancel}
				onClick={(e) => {
					if (placing && (e.target as HTMLElement).tagName === 'TD')
						void ctx.place(r.date, s)
				}}
				style={ctx.fits ? { touchAction: 'pan-y' } : undefined}
				onContextMenu={(e) => e.preventDefault()}
			>
				{cols.map(cell)}
			</tr>
			{open && (s || open === 'detail') ? (
				<XRow n={cols.length}>
					{open === 'rpe' && s ? (
						<RpeEdit s={s} />
					) : open === 'prop' && prop ? (
						<ProposalBox p={prop} />
					) : open === 'link' && s ? (
						<LinkChoice s={s} others={r.sameDay} />
					) : open === 'cmp' && s ? (
						<Compare s={s} />
					) : s ? (
						<SessionDetail s={s} ctx={ctx} />
					) : (
						<EmptyDay date={r.date} today={today} />
					)}
				</XRow>
			) : null}
		</>
	)
}

function signed(v: number) {
	const t = n0(v)
	return Math.round(v) > 0 ? `+${t}` : t
}

function ProgTd({
	v,
	show,
	f,
}: {
	v: { value: number | null; why: string | null } | undefined
	show: boolean
	f: (v: number) => string
}) {
	if (!show || !v) return <td className="num" />
	return (
		<td className="num">
			{v.value != null ? f(v.value) : v.why ? <Q why={v.why} /> : ''}
		</td>
	)
}

function EmptyDay({ date, today }: { date: string; today: string }) {
	const { act } = useHb()
	const [text, setText] = useState('')
	const [done, setDone] = useState(date < today)
	const [sport, setSport] = useState<'run' | 'bike' | 'swim' | 'strength'>(
		'run',
	)
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				if (!text.trim()) return
				void act<{ notDoneBecause: string | null }>(
					'add_session',
					{
						date,
						sentence: text.trim(),
						sport,
						...(date <= today && done && sport !== 'strength'
							? { alreadyDone: true }
							: {}),
					},
					(v) => ({
						what: `La til «${text.trim()}» ${dayShort(date)}${v.notDoneBecause ? ` (${v.notDoneBecause})` : ''}`,
						before: '',
						after: text.trim(),
					}),
				).then((r) => r.ok && setText(''))
			}}
		>
			<div className="say">
				<b>{dayLong(date)}</b>: ingen økt. Skriv en for å legge den til.
			</div>
			<div className="seg" role="radiogroup" aria-label="Idrett">
				{(
					[
						['run', 'Løping'],
						['bike', 'Sykling'],
						['swim', 'Svømming'],
						['strength', 'Styrke'],
					] as const
				).map(([id, label]) => (
					<button
						key={id}
						type="button"
						role="radio"
						aria-checked={sport === id}
						aria-pressed={sport === id}
						onClick={() => setSport(id)}
					>
						{label}
					</button>
				))}
			</div>
			<div style={{ display: 'flex', gap: 6 }}>
				<input
					className="cell-in dash"
					style={{ height: 44, flex: 1 }}
					placeholder={
						sport === 'strength'
							? '3x10 knebøy 60 kg'
							: '45 min rolig · 4x8 min terskel'
					}
					value={text}
					onChange={(e) => setText(e.target.value)}
					enterKeyHint="done"
					aria-label="Ny økt"
				/>
				<button className="btn pri" type="submit" disabled={!text.trim()}>
					Legg til
				</button>
			</div>
			{date <= today ? (
				<label
					className="why"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						minHeight: 44,
					}}
				>
					<input
						type="checkbox"
						checked={done}
						onChange={(e) => setDone(e.target.checked)}
						style={{ width: 20, height: 20 }}
					/>
					Allerede gjort
				</label>
			) : null}
		</form>
	)
}

function RpeEdit({ s }: { s: SessionCard }) {
	const { act } = useHb()
	return (
		<div>
			<div className="say">
				Hvor tungt kjentes «{s.title}»?{' '}
				<span className="why">1 veldig lett · 10 alt du hadde</span>
			</div>
			<div className="rpe" role="group" aria-label="Tyngde 1 til 10">
				{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
					<button
						key={n}
						type="button"
						aria-pressed={s.rpe === n}
						onClick={() =>
							void act('rate_session', { sessionId: s.id, rpe: n }, () => ({
								what: `Tyngde ${n} på «${s.title}» ${dayShort(s.date)}`,
								before: s.rpe != null ? String(s.rpe) : '',
								after: String(n),
							}))
						}
					>
						{n}
					</button>
				))}
			</div>
			{s.rpe != null ? (
				<button
					type="button"
					className="btn sm"
					style={{ marginTop: 6 }}
					onClick={() =>
						void act('rate_session', { sessionId: s.id, rpe: null }, () => ({
							what: `Tømte tyngde på «${s.title}»`,
							before: String(s.rpe),
							after: '',
						}))
					}
				>
					Tøm
				</button>
			) : null}
		</div>
	)
}

export function ProposalBox({ p }: { p: ProposalItem }) {
	const { act } = useHb()
	const [scope, setScope] = useState<'this-week' | 'from-now-on'>('this-week')
	const waiting = p.state === 'waiting'
	return (
		<div
			style={{
				borderLeft: '3px solid var(--over)',
				paddingLeft: 10,
				margin: '8px 0',
			}}
		>
			<div className="say">
				<b>{p.headline}</b>
				{p.addsLoad ? <span className="mark">mer trening</span> : null}
				{p.touchesOwnSession ? (
					<span className="mark">din egen økt</span>
				) : null}
			</div>
			<div className="why">{p.reason}</div>
			{!waiting ? (
				<div className="why">{p.stateLabel}</div>
			) : (
				<>
					{p.asksScope ? (
						<div className="seg" role="group" aria-label="Gjelder">
							<button
								type="button"
								aria-pressed={scope === 'this-week'}
								onClick={() => setScope('this-week')}
							>
								Bare denne uka
							</button>
							<button
								type="button"
								aria-pressed={scope === 'from-now-on'}
								onClick={() => setScope('from-now-on')}
							>
								Fra nå av
							</button>
						</div>
					) : null}
					<div className="acts">
						<button
							type="button"
							className="btn pri sm"
							onClick={() =>
								void act<{ applied: boolean }>(
									'answer_proposal',
									{
										proposalId: p.id,
										answer: 'yes',
										...(p.asksScope ? { scope } : {}),
									},
									(v) => ({
										what: `Ja til: ${p.headline}${v.applied ? '' : ' (ingenting igjen å endre)'}`,
										before: p.session?.title ?? null,
										after: p.headline,
									}),
								)
							}
						>
							Ja
						</button>
						<button
							type="button"
							className="btn sm"
							onClick={() =>
								void act(
									'answer_proposal',
									{ proposalId: p.id, answer: 'no' },
									() => ({
										what: `Nei til: ${p.headline}`,
									}),
								)
							}
						>
							Nei
						</button>
					</div>
				</>
			)}
		</div>
	)
}

function LinkChoice({ s, others }: { s: SessionCard; others: SessionCard[] }) {
	const { act } = useHb()
	const detail = useRead<SessionOutput>('session', sessionInput(s.id))
	const recId = detail.state?.ok ? detail.state.value.recording?.id : null
	const opts = useRead<LinkOptionsOutput>(
		'link_options',
		{ recordingId: recId },
		!!recId,
	)
	if (!detail.state) return <div className="why">Henter …</div>
	if (!detail.state.ok) return <div className="why">{detail.state.message}</div>
	if (!recId)
		return <div className="why">Fant ikke opptaket for denne økta.</div>
	if (!opts.state) return <div className="why">Henter valg …</div>
	if (!opts.state.ok) return <div className="why">{opts.state.message}</div>
	const options = opts.state.value.options
	return (
		<div>
			<div className="say">
				Klokka sendte «{s.title}»{' '}
				{s.actual.durationS.value != null
					? minutes(s.actual.durationS.value)
					: ''}
				. Var det en av disse?
			</div>
			{options.length ? (
				<div className="acts">
					{options.map((o) => (
						<button
							key={o.id}
							type="button"
							className="btn sm"
							onClick={() =>
								void act(
									'link_recording',
									{ recordingId: recId, sessionId: o.id },
									() => ({
										what: `Koblet opptaket til «${o.title ?? 'økt'}»`,
										before: 'egen rad',
										after: o.title ?? 'planlagt økt',
									}),
								)
							}
						>
							{o.title ?? 'Økt'} {o.minutes != null ? `${o.minutes}′` : ''}
						</button>
					))}
				</div>
			) : (
				<div className="why">
					Ingen av de {others.length - 1} andre øktene i dag passer (samme
					idrett, uten opptak).
				</div>
			)}
			<div className="why" style={{ marginTop: 6 }}>
				Lar du være, står den som en ekstra økt.
			</div>
		</div>
	)
}

function Compare({ s }: { s: SessionCard }) {
	const q = useRead<SessionOutput>('session', sessionInput(s.id))
	if (!q.state) return <div className="why">Henter …</div>
	if (!q.state.ok) return <div className="why">{q.state.message}</div>
	const c = q.state.value.comparison
	const today = new Date().toISOString().slice(0, 10)
	const dev = deviation(s, today)
	const rows: [
		string,
		{ value: number | null; why: string | null },
		{ value: number | null; why: string | null },
		(v: number) => string,
	][] = [
		['Tid ′', c.durationS.planned, c.durationS.actual, (v) => n0(v / 60)],
		['km', c.distanceM.planned, c.distanceM.actual, (v) => km(v)],
		['Belastning', c.load.planned, c.load.actual, (v) => n0(v)],
	]
	const sum = (() => {
		if (s.status === 'recording-only')
			return 'Ikke planlagt: klokka tok den opp. Ingen plan, ingen avvik. Den teller i ukas sum.'
		if (s.status === 'planned')
			return 'Ikke gjort ennå. Avvik regnes når økta kommer inn.'
		if (s.status === 'missed') return 'Ikke gjort. Under.'
		const parts: string[] = []
		if (c.structure.call === 'as-planned') parts.push('Dragene fulgte planen.')
		else if (c.structure.call === 'diverged')
			parts.push(`${c.structure.label ?? 'Dragene avvek fra planen'}.`)
		else if (c.structure.why)
			parts.push(`${c.structure.why} Sammenligner bare total.`)
		if (c.verdict.sentence) parts.push(`${c.verdict.sentence}.`)
		else if (c.verdict.why) parts.push(`? ${c.verdict.why}`)
		return parts.join(' ')
	})()
	return (
		<div>
			<div className="say">
				<b>Plan mot faktisk</b> ·{' '}
				<span className={`dev t-${dev.tone}`}>{dev.sign || ' '}</span>
			</div>
			<table className="sub">
				<thead>
					<tr>
						<th />
						<th className="num">Mål</th>
						<th className="num">Faktisk</th>
						<th className="num">Avvik</th>
					</tr>
				</thead>
				<tbody>
					{rows.map(([label, p, a, f]) => (
						<tr key={label}>
							<td>{label}</td>
							<td className="num">
								{p.value != null ? f(p.value) : p.why ? <Q why={p.why} /> : ''}
							</td>
							<td className="num">
								{a.value != null ? f(a.value) : a.why ? <Q why={a.why} /> : ''}
							</td>
							<td className="num">
								{p.value != null && a.value != null && p.value > 0
									? `${a.value >= p.value ? '+' : '−'}${n0(Math.abs((a.value / p.value - 1) * 100))}%`
									: ''}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<div className="say">{sum}</div>
			{c.sinceLast ? (
				<div className="why">
					Forrige gang ({dateMedium(c.sinceLast.date, false)}):{' '}
					{c.sinceLast.durationS.value != null
						? minutes(c.sinceLast.durationS.value)
						: '?'}
					{c.sinceLast.load.value != null
						? `, belastning ${n0(c.sinceLast.load.value)}`
						: ''}
				</div>
			) : null}
		</div>
	)
}

function TargetCell({
	st,
}: {
	st: NonNullable<SessionOutput['structure']>[number]['steps'][number]
}) {
	const t = st.target
	if (!t) return st.note ? <span className="mute">{st.note}</span> : null
	const bits: string[] = []
	if (t.resolvedText && !st.text.includes(t.resolvedText))
		bits.push(`${t.approximate ? '≈' : ''}${t.resolvedText}`)
	const hr = t.heartRate
	if (hr && (hr.min != null || hr.max != null))
		bits.push(
			hr.min != null && hr.max != null
				? `${hr.min}–${hr.max} bpm`
				: hr.max != null
					? `<${hr.max} bpm`
					: `>${hr.min} bpm`,
		)
	if (!bits.length && !t.resolvedText && t.why) return <Q why={t.why} />
	if (!bits.length) return <span className="mute">{t.label}</span>
	return <>{bits.join(' · ')}</>
}

export function SessionDetail({ s, ctx }: { s: SessionCard; ctx: DetailCtx }) {
	const { act } = useHb()
	const q = useRead<SessionOutput>('session', sessionInput(s.id))
	const [note, setNote] = useState<string | null>(null)
	const [confirm, setConfirm] = useState<'delete' | null>(null)
	const key = `${s.id}:${s.status}:${s.rpe}:${s.date}:${s.planned.durationS.value}`
	const reloadRef = useRef(q.reload)
	reloadRef.current = q.reload
	const first = useRef(true)
	useEffect(() => {
		if (first.current) {
			first.current = false
			return
		}
		reloadRef.current()
	}, [key])
	if (!q.state) return <div className="why">Henter økta …</div>
	if (!q.state.ok) return <div className="why">{q.state.message}</div>
	const d = q.state.value
	const can = d.can
	const today = ctx.data.today
	const rec = d.recording
	const noteVal = note ?? d.feeling.note ?? ''
	return (
		<div>
			<div className="say">
				<b>{d.title}</b> · {d.sportName} · {dayLong(d.date)}
				{d.time ? ` ${d.time}` : ''}
				{d.purpose ? ` · ${d.purpose}` : ''}
			</div>
			{d.summary && !d.structure?.length ? (
				<div className="mono" style={{ fontSize: 13 }}>
					{d.summary}
				</div>
			) : null}
			{d.adjustedBecause ? (
				<div className="why">* {d.adjustedBecause}</div>
			) : null}
			{d.whose === 'athlete' && d.status !== 'recording-only' ? (
				<div className="why">
					Din egen økt: planen endrer den ikke uten å spørre.
				</div>
			) : null}
			{d.structure?.length && d.sport !== 'strength' ? (
				<table className="sub">
					<thead>
						<tr>
							<th>Del</th>
							<th>Mål</th>
						</tr>
					</thead>
					<tbody>
						{d.structure.map((b, i) => (
							<Fragment key={i}>
								{b.repeat > 1 || b.series > 1 ? (
									<tr>
										<td colSpan={2} style={{ fontWeight: 600 }}>
											{b.name ? `${b.name}: ` : ''}
											{b.text}
										</td>
									</tr>
								) : null}
								{b.steps.map((st, j) => (
									<tr key={j}>
										<td
											style={{
												paddingLeft: b.repeat > 1 || b.series > 1 ? 16 : 6,
											}}
										>
											{b.repeat <= 1 && b.series <= 1 && b.name && j === 0
												? `${b.name}: `
												: ''}
											{st.kind === 'rest' ? (
												<span className="mute">{st.text}</span>
											) : (
												st.text
											)}
										</td>
										<td>
											<TargetCell st={st} />
										</td>
									</tr>
								))}
							</Fragment>
						))}
					</tbody>
				</table>
			) : d.status === 'recording-only' ? (
				<div className="why">Ikke planlagt: klokka tok den opp.</div>
			) : d.sport !== 'strength' ? (
				<div className="why">Ingen struktur: bare tid og innsats.</div>
			) : null}
			{d.description ? (
				<p className="why" style={{ whiteSpace: 'pre-wrap' }}>
					{d.description}
				</p>
			) : null}
			{rec ? (
				<table className="sub">
					<thead>
						<tr>
							<th>Opptak ({rec.from})</th>
							<th className="num">Tid</th>
							<th className="num">km</th>
							<th className="num">Puls</th>
							<th className="num">Watt</th>
							<th className="num">/km</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>snitt</td>
							<td className="num">
								{rec.durationS.value != null ? (
									hm(rec.durationS.value)
								) : (
									<Q why={rec.durationS.why ?? 'Ukjent.'} />
								)}
							</td>
							<td className="num">
								{rec.distanceM.value != null ? (
									km(rec.distanceM.value)
								) : (
									<Q why={rec.distanceM.why ?? 'Ukjent.'} />
								)}
							</td>
							<td className="num">
								{rec.avgHeartRate.value != null ? (
									n0(rec.avgHeartRate.value)
								) : (
									<Q why={rec.avgHeartRate.why ?? 'Ukjent.'} />
								)}
							</td>
							<td className="num">
								{rec.avgPower.value != null ? (
									n0(rec.avgPower.value)
								) : (
									<Q why={rec.avgPower.why ?? 'Ukjent.'} />
								)}
							</td>
							<td className="num">
								{rec.avgPace.value != null && d.sport === 'run' ? (
									pace(rec.avgPace.value)
								) : (
									<Q why={rec.avgPace.why ?? 'Fart regnes bare for løping.'} />
								)}
							</td>
						</tr>
					</tbody>
				</table>
			) : null}
			{d.sport === 'strength' && d.status !== 'recording-only' ? (
				<StrengthTable sessionId={d.id} canLog={can.logStrength} />
			) : null}
			{can.rateFeeling.allowed ? (
				<form
					style={{ marginTop: 8 }}
					onSubmit={(e) => {
						e.preventDefault()
						void act(
							'note_session',
							{ sessionId: d.id, note: noteVal },
							() => ({
								what: `Notat på «${d.title}» ${dayShort(d.date)}`,
								before: d.feeling.note ?? '',
								after: noteVal,
							}),
						).then((r) => r.ok && setNote(null))
					}}
				>
					<label className="why" htmlFor={`note-${d.id}`}>
						Notat
					</label>
					<textarea
						id={`note-${d.id}`}
						className="dash"
						rows={2}
						maxLength={2000}
						value={noteVal}
						onChange={(e) => setNote(e.target.value)}
						style={{
							width: '100%',
							padding: 8,
							font: '16px var(--sans)',
							resize: 'vertical',
						}}
						placeholder="Hvordan gikk det?"
					/>
					{note != null && note !== (d.feeling.note ?? '') ? (
						<button className="btn sm" type="submit">
							Lagre notat
						</button>
					) : null}
				</form>
			) : null}
			<div className="acts">
				{can.markDone.allowed && d.sport !== 'strength' ? (
					<button
						type="button"
						className="btn sm pri"
						onClick={() => void ctx.doDone(s)}
					>
						Gjort
					</button>
				) : null}
				{can.skip.allowed ? (
					<button
						type="button"
						className="btn sm"
						onClick={() => void ctx.doSkip(s)}
					>
						Hopp over
					</button>
				) : null}
				{can.move.allowed ? (
					<button
						type="button"
						className="btn sm"
						onClick={() =>
							ctx.setPlacing({
								sid: s.id,
								title: s.title,
								date: s.date,
								mode: 'move',
							})
						}
					>
						Flytt
					</button>
				) : null}
				{can.swap.allowed ? (
					<button
						type="button"
						className="btn sm"
						onClick={() =>
							ctx.setPlacing({
								sid: s.id,
								title: s.title,
								date: s.date,
								mode: 'swap',
							})
						}
					>
						Bytt
					</button>
				) : null}
				{can.shorten.allowed ? (
					<button
						type="button"
						className="btn sm"
						onClick={() =>
							void act<{
								minutesBefore: number | null
								minutesAfter: number | null
							}>('shorten_session', { sessionId: s.id }, (v) => ({
								what: `«${s.title}» kortere: ${v.minutesBefore ?? '?'}′ → ${v.minutesAfter ?? '?'}′`,
								before: `${v.minutesBefore ?? '?'}′`,
								after: `${v.minutesAfter ?? '?'}′`,
							}))
						}
					>
						Kortere
					</button>
				) : null}
				{can.makeEasier.allowed ? (
					<button
						type="button"
						className="btn sm"
						onClick={() =>
							void act<{
								minutesBefore: number | null
								minutesAfter: number | null
							}>('ease_session', { sessionId: s.id }, (v) => ({
								what: `«${s.title}» lettere: ${v.minutesBefore ?? '?'}′ → ${v.minutesAfter ?? '?'}′ rolig`,
								before: `${v.minutesBefore ?? '?'}′`,
								after: `${v.minutesAfter ?? '?'}′ rolig`,
							}))
						}
					>
						Lettere
					</button>
				) : null}
				{d.whose === 'athlete' && d.status === 'planned' ? (
					<button
						type="button"
						className="btn sm"
						onClick={() =>
							void act('release_session', { sessionId: s.id }, () => ({
								what: `«${s.title}» gitt til planen`,
								before: 'egen',
								after: 'planens',
							}))
						}
					>
						Gi til planen
					</button>
				) : null}
				{!d.hasRecording && d.whose === 'athlete' ? (
					<button
						type="button"
						className="btn sm dng"
						onClick={() => setConfirm('delete')}
					>
						Slett
					</button>
				) : null}
			</div>
			{[can.move, can.skip, can.markDone, can.shorten]
				.filter((x) => !x.allowed && x.why)
				.slice(0, 1)
				.map((x) => (
					<div key="w" className="why" style={{ marginTop: 6 }}>
						{x.why}
					</div>
				))}
			{d.date >= today && !ctx.onDayPage ? (
				<Link className="lnk" to={`${BASE}/dag/${d.date}`}>
					Bare denne dagen, stort →
				</Link>
			) : null}
			{confirm === 'delete' ? (
				<Confirm
					title={`Slette «${d.title}»?`}
					yes="Slett"
					danger
					onNo={() => setConfirm(null)}
					onYes={() => {
						setConfirm(null)
						void act<{ noUndoBecause: string }>(
							'delete_session',
							{ sessionId: s.id },
							() => ({
								what: `Slettet «${d.title}» ${dayShort(d.date)}`,
								before: d.title,
								after: '',
							}),
						)
					}}
				>
					Kan ikke angres.
				</Confirm>
			) : null}
		</div>
	)
}

// ── strength: the set table ──────────────────────────────────────────────────

function loadText(l: StrengthLoad | null | undefined): string {
	if (!l) return ''
	switch (l.kind) {
		case 'kg':
			return n1(l.kg)
		case 'kg-per-hand':
			return `2×${n1(l.kg)}`
		case 'bodyweight':
			return 'kv'
		case 'bodyweight-plus':
			return `kv+${n1(l.kg)}`
		case 'assisted':
			return `−${n1(l.kg)}`
		case 'machine-level':
			return l.label ?? `nivå ${l.level}`
		case 'band':
			return l.band
		case 'none':
			return '–'
	}
}
function loadKg(l: StrengthLoad | null | undefined): number | null {
	if (!l) return null
	if (l.kind === 'kg' || l.kind === 'bodyweight-plus') return l.kg
	if (l.kind === 'kg-per-hand') return l.kg * 2
	return null
}

export function StrengthTable({
	sessionId,
	canLog,
}: {
	sessionId: string
	canLog: { allowed: boolean; why: string | null }
}) {
	const { act, demo } = useHb()
	const q = useRead<StrengthSessionOutput>('strength_session', { sessionId })
	// Opening the sets of a session not begun starts it, once: a program's
	// working weights are taken at this moment, as in the other apps.
	const started = useRef(false)
	const read = q.state
	const setRead = q.setState
	useEffect(() => {
		if (started.current || demo || !canLog.allowed) return
		if (!read?.ok) return
		const v = read.value
		if (v.session.state !== 'planned' || v.loggedWorkingSets > 0) return
		started.current = true
		void callCap<StrengthSessionOutput>('start_strength_session', {
			sessionId,
		}).then((r) => {
			if (r.ok) setRead(r)
		})
	}, [read, demo, canLog.allowed, sessionId, setRead])
	const [pad, setPad] = useState<{
		stepId: string
		setIndex: number
		field: 'reps' | 'kg'
		label: string
		initial: string
	} | null>(null)
	const [ask, setAsk] = useState<string | null>(null)
	const [finished, setFinished] = useState<string | null>(null)
	if (!q.state) return <div className="why">Henter settene …</div>
	if (!q.state.ok) return <div className="why">{q.state.message}</div>
	const st = q.state.value
	let volume = 0
	let volumeUnknown = false
	for (const ex of st.exercises)
		for (const set of ex.sets)
			if (set.logged?.done && !set.warmup) {
				const k = loadKg(set.logged.load)
				if (k != null && set.logged.reps != null) volume += k * set.logged.reps
				else if (
					set.logged.load?.kind !== 'bodyweight' &&
					set.logged.load?.kind !== 'none'
				)
					volumeUnknown = true
			}
	const log = async (input: Record<string, unknown>, what: string) => {
		const r = await act('log_strength_set', { sessionId, ...input }, () => ({
			what,
		}))
		q.reload()
		return r
	}
	return (
		<div style={{ marginTop: 6 }}>
			{st.program ? (
				<div className="why">Program: {st.program.name}</div>
			) : null}
			<table className="sub">
				<thead>
					<tr>
						<th>Øvelse</th>
						<th className="num">Sett</th>
						<th className="num">Reps</th>
						<th className="num">kg</th>
						<th className="num">✓</th>
					</tr>
				</thead>
				<tbody>
					{st.exercises.map((ex) =>
						ex.sets.map((set, i) => {
							const logged = set.logged
							const reps = logged?.reps ?? set.prescribed.reps
							const kgTxt = logged?.load
								? loadText(logged.load)
								: set.prescribed.kg != null
									? n1(set.prescribed.kg)
									: null
							const label = `${ex.name}, ${set.warmup ? 'oppvarming' : `sett ${set.setIndex + 1}`}`
							return (
								<tr
									key={`${ex.stepId}-${set.setIndex}`}
									style={set.warmup ? { color: 'var(--mute)' } : undefined}
								>
									<td>
										{i === 0 ? <b>{ex.name}</b> : null}
										{i === 0 && ex.sets[0]?.lastTime ? (
											<div className="mute" style={{ fontSize: 11 }}>
												sist: {ex.sets[0].lastTime.reps ?? '?'} ×{' '}
												{loadText(ex.sets[0].lastTime.load)}
											</div>
										) : null}
										{i === 0 && ex.defaultLoadUnknownBecause ? (
											<div className="mute" style={{ fontSize: 11 }}>
												{ex.defaultLoadUnknownBecause}
											</div>
										) : null}
									</td>
									<td className="num">
										{set.warmup
											? 'opv'
											: i + 1 - ex.sets.filter((x) => x.warmup).length}
									</td>
									<td className="num" style={{ padding: 0 }}>
										<button
											type="button"
											className="cell-in"
											style={{
												height: 40,
												fontStyle: logged ? 'normal' : 'italic',
												textAlign: 'right',
											}}
											disabled={!canLog.allowed}
											aria-label={`${label}: reps ${reps ?? 'ukjent'}`}
											onClick={() =>
												setPad({
													stepId: ex.stepId,
													setIndex: set.setIndex,
													field: 'reps',
													label: `${label}: reps`,
													initial: reps != null ? String(reps) : '',
												})
											}
										>
											{reps ??
												(set.prescribed.seconds
													? `${set.prescribed.seconds}s`
													: '?')}
										</button>
									</td>
									<td className="num" style={{ padding: 0 }}>
										<button
											type="button"
											className="cell-in"
											style={{
												height: 40,
												fontStyle: logged ? 'normal' : 'italic',
												textAlign: 'right',
											}}
											disabled={!canLog.allowed}
											aria-label={`${label}: kg ${kgTxt ?? 'ukjent'}`}
											onClick={() =>
												setPad({
													stepId: ex.stepId,
													setIndex: set.setIndex,
													field: 'kg',
													label: `${label}: kg`,
													initial:
														(loadKg(logged?.load) ?? set.prescribed.kg)
															?.toString()
															.replace('.', ',') ?? '',
												})
											}
										>
											{kgTxt ?? (
												<span
													className="q"
													title={set.prescribed.kgUnknownBecause}
												>
													?
												</span>
											)}
										</button>
									</td>
									<td className="num" style={{ padding: 0 }}>
										<button
											type="button"
											className="cell-in"
											style={{
												height: 40,
												textAlign: 'center',
												fontWeight: 700,
												color: logged?.done
													? 'var(--hit)'
													: logged
														? 'var(--under)'
														: 'var(--mute)',
											}}
											disabled={!canLog.allowed}
											aria-label={
												logged
													? `${label}: logget, fjern`
													: `${label}: huk av som gjort`
											}
											onClick={() =>
												logged
													? void act(
															'remove_strength_set',
															{
																sessionId,
																stepId: ex.stepId,
																setIndex: set.setIndex,
															},
															() => ({
																what: `Fjernet ${label}`,
															}),
														).then(() => q.reload())
													: void log(
															{ stepId: ex.stepId, setIndex: set.setIndex },
															`${label}: ${reps ?? '?'} × ${kgTxt ?? '?'}`,
														).then((r) => {
															if (!r.ok && r.code === 'needs-load')
																setPad({
																	stepId: ex.stepId,
																	setIndex: set.setIndex,
																	field: 'kg',
																	label: `${label}: kg`,
																	initial: '',
																})
														})
											}
										>
											{logged ? (logged.done ? '✓' : '×') : '○'}
										</button>
									</td>
								</tr>
							)
						}),
					)}
				</tbody>
				<tfoot>
					<tr>
						<td colSpan={3}>
							Sum volum{' '}
							<span className="mute">
								({st.loggedWorkingSets} sett logget, {st.unloggedWorkingSets}{' '}
								igjen)
							</span>
						</td>
						<td className="num" colSpan={2}>
							{volume ? (
								`${n0(volume)} kg`
							) : volumeUnknown ? (
								<Q why="Noen sett mangler kilo." />
							) : (
								''
							)}
						</td>
					</tr>
				</tfoot>
			</table>
			{!canLog.allowed && canLog.why ? (
				<div className="why">{canLog.why}</div>
			) : null}
			{canLog.allowed ? (
				<div className="acts">
					<button
						type="button"
						className="btn sm"
						onClick={() =>
							void act<{ loggedSets: number }>(
								'log_strength_as_planned',
								{ sessionId },
								(v) => ({
									what: `Styrke ført som planlagt (${v.loggedSets} sett)`,
								}),
							).then(() => q.reload())
						}
					>
						Alt som planlagt
					</button>
					<button
						type="button"
						className="btn sm pri"
						onClick={async () => {
							const r = await act<{
								lifts: { name: string; reason: string }[]
							}>('finish_strength_session', { sessionId }, (v) => ({
								what: `Styrkeøkta fullført${v.lifts.length ? `: ${v.lifts.map((l) => l.name).join(', ')}` : ''}`,
							}))
							if (!r.ok && r.code === 'unlogged-sets') setAsk(r.message)
							else if (r.ok)
								setFinished(
									r.value.lifts
										.map((l) => `${l.name}: ${l.reason}`)
										.join(' · ') || null,
								)
							q.reload()
						}}
					>
						Fullfør
					</button>
				</div>
			) : null}
			{finished ? (
				<div className="why" style={{ marginTop: 6 }}>
					{finished}
				</div>
			) : null}
			{ask ? (
				<Confirm
					title={ask}
					yes="Avslutt, regn dem som ikke gjort"
					onNo={() => setAsk(null)}
					onYes={() => {
						setAsk(null)
						void act(
							'finish_strength_session',
							{ sessionId, unloggedSets: 'not-done' },
							() => ({
								what: 'Styrkeøkta fullført, resten ikke gjort',
							}),
						).then(() => q.reload())
					}}
				>
					Eller avbryt og før dem først.
				</Confirm>
			) : null}
			{pad ? (
				<NumPad
					label={pad.label}
					initial={pad.initial.replace('.', ',')}
					decimals={pad.field === 'kg'}
					onCancel={() => setPad(null)}
					onDone={(v) => {
						const p = pad
						setPad(null)
						if (v == null) return
						void log(
							p.field === 'reps'
								? {
										stepId: p.stepId,
										setIndex: p.setIndex,
										reps: Math.round(v),
									}
								: {
										stepId: p.stepId,
										setIndex: p.setIndex,
										load: { kind: 'kg', kg: v },
									},
							`${p.label} = ${p.field === 'kg' ? `${n1(v)} kg` : Math.round(v)}`,
						)
					}}
				/>
			) : null}
		</div>
	)
}

export { callCap }
