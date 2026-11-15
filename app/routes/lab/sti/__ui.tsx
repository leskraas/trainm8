/**
 * Sti: shared look, words and small parts. The season is a path through a
 * landscape; these are the stones it is built from.
 */
import {
	type ReactNode,
	useEffect,
	useState,
	useSyncExternalStore,
} from 'react'
import { Link } from 'react-router'
import { useCapability } from '#app/lab/engine/client.ts'
import { type Num } from '#app/lab/engine/reads.types.ts'
import {
	type UndoInput,
	type UndoOutput,
} from '#app/lab/engine/sessions.types.ts'
import {
	type UndoGoalChangeInput,
	type GoalWriteOutput,
} from '#app/lab/engine/setup.types.ts'

export const BASE = '/lab/sti'

// ── Look ─────────────────────────────────────────────────────────────────────

export const STI_CSS = `
.sti {
	--sky: #F3F5F2;
	--ink: #2E3A33;
	--ink-soft: rgba(46,58,51,.62);
	--ink-faint: rgba(46,58,51,.16);
	--t0: #C9D6C3;
	--t1: #7E9B78;
	--slab: #FFFFFF;
	--dot: #E4572E;
	--alt: #3E7CB1;
	--fog: #DDE1DC;
	--card: #FFFFFF;
	--scrim: rgba(18,22,20,.28);
	--good: #4E7A4A;
	--warn: #A3542F;
	--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
	--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
	--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
	color-scheme: light;
	background: var(--sky);
	color: var(--ink);
	font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
	min-height: 100dvh;
	-webkit-text-size-adjust: 100%;
	-webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
	.sti {
		--sky: #121614;
		--ink: #D6E2D2;
		--ink-soft: rgba(214,226,210,.66);
		--ink-faint: rgba(214,226,210,.16);
		--t0: #26332A;
		--t1: #3F5A43;
		--slab: #1B221D;
		--dot: #FF7A50;
		--alt: #6FA8DC;
		--fog: #2A312C;
		--card: #1A201C;
		--scrim: rgba(0,0,0,.5);
		--good: #8DBF86;
		--warn: #E39A72;
		color-scheme: dark;
	}
}
html:has(.sti), body:has(.sti) {
	background: var(--sti-sky-root, #F3F5F2);
	overscroll-behavior: none;
	-webkit-tap-highlight-color: transparent;
}
@media (prefers-color-scheme: dark) {
	html:has(.sti), body:has(.sti) { --sti-sky-root: #121614; }
}
.sti *, .sti *::before, .sti *::after { box-sizing: border-box; }
.sti button, .sti a, .sti [role="button"], .sti label {
	touch-action: manipulation;
	-webkit-tap-highlight-color: transparent;
}
.sti button, .sti [role="button"] {
	user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
	font: inherit; color: inherit;
}
.sti input, .sti textarea, .sti select { font-size: 16px; font-family: inherit; color: inherit; }
.sti .num { font-variant-numeric: tabular-nums; }
.sti .caps {
	font-variant-caps: all-small-caps;
	letter-spacing: .08em;
	font-weight: 650;
}
.sti .soft { color: var(--ink-soft); }
.sti h1, .sti h2, .sti h3, .sti p { margin: 0; }
.sti-btn {
	display: inline-flex; align-items: center; justify-content: center; gap: 8px;
	min-height: 48px; padding: 0 20px; border-radius: 14px;
	border: 1.5px solid var(--ink); background: var(--ink); color: var(--sky) !important;
	font-weight: 650; font-size: 16px; text-decoration: none; cursor: pointer;
	transition: transform 140ms var(--ease-out), opacity 140ms ease;
}
.sti-btn:active { transform: scale(0.97); }
.sti-btn[disabled], .sti-btn[aria-disabled="true"] { opacity: .45; cursor: default; }
.sti-btn.ghost { background: transparent; color: var(--ink) !important; }
.sti-btn.quiet { background: transparent; border-color: var(--ink-faint); color: var(--ink) !important; }
.sti-btn.alt { background: var(--alt); border-color: var(--alt); color: #fff !important; }
.sti-btn.danger { background: var(--warn); border-color: var(--warn); color: #fff !important; }
.sti-btn.small { min-height: 44px; padding: 0 14px; font-size: 15px; border-radius: 12px; }
.sti-btn.wide { width: 100%; }
.sti-link {
	color: inherit; text-decoration: underline; text-underline-offset: 3px;
	text-decoration-color: var(--ink-faint); background: none; border: 0; padding: 0; cursor: pointer;
	min-height: 44px; display: inline-flex; align-items: center;
}
.sti-chip {
	min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1.5px solid var(--ink-faint);
	background: var(--card); display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
	font-size: 15px; transition: transform 120ms var(--ease-out), background-color 160ms ease, border-color 160ms ease;
}
.sti-chip:active { transform: scale(0.97); }
.sti-chip[aria-pressed="true"], .sti-chip[aria-checked="true"] {
	border-color: var(--ink); background: var(--ink); color: var(--sky);
}
.sti-field {
	width: 100%; min-height: 48px; padding: 10px 14px; border-radius: 12px;
	border: 1.5px solid var(--ink-faint); background: var(--card);
	outline: none; transition: border-color 140ms ease;
}
.sti-field:focus { border-color: var(--ink); }
.sti-card {
	background: var(--card); border-radius: 18px; padding: 16px;
	border: 1px solid var(--ink-faint);
}
.sti-err {
	color: var(--warn); font-size: 15px; line-height: 1.4;
}
.sti-fog {
	background: var(--fog); border-radius: 14px; padding: 14px 16px;
	color: var(--ink-soft); font-size: 14px; line-height: 1.4;
	position: relative; overflow: hidden;
}
.sti-fog::after {
	content: ""; position: absolute; inset: 0; pointer-events: none;
	background: radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.35), transparent 60%);
}
@media (prefers-color-scheme: dark) { .sti-fog::after { background: radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.05), transparent 60%); } }
.sti-sheet-wrap {
	min-height: 100dvh; display: flex; flex-direction: column;
	background: var(--sky);
}
.sti-sheet {
	flex: 1; margin-top: calc(env(safe-area-inset-top, 0px) + 52px);
	background: var(--card); border-radius: 24px 24px 0 0;
	box-shadow: 0 -10px 40px rgba(20,30,24,.10);
	padding: 8px 20px calc(32px + env(safe-area-inset-bottom, 0px));
	width: 100%; max-width: 640px; margin-left: auto; margin-right: auto;
	transform: translateY(0); opacity: 1;
	transition: transform 360ms var(--ease-drawer), opacity 200ms ease;
}
@starting-style { .sti-sheet { transform: translateY(40px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
	.sti-sheet { transition: opacity 200ms ease; }
	@starting-style { .sti-sheet { transform: none; opacity: 0; } }
}
.sti-handle { width: 40px; height: 5px; border-radius: 3px; background: var(--ink-faint); margin: 4px auto 10px; }
.sti-merke {
	position: fixed; left: 50%; z-index: 50;
	bottom: calc(env(safe-area-inset-bottom, 0px) + 88px);
	transform: translateX(-50%); opacity: 1;
	transition: transform 240ms var(--ease-out), opacity 200ms ease;
	display: flex; align-items: center; gap: 4px; width: max-content; max-width: min(calc(100vw - 24px), 520px);
	background: var(--ink); color: var(--sky); border-radius: 14px;
	padding: 4px 4px 4px 16px; box-shadow: 0 8px 28px rgba(0,0,0,.18);
	font-size: 15px;
}
@starting-style { .sti-merke { transform: translate(-50%, 12px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
	.sti-merke { transition: opacity 200ms ease; }
	@starting-style { .sti-merke { transform: translateX(-50%); opacity: 0; } }
}
.sti-merke button { background: transparent; border: 0; color: var(--sky); font-weight: 700; min-height: 44px; padding: 0 14px; cursor: pointer; border-radius: 10px; }
.sti-merke button:active { transform: scale(0.97); }
.sti-pending { opacity: .55; transition: opacity 160ms ease; }
.sti-spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: sti-spin 600ms linear infinite; display: inline-block; }
@keyframes sti-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .sti-spin { animation-duration: 1.6s; } }
@media (hover: hover) and (pointer: fine) {
	.sti-btn:hover { opacity: .92; }
	.sti-chip:hover { border-color: var(--ink-soft); }
	.sti-link:hover { text-decoration-color: currentColor; }
}
`

export function StiRoot({ children }: { children: ReactNode }) {
	return (
		<div className="sti">
			<style dangerouslySetInnerHTML={{ __html: STI_CSS }} />
			{children}
			<MerkeBar />
		</div>
	)
}

// ── Words ────────────────────────────────────────────────────────────────────

const WD_SHORT: Record<string, string> = {
	mon: 'man',
	tue: 'tir',
	wed: 'ons',
	thu: 'tor',
	fri: 'fre',
	sat: 'lør',
	sun: 'søn',
}
const WD_LONG: Record<string, string> = {
	mon: 'mandag',
	tue: 'tirsdag',
	wed: 'onsdag',
	thu: 'torsdag',
	fri: 'fredag',
	sat: 'lørdag',
	sun: 'søndag',
}
export const WEEKDAY_KEYS = [
	'mon',
	'tue',
	'wed',
	'thu',
	'fri',
	'sat',
	'sun',
] as const
export const wdShort = (w: string) => WD_SHORT[w] ?? w
export const wdLong = (w: string) => WD_LONG[w] ?? w

const MONTHS = [
	'januar',
	'februar',
	'mars',
	'april',
	'mai',
	'juni',
	'juli',
	'august',
	'september',
	'oktober',
	'november',
	'desember',
]

export function toDate(day: string) {
	return new Date(`${day.slice(0, 10)}T12:00:00Z`)
}
export function dayKey(d: Date) {
	return d.toISOString().slice(0, 10)
}
export function addDays(day: string, n: number) {
	const d = toDate(day)
	d.setUTCDate(d.getUTCDate() + n)
	return dayKey(d)
}
export function daysBetween(a: string, b: string) {
	return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)
}
export function weekdayOf(day: string) {
	return WEEKDAY_KEYS[(toDate(day).getUTCDay() + 6) % 7]!
}
export function mondayOf(day: string) {
	return addDays(day, -((toDate(day).getUTCDay() + 6) % 7))
}
export function fmtDay(day: string, opts: { weekday?: boolean } = {}) {
	const d = toDate(day)
	const s = `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`
	return opts.weekday ? `${wdLong(weekdayOf(day))} ${s}` : s
}
export function fmtMonthYear(day: string) {
	const d = toDate(day)
	return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
/** «i dag», «i morgen», «i går», else «tirsdag 18. november». */
export function relDay(day: string, today: string) {
	const n = daysBetween(today, day)
	if (n === 0) return 'i dag'
	if (n === 1) return 'i morgen'
	if (n === -1) return 'i går'
	return fmtDay(day, { weekday: true })
}

export function fmtDuration(seconds: number) {
	const m = Math.round(seconds / 60)
	if (m < 60) return `${m} min`
	const h = Math.floor(m / 60)
	const r = m % 60
	return r ? `${h} t ${r} min` : `${h} t`
}
export function fmtKm(meters: number) {
	const km = meters / 1000
	return `${km.toLocaleString('nb-NO', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`
}
export function fmtPace(sec: number, unit: 'km' | '100m' = 'km') {
	const s = Math.round(sec)
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /${unit === 'km' ? 'km' : '100 m'}`
}
export function fmtNumber(n: number, digits = 0) {
	return n.toLocaleString('nb-NO', { maximumFractionDigits: digits })
}
export function fmtHours(h: number) {
	return `${h.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} t`
}

/** A number the app may not know. */
export function Known({
	n,
	fmt,
	unknown = 'ukjent',
}: {
	n: Num | { value: number | null; why?: string | null } | null | undefined
	fmt: (v: number) => string
	unknown?: string
}) {
	if (!n || n.value === null || n.value === undefined) {
		return (
			<span
				className="soft"
				title={n?.why ?? undefined}
				style={{ fontStyle: 'italic' }}
			>
				{unknown}
			</span>
		)
	}
	return <span className="num">{fmt(n.value)}</span>
}

const PHASE_WORDS: Array<[RegExp, string, string]> = [
	[
		/base|grunn|foundation|general/i,
		'Grunnen',
		'rolig mengde som legger grunnmuren. Mest lett, litt fart.',
	],
	[
		/build|bygg|oppbygg|bakke/i,
		'Bakken',
		'mer terskel, og langturen blir lengre. Her blir det bratt.',
	],
	[
		/peak|topp|spiss|spesif|specific|race.?prep/i,
		'Toppen',
		'de hardeste og mest løpslike øktene. Kort før det flater ut.',
	],
	[
		/taper|nedtrapp|nedstig/i,
		'Nedstigningen',
		'mindre mengde, men farten beholdes. Beina hviler seg klare.',
	],
	[
		/recover|restitu|hvile/i,
		'Hvilen',
		'en lett strekning for å ta igjen seg selv.',
	],
	[/race|løp|konkurr|mål/i, 'Målet', 'dagen du har gått mot.'],
	[
		/block|blokk|runde|cycle|syklus/i,
		'Runden',
		'fire uker som gjentar seg med litt mer hver gang.',
	],
]
/** The engine's phase name as Sti's terrain. Unknown names stay as they are. */
export function phaseName(name: string | null | undefined) {
	if (!name) return 'Stien'
	const round = /^(?:blokk|block|runde)\s*(\d+)$/i.exec(name.trim())
	if (round) return `Runde ${round[1]}`
	for (const [re, word] of PHASE_WORDS) if (re.test(name)) return word
	return name
}
export function phaseWhat(name: string | null | undefined) {
	if (!name) return null
	for (const [re, , what] of PHASE_WORDS) if (re.test(name)) return what
	return null
}

/** traff / under / over, the three words Sti always uses. */
export function verdictWord(call: 'under' | 'on-target' | 'over' | null) {
	if (call === 'on-target') return 'traff'
	if (call === 'under') return 'under'
	if (call === 'over') return 'over'
	return null
}

export function sportLetter(sport: string | null | undefined) {
	switch (sport) {
		case 'run':
			return 'L'
		case 'bike':
			return 'Sy'
		case 'swim':
			return 'Sv'
		case 'strength':
			return 'St'
		default:
			return 'A'
	}
}
export function sportWord(sport: string | null | undefined) {
	switch (sport) {
		case 'run':
			return 'Løping'
		case 'bike':
			return 'Sykling'
		case 'swim':
			return 'Svømming'
		case 'strength':
			return 'Styrke'
		default:
			return 'Annet'
	}
}

/** RPE 1–10 as a border colour, light to dark along the terrain. */
export function rpeColor(rpe: number | null | undefined) {
	if (!rpe) return 'var(--ink)'
	const t = Math.min(1, Math.max(0, (rpe - 1) / 9))
	return `color-mix(in oklab, var(--t1) ${Math.round((1 - t) * 100)}%, var(--dot) ${Math.round(t * 100)}%)`
}

// ── Parts ────────────────────────────────────────────────────────────────────

export function Sheet({
	title,
	kicker,
	back = BASE,
	children,
	wide,
}: {
	title: ReactNode
	kicker?: ReactNode
	back?: string
	children: ReactNode
	wide?: boolean
}) {
	return (
		<div className="sti-sheet-wrap">
			<div
				aria-hidden
				style={{
					position: 'fixed',
					inset: 0,
					pointerEvents: 'none',
					background:
						'radial-gradient(80% 50% at 50% 0%, var(--t0), transparent 70%)',
					opacity: 0.6,
				}}
			/>
			<section
				className="sti-sheet"
				style={{ position: 'relative', maxWidth: wide ? 900 : 640 }}
			>
				<div className="sti-handle" aria-hidden />
				<header
					style={{
						display: 'flex',
						alignItems: 'flex-start',
						gap: 12,
						marginBottom: 16,
					}}
				>
					<div style={{ flex: 1, minWidth: 0 }}>
						{kicker ? (
							<div className="caps soft" style={{ fontSize: 13 }}>
								{kicker}
							</div>
						) : null}
						<h1
							style={{
								fontSize: 24,
								lineHeight: 1.2,
								fontWeight: 700,
								overflowWrap: 'anywhere',
							}}
						>
							{title}
						</h1>
					</div>
					<Link
						to={back}
						aria-label="Lukk"
						className="sti-btn quiet small"
						style={{ width: 44, padding: 0, flexShrink: 0 }}
						prefetch="intent"
					>
						<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
							<path
								d="M4 4l10 10M14 4L4 14"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							/>
						</svg>
					</Link>
				</header>
				{children}
			</section>
		</div>
	)
}

export function ErrorLine({ message }: { message: string | null | undefined }) {
	if (!message) return null
	return (
		<p className="sti-err" role="alert" style={{ marginTop: 8 }}>
			{message}
		</p>
	)
}

export function Spinner() {
	return <span className="sti-spin" aria-hidden />
}

/** The short dashed line that fades into fog: Sti before there is a path. */
export function EmptyTrail({ height = 220 }: { height?: number }) {
	return (
		<svg
			width="120"
			height={height}
			viewBox={`0 0 120 ${height}`}
			aria-hidden
			style={{ display: 'block', margin: '0 auto' }}
		>
			<defs>
				<linearGradient id="sti-fog-up" x1="0" y1="1" x2="0" y2="0">
					<stop offset="0" stopColor="var(--ink)" stopOpacity="1" />
					<stop offset=".75" stopColor="var(--ink)" stopOpacity="0" />
				</linearGradient>
			</defs>
			<path
				d={`M60 ${height - 10} C 40 ${height * 0.7}, 84 ${height * 0.45}, 58 ${height * 0.1}`}
				fill="none"
				stroke="url(#sti-fog-up)"
				strokeWidth="3"
				strokeDasharray="2 9"
				strokeLinecap="round"
			/>
			<circle cx="60" cy={height - 10} r="7" fill="var(--dot)" />
			<circle
				cx="60"
				cy={height - 10}
				r="12"
				fill="none"
				stroke="var(--dot)"
				strokeOpacity=".35"
				strokeWidth="2"
			/>
		</svg>
	)
}

// ── Merke: every change leaves a small mark with «Angre» ─────────────────────

export type MerkeState = {
	id: number
	text: string
	token: string | null
	kind: 'session' | 'goal'
	noUndo: string | null
	sessionIds: string[]
	at: number
}

let merke: MerkeState | null = null
const listeners = new Set<() => void>()
function emit() {
	for (const l of listeners) l()
}
function readStored() {
	try {
		const raw = sessionStorage.getItem('sti-merke')
		if (!raw) return null
		const m = JSON.parse(raw) as MerkeState
		return Date.now() - m.at < 1000 * 60 * 30 ? m : null
	} catch {
		return null
	}
}
let hydrated = false
function getMerke() {
	if (!hydrated && typeof window !== 'undefined') {
		hydrated = true
		merke = readStored()
	}
	return merke
}

export function setMerke(m: Omit<MerkeState, 'id' | 'at'> | null) {
	merke = m ? { ...m, id: Date.now(), at: Date.now() } : null
	try {
		if (merke) sessionStorage.setItem('sti-merke', JSON.stringify(merke))
		else sessionStorage.removeItem('sti-merke')
	} catch {
		// storage blocked: the mark lives only in memory
	}
	emit()
}

/** Leave a mark after a write: its undo token, or why there is none. */
export function markChange(
	text: string,
	result: { undo: string | null; noUndoBecause?: string | null },
	sessionIds: string[] = [],
	kind: 'session' | 'goal' = 'session',
) {
	setMerke({
		text,
		token: result.undo,
		noUndo: result.undo ? null : (result.noUndoBecause ?? null),
		kind,
		sessionIds,
	})
}

export function useMerke() {
	return useSyncExternalStore(
		(l) => {
			listeners.add(l)
			return () => listeners.delete(l)
		},
		getMerke,
		() => null,
	)
}

export function useUndoMerke() {
	const undo = useCapability<UndoInput, UndoOutput>('undo')
	const undoGoal = useCapability<UndoGoalChangeInput, GoalWriteOutput>(
		'undo_goal_change',
	)
	const [error, setError] = useState<string | null>(null)
	async function run(m: MerkeState) {
		if (!m.token) return
		setError(null)
		const res =
			m.kind === 'goal'
				? await undoGoal.call({ undo: m.token })
				: await undo.call({ token: m.token })
		if (res.ok) {
			setMerke({
				text: 'Angret. Stien er som før.',
				token: null,
				noUndo: null,
				kind: 'session',
				sessionIds: [],
			})
		} else setError(res.message)
	}
	return { run, error, pending: undo.pending || undoGoal.pending }
}

function MerkeBar() {
	const m = useMerke()
	const { run, error, pending } = useUndoMerke()
	const [visibleId, setVisibleId] = useState<number | null>(null)
	useEffect(() => {
		if (!m) return
		// Only fresh marks float up; an old one stays on the path beside the stone.
		if (Date.now() - m.at > 8000) return
		setVisibleId(m.id)
		const t = window.setTimeout(
			() => setVisibleId((v) => (v === m.id ? null : v)),
			m.token ? 9000 : 4500,
		)
		return () => window.clearTimeout(t)
	}, [m])
	if (!m || visibleId !== m.id) return null
	return (
		<div className="sti-merke" role="status" aria-live="polite">
			<span
				style={{
					flex: 1,
					minWidth: 0,
					padding: '8px 0',
					overflowWrap: 'anywhere',
				}}
			>
				{error ?? m.text}
				{!m.token && m.noUndo ? (
					<span style={{ opacity: 0.7 }}> {m.noUndo}</span>
				) : null}
			</span>
			{m.token ? (
				<button type="button" onClick={() => run(m)} disabled={pending}>
					{pending ? <Spinner /> : 'Angre'}
				</button>
			) : null}
			<button
				type="button"
				aria-label="Lukk"
				onClick={() => setVisibleId(null)}
				style={{ padding: '0 12px', opacity: 0.7 }}
			>
				×
			</button>
		</div>
	)
}

export function useReducedMotion() {
	const [reduce, setReduce] = useState(false)
	useEffect(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
		setReduce(mq.matches)
		const on = () => setReduce(mq.matches)
		mq.addEventListener('change', on)
		return () => mq.removeEventListener('change', on)
	}, [])
	return reduce
}

export function plural(n: number, one: string, many: string) {
	return `${fmtNumber(n)} ${n === 1 ? one : many}`
}

// ── Stones: the slab's shape is the icon ─────────────────────────────────────

export type StoneFill = 'empty' | 'full' | 'half' | 'struck' | 'fog'

/** Endurance is a cut pebble, strength a square, anything else a round stone. */
export function stonePath(
	sport: string | null | undefined,
	w: number,
	h: number,
) {
	if (sport === 'strength') return `M2 2 H${w - 2} V${h - 2} H2 Z`
	if (sport === 'run' || sport === 'bike' || sport === 'swim')
		return `M${w * 0.16} 1.5 H${w * 0.84} L${w - 1.5} ${h * 0.42} L${w * 0.88} ${h - 1.5} H${w * 0.12} L1.5 ${h * 0.46} Z`
	const rx = w / 2 - 1.5
	const ry = h / 2 - 1.5
	return `M${w / 2 - rx} ${h / 2} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0`
}

export function Stone({
	sport,
	size = 44,
	fill = 'empty',
	border,
	label,
	lifted,
	question,
}: {
	sport: string | null | undefined
	size?: number
	fill?: StoneFill
	border?: string
	label?: string
	lifted?: boolean
	question?: boolean
}) {
	const w = size
	const h = sport === 'strength' ? size * 0.86 : size * 0.78
	const d = stonePath(sport, w, h)
	const clipId = `sti-c-${sport ?? 'o'}-${Math.round(size)}`
	const ink = fill === 'full' ? 'var(--sky)' : 'var(--ink)'
	return (
		<svg
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			aria-hidden
			style={{
				display: 'block',
				overflow: 'visible',
				filter: lifted ? 'drop-shadow(0 10px 14px rgba(0,0,0,.22))' : undefined,
			}}
		>
			<defs>
				<clipPath id={clipId}>
					<path d={d} />
				</clipPath>
			</defs>
			<path d={d} fill={fill === 'fog' ? 'var(--fog)' : 'var(--slab)'} />
			{fill === 'full' ? <path d={d} fill="var(--ink)" /> : null}
			{fill === 'half' ? (
				<rect
					x="0"
					y={h / 2}
					width={w}
					height={h / 2}
					fill="var(--ink)"
					clipPath={`url(#${clipId})`}
				/>
			) : null}
			{fill === 'struck' ? (
				<path
					d={`M${w * 0.2} ${h * 0.82} L${w * 0.8} ${h * 0.18}`}
					stroke="var(--ink-soft)"
					strokeWidth="1.6"
				/>
			) : null}
			<path
				d={d}
				fill="none"
				stroke={
					border ??
					(fill === 'struck' || fill === 'fog'
						? 'var(--ink-soft)'
						: 'var(--ink)')
				}
				strokeWidth={border ? 2.6 : 1.6}
				strokeDasharray={fill === 'struck' ? '3 3' : undefined}
			/>
			{label && fill !== 'struck' ? (
				<text
					x={w / 2}
					y={h / 2 + Math.max(4, size * 0.11)}
					textAnchor="middle"
					fontSize={Math.max(10, size * 0.3)}
					fontWeight="700"
					fill={fill === 'half' ? 'var(--ink)' : ink}
					style={{
						fontFamily: 'inherit',
						paintOrder: 'stroke',
						stroke: fill === 'half' ? 'var(--slab)' : 'none',
						strokeWidth: 3,
					}}
				>
					{label}
				</text>
			) : null}
			{question ? (
				<g transform={`translate(${w - 4} 2)`}>
					<circle r="8" fill="var(--alt)" />
					<text
						y="4"
						textAnchor="middle"
						fontSize="11"
						fontWeight="800"
						fill="#fff"
					>
						?
					</text>
				</g>
			) : null}
		</svg>
	)
}
