import { useState } from 'react'
import { Link, useLoaderData, useRevalidator } from 'react-router'
import { type AthleteOutput } from '#app/lab/engine/reads.types.ts'
import {
	type ApplyGoalToPlanOutput,
	type ConnectionsOutput,
	type DeleteAccountOutput,
	type DisconnectOutput,
	type ExportDataOutput,
	type GoalOutput,
	type GoalWriteOutput,
	type ImportStatusOutput,
	type RemoveGoalOutput,
	type SessionPreference,
	type SetAvailabilityOutput,
	type SetupState,
	type Sport,
	type SportThresholds,
	type SyncOutput,
	type ThresholdsOutput,
	type ThresholdValues,
	type Weekday,
} from '#app/lab/engine/setup.types.ts'
import { type Route } from './+types/innstillinger.$del.ts'
import { useCall } from './__convo.tsx'
import { run } from './__data.server.ts'
import {
	hoursText,
	joinList,
	mmss,
	monthYear,
	num0,
	plural,
	shortDate,
	WEEKDAY_SHORT,
} from './__fmt.ts'
import { GoalForm, IntervalsCard, UploadCard } from './__onboarding.tsx'
import { FocusCard } from './__overlay.tsx'
import { PhaseStrip } from './__season.tsx'
import { Chip, Chips, HoldButton, Unknown, WeekdayToggles } from './__ui.tsx'

const PARTS = [
	'soner',
	'tilgjengelighet',
	'mal',
	'koblinger',
	'konto',
	'slett',
] as const
type Part = (typeof PARTS)[number]

const TITLES: Record<Part, string> = {
	soner: 'Soner og terskler',
	tilgjengelighet: 'Tilgjengelighet',
	mal: 'Mål',
	koblinger: 'Koblinger og filer',
	konto: 'Konto',
	slett: 'Slett alle dataene mine',
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const del = (PARTS as readonly string[]).includes(params.del)
		? (params.del as Part)
		: null
	if (!del) return { del: null }
	const athlete = await run<AthleteOutput>(request, 'athlete', {})
	const me = athlete.ok ? athlete.value : null
	if (del === 'soner') {
		const t = await run<ThresholdsOutput>(request, 'thresholds', {})
		return {
			del,
			me,
			thresholds: t.ok ? t.value : null,
			error: t.ok ? null : t.message,
		}
	}
	if (del === 'tilgjengelighet') {
		const s = await run<SetupState>(request, 'get_setup', {})
		return {
			del,
			me,
			setup: s.ok ? s.value : null,
			error: s.ok ? null : s.message,
		}
	}
	if (del === 'mal') {
		const [g, s] = await Promise.all([
			run<GoalOutput>(request, 'goal', {}),
			run<SetupState>(request, 'get_setup', {}),
		])
		return {
			del,
			me,
			goal: g.ok ? g.value : null,
			setup: s.ok ? s.value : null,
			error: g.ok ? null : g.message,
		}
	}
	if (del === 'koblinger') {
		const [c, st] = await Promise.all([
			run<ConnectionsOutput>(request, 'connections', {}),
			run<ImportStatusOutput>(request, 'import_status', {}),
		])
		return {
			del,
			me,
			connections: c.ok ? c.value : null,
			status: st.ok ? st.value : null,
			error: c.ok ? null : c.message,
		}
	}
	const c = await run<ConnectionsOutput>(request, 'connections', {})
	return { del, me, connections: c.ok ? c.value : null, error: null }
}

export default function SettingsFocus() {
	const data = useLoaderData<typeof loader>()
	if (!data.del)
		return (
			<FocusCard title="Endre">
				<p>
					Det finnes ikke. Prøv soner, tilgjengelighet, mål, koblinger eller
					konto.
				</p>
			</FocusCard>
		)
	const d = data as Exclude<typeof data, { del: null }> &
		Record<string, unknown>
	return (
		<FocusCard title={TITLES[d.del]}>
			{'error' in d && d.error ? (
				<p className="prat-err">{String(d.error)}</p>
			) : null}
			{d.del === 'soner' && d.thresholds ? (
				<Zones t={d.thresholds as ThresholdsOutput} />
			) : null}
			{d.del === 'tilgjengelighet' && d.setup ? (
				<Availability
					setup={d.setup as SetupState}
					me={d.me as AthleteOutput | null}
				/>
			) : null}
			{d.del === 'mal' ? (
				<GoalPart
					goal={(d.goal as GoalOutput | null) ?? null}
					setup={(d.setup as SetupState | null) ?? null}
					me={d.me as AthleteOutput | null}
				/>
			) : null}
			{d.del === 'koblinger' && d.connections ? (
				<Connections
					c={d.connections as ConnectionsOutput}
					status={(d.status as ImportStatusOutput | null) ?? null}
				/>
			) : null}
			{d.del === 'konto' ? <Account me={d.me as AthleteOutput | null} /> : null}
			{d.del === 'slett' ? (
				<Delete
					me={d.me as AthleteOutput | null}
					c={(d.connections as ConnectionsOutput | null) ?? null}
				/>
			) : null}
		</FocusCard>
	)
}

function Said({ children }: { children: React.ReactNode }) {
	return (
		<div className="prat-turn partner" style={{ marginTop: 0 }}>
			<div className="prat-bubble">{children}</div>
		</div>
	)
}

// ── soner ───────────────────────────────────────────────────────────────────

const SPORT_NAME: Record<Sport, string> = {
	run: 'Løping',
	bike: 'Sykkel',
	swim: 'Svømming',
}

type Field = {
	key: keyof ThresholdValues
	label: string
	kind: 'bpm' | 'watt' | 'pace' | 'pace100'
}
const FIELDS: Record<Sport, Field[]> = {
	run: [
		{ key: 'thresholdPacePerKm', label: 'Terskelfart (min/km)', kind: 'pace' },
		{ key: 'lthr', label: 'Terskelpuls', kind: 'bpm' },
		{ key: 'maxHr', label: 'Makspuls', kind: 'bpm' },
		{ key: 'runPower', label: 'Terskelwatt', kind: 'watt' },
	],
	bike: [
		{ key: 'ftp', label: 'FTP (watt)', kind: 'watt' },
		{ key: 'lthr', label: 'Terskelpuls', kind: 'bpm' },
		{ key: 'maxHr', label: 'Makspuls', kind: 'bpm' },
	],
	swim: [
		{ key: 'cssPer100m', label: 'CSS (min/100 m)', kind: 'pace100' },
		{ key: 'lthr', label: 'Terskelpuls', kind: 'bpm' },
		{ key: 'maxHr', label: 'Makspuls', kind: 'bpm' },
	],
}

function parseValue(f: Field, v: string): number | null {
	const t = v.trim()
	if (!t) return null
	if (f.kind === 'pace' || f.kind === 'pace100') {
		const m = /^(\d{1,2})[:.,](\d{1,2})$/.exec(t)
		if (m) return Number(m[1]) * 60 + Number(m[2])
		const n = Number(t)
		return Number.isFinite(n) && n > 0 ? n : null
	}
	const n = Number(t.replace(',', '.'))
	return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function showValue(f: Field, v: number | null) {
	if (v === null) return ''
	return f.kind === 'pace' || f.kind === 'pace100' ? mmss(v) : String(v)
}

function rangeText(r: NonNullable<SportThresholds['zones'][number]['range']>) {
	const f = (v: number) =>
		r.unit === 'sec-per-km'
			? `${mmss(v)}`
			: r.unit === 'sec-per-100m'
				? `${mmss(v)}`
				: num0(v)
	const unit =
		r.unit === 'bpm'
			? 'slag/min'
			: r.unit === 'watt'
				? 'W'
				: r.unit === 'sec-per-km'
					? '/km'
					: '/100 m'
	return r.max === null
		? `over ${f(r.min)} ${unit}`
		: `${f(r.min)}–${f(r.max)} ${unit}`
}

function Zones({ t }: { t: ThresholdsOutput }) {
	if (!t.sports.length)
		return <Said>Du har ingen kondisjonsidretter med soner ennå.</Said>
	return (
		<>
			<Said>
				Her er tersklene dine. Sonene og målene i øktene regnes ut fra dem.
				Endrer du en, regner jeg om de planlagte øktene.
			</Said>
			{t.sports.map((s) => (
				<SportZones key={s.sport} s={s} />
			))}
		</>
	)
}

function SportZones({ s }: { s: SportThresholds }) {
	const call = useCall()
	const fields = FIELDS[s.sport]
	const [vals, setVals] = useState<Record<string, string>>(
		Object.fromEntries(
			fields.map((f) => [f.key, showValue(f, s.values[f.key])]),
		),
	)
	const [msg, setMsg] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const save = async (extra?: { zoneSystem: string }) => {
		const input: Record<string, unknown> = { sport: s.sport, ...extra }
		for (const f of fields) {
			const v = parseValue(f, vals[f.key] ?? '')
			if (v !== null && v !== s.values[f.key]) input[f.key] = v
		}
		if (Object.keys(input).length === 1) {
			setMsg('Ingenting er endret.')
			return
		}
		setBusy(true)
		const r = await call<SportThresholds>('set_thresholds', input)
		setBusy(false)
		setMsg(
			r.ok
				? 'Lagret. Planlagte økter er regnet om med de nye tallene.'
				: r.message,
		)
	}
	return (
		<div className="prat-card">
			<span className="prat-card-title">{SPORT_NAME[s.sport]}</span>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
					gap: 10,
				}}
			>
				{fields.map((f) => (
					<label key={f.key} className="prat-field">
						<span>{f.label}</span>
						<input
							className="prat-input num"
							inputMode={f.kind.startsWith('pace') ? 'text' : 'numeric'}
							value={vals[f.key] ?? ''}
							placeholder="ikke satt"
							onChange={(e) =>
								setVals((v) => ({ ...v, [f.key]: e.target.value }))
							}
						/>
					</label>
				))}
			</div>
			<Chips>
				<Chip primary busy={busy} onClick={() => void save()}>
					Lagre
				</Chip>
			</Chips>
			{msg ? <span className="prat-note">{msg}</span> : null}
			{s.zoneSystems.length > 1 ? (
				<div className="prat-field">
					<span>
						Sonemodell
						{s.zoneSystem?.chosenBy === 'app'
							? ' (valgt av meg; velg en annen om du vil)'
							: ''}
					</span>
					<Chips>
						{s.zoneSystems.map((z) => (
							<Chip
								key={z.id}
								quiet
								pressed={s.zoneSystem?.id === z.id}
								onClick={() => void save({ zoneSystem: z.id })}
							>
								{z.name}
							</Chip>
						))}
					</Chips>
				</div>
			) : null}
			<div className="prat-list">
				{s.zones.map((z) => (
					<div key={z.label} className="prat-row" style={{ minHeight: 44 }}>
						<b className="num" style={{ width: 40 }}>
							{z.label}
						</b>
						<span className="prat-row-main">
							<span className="prat-row-sub">{z.description ?? ''}</span>
						</span>
						{z.range ? (
							<span
								className="num"
								style={{ fontSize: 15, whiteSpace: 'nowrap' }}
							>
								{rangeText(z.range)}
							</span>
						) : (
							<Unknown why={z.why} short="ukjent" />
						)}
					</div>
				))}
			</div>
			{s.zones.some((z) => !z.range && z.why) ? (
				<span className="prat-note">
					{s.zones.find((z) => !z.range && z.why)?.why}
				</span>
			) : null}
			{s.history.length ? (
				<span className="prat-note">
					Sist endret:{' '}
					{s.history
						.slice(-3)
						.map((h) => `${shortDate(h.date)}`)
						.join(', ')}
				</span>
			) : null}
		</div>
	)
}

// ── tilgjengelighet ─────────────────────────────────────────────────────────

const PREFS: SessionPreference[] = [
	'long',
	'intervals',
	'threshold',
	'short',
	'surprise',
]

function Availability({
	setup,
	me,
}: {
	setup: SetupState
	me: AthleteOutput | null
}) {
	const call = useCall()
	const a = setup.answers
	const [days, setDays] = useState<Weekday[]>(
		a.availability.days ?? ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
	)
	const [hours, setHours] = useState<number | null>(a.availability.hoursPerWeek)
	const [msg, setMsg] = useState<React.ReactNode>(null)
	const [busy, setBusy] = useState<string | null>(null)
	const [time, setTime] = useState(a.defaultTrainingTime ?? '')
	const range = setup.choices.hoursPerWeek

	const saveDays = async () => {
		setBusy('days')
		const r = await call<SetAvailabilityOutput>('set_availability', {
			days,
			hoursPerWeek: hours,
		})
		setBusy(null)
		if (!r.ok) return setMsg(r.message)
		const n = r.value.planEffect.length
		setMsg(
			<>
				{r.value.note}
				{n
					? ` Endringen påvirker ${joinList(r.value.planEffect.map((p) => `${p.what.toLowerCase()} (${p.lostDays.map((d) => WEEKDAY_SHORT[d]).join(', ')})`))}. Uker som alt er lagt, flyttes ikke; nye uker bruker de nye dagene.`
					: ''}
			</>,
		)
	}

	return (
		<>
			<Said>Hvilke dager kan du trene? Trykk bort dager som ikke går.</Said>
			<div className="prat-card">
				<WeekdayToggles value={days} onChange={setDays} />
				<label className="prat-field">
					<span>
						Mest tid i uka: {hours === null ? 'ikke satt' : hoursText(hours)}
					</span>
					<input
						className="prat-range"
						type="range"
						min={range.min}
						max={range.max}
						step={range.step}
						value={hours ?? range.min}
						onChange={(e) => setHours(Number(e.target.value))}
					/>
				</label>
				<Chips>
					<Chip
						primary
						busy={busy === 'days'}
						disabled={!days.length}
						onClick={() => void saveDays()}
					>
						Lagre dager og tid
					</Chip>
					{hours !== null ? (
						<Chip quiet onClick={() => setHours(null)}>
							Ingen grense
						</Chip>
					) : null}
				</Chips>
				{msg ? <span className="prat-note">{msg}</span> : null}
			</div>

			<Said>Hvor ofte vil du løfte?</Said>
			<div className="prat-card">
				<Chips>
					{([0, 1, 2, 3] as const).map((n) => (
						<Chip
							key={n}
							pressed={(a.strengthPerWeek ?? 0) === n}
							onClick={() =>
								void call('set_strength', { perWeek: n }).then((r) =>
									setMsg(
										r.ok
											? 'Lagret. Det gjelder fra neste uke som legges.'
											: r.message,
									),
								)
							}
						>
							{n === 0 ? 'Ikke' : `${n} i uka`}
						</Chip>
					))}
				</Chips>
			</div>

			<Said>Hvilke økter liker du?</Said>
			<div className="prat-card">
				<Chips>
					{PREFS.map((p) => {
						const on = (a.sessionPreferences ?? []).includes(p)
						const label =
							setup.choices.sessionPreferences.find((x) => x.id === p)?.label ??
							p
						return (
							<Chip
								key={p}
								quiet
								pressed={on}
								onClick={() => {
									const next = on
										? (a.sessionPreferences ?? []).filter((x) => x !== p)
										: [...(a.sessionPreferences ?? []), p]
									void call('set_preferences', {
										sessionPreferences: next,
									}).then((r) => {
										if (!r.ok) setMsg(r.message)
									})
								}}
							>
								{label}
							</Chip>
						)
					})}
				</Chips>
			</div>

			<Said>Når trener du vanligvis, og skal planen justere seg selv?</Said>
			<div className="prat-card">
				<label className="prat-field">
					<span>Vanlig treningstid</span>
					<input
						className="prat-input"
						type="time"
						value={time}
						onChange={(e) => setTime(e.target.value)}
						onBlur={() =>
							void call('set_preferences', {
								defaultTrainingTime: time || null,
							}).then((r) => {
								if (!r.ok) setMsg(r.message)
							})
						}
					/>
				</label>
				<div className="prat-toggle">
					<span style={{ fontSize: 15 }}>
						Juster planen selv hver søndag
						<br />
						<span className="prat-note">
							{a.adjustAutomatically
								? 'Jeg endrer og sier fra, og du kan angre.'
								: 'Jeg foreslår og venter på ja.'}
						</span>
					</span>
					<button
						type="button"
						role="switch"
						className="prat-switch"
						aria-checked={a.adjustAutomatically}
						aria-label="Juster planen selv"
						onClick={() =>
							void call('set_preferences', {
								adjustAutomatically: !a.adjustAutomatically,
							}).then((r) => {
								if (!r.ok) setMsg(r.message)
							})
						}
					/>
				</div>
				{me?.homePlace ? (
					<span className="prat-note">
						Været hentes for {me.homePlace.name}.
					</span>
				) : null}
			</div>
		</>
	)
}

// ── mål ─────────────────────────────────────────────────────────────────────

function GoalPart({
	goal,
	setup,
	me,
}: {
	goal: GoalOutput | null
	setup: SetupState | null
	me: AthleteOutput | null
}) {
	const call = useCall()
	const revalidator = useRevalidator()
	const [edit, setEdit] = useState(false)
	const [busy, setBusy] = useState(false)
	const [msg, setMsg] = useState<string | null>(null)
	const [undo, setUndo] = useState<string | null>(null)
	const [confirmStop, setConfirmStop] = useState(false)
	const g = goal?.goal ?? null
	const sports = (setup?.answers.sports ?? ['run']) as Sport[]

	const afterWrite = (
		r:
			| { ok: true; value: GoalWriteOutput | RemoveGoalOutput }
			| { ok: false; message: string },
	) => {
		setBusy(false)
		if (!r.ok) return setMsg(r.message)
		setUndo(r.value.undo)
		setEdit(false)
		void revalidator.revalidate()
	}

	return (
		<>
			{g ? (
				<>
					<Said>
						Du sikter mot <b>{g.name}</b> {shortDate(g.date)}
						{g.distanceKm
							? `, ${String(Math.round(g.distanceKm * 10) / 10).replace('.', ',')} km`
							: ''}
						{g.targetTime ? `, på ${g.targetTime.text}` : ''}. Det er{' '}
						{g.daysLeft >= 0 ? plural(g.daysLeft, 'dag', 'dager') : 'passert'}{' '}
						til.{' '}
						{g.planRunsTowardIt
							? 'Planen går mot den.'
							: 'Planen går ikke mot den ennå.'}
					</Said>
					<Chips>
						<Chip onClick={() => setEdit((v) => !v)}>
							{edit ? 'Avbryt' : 'Endre målet'}
						</Chip>
						<Chip quiet danger onClick={() => setConfirmStop(true)}>
							Fjern målet
						</Chip>
					</Chips>
				</>
			) : (
				<>
					<Said>
						{goal?.openEnded || me?.plan.exists
							? 'Du har ikke noe løp å sikte mot. Planen går en blokk om gangen. Har du et løp?'
							: 'Du har ikke satt noe mål ennå.'}
					</Said>
					<Chips>
						<Chip primary onClick={() => setEdit(true)}>
							Sett et mål
						</Chip>
					</Chips>
				</>
			)}
			{edit ? (
				<GoalForm
					sports={sports}
					today={me?.today ?? new Date().toISOString().slice(0, 10)}
					busy={busy}
					initial={g}
					onSubmit={(input) => {
						setBusy(true)
						setMsg(null)
						void (
							g
								? call<GoalWriteOutput>('update_goal', input)
								: call<GoalWriteOutput>('set_goal', { kind: 'event', ...input })
						).then(afterWrite)
					}}
				/>
			) : null}
			{g && edit ? (
				<p className="prat-note" style={{ margin: 0 }}>
					En ny dato flytter ikke fasene i en plan som alt går mot målet.
				</p>
			) : null}
			{confirmStop && g ? (
				<div className="prat-card">
					<span>
						{g.planRunsTowardIt
							? 'Planen er bygd for dette løpet. Fjerner du målet, stopper planen også, og vi lager en ny. Du kan angre.'
							: 'Fjerne målet?'}
					</span>
					<Chips>
						<Chip
							danger
							busy={busy}
							onClick={() => {
								setBusy(true)
								setConfirmStop(false)
								void call<RemoveGoalOutput>(
									'remove_goal',
									g.planRunsTowardIt ? { stopPlan: true } : {},
								).then(afterWrite)
							}}
						>
							{g.planRunsTowardIt ? 'Fjern mål og stopp planen' : 'Fjern'}
						</Chip>
						<Chip quiet onClick={() => setConfirmStop(false)}>
							Nei
						</Chip>
					</Chips>
				</div>
			) : null}
			{goal?.proposal ? <ApplyGoal goal={goal} /> : null}
			{goal?.problem ? (
				<p className="prat-warn" style={{ margin: 0 }}>
					{goal.problem}
				</p>
			) : null}
			{msg ? (
				<p className="prat-err" style={{ margin: 0 }}>
					{msg}
				</p>
			) : null}
			{undo ? (
				<Chips>
					<Chip
						quiet
						onClick={() =>
							void call<GoalWriteOutput>('undo_goal_change', { undo }).then(
								(r) => {
									setUndo(null)
									setMsg(r.ok ? 'Angret. Målet er som før.' : r.message)
								},
							)
						}
					>
						Angre endringen
					</Chip>
				</Chips>
			) : null}
		</>
	)
}

function ApplyGoal({ goal }: { goal: GoalOutput }) {
	const call = useCall()
	const p = goal.proposal!
	const [msg, setMsg] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	return (
		<div className="prat-card">
			<span>
				Skal planen gå mot løpet? Da slutter «{p.endsCurrentBlock.name}» etter{' '}
				{p.endsCurrentBlock.weeksKept} av {p.endsCurrentBlock.weeksHad} uker, og
				fra neste uke legger jeg disse fasene:
			</span>
			<PhaseStrip phases={p.phases} />
			{p.steepWeeks.length ? (
				<span className="prat-warn">
					{p.steepWeeks.length === 1 ? 'Én uke' : `${p.steepWeeks.length} uker`}{' '}
					øker mer enn 10 %:{' '}
					{p.steepWeeks
						.map(
							(w) =>
								`${shortDate(w.weekStart)} (${hoursText(w.fromHours)} → ${hoursText(w.toHours)})`,
						)
						.join(', ')}
					.
				</span>
			) : null}
			{p.ownSessionsKept ? (
				<span className="prat-note">
					{plural(
						p.ownSessionsKept,
						'økt du har lagt selv',
						'økter du har lagt selv',
					)}{' '}
					blir stående.
				</span>
			) : null}
			<span className="prat-note">
				Dette kan ikke angres, men du kan fjerne målet senere.
			</span>
			<Chips>
				<Chip
					primary
					busy={busy}
					onClick={() => {
						setBusy(true)
						void call<ApplyGoalToPlanOutput>('apply_goal_to_plan', {
							goalId: p.goalId,
							digest: p.digest,
						}).then((r) => {
							setBusy(false)
							setMsg(
								r.ok
									? `Gjort. Planen går nå mot ${r.value.goal.name}: ${r.value.phases.map((x) => `${x.name} ${x.weeks} u`).join(', ')}.`
									: r.message,
							)
						})
					}}
				>
					Ja, legg om planen
				</Chip>
			</Chips>
			{msg ? <span className="prat-note">{msg}</span> : null}
		</div>
	)
}

// ── koblinger ───────────────────────────────────────────────────────────────

const STATE: Record<string, string> = {
	'not-connected': 'Ikke koblet til',
	connected: 'Koblet til',
	'importing-history': 'Henter historikk …',
	'needs-reconnect': 'Må kobles til på nytt',
}

function Connections({
	c,
	status,
}: {
	c: ConnectionsOutput
	status: ImportStatusOutput | null
}) {
	const call = useCall()
	const [msg, setMsg] = useState<string | null>(null)
	const [connect, setConnect] = useState(false)
	const [upload, setUpload] = useState(false)
	return (
		<>
			<Said>
				{status && status.recordings.total
					? `Jeg har ${status.recordings.total} økter fra klokka${status.recordings.earliest ? `, den eldste fra ${monthYear(status.recordings.earliest)}` : ''}.`
					: 'Jeg har ingen økter fra klokka ennå.'}
				{status?.importing ? ' Historikken er fortsatt på vei inn.' : ''}
			</Said>
			<div className="prat-list">
				{c.sources.map((s) => (
					<div key={s.id} className="prat-row" style={{ flexWrap: 'wrap' }}>
						<span className="prat-row-main" style={{ minWidth: 160 }}>
							<span className="prat-row-title">{s.name}</span>
							<span className="prat-row-sub" style={{ whiteSpace: 'normal' }}>
								{s.availability === 'coming-soon'
									? 'Kommer'
									: s.availability === 'not-available'
										? (s.why ?? 'Kan ikke kobles herfra')
										: s.id === 'file'
											? 'Last opp .fit, .tcx, .gpx eller .zip'
											: STATE[s.state]}
								{s.lastCheckedAt
									? ` · sist sjekket ${new Date(s.lastCheckedAt).toLocaleString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
									: ''}
							</span>
						</span>
						{s.id === 'intervalsicu' && s.availability === 'available' ? (
							<Chips>
								{s.canSync ? (
									<Chip
										quiet
										onClick={() =>
											void call<SyncOutput>('sync_sources', {
												source: 'intervalsicu',
											}).then((r) =>
												setMsg(
													r.ok
														? `${r.value.imported ? `Hentet ${r.value.imported} nye.` : 'Ingen nye økter.'}${r.value.failed.map((f) => ` ${f.message}`).join('')}`
														: r.message,
												),
											)
										}
									>
										Hent nå
									</Chip>
								) : null}
								{s.canDisconnect ? (
									<Chip
										quiet
										danger
										onClick={() =>
											void call<DisconnectOutput>('disconnect_source', {
												source: 'intervalsicu',
											}).then((r) =>
												setMsg(
													r.ok
														? 'Koblet fra. Øktene du alt har, blir værende.'
														: r.message,
												),
											)
										}
									>
										Koble fra
									</Chip>
								) : (
									<Chip onClick={() => setConnect((v) => !v)}>
										{s.state === 'needs-reconnect'
											? 'Koble til på nytt'
											: 'Koble til'}
									</Chip>
								)}
							</Chips>
						) : null}
						{s.id === 'strava' && s.canDisconnect ? (
							<Chip
								quiet
								danger
								onClick={() =>
									void call('disconnect_source', { source: 'strava' }).then(
										(r) => setMsg(r.ok ? 'Koblet fra.' : r.message),
									)
								}
							>
								Koble fra
							</Chip>
						) : null}
						{s.id === 'file' ? (
							<Chip onClick={() => setUpload((v) => !v)}>Last opp</Chip>
						) : null}
					</div>
				))}
			</div>
			{connect ? (
				<IntervalsCard onDone={(ok) => ok && setConnect(false)} />
			) : null}
			{upload ? <UploadCard /> : null}
			{c.duplicateRisk ? (
				<p className="prat-warn" style={{ margin: 0 }}>
					{c.duplicateRisk}
				</p>
			) : null}
			{msg ? (
				<p className="prat-note" style={{ margin: 0 }}>
					{msg}
				</p>
			) : null}
		</>
	)
}

// ── konto ───────────────────────────────────────────────────────────────────

function Account({ me }: { me: AthleteOutput | null }) {
	const call = useCall()
	const [name, setName] = useState(me?.name ?? '')
	const [msg, setMsg] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	return (
		<>
			<Said>Hva skal jeg kalle deg?</Said>
			<form
				className="prat-card"
				onSubmit={(e) => {
					e.preventDefault()
					void call('set_display_name', { name: name.trim() || null }).then(
						(r) => setMsg(r.ok ? 'Lagret.' : r.message),
					)
				}}
			>
				<input
					className="prat-input"
					value={name}
					maxLength={40}
					onChange={(e) => setName(e.target.value)}
					placeholder={me?.username ?? 'Navn'}
					aria-label="Navn"
				/>
				<Chips>
					<button type="submit" className="prat-chip primary">
						<span>Lagre navn</span>
					</button>
				</Chips>
				{me?.email ? (
					<span className="prat-note">Innlogget som {me.email}</span>
				) : null}
			</form>
			<Said>Vil du ha med deg alt du har her? Du får det som én fil.</Said>
			<Chips>
				<Chip busy={busy} onClick={() => void exportAll(call, setBusy, setMsg)}>
					Last ned dataene mine
				</Chip>
			</Chips>
			{msg ? (
				<p className="prat-note" style={{ margin: 0 }}>
					{msg}
				</p>
			) : null}
			<Said>Og om du vil slutte helt:</Said>
			<Chips>
				<Link
					to="/lab/prat/innstillinger/slett"
					className="prat-chip danger"
					replace
					preventScrollReset
				>
					<span>Slett alle dataene mine</span>
				</Link>
			</Chips>
		</>
	)
}

async function exportAll(
	call: ReturnType<typeof useCall>,
	setBusy: (b: boolean) => void,
	setMsg: (m: string | null) => void,
) {
	setBusy(true)
	const r = await call<ExportDataOutput>(
		'export_data',
		{},
		{ revalidate: false },
	)
	setBusy(false)
	if (!r.ok) return setMsg(r.message)
	const blob = new Blob([JSON.stringify(r.value.data, null, 2)], {
		type: 'application/json',
	})
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = r.value.fileName
	document.body.appendChild(a)
	a.click()
	a.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 2000)
	setMsg(`Lastet ned ${r.value.fileName}.`)
}

// ── slett ───────────────────────────────────────────────────────────────────

function Delete({
	me,
	c,
}: {
	me: AthleteOutput | null
	c: ConnectionsOutput | null
}) {
	const call = useCall()
	const [typed, setTyped] = useState('')
	const [msg, setMsg] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [done, setDone] = useState<DeleteAccountOutput | null>(null)
	const connected = (c?.sources ?? [])
		.filter((s) => s.canDisconnect)
		.map((s) => s.name)
	const count = me?.recordings.count ?? null

	if (done)
		return (
			<>
				<Said>Alt er slettet. Takk for følget.</Said>
				<Said>Hei. Jeg skal legge treningsplanen din. Først litt om deg …</Said>
				<Chips>
					<Chip primary onClick={() => window.location.assign('/')}>
						Til start
					</Chip>
				</Chips>
			</>
		)

	const parts: string[] = []
	parts.push(
		count
			? plural(count, 'økt fra klokka', 'økter fra klokka')
			: 'alt du har fortalt meg',
	)
	if (me?.plan.exists) parts.push('planen din')
	if (me?.goal) parts.push(`målet ditt (${me.goal.name})`)
	if (connected.length) parts.push(`koblingene til ${joinList(connected)}`)

	return (
		<>
			<Said>
				Det sletter {joinList(parts)}, og kontoen din. Det kan ikke angres.
			</Said>
			<Said>Vil du laste ned dataene dine først?</Said>
			<Chips>
				<Chip busy={busy} onClick={() => void exportAll(call, setBusy, setMsg)}>
					Last ned først
				</Chip>
			</Chips>
			<div className="prat-card">
				<label className="prat-field">
					<span>Skriv SLETT for å bekrefte</span>
					<input
						className="prat-input"
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
						autoCapitalize="characters"
						autoComplete="off"
						spellCheck={false}
					/>
				</label>
				<HoldButton
					disabled={typed !== 'SLETT'}
					doneLabel="Sletter …"
					onConfirm={() => {
						setMsg(null)
						void call<DeleteAccountOutput>(
							'delete_account',
							{ confirm: typed },
							{ revalidate: false },
						).then((r) => {
							if (r.ok) setDone(r.value)
							else setMsg(r.message)
						})
					}}
				>
					Hold inne for å slette alt
				</HoldButton>
				<span className="prat-note">
					Hold knappen i halvannet sekund. Slipper du før, skjer ingenting.
				</span>
			</div>
			{msg ? (
				<p className="prat-err" style={{ margin: 0 }}>
					{msg}
				</p>
			) : null}
		</>
	)
}
