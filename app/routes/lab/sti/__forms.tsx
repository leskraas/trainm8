import { useEffect, useMemo, useRef, useState } from 'react'
import { uploadToCapability, useCapability } from '#app/lab/engine/client.ts'
import {
	type ConnectIntervalsIcuInput,
	type ConnectOutput,
	type ConnectionsOutput,
	type GoalOutput,
	type GoalWriteOutput,
	type ImportStatusOutput,
	type SetGoalInput,
	type Sport,
	type SyncOutput,
	type UpdateGoalInput,
	type UploadOutput,
} from '#app/lab/engine/setup.types.ts'
import { ErrorLine, Spinner, fmtMonthYear, plural } from './__ui.tsx'

/** Connections, the history coming in and file upload. Also used in the pack. */
export function TracksPanel({
	connections,
	connectionsError,
	status,
	showManage,
}: {
	connections: ConnectionsOutput | null
	connectionsError: string | null
	status: ImportStatusOutput | null
	showManage?: boolean
}) {
	const connect = useCapability<ConnectIntervalsIcuInput, ConnectOutput>(
		'connect_intervals_icu',
	)
	const statusCap = useCapability<Record<string, never>, ImportStatusOutput>(
		'import_status',
	)
	const [live, setLive] = useState<ImportStatusOutput | null>(status)
	const [key, setKey] = useState('')
	const [keyError, setKeyError] = useState<string | null>(null)
	const [upload, setUpload] = useState<{
		pending: boolean
		result: UploadOutput | null
		error: string | null
	}>({
		pending: false,
		result: null,
		error: null,
	})
	const fileRef = useRef<HTMLInputElement>(null)
	useEffect(() => setLive(status), [status])

	const importing = live?.importing ?? false
	useEffect(() => {
		if (!importing) return
		const t = window.setInterval(async () => {
			const r = await statusCap.call({}, { revalidate: false })
			if (r.ok) setLive(r.value)
		}, 3000)
		return () => window.clearInterval(t)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [importing])

	async function doConnect(e: React.FormEvent) {
		e.preventDefault()
		setKeyError(null)
		const r = await connect.call({ apiKey: key.trim() })
		if (!r.ok) return setKeyError(r.message)
		setKey('')
		const s = await statusCap.call({}, { revalidate: false })
		if (s.ok) setLive(s.value)
	}
	async function doUpload(files: FileList | null) {
		if (!files?.length) return
		setUpload({ pending: true, result: null, error: null })
		const form = new FormData()
		for (const f of Array.from(files)) form.append('file', f)
		try {
			const r = await uploadToCapability<UploadOutput>(
				'upload_activity_files',
				form,
			)
			if (!r.ok) setUpload({ pending: false, result: null, error: r.message })
			else {
				setUpload({ pending: false, result: r.value, error: null })
				const s = await statusCap.call({}, { revalidate: true })
				if (s.ok) setLive(s.value)
			}
		} catch {
			setUpload({
				pending: false,
				result: null,
				error: 'Fikk ikke kontakt. Prøv igjen.',
			})
		}
		if (fileRef.current) fileRef.current.value = ''
	}

	const total = live?.recordings.total ?? 0
	const sources = connections?.sources ?? []
	const intervals = sources.find((s) => s.id === 'intervalsicu')
	const intervalsOn = intervals && intervals.state !== 'not-connected'
	return (
		<div style={{ display: 'grid', gap: 14 }}>
			<HistoryTrail
				total={total}
				importing={importing}
				earliest={live?.recordings.earliest ?? null}
			/>
			{connectionsError ? <ErrorLine message={connectionsError} /> : null}
			{sources
				.filter((s) => s.id !== 'file')
				.map((s) => (
					<div
						key={s.id}
						className="sti-card"
						style={{ display: 'grid', gap: 8 }}
					>
						<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
							<strong style={{ flex: 1 }}>{s.name}</strong>
							<span className="soft" style={{ fontSize: 13 }}>
								{s.state === 'connected'
									? 'Koblet på'
									: s.state === 'importing-history'
										? 'Henter spor …'
										: s.state === 'needs-reconnect'
											? 'Må kobles på igjen'
											: s.availability === 'coming-soon'
												? 'Kommer'
												: s.availability === 'not-available'
													? 'Ikke herfra'
													: 'Ikke koblet'}
							</span>
						</div>
						<p className="soft" style={{ fontSize: 14, lineHeight: 1.4 }}>
							{s.why ?? s.description}
						</p>
						{s.id === 'intervalsicu' &&
						(!intervalsOn || s.state === 'needs-reconnect') ? (
							<form onSubmit={doConnect} style={{ display: 'grid', gap: 8 }}>
								<label htmlFor="sti-key" style={{ fontSize: 14 }}>
									API-nøkkel (intervals.icu → Settings → Developer Settings)
								</label>
								<div style={{ display: 'flex', gap: 8 }}>
									<input
										id="sti-key"
										className="sti-field"
										value={key}
										onChange={(e) => setKey(e.target.value)}
										autoComplete="off"
										autoCapitalize="none"
										autoCorrect="off"
										spellCheck={false}
										enterKeyHint="go"
										placeholder="Lim inn nøkkelen"
									/>
									<button
										className="sti-btn"
										type="submit"
										disabled={connect.pending || !key.trim()}
									>
										{connect.pending ? <Spinner /> : 'Koble'}
									</button>
								</div>
								<ErrorLine message={keyError} />
							</form>
						) : null}
						{showManage && s.id === 'intervalsicu' && intervalsOn ? (
							<ManageSource
								id="intervalsicu"
								canSync={s.canSync}
								canDisconnect={s.canDisconnect}
							/>
						) : null}
						{showManage && s.id === 'strava' && s.canDisconnect ? (
							<ManageSource id="strava" canSync={s.canSync} canDisconnect />
						) : null}
					</div>
				))}
			<div className="sti-card" style={{ display: 'grid', gap: 8 }}>
				<strong>Last opp fil</strong>
				<p className="soft" style={{ fontSize: 14, lineHeight: 1.4 }}>
					.fit, .tcx, .gpx eller en .zip (for eksempel en Strava-eksport).
					Opptil 20 om gangen.
				</p>
				<input
					ref={fileRef}
					type="file"
					multiple
					accept=".fit,.gz,.tcx,.gpx,.zip"
					onChange={(e) => void doUpload(e.target.files)}
					style={{ display: 'none' }}
					id="sti-upload"
				/>
				<label
					htmlFor="sti-upload"
					className="sti-btn quiet"
					role="button"
					aria-disabled={upload.pending}
				>
					{upload.pending ? (
						<>
							<Spinner /> Leser filene …
						</>
					) : (
						'Velg filer'
					)}
				</label>
				<ErrorLine message={upload.error} />
				{upload.result ? (
					<p style={{ fontSize: 14 }}>
						{upload.result.imported
							? `${plural(upload.result.imported, 'økt', 'økter')} lagt på stien.`
							: 'Ingen nye økter i filene.'}
						{upload.result.duplicates
							? ` ${plural(upload.result.duplicates, 'var', 'var')} der fra før.`
							: ''}
						{upload.result.failed.map((f) => (
							<span
								key={f.file}
								className="sti-err"
								style={{ display: 'block' }}
							>
								{f.file}: {f.reason}
							</span>
						))}
					</p>
				) : null}
			</div>
			{connections?.duplicateRisk ? (
				<p className="soft" style={{ fontSize: 13 }}>
					{connections.duplicateRisk}
				</p>
			) : null}
		</div>
	)
}

function ManageSource({
	id,
	canSync,
	canDisconnect,
}: {
	id: 'intervalsicu' | 'strava'
	canSync: boolean
	canDisconnect: boolean
}) {
	const sync = useCapability<
		{ source?: 'intervalsicu' | 'strava' },
		SyncOutput
	>('sync_sources')
	const disc = useCapability<
		{ source: 'intervalsicu' | 'strava' },
		ConnectOutput
	>('disconnect_source')
	const [msg, setMsg] = useState<string | null>(null)
	const [confirm, setConfirm] = useState(false)
	return (
		<div
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				gap: 8,
				alignItems: 'center',
			}}
		>
			{canSync ? (
				<button
					type="button"
					className="sti-btn quiet small"
					disabled={sync.pending}
					onClick={async () => {
						const r = await sync.call({ source: id })
						setMsg(
							r.ok
								? r.value.failed.length
									? r.value.failed.map((f) => f.message).join(' ')
									: r.value.imported
										? `${plural(r.value.imported, 'ny økt', 'nye økter')} kom inn.`
										: 'Ingen nye spor.'
								: r.message,
						)
					}}
				>
					{sync.pending ? <Spinner /> : 'Hent nå'}
				</button>
			) : null}
			{canDisconnect ? (
				confirm ? (
					<>
						<span style={{ fontSize: 14 }}>Øktene du har, blir liggende.</span>
						<button
							type="button"
							className="sti-btn danger small"
							disabled={disc.pending}
							onClick={async () => {
								const r = await disc.call({ source: id })
								setMsg(r.ok ? 'Koblet fra.' : r.message)
								setConfirm(false)
							}}
						>
							Koble fra
						</button>
						<button
							type="button"
							className="sti-btn ghost small"
							onClick={() => setConfirm(false)}
						>
							Avbryt
						</button>
					</>
				) : (
					<button
						type="button"
						className="sti-btn ghost small"
						onClick={() => setConfirm(true)}
					>
						Koble fra …
					</button>
				)
			) : null}
			{msg ? (
				<span role="status" style={{ fontSize: 14 }}>
					{msg}
				</span>
			) : null}
		</div>
	)
}

/** The path behind the dot, drawn as the history comes in. */
function HistoryTrail({
	total,
	importing,
	earliest,
}: {
	total: number
	importing: boolean
	earliest: string | null
}) {
	const segs = Math.min(40, Math.max(1, Math.ceil(total / 6)))
	const H = 120
	const pts = Array.from({ length: segs + 1 }, (_, i) => {
		const y = H - 14 - (i / Math.max(segs, 1)) * (total ? H - 28 : 14)
		const x = 60 + Math.sin(i * 0.9) * (total ? 26 : 4)
		return [x, y] as const
	})
	const d = pts
		.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
		.join(' ')
	const top = pts[pts.length - 1]!
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
			<svg
				width="120"
				height={H}
				viewBox={`0 0 120 ${H}`}
				aria-hidden
				style={{ flexShrink: 0 }}
			>
				<path
					d={d}
					fill="none"
					stroke="var(--ink)"
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
					style={{ transition: 'd 400ms var(--ease-out)' }}
				/>
				<circle cx={top[0]} cy={top[1]} r="6" fill="var(--dot)" />
				<circle
					cx={top[0]}
					cy={top[1]}
					r="10"
					fill="none"
					stroke="var(--dot)"
					strokeOpacity=".35"
					strokeWidth="2"
				/>
			</svg>
			<p
				role="status"
				aria-live="polite"
				style={{ fontSize: 16, lineHeight: 1.4 }}
			>
				{importing ? (
					<>
						<Spinner /> Henter spor … <span className="num">{total}</span> økter
						så langt.
					</>
				) : total > 0 ? (
					<>
						Du har gått{' '}
						<strong className="num">{plural(total, 'økt', 'økter')}</strong>
						{earliest ? ` siden ${fmtMonthYear(earliest)}` : ''}.
					</>
				) : (
					'Stien bak deg tegnes når øktene kommer inn.'
				)}
			</p>
		</div>
	)
}

/** The flag: a race with a date, or «bli i bedre form». Used here and in the pack. */
export function GoalForm({
	sports,
	goal,
	onDone,
	submitLabel,
}: {
	sports: string[]
	goal: GoalOutput | null
	onDone: (out: GoalWriteOutput | null) => void
	submitLabel: string
}) {
	const existing = goal?.goal ?? null
	const setGoal = useCapability<SetGoalInput, GoalWriteOutput>('set_goal')
	const update = useCapability<UpdateGoalInput, GoalWriteOutput>('update_goal')
	const endurance = useMemo(
		() =>
			sports.filter(
				(s): s is Sport => s === 'run' || s === 'bike' || s === 'swim',
			),
		[sports],
	)
	const [kind, setKind] = useState<'event' | 'open'>('event')
	const [name, setName] = useState(existing?.name ?? '')
	const [date, setDate] = useState(existing?.date ?? '')
	const [sport, setSport] = useState<Sport>(
		(existing?.sports.find((s) => s !== 'strength') as Sport | undefined) ??
			endurance[0] ??
			'run',
	)
	const [distance, setDistance] = useState(
		existing?.distanceKm ? String(existing.distanceKm).replace('.', ',') : '',
	)
	const [time, setTime] = useState(existing?.targetTime?.text ?? '')
	const [error, setError] = useState<string | null>(null)
	const pending = setGoal.pending || update.pending
	const presets =
		sport === 'run'
			? [5, 10, 21.1, 42.2]
			: sport === 'bike'
				? [40, 90, 160]
				: [1.5, 3.8]

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		setError(null)
		if (kind === 'open') {
			if (existing)
				return setError(
					'Du har et flagg alt. Ta det ned i sekken (Flagg) først, eller behold det.',
				)
			const r = await setGoal.call({ kind: 'open-ended' })
			if (!r.ok) return setError(r.message)
			return onDone(r.value)
		}
		const km = distance.trim() ? Number(distance.replace(',', '.')) : undefined
		if (km !== undefined && !(km > 0))
			return setError('Distansen må være et tall, som 21,1.')
		const base = {
			name: name.trim(),
			date,
			sport,
			...(km ? { distanceKm: km } : {}),
			...(time.trim() ? { targetTime: time.trim() } : {}),
		}
		const r = existing
			? await update.call({
					...base,
					distanceKm: km ?? null,
					targetTime: time.trim() || null,
				})
			: await setGoal.call({ kind: 'event', ...base })
		if (!r.ok) return setError(r.message)
		onDone(r.value)
	}

	return (
		<form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
			<div
				role="radiogroup"
				aria-label="Type mål"
				style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
			>
				<button
					type="button"
					role="radio"
					aria-checked={kind === 'event'}
					className="sti-chip"
					onClick={() => setKind('event')}
					style={{
						height: 96,
						borderRadius: 16,
						flexDirection: 'column',
						justifyContent: 'center',
					}}
				>
					<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
						<path
							d="M6 24V3"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
						<path
							d="M6 4h14l-4 4.5 4 4.5H6"
							fill={kind === 'event' ? 'var(--dot)' : 'none'}
							stroke="currentColor"
							strokeWidth="1.6"
							strokeLinejoin="round"
						/>
					</svg>
					<span style={{ fontWeight: 650 }}>Et mål med dato</span>
				</button>
				<button
					type="button"
					role="radio"
					aria-checked={kind === 'open'}
					className="sti-chip"
					onClick={() => setKind('open')}
					style={{
						height: 96,
						borderRadius: 16,
						flexDirection: 'column',
						justifyContent: 'center',
					}}
				>
					<svg width="28" height="26" viewBox="0 0 28 26" aria-hidden>
						<ellipse
							cx="14"
							cy="13"
							rx="11"
							ry="8"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeDasharray="3 3"
						/>
					</svg>
					<span style={{ fontWeight: 650 }}>Bli i bedre form</span>
				</button>
			</div>
			{kind === 'open' ? (
				<div className="sti-fog">
					Uten dato har stien ingen ende. Den blir en rundløype på fire uker,
					med litt mer hver runde. Du kan sette et flagg senere.
				</div>
			) : (
				<>
					<Field label="Navn på løpet eller rittet">
						<input
							className="sti-field"
							required
							maxLength={80}
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Oslo Maraton"
						/>
					</Field>
					<Field label="Dato">
						<input
							className="sti-field"
							type="date"
							required
							value={date}
							onChange={(e) => setDate(e.target.value)}
						/>
					</Field>
					{endurance.length > 1 ? (
						<div
							role="radiogroup"
							aria-label="Idrett"
							style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
						>
							{endurance.map((s) => (
								<button
									key={s}
									type="button"
									role="radio"
									aria-checked={sport === s}
									className="sti-chip"
									onClick={() => setSport(s)}
								>
									{s === 'run' ? 'Løp' : s === 'bike' ? 'Ritt' : 'Svøm'}
								</button>
							))}
						</div>
					) : null}
					<Field label="Distanse (km, valgfritt)">
						<input
							className="sti-field num"
							inputMode="decimal"
							value={distance}
							onChange={(e) => setDistance(e.target.value)}
							placeholder="21,1"
						/>
						<div
							style={{
								display: 'flex',
								gap: 6,
								marginTop: 8,
								flexWrap: 'wrap',
							}}
						>
							{presets.map((p) => (
								<button
									key={p}
									type="button"
									className="sti-chip num"
									style={{ minHeight: 36, padding: '0 12px', fontSize: 14 }}
									onClick={() => setDistance(String(p).replace('.', ','))}
								>
									{String(p).replace('.', ',')}
								</button>
							))}
						</div>
					</Field>
					<Field label="Måltid (t:mm:ss, valgfritt)">
						<input
							className="sti-field num"
							inputMode="numeric"
							value={time}
							onChange={(e) => setTime(e.target.value)}
							placeholder="1:45:00"
							autoCapitalize="none"
							autoCorrect="off"
						/>
					</Field>
				</>
			)}
			<ErrorLine message={error} />
			<button className="sti-btn wide" type="submit" disabled={pending}>
				{pending ? <Spinner /> : null}
				{submitLabel}
			</button>
		</form>
	)
}

function Field({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<label style={{ display: 'grid', gap: 6 }}>
			<span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
			{children}
		</label>
	)
}
