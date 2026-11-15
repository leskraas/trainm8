import { useEffect, useRef, useState } from 'react'
import {
	type ImportStatusOutput,
	type UploadOutput,
} from '#app/lab/engine/setup.types.ts'
import { cap, upload } from './__api.ts'
import { type CardCtx, type Handler } from './__deck.tsx'
import { MONTHS, clock, parseDay, plural } from './__format.ts'
import { range, Wheel, type WheelItem } from './__ui.tsx'

/**
 * The few cards that are not yes or no. Each one is an exception the concept
 * allows: the race card, the number card (wheels), the scale card, the note,
 * the zone card, plus the two the contract forces (an API key, a file).
 */

// ── number card: one or more wheels, one «Ferdig» ─────────────────────

export function NumberForm({
	c,
	columns,
	initial,
	label = 'Ferdig',
	onDone,
	note,
}: {
	c: CardCtx
	columns: Array<{
		items: WheelItem[]
		label: string
		sep?: string
		unit?: string
		minWidth?: number
	}>
	initial: number[]
	label?: string
	onDone: (values: number[]) => Handler
	note?: string
}) {
	const [vals, setVals] = useState(initial)
	return (
		<div>
			<div className="tm-wheels">
				{columns.map((col, i) => (
					<div key={i} style={{ display: 'flex', gap: 6 }}>
						{col.sep ? <span className="tm-wheel-sep">{col.sep}</span> : null}
						<Wheel
							items={col.items}
							value={vals[i]!}
							label={col.label}
							minWidth={col.minWidth}
							onChange={(v) =>
								setVals((p) => p.map((x, j) => (j === i ? v : x)))
							}
						/>
						{col.unit ? (
							<span className="tm-wheel-unit">{col.unit}</span>
						) : null}
					</div>
				))}
			</div>
			{note ? <p className="tm-note">{note}</p> : null}
			<button
				type="button"
				className="tm-wide yes"
				style={{ marginTop: 16 }}
				disabled={c.busy}
				onClick={() => c.submit(onDone(vals))}
			>
				{label}
			</button>
		</div>
	)
}

export const timeColumns = (maxH = 12) => [
	{ items: range(0, maxH, 1), label: 'Timer' },
	{
		items: range(0, 59, 1, (n) => String(n).padStart(2, '0')),
		label: 'Minutter',
		sep: ':',
	},
	{
		items: range(0, 59, 1, (n) => String(n).padStart(2, '0')),
		label: 'Sekunder',
		sep: ':',
	},
]

export function splitTime(sec: number) {
	return [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60]
}

// ── the race card: the one card with fields ───────────────────────────

export type Race = {
	name: string
	date: string
	distanceKm: number | null
	sport: 'run' | 'bike' | 'swim'
}

const DISTANCES: Array<{ km: number; l: string }> = [
	{ km: 5, l: '5 km' },
	{ km: 10, l: '10 km' },
	{ km: 21.0975, l: 'Halv' },
	{ km: 42.195, l: 'Hel' },
]
const SPORT_WORD = { run: 'Løp', bike: 'Ritt', swim: 'Svøm' } as const

function pad(n: number) {
	return String(n).padStart(2, '0')
}

export function RaceForm({
	c,
	today,
	sports,
	initial,
	onDone,
}: {
	c: CardCtx
	today: string
	sports: Array<'run' | 'bike' | 'swim'>
	initial?: Partial<Race>
	onDone: (r: Race) => Handler
}) {
	const t = parseDay(today)
	const start = initial?.date
		? parseDay(initial.date)
		: new Date(t.getTime() + 84 * 864e5)
	const [name, setName] = useState(initial?.name ?? '')
	const [day, setDay] = useState(start.getUTCDate())
	const [month, setMonth] = useState(start.getUTCMonth())
	const [year, setYear] = useState(start.getUTCFullYear())
	const [sport, setSport] = useState<Race['sport']>(
		initial?.sport ?? sports[0] ?? 'run',
	)
	const known = DISTANCES.find((d) => d.km === initial?.distanceKm)
	const [dist, setDist] = useState<number | 'other' | null>(
		initial?.distanceKm ? (known ? known.km : 'other') : null,
	)
	const [otherKm, setOtherKm] = useState(
		initial?.distanceKm && !known ? Math.round(initial.distanceKm) : 15,
	)
	const [err, setErr] = useState<string | null>(null)
	const y0 = t.getUTCFullYear()

	function submit() {
		const n = name.trim()
		if (!n) return setErr('Gi løpet et navn.')
		const d = new Date(Date.UTC(year, month, day))
		if (d.getUTCMonth() !== month)
			return setErr(`${MONTHS[month]} har ikke ${day} dager.`)
		const date = `${year}-${pad(month + 1)}-${pad(day)}`
		if (date <= today) return setErr('Datoen må være etter i dag.')
		setErr(null)
		c.submit(
			onDone({
				name: n.slice(0, 80),
				date,
				sport,
				distanceKm: dist === 'other' ? otherKm : dist,
			}),
		)
	}

	return (
		<div data-nodrag>
			<label className="tm-field">
				<span>Navn</span>
				<input
					className="tm-input"
					value={name}
					maxLength={80}
					autoComplete="off"
					enterKeyHint="done"
					placeholder="Bergen halvmaraton"
					onChange={(e) => setName(e.target.value)}
				/>
			</label>
			<div className="tm-field">
				<span>Dato</span>
				<div className="tm-wheels">
					<Wheel
						items={range(1, 31)}
						value={day}
						onChange={setDay}
						label="Dag"
						minWidth={56}
					/>
					<Wheel
						items={MONTHS.map((m, i) => ({ v: i, l: m.slice(0, 3) }))}
						value={month}
						onChange={setMonth}
						label="Måned"
						minWidth={76}
					/>
					<Wheel
						items={range(y0, y0 + 3)}
						value={year}
						onChange={setYear}
						label="År"
						minWidth={80}
					/>
				</div>
			</div>
			{sports.length > 1 ? (
				<div className="tm-field">
					<span>Hva slags</span>
					<div className="tm-chips">
						{sports.map((s) => (
							<button
								key={s}
								type="button"
								className="tm-chip"
								aria-pressed={sport === s}
								onClick={() => setSport(s)}
							>
								{SPORT_WORD[s]}
							</button>
						))}
					</div>
				</div>
			) : null}
			<div className="tm-field">
				<span>Distanse</span>
				<div className="tm-chips">
					{DISTANCES.map((d) => (
						<button
							key={d.l}
							type="button"
							className="tm-chip"
							aria-pressed={dist === d.km}
							onClick={() => setDist(d.km)}
						>
							{d.l}
						</button>
					))}
					<button
						type="button"
						className="tm-chip"
						aria-pressed={dist === 'other'}
						onClick={() => setDist('other')}
					>
						Annen
					</button>
				</div>
				{dist === 'other' ? (
					<div className="tm-wheels" style={{ marginTop: 8 }}>
						<Wheel
							items={range(1, 300)}
							value={otherKm}
							onChange={setOtherKm}
							label="Kilometer"
							minWidth={90}
						/>
						<span className="tm-wheel-unit">km</span>
					</div>
				) : null}
			</div>
			{err ? (
				<p className="tm-err" role="alert">
					{err}
				</p>
			) : null}
			<button
				type="button"
				className="tm-wide yes"
				style={{ marginTop: 18 }}
				disabled={c.busy}
				onClick={submit}
			>
				Lagre løpet
			</button>
		</div>
	)
}

// ── a short text: the note, the API key, the name ─────────────────────

export function TextForm({
	c,
	label,
	initial = '',
	multiline,
	placeholder,
	maxLength,
	button,
	secret,
	help,
	run,
}: {
	c: CardCtx
	label: string
	initial?: string
	multiline?: boolean
	placeholder?: string
	maxLength?: number
	button: string
	secret?: boolean
	help?: string
	/** Return an error message to show by the field, or a handler to go on. */
	run: (value: string) => Promise<string | Handler>
}) {
	const [v, setV] = useState(initial)
	const [err, setErr] = useState<string | null>(null)
	const [pending, setPending] = useState(false)
	async function go() {
		setPending(true)
		const r = await run(v)
		setPending(false)
		if (typeof r === 'string') setErr(r)
		else c.submit(r)
	}
	return (
		<div data-nodrag>
			<label className="tm-field">
				<span>{label}</span>
				{multiline ? (
					<textarea
						className="tm-input"
						value={v}
						maxLength={maxLength}
						placeholder={placeholder}
						onChange={(e) => setV(e.target.value)}
					/>
				) : (
					<input
						className="tm-input"
						value={v}
						maxLength={maxLength}
						placeholder={placeholder}
						autoComplete="off"
						autoCapitalize={secret ? 'none' : 'sentences'}
						autoCorrect="off"
						spellCheck={false}
						enterKeyHint="done"
						onChange={(e) => setV(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') void go()
						}}
					/>
				)}
			</label>
			{help ? <p className="tm-note">{help}</p> : null}
			{err ? (
				<p className="tm-err" role="alert">
					{err}
				</p>
			) : null}
			<button
				type="button"
				className="tm-wide yes"
				style={{ marginTop: 16 }}
				disabled={c.busy || pending}
				onClick={() => void go()}
			>
				{pending ? 'Et øyeblikk …' : button}
			</button>
		</div>
	)
}

// ── a file from the watch ─────────────────────────────────────────────

export function FileForm({
	c,
	then,
}: {
	c: CardCtx
	then: (r: UploadOutput) => Handler
}) {
	const input = useRef<HTMLInputElement>(null)
	const [state, setState] = useState<'idle' | 'sending' | 'error'>('idle')
	const [err, setErr] = useState<string | null>(null)
	async function send(files: FileList | null) {
		if (!files || files.length === 0) return
		setState('sending')
		const form = new FormData()
		for (const f of Array.from(files)) form.append('file', f)
		const r = await upload<UploadOutput>('upload_activity_files', form)
		if (!r.ok) {
			setState('error')
			setErr(r.message)
			return
		}
		c.submit(then(r.value))
	}
	return (
		<div data-nodrag>
			<input
				ref={input}
				type="file"
				multiple
				accept=".fit,.gz,.tcx,.gpx,.zip"
				style={{ display: 'none' }}
				onChange={(e) => void send(e.target.files)}
			/>
			<p className="tm-note">
				.fit, .tcx, .gpx eller en .zip (for eksempel en Strava-eksport). Opptil
				20 filer.
			</p>
			{err ? (
				<p className="tm-err" role="alert">
					{err}
				</p>
			) : null}
			<button
				type="button"
				className="tm-wide yes"
				style={{ marginTop: 16 }}
				disabled={c.busy || state === 'sending'}
				onClick={() => input.current?.click()}
			>
				{state === 'sending' ? 'Laster opp …' : 'Velg filer'}
			</button>
		</div>
	)
}

export function uploadSummary(r: UploadOutput): string {
	const parts = [`${plural(r.imported, 'ny økt', 'nye økter')} kom inn.`]
	if (r.duplicates)
		parts.push(`${plural(r.duplicates, 'fantes', 'fantes')} fra før.`)
	if (r.failed.length)
		parts.push(
			`${plural(r.failed.length, 'fil', 'filer')} gikk ikke: ${r.failed
				.slice(0, 3)
				.map((f) => `${f.file} (${f.reason})`)
				.join(', ')}${r.failed.length > 3 ? ' …' : ''}`,
		)
	return parts.join(' ')
}

// ── the counter: «Henter … 128 økter» ─────────────────────────────────

export function ImportCounter({
	c,
	then,
	skip,
}: {
	c: CardCtx
	then: (s: ImportStatusOutput) => Handler
	skip: Handler
}) {
	const [s, setS] = useState<ImportStatusOutput | null>(null)
	const [err, setErr] = useState<string | null>(null)
	const done = useRef(false)
	useEffect(() => {
		let alive = true
		let timer: number | undefined
		async function poll() {
			const r = await cap<ImportStatusOutput>('import_status', {})
			if (!alive) return
			if (!r.ok) setErr(r.message)
			else {
				setErr(null)
				setS(r.value)
				if (!r.value.importing && !done.current) {
					done.current = true
					c.submit(then(r.value))
					return
				}
			}
			timer = window.setTimeout(poll, 2500)
		}
		void poll()
		return () => {
			alive = false
			window.clearTimeout(timer)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	return (
		<div data-nodrag>
			<div
				className="tm-big num"
				style={{ color: 'var(--ink)' }}
				aria-live="polite"
			>
				{s ? s.recordings.total : <span className="tm-dots" />}
			</div>
			<p className="tm-note">
				{s
					? s.recordings.total === 1
						? 'økt så langt'
						: 'økter så langt'
					: 'Spør klokka'}
			</p>
			{err ? <p className="tm-err">{err}</p> : null}
			<button
				type="button"
				className="tm-wide ghost"
				style={{ marginTop: 12 }}
				disabled={c.busy}
				onClick={() => c.submit(skip)}
			>
				Fortsett mens jeg henter
			</button>
		</div>
	)
}

export function targetTimeText(sec: number) {
	return clock(sec)
}
