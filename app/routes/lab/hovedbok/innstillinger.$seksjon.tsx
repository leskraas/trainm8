import { useState } from 'react'
import { Link, useLoaderData } from 'react-router'
import { type AthleteOutput } from '#app/lab/engine/reads.types.ts'
import {
	type ConnectionsOutput,
	type DeleteAccountOutput,
	type ExportDataOutput,
	type GoalOutput,
	type ImportStatusOutput,
	type SetupState,
	type SportThresholds,
	type ThresholdsOutput,
	type ThresholdValues,
	type Zone,
} from '#app/lab/engine/setup.types.ts'
import { type Route } from './+types/innstillinger.$seksjon.ts'
import { cap } from './__engine.server.ts'
import { n0, pace, SPORT_NAME } from './__format.ts'
import {
	GoalRows,
	LevelRow,
	LikesRow,
	NumCell,
	SourceRows,
	SportsRow,
	SRow,
	TextCell,
	VolumeRows,
} from './__setup.tsx'
import {
	BASE,
	callCap,
	ErrorBar,
	FULL_COLS,
	Q,
	Shell,
	useFlash,
	useHb,
} from './__ui.tsx'

const SECTIONS = [
	{ key: 'tilgjengelighet', label: 'Tilgjengelighet' },
	{ key: 'soner', label: 'Terskler og soner' },
	{ key: 'maal', label: 'Mål' },
	{ key: 'kilder', label: 'Kilder' },
	{ key: 'konto', label: 'Konto' },
	{ key: 'visning', label: 'Visning' },
] as const
type Sec = (typeof SECTIONS)[number]['key']

export async function loader({ request, params }: Route.LoaderArgs) {
	const sec = (
		SECTIONS.some((s) => s.key === params.seksjon)
			? params.seksjon
			: 'tilgjengelighet'
	) as Sec
	const me = await cap<AthleteOutput>(request, 'athlete')
	if (!me.ok) return { sec, error: me.message }
	const need = {
		setup: sec === 'tilgjengelighet' || sec === 'maal' || sec === 'konto',
		thr: sec === 'soner',
		goal: sec === 'maal',
		conn: sec === 'kilder',
	}
	const [setup, thr, goal, conns, imp] = await Promise.all([
		need.setup ? cap<SetupState>(request, 'get_setup') : null,
		need.thr ? cap<ThresholdsOutput>(request, 'thresholds') : null,
		need.goal ? cap<GoalOutput>(request, 'goal') : null,
		need.conn ? cap<ConnectionsOutput>(request, 'connections') : null,
		need.conn ? cap<ImportStatusOutput>(request, 'import_status') : null,
	])
	const errors = [setup, thr, goal, conns, imp].flatMap((r) =>
		r && !r.ok ? [r.message] : [],
	)
	return {
		sec,
		error: null,
		errors,
		athlete: me.value,
		setup: setup?.ok ? setup.value : null,
		thr: thr?.ok ? thr.value : null,
		goal: goal?.ok ? goal.value : null,
		conns: conns?.ok ? conns.value : null,
		imp: imp?.ok ? imp.value : null,
	}
}

export const meta = () => [{ title: 'Innstillinger · Hovedbok' }]

export default function SettingsRoute() {
	const d = useLoaderData<typeof loader>()
	return (
		<Shell
			title="Innstillinger"
			top={
				<nav
					className="seg"
					aria-label="Seksjoner"
					style={{
						flexWrap: 'nowrap',
						overflowX: 'auto',
						paddingBottom: 8,
						scrollbarWidth: 'none',
					}}
				>
					{SECTIONS.map((s) => (
						<Link
							key={s.key}
							to={`${BASE}/innstillinger/${s.key}`}
							replace
							aria-current={s.key === d.sec}
							style={{ whiteSpace: 'nowrap', flex: 'none' }}
						>
							{s.label}
						</Link>
					))}
				</nav>
			}
			bars={
				<>
					{d.error ? <ErrorBar message={d.error} /> : null}
					{'errors' in d
						? d.errors?.map((m, i) => <ErrorBar key={i} message={m} />)
						: null}
				</>
			}
		>
			<div className="hb-page">
				{'athlete' in d && d.athlete ? <Section d={d} /> : null}
			</div>
		</Shell>
	)
}

type D = Extract<Awaited<ReturnType<typeof loader>>, { athlete: AthleteOutput }>

function Section({ d }: { d: D }) {
	const { act } = useHb()
	switch (d.sec) {
		case 'tilgjengelighet': {
			const s = d.setup
			if (!s) return null
			return (
				<table className="sheet-t">
					<tbody>
						<VolumeRows setup={s} log />
						<SRow
							q="Klokkeslett"
							why="Når øktene legges. Tomt = 07:00."
							filled={s.answers.defaultTrainingTime != null}
						>
							<input
								type="time"
								className="cell-in"
								aria-label="Klokkeslett for økter"
								defaultValue={s.answers.defaultTrainingTime ?? ''}
								onBlur={(e) =>
									e.target.value !== (s.answers.defaultTrainingTime ?? '') &&
									void act(
										'set_preferences',
										{ defaultTrainingTime: e.target.value || null },
										() => ({
											what: `Klokkeslett: ${e.target.value || '07:00'}`,
										}),
									)
								}
							/>
						</SRow>
						<SRow
							q="Tilpasning"
							why={
								s.answers.adjustAutomatically
									? 'Planen endrer seg selv hver søndag og sier hva den gjorde. Alt kan angres.'
									: 'Planen foreslår og venter på ja eller nei.'
							}
							filled
						>
							<div className="seg" role="group" aria-label="Tilpasning">
								<button
									type="button"
									aria-pressed={!s.answers.adjustAutomatically}
									onClick={() =>
										void act(
											'set_preferences',
											{ adjustAutomatically: false },
											() => ({ what: 'Tilpasning: spør først' }),
										)
									}
								>
									Spør først
								</button>
								<button
									type="button"
									aria-pressed={s.answers.adjustAutomatically}
									onClick={() =>
										void act(
											'set_preferences',
											{ adjustAutomatically: true },
											() => ({ what: 'Tilpasning: automatisk' }),
										)
									}
								>
									Automatisk
								</button>
							</div>
						</SRow>
						<tr>
							<td colSpan={2} className="sec">
								Om deg
							</td>
						</tr>
						<SportsRow setup={s} log />
						<LevelRow setup={s} log />
						<LikesRow setup={s} log />
						<tr>
							<td colSpan={2} className="why" style={{ padding: '8px 0' }}>
								Idretter, nivå og ønsker brukes neste gang planen lages. Uker
								som alt er lagt ut flyttes ikke.
							</td>
						</tr>
					</tbody>
				</table>
			)
		}
		case 'soner':
			return d.thr ? (
				<>
					{d.thr.sports.map((s) => (
						<SportZones key={s.sport} s={s} />
					))}
					{!d.thr.sports.length ? (
						<p className="why">Ingen idretter med soner ennå.</p>
					) : null}
				</>
			) : null
		case 'maal':
			return d.goal ? (
				<table className="sheet-t">
					<tbody>
						<GoalRows
							goal={d.goal}
							sports={d.setup?.answers.sports ?? ['run']}
							log
							today={d.athlete.today}
						/>
					</tbody>
				</table>
			) : null
		case 'kilder':
			return d.conns && d.imp ? (
				<>
					<table className="sheet-t">
						<tbody>
							<SourceRows conns={d.conns} imp={d.imp} log />
						</tbody>
					</table>
					<table className="sub" style={{ marginTop: 16 }}>
						<thead>
							<tr>
								<th>Kilde</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{d.conns.sources.map((s) => (
								<tr key={s.id}>
									<td>{s.name}</td>
									<td>
										{s.availability === 'coming-soon' ? (
											<span className="mute">ikke tilgjengelig ennå</span>
										) : s.availability === 'not-available' ? (
											<span className="mute">kan ikke kobles herfra</span>
										) : s.state === 'not-connected' ? (
											<span className="mute">ikke koblet</span>
										) : s.state === 'connected' ? (
											'koblet'
										) : s.state === 'importing-history' ? (
											'henter historikk'
										) : (
											<b>må kobles på nytt</b>
										)}
										{s.why ? <div className="mute">{s.why}</div> : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			) : null
		case 'konto':
			return <Account d={d} />
		case 'visning':
			return <ViewPrefs />
	}
}

const FIELDS: Record<
	string,
	{
		k: keyof ThresholdValues
		label: string
		unit: string
		min: number
		max: number
		time?: boolean
	}[]
> = {
	run: [
		{
			k: 'thresholdPacePerKm',
			label: 'Terskelfart',
			unit: '/km',
			min: 150,
			max: 600,
			time: true,
		},
		{ k: 'lthr', label: 'Terskelpuls', unit: 'bpm', min: 80, max: 220 },
		{ k: 'maxHr', label: 'Makspuls', unit: 'bpm', min: 80, max: 220 },
		{ k: 'runPower', label: 'Terskelwatt', unit: 'W', min: 50, max: 600 },
	],
	bike: [
		{ k: 'ftp', label: 'FTP', unit: 'W', min: 50, max: 600 },
		{ k: 'lthr', label: 'Terskelpuls', unit: 'bpm', min: 80, max: 220 },
		{ k: 'maxHr', label: 'Makspuls', unit: 'bpm', min: 80, max: 220 },
	],
	swim: [
		{
			k: 'cssPer100m',
			label: 'CSS',
			unit: '/100 m',
			min: 60,
			max: 250,
			time: true,
		},
		{ k: 'lthr', label: 'Terskelpuls', unit: 'bpm', min: 80, max: 220 },
		{ k: 'maxHr', label: 'Makspuls', unit: 'bpm', min: 80, max: 220 },
	],
}

function SportZones({ s }: { s: SportThresholds }) {
	const { act } = useHb()
	const save = (input: Record<string, unknown>, what: string) =>
		act('set_thresholds', { sport: s.sport, ...input }, () => ({ what }))
	return (
		<section style={{ marginBottom: 24 }}>
			<div className="sec">{SPORT_NAME[s.sport]}</div>
			<table className="sheet-t">
				<tbody>
					{FIELDS[s.sport]!.map((f) => (
						<SRow
							key={f.k}
							q={f.label}
							why={f.unit}
							filled={s.values[f.k] != null}
						>
							{f.time ? (
								<TimeCell
									value={s.values[f.k]}
									label={`${f.label} ${f.unit}`}
									min={f.min}
									max={f.max}
									onSave={(v) =>
										save(
											{ [f.k]: v },
											`${SPORT_NAME[s.sport]} ${f.label}: ${pace(v)} ${f.unit}`,
										)
									}
								/>
							) : (
								<NumCell
									label={`${f.label} ${f.unit}`}
									value={s.values[f.k]}
									placeholder="ikke satt"
									min={f.min}
									max={f.max}
									step={1}
									suffix={f.unit}
									onSave={(v) =>
										v == null
											? Promise.resolve()
											: save(
													{ [f.k]: v },
													`${SPORT_NAME[s.sport]} ${f.label}: ${v} ${f.unit}`,
												)
									}
								/>
							)}
						</SRow>
					))}
					<SRow
						q="Sonesystem"
						why={
							s.zoneSystem?.chosenBy === 'app' ? 'Appens standard.' : undefined
						}
						filled={!!s.zoneSystem}
					>
						<div className="seg" role="radiogroup" aria-label="Sonesystem">
							{[
								...(s.zoneSystem &&
								!s.zoneSystems.some((z) => z.id === s.zoneSystem!.id)
									? [s.zoneSystem]
									: []),
								...s.zoneSystems,
							].map((z) => (
								<button
									key={z.id}
									type="button"
									role="radio"
									aria-checked={s.zoneSystem?.id === z.id}
									aria-pressed={s.zoneSystem?.id === z.id}
									onClick={() =>
										s.zoneSystem?.id !== z.id &&
										void save(
											{ zoneSystem: z.id },
											`${SPORT_NAME[s.sport]} sonesystem: ${z.name}`,
										)
									}
								>
									{z.name}
								</button>
							))}
						</div>
					</SRow>
				</tbody>
			</table>
			<table className="sub">
				<thead>
					<tr>
						<th>Sone</th>
						<th className="num">Fra</th>
						<th className="num">Til</th>
					</tr>
				</thead>
				<tbody>
					{s.zones.map((z) => (
						<ZoneRow key={z.label} z={z} />
					))}
				</tbody>
			</table>
			<p className="why">
				Sonene regnes fra tersklene. Endrer du en terskel, regnes sonene og
				planlagte mål om.
			</p>
			{s.history.length ? (
				<details>
					<summary
						className="why"
						style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}
					>
						Historikk ({s.history.length})
					</summary>
					<table className="sub">
						<tbody>
							{s.history.slice(0, 30).map((h, i) => (
								<tr key={i}>
									<td className="mute">{h.date}</td>
									<td>
										{FIELDS[s.sport]!.find((f) => f.k === h.what)?.label ??
											h.what}
									</td>
									<td className="num">
										{h.what === 'thresholdPacePerKm' || h.what === 'cssPer100m'
											? pace(h.value)
											: n0(h.value)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</details>
			) : null}
		</section>
	)
}

function fmtRange(v: number, unit: string) {
	return unit === 'sec-per-km' || unit === 'sec-per-100m' ? pace(v) : n0(v)
}
function ZoneRow({ z }: { z: Zone }) {
	const r = z.range
	const ref = useFlash<HTMLTableCellElement>(r)
	const unit = r
		? { bpm: 'bpm', watt: 'W', 'sec-per-km': '/km', 'sec-per-100m': '/100m' }[
				r.unit
			]
		: ''
	return (
		<tr>
			<td>
				<b>{z.label}</b>{' '}
				{z.description ? <span className="mute">{z.description}</span> : null}
			</td>
			<td ref={ref} className="num">
				{r ? (
					fmtRange(r.min, r.unit)
				) : (
					<Q why={z.why ?? 'Terskelen sonen regnes fra er ikke satt.'} />
				)}
			</td>
			<td className="num">
				{r ? (r.max != null ? fmtRange(r.max, r.unit) : '∞') : ''}{' '}
				<span className="mute">{unit}</span>
			</td>
		</tr>
	)
}

function TimeCell({
	value,
	label,
	min,
	max,
	onSave,
}: {
	value: number | null
	label: string
	min: number
	max: number
	onSave: (v: number) => Promise<unknown>
}) {
	const [err, setErr] = useState<string | null>(null)
	return (
		<div style={{ display: 'flex', alignItems: 'center' }}>
			<TextCell
				label={label}
				value={value != null ? pace(value) : ''}
				placeholder="m:ss"
				onSave={async (t) => {
					const m = /^(\d{1,2}):(\d{2})$/.exec(t)
					if (!m) return setErr('skriv m:ss')
					const v = Number(m[1]) * 60 + Number(m[2])
					if (v < min || v > max) return setErr(`${pace(min)}–${pace(max)}`)
					setErr(null)
					await onSave(v)
				}}
			/>
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

function Account({ d }: { d: D }) {
	const { act, log } = useHb()
	const [open, setOpen] = useState(false)
	const [typed, setTyped] = useState('')
	const [busy, setBusy] = useState(false)
	const [err, setErr] = useState<string | null>(null)
	const [done, setDone] = useState<DeleteAccountOutput | null>(null)
	const [exp, setExp] = useState<string | null>(null)
	const a = d.athlete
	const planWeeks =
		a.plan.exists && a.plan.firstWeek && a.plan.lastWeek
			? Math.round(
					(Date.parse(a.plan.lastWeek) - Date.parse(a.plan.firstWeek)) /
						604800000,
				) + 1
			: 0
	const connected = a.sources.filter((s) => s.status !== 'disconnected').length
	if (done)
		return (
			<div role="status">
				<p className="say">
					<b>Slettet.</b> Økter, plan, mål og koblinger er borte. Du er logget
					ut.
				</p>
				<a className="btn pri" href="/">
					Til start
				</a>
			</div>
		)
	return (
		<table className="sheet-t">
			<tbody>
				<SRow q="Navn" filled={!!a.name}>
					<TextCell
						label="Navn"
						value={a.name ?? ''}
						placeholder={a.username}
						maxLength={40}
						onSave={(v) =>
							act('set_display_name', { name: v || null }, () => ({
								what: `Navn: ${v || a.username}`,
							}))
						}
					/>
				</SRow>
				<SRow q="Brukernavn" filled>
					<div
						className="mono"
						style={{
							padding: '0 8px',
							minHeight: 36,
							display: 'flex',
							alignItems: 'center',
							overflowWrap: 'anywhere',
						}}
					>
						{a.username}
					</div>
				</SRow>
				<SRow q="E-post" filled={!!a.email}>
					<div
						className="mono"
						style={{ padding: '6px 8px', overflowWrap: 'anywhere' }}
					>
						{a.email ?? <span className="mute">ingen</span>}
					</div>
				</SRow>
				<SRow q="Tidssone" filled>
					<TextCell
						label="Tidssone"
						value={a.timezone}
						placeholder="Europe/Oslo"
						onSave={(v) =>
							act('set_timezone', { timezone: v }, () => ({
								what: `Tidssone: ${v}`,
							}))
						}
					/>
				</SRow>
				<SRow q="Eksporter" why="Alt du eier, som JSON." filled>
					<div style={{ padding: 4 }}>
						<button
							type="button"
							className="btn sm"
							onClick={async () => {
								setExp('Lager fila …')
								const r = await callCap<ExportDataOutput>(
									'export_data',
									{},
									'GET',
								)
								if (!r.ok) return setExp(r.message)
								const blob = new Blob([JSON.stringify(r.value.data, null, 2)], {
									type: 'application/json',
								})
								const url = URL.createObjectURL(blob)
								const link = document.createElement('a')
								link.href = url
								link.download = r.value.fileName
								link.click()
								setTimeout(() => URL.revokeObjectURL(url), 2000)
								setExp(`Lastet ned ${r.value.fileName}`)
							}}
						>
							Last ned
						</button>
						{exp ? <div className="why">{exp}</div> : null}
					</div>
				</SRow>
				<SRow q="Slett alle data" filled>
					<div style={{ padding: 4 }}>
						<button
							type="button"
							className="btn sm dng"
							aria-expanded={open}
							onClick={() => setOpen(!open)}
						>
							{open ? 'Avbryt' : 'Slett …'}
						</button>
					</div>
				</SRow>
				{open ? (
					<tr>
						<td colSpan={2} style={{ padding: '8px 0 16px' }}>
							<div className="hb-x" style={{ width: 'auto', padding: 0 }}>
								<table className="sub">
									<thead>
										<tr>
											<th>Dette slettes for godt</th>
											<th className="num">Antall</th>
										</tr>
									</thead>
									<tbody>
										<tr>
											<td>Økter fra klokka og filer</td>
											<td className="num">{n0(a.recordings.count)}</td>
										</tr>
										<tr>
											<td>Planen</td>
											<td className="num">
												{planWeeks ? `${planWeeks} uker` : 'ingen'}
											</td>
										</tr>
										<tr>
											<td>Mål</td>
											<td className="num">{a.goal ? 1 : 0}</td>
										</tr>
										<tr>
											<td>Koblinger</td>
											<td className="num">{connected}</td>
										</tr>
										<tr>
											<td>Endringslogg (denne enheten)</td>
											<td className="num">{log.length}</td>
										</tr>
										<tr>
											<td>Kontoen</td>
											<td className="num">1</td>
										</tr>
									</tbody>
								</table>
								<p className="say">
									Skriv <b className="mono">SLETT</b> for å slette{' '}
									{n0(a.recordings.count)} økter, planen og koblingene. Kan ikke
									angres. Last ned først hvis du vil ta vare på noe.
								</p>
								<div style={{ display: 'flex', gap: 6 }}>
									<input
										className="cell-in dash mono"
										style={{ height: 44, flex: 1 }}
										aria-label="Skriv SLETT for å bekrefte"
										placeholder="SLETT"
										autoCapitalize="characters"
										autoCorrect="off"
										autoComplete="off"
										value={typed}
										onChange={(e) => setTyped(e.target.value)}
									/>
									<button
										type="button"
										className="btn dng"
										disabled={typed !== 'SLETT' || busy}
										onClick={async () => {
											setBusy(true)
											const r = await callCap<DeleteAccountOutput>(
												'delete_account',
												{ confirm: typed },
											)
											setBusy(false)
											if (!r.ok) return setErr(r.message)
											try {
												localStorage.removeItem('hovedbok.logg.v1')
												localStorage.removeItem('hovedbok.visning.v1')
											} catch {
												/* nothing kept */
											}
											setDone(r.value)
										}}
									>
										{busy ? 'Sletter …' : 'Slett'}
									</button>
								</div>
								{err ? (
									<div
										role="alert"
										style={{
											color: 'var(--danger)',
											fontSize: 13,
											marginTop: 4,
										}}
									>
										{err}
									</div>
								) : null}
							</div>
						</td>
					</tr>
				) : null}
			</tbody>
		</table>
	)
}

function ViewPrefs() {
	const { prefs, setPrefs } = useHb()
	const move = (i: number, dir: -1 | 1) => {
		const cols = [...prefs.cols]
		const j = i + dir
		if (j < 0 || j >= cols.length) return
		;[cols[i], cols[j]] = [cols[j]!, cols[i]!]
		setPrefs({ cols })
	}
	return (
		<table className="sheet-t">
			<tbody>
				<SRow
					q="Nivå"
					why="Enkel: dag, plan, faktisk, avvik, tyngde. Full: alle kolonner."
					filled
				>
					<div className="seg" role="group" aria-label="Nivå">
						<button
							type="button"
							aria-pressed={prefs.level === 'enkel'}
							onClick={() => setPrefs({ level: 'enkel' })}
						>
							Enkel
						</button>
						<button
							type="button"
							aria-pressed={prefs.level === 'full'}
							onClick={() => setPrefs({ level: 'full' })}
						>
							Full
						</button>
					</div>
				</SRow>
				<SRow
					q="Toppseksjon"
					why="Veien til målet og ukas mengde, fryst øverst."
					filled
				>
					<div className="seg" role="group" aria-label="Toppseksjon">
						<button
							type="button"
							aria-pressed={prefs.top}
							onClick={() => setPrefs({ top: true })}
						>
							På
						</button>
						<button
							type="button"
							aria-pressed={!prefs.top}
							onClick={() => setPrefs({ top: false })}
						>
							Av
						</button>
					</div>
				</SRow>
				<tr>
					<td colSpan={2} className="sec">
						Kolonner på Full-nivå
					</td>
				</tr>
				{prefs.cols.map((c, i) => {
					const info = FULL_COLS.find((f) => f.key === c.key)
					return (
						<SRow
							key={c.key}
							q={info?.label ?? c.key}
							why={info?.long}
							filled={c.on}
						>
							<div className="seg">
								<button
									type="button"
									aria-pressed={c.on}
									onClick={() =>
										setPrefs({
											cols: prefs.cols.map((x) =>
												x.key === c.key ? { ...x, on: !x.on } : x,
											),
										})
									}
								>
									{c.on ? 'Vises' : 'Skjult'}
								</button>
								<button
									type="button"
									aria-label={`Flytt ${info?.label} opp`}
									disabled={i === 0}
									onClick={() => move(i, -1)}
								>
									↑
								</button>
								<button
									type="button"
									aria-label={`Flytt ${info?.label} ned`}
									disabled={i === prefs.cols.length - 1}
									onClick={() => move(i, 1)}
								>
									↓
								</button>
							</div>
						</SRow>
					)
				})}
				<tr>
					<td colSpan={2} className="why" style={{ padding: '8px 0' }}>
						Lagres i denne nettleseren.{' '}
						<Link className="lnk" to={BASE}>
							Til boka →
						</Link>
					</td>
				</tr>
			</tbody>
		</table>
	)
}
