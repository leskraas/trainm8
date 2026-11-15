import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRevalidator } from 'react-router'
import { uploadToCapability } from '#app/lab/engine/client.ts'
import {
	type ConnectionsOutput,
	type ExperienceLevel,
	type GoalOutput,
	type ImportStatusOutput,
	type SetupState,
	type Sport,
	type SyncOutput,
	type UploadOutput,
	type Weekday,
} from '#app/lab/engine/setup.types.ts'
import { dateMedium, monthYear, n0, n1, WD, WEEKDAY_KEYS } from './__format.ts'
import { callCap, Confirm, Q, useFlash, useHb } from './__ui.tsx'

type Act = ReturnType<typeof useHb>['act']

/** A row of the sheet: question to the left, cell to the right. */
export function SRow({
	q,
	why,
	filled,
	children,
	id,
}: {
	q: ReactNode
	why?: ReactNode
	filled: boolean
	children: ReactNode
	id?: string
}) {
	const ref = useFlash<HTMLTableCellElement>(children ? String(filled) : '')
	return (
		<tr id={id}>
			<th scope="row">
				{q}
				{why ? <span className="why">{why}</span> : null}
			</th>
			<td ref={ref} className={filled ? 'filled' : 'unf'}>
				{children}
			</td>
		</tr>
	)
}

/** Writes a setup answer; quiet in getting started, logged in settings. */
function useSetupWrite(log: boolean) {
	const { act } = useHb()
	return (name: string, input: unknown, what: string) =>
		act<{ note?: string }>(name, input, (v) =>
			log ? { what: v.note ? `${what}. ${v.note}` : what } : null,
		)
}

export function SportsRow({ setup, log }: { setup: SetupState; log: boolean }) {
	const write = useSetupWrite(log)
	const a = setup.answers
	const sports = a.sports ?? []
	const others = a.otherActivities ?? []
	const toggle = (s: Sport) => {
		const next = sports.includes(s)
			? sports.filter((x) => x !== s)
			: [...sports, s]
		if (!next.length && !others.length) return
		void write(
			'set_sports',
			{
				sports: next,
				...(next.length
					? {
							mainSport: next.includes(a.mainSport as Sport)
								? a.mainSport
								: next[0],
						}
					: {}),
				otherActivities: others,
			},
			`Idretter: ${next.map((x) => setup.choices.sports.find((c) => c.id === x)?.label).join(', ') || 'ingen'}`,
		)
	}
	return (
		<>
			<SRow
				q="Idretter"
				why={
					sports.length > 1
						? `Hovedidrett: ${setup.choices.sports.find((c) => c.id === (a.mainSport ?? sports[0]))?.label}`
						: 'Den første er hovedidretten.'
				}
				filled={sports.length > 0}
			>
				<div className="seg" role="group" aria-label="Idretter">
					{setup.choices.sports.map((c) => (
						<button
							key={c.id}
							type="button"
							aria-pressed={sports.includes(c.id)}
							onClick={() => toggle(c.id)}
						>
							{c.label}
						</button>
					))}
				</div>
				{sports.length > 1 ? (
					<div className="seg" role="group" aria-label="Hovedidrett">
						<span className="why" style={{ alignSelf: 'center' }}>
							Hoved:
						</span>
						{sports.map((s) => (
							<button
								key={s}
								type="button"
								aria-pressed={(a.mainSport ?? sports[0]) === s}
								onClick={() =>
									void write(
										'set_sports',
										{ sports, mainSport: s, otherActivities: others },
										`Hovedidrett: ${s}`,
									)
								}
							>
								{setup.choices.sports.find((c) => c.id === s)?.label}
							</button>
						))}
					</div>
				) : null}
			</SRow>
			<SRow
				q="Annet"
				why="Får en fast dag, uten struktur."
				filled={a.otherActivities !== null}
			>
				<div className="seg" role="group" aria-label="Andre aktiviteter">
					{setup.choices.otherActivities.map((c) => (
						<button
							key={c.id}
							type="button"
							aria-pressed={others.includes(c.id)}
							onClick={() => {
								const next = others.includes(c.id)
									? others.filter((x) => x !== c.id)
									: [...others, c.id]
								if (!sports.length && !next.length) return
								void write(
									'set_sports',
									{
										sports,
										...(sports.length
											? { mainSport: a.mainSport ?? sports[0] }
											: {}),
										otherActivities: next,
									},
									`Annet: ${next.length}`,
								)
							}}
						>
							{c.label}
						</button>
					))}
				</div>
			</SRow>
		</>
	)
}

export function LevelRow({ setup, log }: { setup: SetupState; log: boolean }) {
	const write = useSetupWrite(log)
	const lv = setup.answers.level
	const cur = setup.choices.levels.find((l) => l.id === lv)
	return (
		<SRow
			q="Erfaring"
			why={cur?.label.split(':').slice(1).join(':').trim() || undefined}
			filled={!!lv}
		>
			<div className="seg" role="radiogroup" aria-label="Erfaring">
				{setup.choices.levels.map((l) => (
					<button
						key={l.id}
						type="button"
						role="radio"
						aria-checked={lv === l.id}
						aria-pressed={lv === l.id}
						onClick={() =>
							void write(
								'set_experience_level',
								{ level: l.id as ExperienceLevel },
								`Erfaring: ${l.label}`,
							)
						}
					>
						{l.label.split(':')[0]}
					</button>
				))}
			</div>
		</SRow>
	)
}

/** A number cell: «Neste» jumps to the next cell, like a spreadsheet. */
export function NumCell({
	value,
	placeholder,
	label,
	min,
	max,
	step,
	onSave,
	suffix,
}: {
	value: number | null
	placeholder?: string
	label: string
	min: number
	max: number
	step: number
	onSave: (v: number | null) => Promise<unknown>
	suffix?: string
}) {
	const [text, setText] = useState(value != null ? n1(value) : '')
	const [err, setErr] = useState<string | null>(null)
	const ref = useRef<HTMLInputElement>(null)
	useEffect(() => {
		if (document.activeElement !== ref.current)
			setText(value != null ? n1(value) : '')
	}, [value])
	const commit = () => {
		const raw = text.trim().replace(',', '.')
		if (raw === '') {
			if (value != null) void onSave(null)
			setErr(null)
			return
		}
		const v = Number(raw)
		if (!Number.isFinite(v) || v < min || v > max) {
			setErr(`${n1(min)}–${n1(max)}`)
			return
		}
		const snapped = Math.round(v / step) * step
		setErr(null)
		if (snapped !== value) void onSave(snapped)
	}
	return (
		<div style={{ display: 'flex', alignItems: 'center' }}>
			<input
				ref={ref}
				className="cell-in mono"
				inputMode="decimal"
				enterKeyHint="next"
				aria-label={label}
				aria-invalid={!!err}
				placeholder={placeholder}
				value={text}
				onChange={(e) => setText(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault()
						commit()
						const all = [
							...document.querySelectorAll<HTMLElement>(
								'.sheet-t input, .sheet-t select',
							),
						]
						all[all.indexOf(e.currentTarget) + 1]?.focus()
					}
				}}
			/>
			{suffix ? (
				<span className="mute" style={{ paddingRight: 8 }}>
					{suffix}
				</span>
			) : null}
			{err ? (
				<span
					role="alert"
					style={{
						color: 'var(--danger)',
						fontSize: 12,
						paddingRight: 8,
						whiteSpace: 'nowrap',
					}}
				>
					{err}
				</span>
			) : null}
		</div>
	)
}

export function VolumeRows({
	setup,
	log,
}: {
	setup: SetupState
	log: boolean
}) {
	const write = useSetupWrite(log)
	const a = setup.answers
	const h = setup.choices.hoursPerWeek
	const hist = setup.fromHistory
	const blocked =
		a.availability.blockedDays ??
		(a.availability.days
			? WEEKDAY_KEYS.filter((d) => !a.availability.days!.includes(d))
			: null)
	const days =
		a.availability.days ??
		(blocked ? WEEKDAY_KEYS.filter((d) => !blocked.includes(d)) : null)
	const toggleDay = (d: Weekday) => {
		const cur = blocked ?? []
		const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]
		if (next.length >= 7) return
		void write(
			'set_availability',
			{ blockedDays: next },
			`Dager som ikke går: ${next.map((x) => WD[WEEKDAY_KEYS.indexOf(x)]).join(' ') || 'ingen'}`,
		)
	}
	const sug = setup.suggested
	return (
		<>
			<SRow
				q="Timer/uke nå"
				why={
					hist.hoursPerWeek.value != null
						? `Klokka sier ${n1(hist.hoursPerWeek.value)} t`
						: (hist.hoursPerWeek.why ?? undefined)
				}
				filled={a.currentHoursPerWeek != null}
			>
				<NumCell
					label="Timer per uke nå"
					value={a.currentHoursPerWeek}
					placeholder={
						sug
							? `forslag ${n1(sug.currentHoursPerWeek)}`
							: hist.hoursPerWeek.value != null
								? n1(hist.hoursPerWeek.value)
								: `${h.min}–${h.max}`
					}
					min={h.min}
					max={h.max}
					step={h.step}
					suffix="t"
					onSave={(v) =>
						v == null
							? Promise.resolve()
							: write(
									'set_current_volume',
									{ hoursPerWeek: v },
									`Timer/uke nå: ${n1(v)}`,
								)
					}
				/>
			</SRow>
			<SRow
				q="Timer/uke maks"
				why="Det meste du har rom for."
				filled={a.availability.hoursPerWeek != null}
			>
				<NumCell
					label="Timer per uke maks"
					value={a.availability.hoursPerWeek}
					placeholder="tomt = ingen grense"
					min={h.min}
					max={h.max}
					step={h.step}
					suffix="t"
					onSave={(v) =>
						write(
							'set_availability',
							{ hoursPerWeek: v },
							`Timer/uke maks: ${v != null ? n1(v) : 'ingen'}`,
						)
					}
				/>
			</SRow>
			<SRow
				q="Dager som ikke går"
				why={
					blocked
						? undefined
						: sug
							? 'Ikke sagt. Planen bruker forslaget.'
							: 'Ikke sagt.'
				}
				filled={blocked != null}
			>
				<div className="seg" role="group" aria-label="Dager som ikke går">
					{WEEKDAY_KEYS.map((d, i) => (
						<button
							key={d}
							type="button"
							aria-pressed={!!blocked?.includes(d)}
							onClick={() => toggleDay(d)}
							style={{ minWidth: 36, padding: 0 }}
						>
							{WD[i]}
						</button>
					))}
				</div>
			</SRow>
			<SRow q="Dager/uke" why="Regnes av dagene over." filled={days != null}>
				<div
					className="mono"
					style={{
						padding: '0 8px',
						minHeight: 36,
						display: 'flex',
						alignItems: 'center',
					}}
				>
					{days != null ? (
						days.length
					) : sug ? (
						<span className="mute">forslag {sug.days.length}</span>
					) : (
						<Q why="Ikke sagt ennå. Velg dagene som ikke går, eller la stå tomt." />
					)}
				</div>
			</SRow>
			<SRow q="Styrke/uke" filled={a.strengthPerWeek != null || setup.hasPlan}>
				<div className="seg" role="group" aria-label="Styrkeøkter per uke">
					{[0, 1, 2, 3].map((n) => (
						<button
							key={n}
							type="button"
							aria-pressed={
								(a.strengthPerWeek ?? (setup.hasPlan || a.level ? 0 : -1)) === n
							}
							onClick={() =>
								void write('set_strength', { perWeek: n }, `Styrke/uke: ${n}`)
							}
						>
							{n}
						</button>
					))}
					{sug && a.strengthPerWeek == null ? (
						<span className="why" style={{ alignSelf: 'center' }}>
							forslag {sug.strengthPerWeek}
						</span>
					) : null}
				</div>
			</SRow>
		</>
	)
}

export function LikesRow({ setup, log }: { setup: SetupState; log: boolean }) {
	const write = useSetupWrite(log)
	const likes = setup.answers.sessionPreferences ?? []
	return (
		<SRow
			q="Liker"
			why="Rangerer planstilene. Valgfritt."
			filled={setup.answers.sessionPreferences !== null}
		>
			<div className="seg" role="group" aria-label="Økter du liker">
				{setup.choices.sessionPreferences.map((c) => (
					<button
						key={c.id}
						type="button"
						aria-pressed={likes.includes(c.id)}
						onClick={() => {
							const next = likes.includes(c.id)
								? likes.filter((x) => x !== c.id)
								: [...likes, c.id]
							void write(
								'set_session_preferences',
								{ preferences: next },
								`Liker: ${next.length}`,
							)
						}}
					>
						{c.label}
					</button>
				))}
			</div>
		</SRow>
	)
}

// ── sources ──────────────────────────────────────────────────────────────────

const STATE_WORD: Record<string, string> = {
	'not-connected': 'ikke koblet',
	connected: 'koblet',
	'importing-history': 'henter historikk',
	'needs-reconnect': 'må kobles på nytt',
}

export function SourceRows({
	conns,
	imp,
	log,
}: {
	conns: ConnectionsOutput
	imp: ImportStatusOutput
	log: boolean
}) {
	const { act, toast } = useHb()
	const revalidator = useRevalidator()
	const [open, setOpen] = useState<'intervalsicu' | 'polar' | 'file' | null>(
		null,
	)
	const [key, setKey] = useState('')
	const [keyErr, setKeyErr] = useState<string | null>(null)
	const [upload, setUpload] = useState<UploadOutput | { error: string } | null>(
		null,
	)
	const [uploading, setUploading] = useState(false)
	const [sure, setSure] = useState<string | null>(null)
	const icu = conns.sources.find((s) => s.id === 'intervalsicu')
	const polar = conns.sources.find((s) => s.id === 'polar')
	const connected = conns.sources.filter(
		(s) => s.state !== 'not-connected' && s.id !== 'file',
	)

	// While history arrives: ask again every few seconds.
	useEffect(() => {
		if (!imp.importing) return
		const t = setInterval(() => void revalidator.revalidate(), 4000)
		return () => clearInterval(t)
	}, [imp.importing, revalidator])

	const r = imp.recordings
	const day = (x: string | null) => (x ? x.slice(0, 10) : null)
	const first = day(r.earliest)
	const last = day(r.latest)
	const count = `${n0(r.total)} ${r.total === 1 ? 'økt' : 'økter'}`
	const status = imp.importing
		? `Henter … ${count}.`
		: r.total
			? `${count}, ${first ? monthYear(first) : '?'} – ${last ? dateMedium(last) : '?'}.`
			: 'Ingen økter ennå. Koble en kilde eller last opp en fil.'

	return (
		<>
			<SRow q="Kilde" filled={connected.length > 0 || r.total > 0}>
				<div className="seg" role="group" aria-label="Kilde">
					<button
						type="button"
						aria-pressed={open === 'intervalsicu'}
						onClick={() =>
							setOpen(open === 'intervalsicu' ? null : 'intervalsicu')
						}
					>
						Intervals.icu{icu && icu.state !== 'not-connected' ? ' ✓' : ''}
					</button>
					<button
						type="button"
						aria-pressed={open === 'polar'}
						onClick={() => setOpen(open === 'polar' ? null : 'polar')}
					>
						Polar
					</button>
					<button
						type="button"
						aria-pressed={open === 'file'}
						onClick={() => setOpen(open === 'file' ? null : 'file')}
					>
						Fil
					</button>
				</div>
			</SRow>
			{open === 'intervalsicu' && icu ? (
				<tr>
					<td colSpan={2} style={{ padding: '8px 0 12px' }}>
						<div className="hb-x" style={{ width: 'auto', padding: 0 }}>
							<div className="say">
								Intervals.icu: <b>{STATE_WORD[icu.state]}</b>
								{icu.lastCheckedAt ? (
									<span className="why">
										{' '}
										· sjekket{' '}
										{new Date(icu.lastCheckedAt).toLocaleString('nb-NO', {
											dateStyle: 'short',
											timeStyle: 'short',
										})}
									</span>
								) : null}
							</div>
							{icu.why ? <div className="why">{icu.why}</div> : null}
							{icu.state === 'not-connected' ||
							icu.state === 'needs-reconnect' ? (
								<form
									onSubmit={async (e) => {
										e.preventDefault()
										const res = await act(
											'connect_intervals_icu',
											{ apiKey: key.trim() },
											() => (log ? { what: 'Koblet Intervals.icu' } : null),
										)
										if (!res.ok) setKeyErr(res.message)
										else {
											setKeyErr(null)
											setKey('')
											toast('Koblet. Henter historikken …')
										}
									}}
								>
									<div className="why">
										Nøkkelen finner du i intervals.icu → Settings → Developer
										Settings.
									</div>
									<div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
										<input
											className="cell-in dash mono"
											style={{ height: 44, flex: 1 }}
											placeholder="API-nøkkel"
											autoCapitalize="none"
											autoCorrect="off"
											autoComplete="off"
											spellCheck={false}
											value={key}
											onChange={(e) => setKey(e.target.value)}
											aria-label="API-nøkkel for Intervals.icu"
											aria-invalid={!!keyErr}
										/>
										<button
											className="btn pri"
											type="submit"
											disabled={!key.trim()}
										>
											Koble
										</button>
									</div>
									{keyErr ? (
										<div
											role="alert"
											style={{
												color: 'var(--danger)',
												fontSize: 13,
												marginTop: 4,
											}}
										>
											{keyErr}
										</div>
									) : null}
								</form>
							) : (
								<div className="acts">
									{icu.canSync ? (
										<button
											type="button"
											className="btn sm"
											onClick={() =>
												void act<SyncOutput>(
													'sync_sources',
													{ source: 'intervalsicu' },
													(v) => ({
														what: `Hentet ${v.imported} nye økter${v.failed.length ? ` (${v.failed.map((f) => f.message).join('; ')})` : ''}`,
													}),
												)
											}
										>
											Hent nå
										</button>
									) : null}
									{icu.canDisconnect ? (
										<button
											type="button"
											className="btn sm dng"
											onClick={() => setSure('intervalsicu')}
										>
											Koble fra
										</button>
									) : null}
								</div>
							)}
						</div>
					</td>
				</tr>
			) : null}
			{open === 'polar' ? (
				<tr>
					<td colSpan={2} style={{ padding: '8px 0 12px' }}>
						<div className="why" style={{ fontSize: 14 }}>
							{polar?.why ?? 'Polar kan ikke kobles herfra.'}
						</div>
					</td>
				</tr>
			) : null}
			{open === 'file' ? (
				<tr>
					<td colSpan={2} style={{ padding: '8px 0 12px' }}>
						<label className="btn" style={{ cursor: 'pointer' }}>
							{uploading ? 'Laster opp …' : 'Velg filer (.fit .tcx .gpx .zip)'}
							<input
								type="file"
								multiple
								accept=".fit,.tcx,.gpx,.zip,.gz"
								className="sr"
								disabled={uploading}
								onChange={async (e) => {
									const files = [...(e.target.files ?? [])]
									if (!files.length) return
									setUploading(true)
									const form = new FormData()
									for (const f of files) form.append('file', f)
									let res
									try {
										res = await uploadToCapability<UploadOutput>(
											'upload_activity_files',
											form,
										)
									} catch {
										res = {
											ok: false as const,
											code: 'network',
											message: 'Fikk ikke kontakt. Prøv igjen.',
										}
									}
									setUploading(false)
									e.target.value = ''
									setUpload(res.ok ? res.value : { error: res.message })
									if (res.ok) void revalidator.revalidate()
								}}
							/>
						</label>
						<div className="why">
							Inntil 20 filer om gangen. En Strava-eksport (.zip) går fint.
						</div>
						{upload ? (
							'error' in upload ? (
								<div
									role="alert"
									style={{ color: 'var(--danger)', fontSize: 13 }}
								>
									{upload.error}
								</div>
							) : (
								<table className="sub">
									<tbody>
										<tr>
											<td>Lagt inn</td>
											<td className="num">{upload.imported}</td>
										</tr>
										<tr>
											<td>Fantes fra før</td>
											<td className="num">{upload.duplicates}</td>
										</tr>
										{upload.failed.map((f) => (
											<tr key={f.file}>
												<td style={{ wordBreak: 'break-all' }}>{f.file}</td>
												<td style={{ color: 'var(--danger)' }}>{f.reason}</td>
											</tr>
										))}
									</tbody>
								</table>
							)
						) : null}
					</td>
				</tr>
			) : null}
			<SRow q="Status" filled={r.total > 0}>
				<div
					className="mono"
					style={{ padding: '6px 8px', fontSize: 13 }}
					role="status"
					aria-live="polite"
				>
					{status}
					{conns.duplicateRisk ? (
						<div className="why">{conns.duplicateRisk}</div>
					) : null}
				</div>
			</SRow>
			{sure ? (
				<Confirm
					title="Koble fra Intervals.icu?"
					yes="Koble fra"
					danger
					onNo={() => setSure(null)}
					onYes={() => {
						setSure(null)
						void act('disconnect_source', { source: 'intervalsicu' }, () => ({
							what: 'Koblet fra Intervals.icu',
						}))
					}}
				>
					Øktene som er hentet blir liggende. Ingen angre: koble til igjen med
					nøkkelen.
				</Confirm>
			) : null}
		</>
	)
}

// ── goal ─────────────────────────────────────────────────────────────────────

export function GoalRows({
	goal,
	sports,
	log,
	today,
}: {
	goal: GoalOutput
	sports: Sport[]
	log: boolean
	today: string
}) {
	const { act } = useHb()
	const g = goal.goal
	const [kind, setKind] = useState<'event' | 'open' | null>(
		g ? 'event' : goal.openEnded ? 'open' : null,
	)
	const [f, setF] = useState({
		name: '',
		date: '',
		sport: (sports[0] ?? 'run') as Sport,
		distanceKm: '',
		targetTime: '',
	})
	const [err, setErr] = useState<string | null>(null)
	const [stop, setStop] = useState(false)
	const upd = (input: Record<string, unknown>, what: string) =>
		act<{ undo: string | null }>('update_goal', input, () => ({
			what,
			goal: true,
		})).then((r) => {
			setErr(r.ok ? null : r.message)
			return r
		})
	if (g) {
		return (
			<>
				<SRow q="Mål" filled>
					<TextCell
						label="Navn på målet"
						value={g.name}
						onSave={(v) => upd({ name: v }, `Mål: ${v}`)}
					/>
				</SRow>
				<SRow
					q="Dato"
					why={g.planRunsTowardIt ? 'Ny dato flytter ikke fasene.' : undefined}
					filled
				>
					<input
						type="date"
						className="cell-in"
						defaultValue={g.date}
						min={today}
						aria-label="Dato for målet"
						onBlur={(e) =>
							e.target.value &&
							e.target.value !== g.date &&
							void upd({ date: e.target.value }, `Måldato: ${e.target.value}`)
						}
					/>
				</SRow>
				<SRow q="Distanse" filled={g.distanceKm != null}>
					<NumCell
						label="Distanse i km"
						value={g.distanceKm}
						placeholder="km"
						min={0.1}
						max={1000}
						step={0.1}
						suffix="km"
						onSave={(v) =>
							upd(
								{ distanceKm: v },
								`Distanse: ${v != null ? n1(v) : 'ingen'} km`,
							)
						}
					/>
				</SRow>
				<SRow q="Måltid" why="t:mm:ss, valgfri" filled={!!g.targetTime}>
					<TextCell
						label="Måltid"
						value={g.targetTime?.text ?? ''}
						placeholder="1:45:00"
						onSave={(v) =>
							upd({ targetTime: v || null }, `Måltid: ${v || 'ingen'}`)
						}
					/>
				</SRow>
				<SRow q="Realistisk?" filled={false}>
					<div
						style={{
							padding: '0 8px',
							minHeight: 36,
							display: 'flex',
							alignItems: 'center',
							gap: 8,
						}}
					>
						<Q why="Appen vurderer ikke måltiden. Den sier ikke ja når den ikke vet." />
						<span className="why">kan ikke vites</span>
					</div>
				</SRow>
				<SRow q="Status" filled>
					<div className="mono" style={{ padding: '6px 8px', fontSize: 13 }}>
						{g.daysLeft >= 0 ? `${g.daysLeft} dager igjen` : 'har vært'} ·{' '}
						{g.planRunsTowardIt
							? 'planen går mot det'
							: 'ingen plan mot det ennå'}
					</div>
				</SRow>
				{goal.proposal ? (
					<tr>
						<td colSpan={2} style={{ padding: '8px 0' }}>
							<div className="hb-bar draft" style={{ borderRadius: 4 }}>
								<span>
									Utkast: blokka «{goal.proposal.endsCurrentBlock.name}» slutter
									etter {goal.proposal.endsCurrentBlock.weeksKept} uker, så{' '}
									{goal.proposal.phases
										.map((p) => `${p.name} ${p.weeks}`)
										.join(' · ')}{' '}
									uker mot løpet.
									{goal.proposal.steepWeeks.length
										? ` ${goal.proposal.steepWeeks.length} uker øker mer enn 10 %.`
										: ''}
									{goal.proposal.ownSessionsKept
										? ` ${goal.proposal.ownSessionsKept} egne økter blir stående.`
										: ''}
								</span>
								<button
									type="button"
									className="btn sm pri"
									onClick={() =>
										void act(
											'apply_goal_to_plan',
											{
												goalId: goal.proposal!.goalId,
												digest: goal.proposal!.digest,
											},
											() => ({
												what: `Planen går nå mot ${g.name}`,
											}),
										)
									}
								>
									Godta
								</button>
							</div>
						</td>
					</tr>
				) : goal.problem ? (
					<tr>
						<td colSpan={2} className="why" style={{ padding: 8 }}>
							{goal.problem}
						</td>
					</tr>
				) : null}
				<tr>
					<td colSpan={2} style={{ padding: '6px 0' }}>
						<button
							type="button"
							className="btn sm dng"
							onClick={() =>
								g.planRunsTowardIt
									? setStop(true)
									: void act('remove_goal', {}, () => ({
											what: `Fjernet målet ${g.name}`,
											goal: true,
										}))
							}
						>
							Fjern målet
						</button>
						{err ? (
							<div
								role="alert"
								style={{ color: 'var(--danger)', fontSize: 13 }}
							>
								{err}
							</div>
						) : null}
					</td>
				</tr>
				{stop ? (
					<Confirm
						title={`Fjerne ${g.name}?`}
						yes="Fjern mål og stopp planen"
						danger
						onNo={() => setStop(false)}
						onYes={() => {
							setStop(false)
							void act('remove_goal', { stopPlan: true }, () => ({
								what: `Fjernet ${g.name}, planen stoppet`,
								goal: true,
							}))
						}}
					>
						Planen er bygd for dette løpet og stopper med det. Du kan angre så
						lenge du ikke har laget en ny plan.
					</Confirm>
				) : null}
			</>
		)
	}
	return (
		<>
			<SRow q="Mål" filled={kind != null}>
				<div className="seg" role="group" aria-label="Mål">
					<button
						type="button"
						aria-pressed={kind === 'event'}
						onClick={() => setKind('event')}
					>
						Løp/ritt
					</button>
					<button
						type="button"
						aria-pressed={kind === 'open'}
						onClick={() => {
							setKind('open')
							if (log)
								void act('set_goal', { kind: 'open-ended' }, () => ({
									what: 'Mål: bedre form',
									goal: true,
								}))
						}}
					>
						Bedre form
					</button>
				</div>
			</SRow>
			{kind === 'open' ? (
				<SRow q="" filled>
					<div className="why" style={{ padding: '6px 8px' }}>
						Ingen dato. Planen går blokk for blokk.
					</div>
				</SRow>
			) : null}
			{kind === 'event' ? (
				<>
					<SRow q="Navn" filled={!!f.name}>
						<input
							className="cell-in"
							enterKeyHint="next"
							aria-label="Navn på løpet"
							placeholder="Oslo Maraton"
							value={f.name}
							onChange={(e) => setF({ ...f, name: e.target.value })}
							maxLength={80}
						/>
					</SRow>
					<SRow q="Dato" filled={!!f.date}>
						<input
							type="date"
							className="cell-in"
							min={today}
							aria-label="Dato"
							value={f.date}
							onChange={(e) => setF({ ...f, date: e.target.value })}
						/>
					</SRow>
					<SRow q="Idrett" filled>
						<div className="seg" role="radiogroup" aria-label="Idrett">
							{(
								[
									['run', 'Løping'],
									['bike', 'Sykling'],
									['swim', 'Svømming'],
								] as const
							).map(([id, label]) => (
								<button
									key={id}
									type="button"
									role="radio"
									aria-checked={f.sport === id}
									aria-pressed={f.sport === id}
									onClick={() => setF({ ...f, sport: id })}
								>
									{label}
								</button>
							))}
						</div>
					</SRow>
					<SRow q="Distanse" why="km, valgfri" filled={!!f.distanceKm}>
						<input
							className="cell-in mono"
							inputMode="decimal"
							enterKeyHint="next"
							aria-label="Distanse i km"
							placeholder="21,1"
							value={f.distanceKm}
							onChange={(e) => setF({ ...f, distanceKm: e.target.value })}
						/>
					</SRow>
					<SRow q="Måltid" why="t:mm:ss, valgfri" filled={!!f.targetTime}>
						<input
							className="cell-in mono"
							inputMode="numeric"
							enterKeyHint="done"
							aria-label="Måltid"
							placeholder="1:45:00"
							value={f.targetTime}
							onChange={(e) => setF({ ...f, targetTime: e.target.value })}
						/>
					</SRow>
					<SRow q="Realistisk?" filled={false}>
						<div
							style={{
								padding: '0 8px',
								minHeight: 36,
								display: 'flex',
								alignItems: 'center',
								gap: 8,
							}}
						>
							<Q why="Appen vurderer ikke måltiden. Den sier ikke ja når den ikke vet." />
							<span className="why">kan ikke vites</span>
						</div>
					</SRow>
					<tr>
						<td colSpan={2} style={{ padding: '8px 0' }}>
							<button
								type="button"
								className="btn pri sm"
								disabled={!f.name.trim() || !f.date}
								onClick={async () => {
									const dist = f.distanceKm.trim()
										? Number(f.distanceKm.replace(',', '.'))
										: undefined
									if (dist != null && !(dist > 0))
										return setErr('Distansen må være et tall over 0.')
									const r = await act(
										'set_goal',
										{
											kind: 'event',
											name: f.name.trim(),
											date: f.date,
											sport: f.sport,
											...(dist ? { distanceKm: dist } : {}),
											...(f.targetTime.trim()
												? { targetTime: f.targetTime.trim() }
												: {}),
										},
										() => ({
											what: `Mål: ${f.name.trim()} ${f.date}`,
											goal: true,
										}),
									)
									setErr(r.ok ? null : r.message)
								}}
							>
								Sett mål
							</button>
							{err ? (
								<div
									role="alert"
									style={{ color: 'var(--danger)', fontSize: 13, marginTop: 4 }}
								>
									{err}
								</div>
							) : null}
						</td>
					</tr>
				</>
			) : null}
		</>
	)
}

export function TextCell({
	value,
	label,
	placeholder,
	onSave,
	maxLength = 80,
}: {
	value: string
	label: string
	placeholder?: string
	onSave: (v: string) => Promise<unknown>
	maxLength?: number
}) {
	const [t, setT] = useState(value)
	useEffect(() => setT(value), [value])
	return (
		<input
			className="cell-in"
			aria-label={label}
			placeholder={placeholder}
			value={t}
			maxLength={maxLength}
			enterKeyHint="done"
			onChange={(e) => setT(e.target.value)}
			onBlur={() => t.trim() !== value && void onSave(t.trim())}
			onKeyDown={(e) =>
				e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()
			}
		/>
	)
}

export { callCap, n0, type Act }
