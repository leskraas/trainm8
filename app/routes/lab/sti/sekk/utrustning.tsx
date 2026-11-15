import { useState } from 'react'
import { useCapability } from '#app/lab/engine/client.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type ExperienceLevel,
	type HomePlace,
	type OtherActivity,
	type SearchPlacesInput,
	type SearchPlacesOutput,
	type SessionPreference,
	type SetAvailabilityInput,
	type SetAvailabilityOutput,
	type SetCurrentVolumeInput,
	type SetLevelInput,
	type SetPreferencesInput,
	type SetSportsInput,
	type SetStrengthInput,
	type SetTimezoneInput,
	type SetupState,
	type Sport,
	type Weekday,
} from '#app/lab/engine/setup.types.ts'
import {
	BASE,
	ErrorLine,
	Sheet,
	Spinner,
	WEEKDAY_KEYS,
	fmtHours,
	wdLong,
	wdShort,
} from '../__ui.tsx'
import { type Route } from './+types/utrustning.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const s = await runCapability(request, 'get_setup', {})
	return { setup: s.ok ? s.value : null, error: s.ok ? null : s.message }
}

export const meta = () => [{ title: 'Sti · Utrustning' }]

export default function Utrustning({ loaderData }: Route.ComponentProps) {
	const { setup, error } = loaderData
	if (!setup) {
		return (
			<Sheet title="Utrustning" back={`${BASE}/sekk`}>
				<ErrorLine message={error} />
			</Sheet>
		)
	}
	return (
		<Sheet kicker="Sekken" title="Utrustning" back={`${BASE}/sekk`}>
			<p
				className="soft"
				style={{ fontSize: 14, marginBottom: 16, lineHeight: 1.45 }}
			>
				{setup.hasPlan
					? 'Endringer her brukes når de neste ukene legges. Uker som alt ligger på stien, flyttes ikke.'
					: 'Svarene dine. Endre fritt.'}
			</p>
			<div style={{ display: 'grid', gap: 14 }}>
				<Sports setup={setup} />
				<Level setup={setup} />
				<Days setup={setup} />
				<Volume setup={setup} />
				<Strength setup={setup} />
				<Prefs setup={setup} />
				<Place setup={setup} />
			</div>
		</Sheet>
	)
}

function Pocket({
	title,
	children,
	onSave,
	pending,
	error,
	note,
	dirty,
}: {
	title: string
	children: React.ReactNode
	onSave?: () => void
	pending?: boolean
	error?: string | null
	note?: string | null
	dirty?: boolean
}) {
	return (
		<section className="sti-card" style={{ display: 'grid', gap: 10 }}>
			<h2 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h2>
			{children}
			<ErrorLine message={error} />
			{note ? (
				<p role="status" style={{ fontSize: 14 }}>
					{note}
				</p>
			) : null}
			{onSave ? (
				<button
					type="button"
					className="sti-btn small"
					onClick={onSave}
					disabled={pending || !dirty}
					style={{ justifySelf: 'start' }}
				>
					{pending ? <Spinner /> : null}
					Lagre
				</button>
			) : null}
		</section>
	)
}

function useSave<I, O>(name: string) {
	const cap = useCapability<I, O>(name)
	const [error, setError] = useState<string | null>(null)
	const [note, setNote] = useState<string | null>(null)
	async function save(input: I, ok: (v: O) => string = () => 'Lagret.') {
		setError(null)
		setNote(null)
		const r = await cap.call(input)
		if (!r.ok) return setError(r.message)
		setNote(ok(r.value))
	}
	return { save, error, note, pending: cap.pending }
}

function Sports({ setup }: { setup: SetupState }) {
	const s = useSave<SetSportsInput, SetupState>('set_sports')
	const [sports, setSports] = useState<Sport[]>(setup.answers.sports ?? [])
	const [other, setOther] = useState<OtherActivity[]>(
		setup.answers.otherActivities ?? [],
	)
	const dirty =
		JSON.stringify(sports) !== JSON.stringify(setup.answers.sports ?? []) ||
		JSON.stringify(other) !==
			JSON.stringify(setup.answers.otherActivities ?? [])
	return (
		<Pocket
			title="Idretter"
			onSave={() => s.save({ sports, otherActivities: other })}
			{...s}
			dirty={dirty}
		>
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
				{setup.choices.sports.map((c) => (
					<button
						key={c.id}
						type="button"
						className="sti-chip"
						aria-pressed={sports.includes(c.id)}
						onClick={() =>
							setSports((l) =>
								l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id],
							)
						}
					>
						{c.label}
						{sports[0] === c.id ? (
							<span style={{ fontSize: 12, opacity: 0.75 }}>· hoved</span>
						) : null}
					</button>
				))}
				{setup.choices.otherActivities.map((c) => (
					<button
						key={c.id}
						type="button"
						className="sti-chip"
						aria-pressed={other.includes(c.id)}
						onClick={() =>
							setOther((l) =>
								l.includes(c.id) ? l.filter((x) => x !== c.id) : [...l, c.id],
							)
						}
					>
						{c.label}
					</button>
				))}
			</div>
		</Pocket>
	)
}

function Level({ setup }: { setup: SetupState }) {
	const s = useSave<SetLevelInput, SetupState>('set_experience_level')
	const [level, setLevel] = useState<ExperienceLevel | null>(
		setup.answers.level,
	)
	return (
		<Pocket
			title="Erfaring"
			onSave={() => level && s.save({ level })}
			{...s}
			dirty={level !== setup.answers.level}
		>
			<div
				role="radiogroup"
				aria-label="Erfaring"
				style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
			>
				{setup.choices.levels.map((c) => (
					<button
						key={c.id}
						type="button"
						role="radio"
						aria-checked={level === c.id}
						className="sti-chip"
						onClick={() => setLevel(c.id)}
						title={c.label}
					>
						{c.label.split(':')[0]}
					</button>
				))}
			</div>
		</Pocket>
	)
}

function Days({ setup }: { setup: SetupState }) {
	const s = useSave<SetAvailabilityInput, SetAvailabilityOutput>(
		'set_availability',
	)
	const [days, setDays] = useState<Weekday[]>(
		setup.answers.availability.days ?? [],
	)
	const [room, setRoom] = useState<number | null>(
		setup.answers.availability.hoursPerWeek,
	)
	const [effect, setEffect] = useState<SetAvailabilityOutput['planEffect']>([])
	const dirty =
		JSON.stringify(days) !==
			JSON.stringify(setup.answers.availability.days ?? []) ||
		room !== setup.answers.availability.hoursPerWeek
	return (
		<Pocket
			title="Dager, og hvilke som ikke går"
			onSave={() =>
				s.save({ days, hoursPerWeek: room }, (v) => {
					setEffect(v.planEffect)
					return v.note
				})
			}
			{...s}
			dirty={dirty && days.length > 0}
		>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: 'repeat(7, 1fr)',
					gap: 4,
				}}
			>
				{WEEKDAY_KEYS.map((d) => {
					const on = days.includes(d)
					return (
						<button
							key={d}
							type="button"
							aria-pressed={on}
							aria-label={`${wdLong(d)}${on ? ' går' : ' går ikke'}`}
							onClick={() =>
								setDays((l) =>
									on
										? l.filter((x) => x !== d)
										: WEEKDAY_KEYS.filter((w) => w === d || l.includes(w)),
								)
							}
							style={{
								height: 52,
								borderRadius: 10,
								border: `1.5px solid ${on ? 'var(--ink)' : 'var(--ink-faint)'}`,
								background: on ? 'var(--ink)' : 'transparent',
								color: on ? 'var(--sky)' : 'var(--ink-soft)',
								textDecoration: on ? 'none' : 'line-through',
								fontWeight: 650,
								fontSize: 13,
								cursor: 'pointer',
							}}
						>
							{wdShort(d)}
						</button>
					)
				})}
			</div>
			<label
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					minHeight: 44,
				}}
			>
				<input
					type="checkbox"
					checked={room !== null}
					onChange={(e) =>
						setRoom(
							e.target.checked
								? (setup.answers.currentHoursPerWeek ?? 6)
								: null,
						)
					}
					style={{ width: 22, height: 22, accentColor: 'var(--ink)' }}
				/>
				<span style={{ flex: 1 }}>Tak på timer i uka</span>
				{room !== null ? <span className="num">{fmtHours(room)}</span> : null}
			</label>
			{room !== null ? (
				<input
					type="range"
					aria-label="Tak på timer i uka"
					min={setup.choices.hoursPerWeek.min}
					max={setup.choices.hoursPerWeek.max}
					step={setup.choices.hoursPerWeek.step}
					value={room}
					onChange={(e) => setRoom(Number(e.target.value))}
					style={{ width: '100%', accentColor: 'var(--ink)', height: 44 }}
				/>
			) : null}
			{effect.map((e) => (
				<p key={e.what} className="soft" style={{ fontSize: 14 }}>
					{e.what}: mistet {e.lostDays.map(wdShort).join(', ')}
					{e.keptDays
						? `, beholder ${e.keptDays.map(wdShort).join(', ')}`
						: ', planen velger dager på nytt'}
					.
				</p>
			))}
		</Pocket>
	)
}

function Volume({ setup }: { setup: SetupState }) {
	const s = useSave<SetCurrentVolumeInput, SetupState>('set_current_volume')
	const [h, setH] = useState<number>(
		setup.answers.currentHoursPerWeek ??
			setup.suggested?.currentHoursPerWeek ??
			4,
	)
	return (
		<Pocket
			title="Hvor mye du går nå"
			onSave={() => s.save({ hoursPerWeek: h })}
			{...s}
			dirty={h !== setup.answers.currentHoursPerWeek}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
				<input
					type="range"
					aria-label="Timer i uka nå"
					min={setup.choices.hoursPerWeek.min}
					max={setup.choices.hoursPerWeek.max}
					step={setup.choices.hoursPerWeek.step}
					value={h}
					onChange={(e) => setH(Number(e.target.value))}
					style={{ flex: 1, accentColor: 'var(--ink)', height: 44 }}
				/>
				<span className="num" style={{ width: 56, textAlign: 'right' }}>
					{fmtHours(h)}
				</span>
			</div>
			{setup.answers.currentHoursPerWeek === null ? (
				<p className="soft" style={{ fontSize: 13 }}>
					Ikke sagt ennå.
				</p>
			) : null}
			{setup.fromHistory.note ? (
				<p className="soft" style={{ fontSize: 13 }}>
					{setup.fromHistory.note}
				</p>
			) : null}
		</Pocket>
	)
}

function Strength({ setup }: { setup: SetupState }) {
	const s = useSave<SetStrengthInput, SetupState>('set_strength')
	const [n, setN] = useState(setup.answers.strengthPerWeek ?? 0)
	return (
		<Pocket
			title="Styrke"
			onSave={() => s.save({ perWeek: n as 0 | 1 | 2 | 3 })}
			{...s}
			dirty={n !== (setup.answers.strengthPerWeek ?? 0)}
		>
			<div
				role="radiogroup"
				aria-label="Styrkeøkter i uka"
				style={{ display: 'flex', gap: 8 }}
			>
				{[0, 1, 2, 3].map((k) => (
					<button
						key={k}
						type="button"
						role="radio"
						aria-checked={n === k}
						className="sti-chip num"
						style={{ flex: 1, justifyContent: 'center' }}
						onClick={() => setN(k)}
					>
						{k === 0 ? 'Ingen' : `${k}×`}
					</button>
				))}
			</div>
		</Pocket>
	)
}

function Prefs({ setup }: { setup: SetupState }) {
	const s = useSave<SetPreferencesInput, SetupState>('set_preferences')
	const tz = useSave<SetTimezoneInput, SetupState>('set_timezone')
	const a = setup.answers
	const [auto, setAuto] = useState(a.adjustAutomatically)
	const [time, setTime] = useState(a.defaultTrainingTime ?? '')
	const [likes, setLikes] = useState<SessionPreference[]>(
		a.sessionPreferences ?? [],
	)
	const dirty =
		auto !== a.adjustAutomatically ||
		time !== (a.defaultTrainingTime ?? '') ||
		JSON.stringify(likes) !== JSON.stringify(a.sessionPreferences ?? [])
	let browserTz: string | null = null
	try {
		browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
	} catch {
		browserTz = null
	}
	return (
		<Pocket
			title="Hvordan stien oppfører seg"
			onSave={() =>
				s.save({
					adjustAutomatically: auto,
					defaultTrainingTime: time || null,
					sessionPreferences: likes,
				})
			}
			{...s}
			dirty={dirty}
		>
			<div
				role="radiogroup"
				aria-label="Når planen vil endre noe"
				style={{ display: 'grid', gap: 8 }}
			>
				<button
					type="button"
					role="radio"
					aria-checked={!auto}
					className="sti-chip"
					style={{
						borderRadius: 14,
						justifyContent: 'flex-start',
						minHeight: 52,
					}}
					onClick={() => setAuto(false)}
				>
					Spør meg først (veiskilt)
				</button>
				<button
					type="button"
					role="radio"
					aria-checked={auto}
					className="sti-chip"
					style={{
						borderRadius: 14,
						justifyContent: 'flex-start',
						minHeight: 52,
					}}
					onClick={() => setAuto(true)}
				>
					Juster selv, og si hva du gjorde (med angre)
				</button>
			</div>
			<label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
				<span style={{ flex: 1 }}>Vanlig tidspunkt</span>
				<input
					className="sti-field num"
					type="time"
					value={time}
					onChange={(e) => setTime(e.target.value)}
					style={{ width: 130 }}
				/>
			</label>
			{!time ? (
				<p className="soft" style={{ fontSize: 13 }}>
					Ikke satt: stegene legges kl. 07:00.
				</p>
			) : null}
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
				{setup.choices.sessionPreferences.map((p) => (
					<button
						key={p.id}
						type="button"
						className="sti-chip"
						aria-pressed={likes.includes(p.id)}
						onClick={() =>
							setLikes((l) =>
								l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id],
							)
						}
					>
						{p.label}
					</button>
				))}
			</div>
			<p className="soft" style={{ fontSize: 14 }}>
				Tidssone: {a.timezone}
				{browserTz && browserTz !== a.timezone ? (
					<button
						type="button"
						className="sti-link"
						style={{ marginLeft: 8 }}
						onClick={() =>
							tz.save(
								{ timezone: browserTz! },
								() => `Tidssone satt til ${browserTz}.`,
							)
						}
					>
						Bruk {browserTz}
					</button>
				) : null}
			</p>
			<ErrorLine message={tz.error} />
			{tz.note ? <p role="status">{tz.note}</p> : null}
		</Pocket>
	)
}

function Place({ setup }: { setup: SetupState }) {
	const search = useCapability<SearchPlacesInput, SearchPlacesOutput>(
		'search_places',
	)
	const set = useSave<HomePlace, SetupState>('set_home_place')
	const remove = useSave<Record<string, never>, SetupState>('remove_home_place')
	const [q, setQ] = useState('')
	const [found, setFound] = useState<SearchPlacesOutput | null>(null)
	const home = setup.answers.homePlace
	return (
		<Pocket
			title="Hvor du går fra (for været)"
			error={set.error ?? remove.error}
			note={set.note ?? remove.note}
		>
			{home ? (
				<p>
					{home.name}, {home.municipality}{' '}
					<button
						type="button"
						className="sti-link"
						onClick={() => remove.save({})}
					>
						Fjern
					</button>
				</p>
			) : (
				<p className="soft" style={{ fontSize: 14 }}>
					Ikke valgt. Uten sted, ikke noe vær.
				</p>
			)}
			<form
				style={{ display: 'flex', gap: 8 }}
				onSubmit={async (e) => {
					e.preventDefault()
					const r = await search.call({ text: q }, { revalidate: false })
					setFound(r.ok ? r.value : { status: 'unavailable', why: r.message })
				}}
			>
				<input
					className="sti-field"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Sted i Norge"
					enterKeyHint="search"
				/>
				<button
					className="sti-btn small"
					type="submit"
					disabled={!q.trim() || search.pending}
				>
					{search.pending ? <Spinner /> : 'Søk'}
				</button>
			</form>
			{found?.status === 'unavailable' ? (
				<p className="soft">{found.why}</p>
			) : null}
			{found?.status === 'found' ? (
				<div style={{ display: 'grid', gap: 6 }}>
					{found.places.length === 0 ? (
						<p className="soft">Fant ingen steder.</p>
					) : null}
					{found.places.slice(0, 6).map(({ id, ...p }) => (
						<button
							key={id}
							type="button"
							className="sti-chip"
							style={{ borderRadius: 12, justifyContent: 'flex-start' }}
							onClick={() =>
								set
									.save(p, () => `${p.name} er lagret.`)
									.then(() => setFound(null))
							}
						>
							{p.name}, {p.municipality}
						</button>
					))}
				</div>
			) : null}
		</Pocket>
	)
}
