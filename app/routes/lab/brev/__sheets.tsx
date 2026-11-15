/**
 * The little sheets behind the holes in the introduction letter, shared by
 * the first open and by «Om meg» in the archive.
 */
import { useEffect, useState, type ReactNode } from 'react'
import {
	type GoalOutput,
	type OtherActivity,
	type SessionPreference,
	type SetupState,
	type Sport,
	type Weekday,
} from '#app/lab/engine/setup.types.ts'
import { DAY_NAME, WEEKDAY_ORDER, addDays, cap, n1 } from './__lib.ts'
import { ErrorLine, Sheet, useWrite } from './__ui.tsx'

export function HoleBtn({
	children,
	onClick,
	empty,
	suggest,
	label,
}: {
	children: ReactNode
	onClick: () => void
	empty?: boolean
	suggest?: boolean
	label: string
}) {
	return (
		<button
			type="button"
			className="b-hole"
			data-empty={empty ? 'true' : 'false'}
			data-suggest={suggest ? 'true' : 'false'}
			onClick={onClick}
			aria-label={`${label}: ${typeof children === 'string' ? children : ''}${suggest ? ' (forslag)' : ''}`}
		>
			{children}
		</button>
	)
}

export type W = ReturnType<typeof useWrite>

export function SportsSheet({
	open,
	onClose,
	setup,
	write,
}: {
	open: boolean
	onClose: () => void
	setup: SetupState
	write: W
}) {
	const [sports, setSports] = useState<Sport[]>(setup.answers.sports ?? [])
	const [other, setOther] = useState<OtherActivity[]>(
		setup.answers.otherActivities ?? [],
	)
	useEffect(() => {
		if (open) {
			setSports(setup.answers.sports ?? [])
			setOther(setup.answers.otherActivities ?? [])
		}
	}, [open, setup.answers.sports, setup.answers.otherActivities])
	const toggle = <T,>(list: T[], v: T) =>
		list.includes(v) ? list.filter((x) => x !== v) : [...list, v]
	return (
		<Sheet open={open} onClose={onClose} title="Hva driver du med?">
			<p className="b-small" style={{ margin: '0 0 6px' }}>
				Den første du velger, bygger jeg planen rundt.
			</p>
			<ul className="b-menu">
				{setup.choices.sports.map((s) => (
					<li key={s.id}>
						<button
							type="button"
							className="b-choice"
							aria-pressed={sports.includes(s.id)}
							onClick={() => setSports((l) => toggle(l, s.id))}
						>
							<span>
								{s.label}
								{sports[0] === s.id ? (
									<span className="b-small"> · hovedidrett</span>
								) : null}
							</span>
							<span className="b-check">✓</span>
						</button>
					</li>
				))}
			</ul>
			<p className="b-h2" style={{ marginTop: 18 }}>
				Og ellers
			</p>
			<ul className="b-menu">
				{setup.choices.otherActivities.map((s) => (
					<li key={s.id}>
						<button
							type="button"
							className="b-choice"
							aria-pressed={other.includes(s.id)}
							onClick={() => setOther((l) => toggle(l, s.id))}
						>
							<span>{s.label}</span>
							<span className="b-check">✓</span>
						</button>
					</li>
				))}
			</ul>
			<div style={{ marginTop: 16 }}>
				<button
					type="button"
					className="b-btn"
					disabled={
						write.pending || (sports.length === 0 && other.length === 0)
					}
					onClick={async () => {
						const r = await write.call({ sports, otherActivities: other })
						if (r.ok) onClose()
					}}
				>
					{write.pending ? 'Skriver …' : 'Skriv det inn'}
				</button>
			</div>
			<ErrorLine message={write.error} />
		</Sheet>
	)
}

export function HoursSheet({
	open,
	onClose,
	initial,
	range,
	write,
	historyNote,
}: {
	open: boolean
	onClose: () => void
	initial: number
	range: { min: number; max: number; step: number }
	write: W
	historyNote: string | null
}) {
	const [v, setV] = useState(initial)
	useEffect(() => {
		if (open) setV(initial)
	}, [open, initial])
	const step = (d: number) =>
		setV((x) => Math.min(range.max, Math.max(range.min, x + d * range.step)))
	return (
		<Sheet open={open} onClose={onClose} title="Hvor mye trener du nå?">
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 18,
					margin: '12px 0',
				}}
			>
				<button
					type="button"
					className="b-btn b-btn-ghost"
					aria-label="Mindre"
					onClick={() => step(-1)}
					style={{ width: 56, padding: 0, fontSize: 24 }}
				>
					−
				</button>
				<output
					aria-live="polite"
					className="b-num"
					style={{
						fontSize: 40,
						lineHeight: '48px',
						minWidth: '4ch',
						textAlign: 'center',
					}}
				>
					{n1(v)}
				</output>
				<button
					type="button"
					className="b-btn b-btn-ghost"
					aria-label="Mer"
					onClick={() => step(1)}
					style={{ width: 56, padding: 0, fontSize: 24 }}
				>
					+
				</button>
			</div>
			<p className="b-small" style={{ textAlign: 'center' }}>
				timer i uka, i snitt
			</p>
			{historyNote ? (
				<p className="b-margin" style={{ fontSize: 16 }}>
					Klokka di sier: {historyNote}.
				</p>
			) : null}
			<button
				type="button"
				className="b-btn"
				style={{ width: '100%', marginTop: 12 }}
				disabled={write.pending}
				onClick={async () => {
					const r = await write.call({ hoursPerWeek: v })
					if (r.ok) onClose()
				}}
			>
				{write.pending ? 'Skriver …' : 'Skriv det inn'}
			</button>
			<ErrorLine message={write.error} />
		</Sheet>
	)
}

export function DaysSheet({
	open,
	onClose,
	initial,
	write,
}: {
	open: boolean
	onClose: () => void
	initial: Weekday[]
	write: W
}) {
	const [ok, setOk] = useState<Weekday[]>(initial)
	useEffect(() => {
		if (open) setOk(initial)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open])
	return (
		<Sheet open={open} onClose={onClose} title="Hvilke dager går ikke?">
			<p className="b-small" style={{ margin: '0 0 6px' }}>
				Kryss av dagene du ikke kan trene.
			</p>
			<ul className="b-menu">
				{WEEKDAY_ORDER.map((d) => {
					const isBlocked = !ok.includes(d)
					return (
						<li key={d}>
							<button
								type="button"
								className="b-choice"
								aria-pressed={isBlocked}
								onClick={() =>
									setOk((l) =>
										l.includes(d)
											? l.filter((x) => x !== d)
											: WEEKDAY_ORDER.filter((x) => x === d || l.includes(x)),
									)
								}
							>
								<span
									style={
										isBlocked
											? {
													textDecoration: 'line-through',
													color: 'var(--ink-2)',
												}
											: undefined
									}
								>
									{cap(DAY_NAME[d])}
								</span>
								<span className="b-check" style={{ color: 'var(--red)' }}>
									går ikke
								</span>
							</button>
						</li>
					)
				})}
			</ul>
			<button
				type="button"
				className="b-btn"
				style={{ width: '100%', marginTop: 12 }}
				disabled={write.pending || ok.length === 0}
				onClick={async () => {
					const r = await write.call({ days: ok })
					if (r.ok) onClose()
				}}
			>
				{ok.length === 0
					? 'Minst én dag må gå'
					: write.pending
						? 'Skriver …'
						: 'Skriv det inn'}
			</button>
			<ErrorLine message={write.error} />
		</Sheet>
	)
}

export function PrefsSheet({
	open,
	onClose,
	setup,
	write,
}: {
	open: boolean
	onClose: () => void
	setup: SetupState
	write: W
}) {
	const [p, setP] = useState<SessionPreference[]>(
		setup.answers.sessionPreferences ?? [],
	)
	useEffect(() => {
		if (open) setP(setup.answers.sessionPreferences ?? [])
	}, [open, setup.answers.sessionPreferences])
	return (
		<Sheet open={open} onClose={onClose} title="Hva liker du?">
			<p className="b-small" style={{ margin: '0 0 6px' }}>
				Velg så mange du vil, eller ingen.
			</p>
			<ul className="b-menu">
				{setup.choices.sessionPreferences.map((c) => (
					<li key={c.id}>
						<button
							type="button"
							className="b-choice"
							aria-pressed={p.includes(c.id)}
							onClick={() =>
								setP((l) =>
									l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id],
								)
							}
						>
							<span>{c.label}</span>
							<span className="b-check">✓</span>
						</button>
					</li>
				))}
			</ul>
			<button
				type="button"
				className="b-btn"
				style={{ width: '100%', marginTop: 12 }}
				disabled={write.pending}
				onClick={async () => {
					const r = await write.call({ preferences: p })
					if (r.ok) onClose()
				}}
			>
				{write.pending ? 'Skriver …' : 'Skriv det inn'}
			</button>
			<ErrorLine message={write.error} />
		</Sheet>
	)
}

export function NameSheet({
	open,
	onClose,
	initial,
	write,
}: {
	open: boolean
	onClose: () => void
	initial: string
	write: W
}) {
	const [v, setV] = useState(initial)
	useEffect(() => {
		if (open) setV(initial)
	}, [open, initial])
	return (
		<Sheet open={open} onClose={onClose} title="Hva heter du?">
			<form
				onSubmit={async (e) => {
					e.preventDefault()
					const r = await write.call({
						name: v.trim() ? v.trim().slice(0, 40) : null,
					})
					if (r.ok) onClose()
				}}
			>
				<label className="b-label" htmlFor="b-name">
					Navnet blir underskriften din, og det jeg kaller deg i brevene.
				</label>
				<input
					id="b-name"
					className="b-input"
					value={v}
					maxLength={40}
					autoComplete="given-name"
					enterKeyHint="done"
					onChange={(e) => setV(e.target.value)}
				/>
				<button
					type="submit"
					className="b-btn"
					style={{ width: '100%', marginTop: 12 }}
					disabled={write.pending}
				>
					{write.pending ? 'Skriver …' : 'Skriv det inn'}
				</button>
				<ErrorLine message={write.error} />
			</form>
		</Sheet>
	)
}

export function IcuSheet({
	open,
	onClose,
	description,
	onConnected,
}: {
	open: boolean
	onClose: () => void
	description: string | null
	onConnected: () => void
}) {
	const [key, setKey] = useState('')
	const connect = useWrite<{ apiKey: string }, unknown>('connect_intervals_icu')
	return (
		<Sheet open={open} onClose={onClose} title="Intervals.icu">
			<form
				onSubmit={async (e) => {
					e.preventDefault()
					const r = await connect.call({ apiKey: key.trim() })
					if (r.ok) {
						setKey('')
						onConnected()
					}
				}}
			>
				{description ? <p className="b-p">{description}</p> : null}
				<label className="b-label" htmlFor="icu-key">
					API-nøkkel
				</label>
				<input
					id="icu-key"
					className="b-input"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					autoComplete="off"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					enterKeyHint="go"
					placeholder="lim inn nøkkelen"
				/>
				<ErrorLine message={connect.error} />
				<button
					type="submit"
					className="b-btn"
					style={{ width: '100%', marginTop: 12 }}
					disabled={connect.pending || !key.trim()}
				>
					{connect.pending ? 'Sjekker nøkkelen …' : 'Koble til'}
				</button>
			</form>
		</Sheet>
	)
}

export function GoalSheet({
	open,
	onClose,
	goal,
	today,
	onSaved,
}: {
	open: boolean
	onClose: () => void
	goal: GoalOutput | null
	today: string
	onSaved: (undo: string | null) => void
}) {
	const g = goal?.goal
	const [name, setName] = useState(g?.name ?? '')
	const [date, setDate] = useState(g?.date ?? '')
	const [sport, setSport] = useState<Sport>(
		(g?.sports.find((s) => s !== 'strength') as Sport | undefined) ?? 'run',
	)
	const [km, setKm] = useState(
		g?.distanceKm ? String(g.distanceKm).replace('.', ',') : '',
	)
	const [time, setTime] = useState(g?.targetTime?.text ?? '')
	useEffect(() => {
		if (!open) return
		setName(g?.name ?? '')
		setDate(g?.date ?? '')
		setKm(g?.distanceKm ? String(g.distanceKm).replace('.', ',') : '')
		setTime(g?.targetTime?.text ?? '')
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open])
	const set = useWrite('set_goal')
	const update = useWrite('update_goal')
	const w = g ? update : set
	const kmNum = km.trim() ? Number(km.replace(',', '.')) : undefined
	return (
		<Sheet open={open} onClose={onClose} title="Et løp">
			<form
				onSubmit={async (e) => {
					e.preventDefault()
					const base = {
						name: name.trim(),
						date,
						sport,
						...(kmNum && Number.isFinite(kmNum) ? { distanceKm: kmNum } : {}),
						...(time.trim() ? { targetTime: time.trim() } : {}),
					}
					const r = g
						? await update.call({
								...base,
								distanceKm: kmNum && Number.isFinite(kmNum) ? kmNum : null,
								targetTime: time.trim() || null,
							})
						: await set.call({ kind: 'event', ...base })
					if (r.ok) onSaved((r.value as { undo?: string | null }).undo ?? null)
				}}
			>
				<label className="b-label" htmlFor="g-name">
					Navn på løpet
				</label>
				<input
					id="g-name"
					className="b-input"
					value={name}
					required
					maxLength={80}
					onChange={(e) => setName(e.target.value)}
					placeholder="f.eks. Oslo halvmaraton"
					autoComplete="off"
				/>
				<label className="b-label" htmlFor="g-date">
					Dato
				</label>
				<input
					id="g-date"
					className="b-input"
					type="date"
					required
					min={addDays(today, 1)}
					value={date}
					onChange={(e) => setDate(e.target.value)}
				/>
				<fieldset style={{ border: 0, padding: 0, margin: '14px 0 0' }}>
					<legend className="b-label" style={{ margin: '0 0 4px' }}>
						Idrett
					</legend>
					<div className="b-row">
						{(['run', 'bike', 'swim'] as Sport[]).map((s) => (
							<button
								key={s}
								type="button"
								className={`b-btn${sport === s ? '' : 'b-btn-ghost'}`}
								aria-pressed={sport === s}
								onClick={() => setSport(s)}
							>
								{s === 'run' ? 'Løp' : s === 'bike' ? 'Sykkel' : 'Svøm'}
							</button>
						))}
					</div>
				</fieldset>
				<div
					style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
				>
					<div>
						<label className="b-label" htmlFor="g-km">
							Distanse, km
						</label>
						<input
							id="g-km"
							className="b-input"
							inputMode="decimal"
							value={km}
							onChange={(e) => setKm(e.target.value)}
							placeholder="21,1"
						/>
					</div>
					<div>
						<label className="b-label" htmlFor="g-time">
							Helst på (valgfritt)
						</label>
						<input
							id="g-time"
							className="b-input"
							inputMode="numeric"
							value={time}
							onChange={(e) => setTime(e.target.value)}
							placeholder="1:45:00"
						/>
					</div>
				</div>
				<ErrorLine message={w.error} />
				<button
					type="submit"
					className="b-btn"
					style={{ width: '100%', marginTop: 16 }}
					disabled={w.pending || !name.trim() || !date}
				>
					{w.pending ? 'Skriver …' : g ? 'Skriv om målet' : 'Sett målet'}
				</button>
			</form>
		</Sheet>
	)
}
