import { useState } from 'react'
import { Link } from 'react-router'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type ExperienceLevel,
	type HomePlace,
	type SearchPlacesOutput,
	type SetAvailabilityOutput,
	type SetupState,
} from '#app/lab/engine/setup.types.ts'
import {
	BASE,
	DAY_NAME,
	LEVEL_SHORT,
	PREF_SHORT,
	WEEKDAY_ORDER,
	cap,
	listText,
	mondayOf,
	n1,
} from '../__lib.ts'
import { addPs } from '../__ps.ts'
import {
	DaysSheet,
	HoleBtn,
	HoursSheet,
	NameSheet,
	PrefsSheet,
	SportsSheet,
} from '../__sheets.tsx'
import { ErrorLine, N, Sheet, useWrite } from '../__ui.tsx'
import { type Route } from './+types/om-meg.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const [setup, athlete] = await Promise.all([
		runCapability(request, 'get_setup', {}),
		runCapability(request, 'athlete', {}),
	])
	if (!setup.ok) throw new Response(setup.message, { status: 500 })
	return {
		setup: setup.value as SetupState,
		today: athlete.ok ? athlete.value.today : '',
		hasPlan: athlete.ok ? athlete.value.setup.hasPlan : false,
	}
}

export const meta = () => [{ title: 'Brev · om meg' }]

type Hole =
	| 'sports'
	| 'level'
	| 'hours'
	| 'cap'
	| 'days'
	| 'strength'
	| 'prefs'
	| 'name'
	| 'time'
	| 'place'
	| null

export default function OmMeg({ loaderData }: Route.ComponentProps) {
	const { setup, today, hasPlan } = loaderData
	const a = setup.answers
	const [hole, setHole] = useState<Hole>(null)
	const close = () => setHole(null)
	const [note, setNote] = useState<string | null>(null)
	const sportsW = useWrite('set_sports')
	const levelW = useWrite('set_experience_level')
	const hoursW = useWrite('set_current_volume')
	const capW = useWrite<{ hoursPerWeek: number | null }, SetAvailabilityOutput>(
		'set_availability',
	)
	const daysW = useWrite<{ days: string[] }, SetAvailabilityOutput>(
		'set_availability',
	)
	const strengthW = useWrite('set_strength')
	const prefsW = useWrite('set_session_preferences')
	const nameW = useWrite('set_display_name')
	const prefW = useWrite('set_preferences')

	const sportWords = [
		...(a.sports ?? []).map(
			(s) =>
				setup.choices.sports.find((c) => c.id === s)?.label.toLowerCase() ?? s,
		),
		...(a.otherActivities ?? []).map(
			(s) =>
				setup.choices.otherActivities
					.find((c) => c.id === s)
					?.label.toLowerCase() ?? s,
		),
	]
	const days = a.availability.days
	const blocked = days ? WEEKDAY_ORDER.filter((d) => !days.includes(d)) : null

	// A change to the days touches the plan: it becomes a PS in this week's letter.
	const daysWrite = {
		...daysW,
		call: async (input: { days: string[] }) => {
			const r = await daysW.call(input)
			if (r.ok) {
				setNote(r.value.note)
				if (hasPlan)
					addPs({
						weekKey: mondayOf(today),
						text: `Dagene dine er endret. ${r.value.note}`,
						token: null,
						noUndoBecause: 'sett dagene tilbake i Om meg',
					})
			}
			return r
		},
	}

	return (
		<main className="b-col">
			<Link to={`${BASE}/arkiv`} className="b-back">
				← Arkivet
			</Link>
			<article className="b-sheet">
				<p
					className="b-small"
					style={{
						margin: 0,
						letterSpacing: '.06em',
						textTransform: 'uppercase',
					}}
				>
					Om meg
				</p>
				<h1 className="b-h" style={{ marginTop: 6 }}>
					Introduksjonsbrevet
				</h1>
				<p className="b-small">
					Trykk på det understrekte for å skrive om.{' '}
					{hasPlan
						? 'Endringer som angår planen, gjelder ukene som legges fra nå.'
						: ''}
				</p>
				<p className="b-p">Hei,</p>
				<p className="b-p">
					jeg driver med{' '}
					<HoleBtn
						empty={!sportWords.length}
						onClick={() => setHole('sports')}
						label="Idretter"
					>
						{sportWords.length ? listText(sportWords) : 'velg idrett'}
					</HoleBtn>
					. Jeg er{' '}
					<HoleBtn
						empty={!a.level}
						onClick={() => setHole('level')}
						label="Nivå"
					>
						{a.level ? LEVEL_SHORT[a.level] : 'hvor erfaren'}
					</HoleBtn>
					. Nå trener jeg rundt{' '}
					<HoleBtn
						empty={a.currentHoursPerWeek === null}
						onClick={() => setHole('hours')}
						label="Timer i uka"
					>
						{a.currentHoursPerWeek !== null ? (
							<N>{n1(a.currentHoursPerWeek)}</N>
						) : (
							'hvor mange'
						)}
					</HoleBtn>{' '}
					timer i uka, og har plass til{' '}
					<HoleBtn
						empty={a.availability.hoursPerWeek === null}
						onClick={() => setHole('cap')}
						label="Mest timer i uka"
					>
						{a.availability.hoursPerWeek !== null ? (
							<N>{n1(a.availability.hoursPerWeek)}</N>
						) : (
							'så mye det trengs'
						)}
					</HoleBtn>
					{a.availability.hoursPerWeek !== null ? ' timer på det meste' : ''}.{' '}
					{blocked && blocked.length ? (
						<>
							<HoleBtn
								onClick={() => setHole('days')}
								label="Dager som ikke går"
							>
								{cap(listText(blocked.map((d) => DAY_NAME[d])))}
							</HoleBtn>{' '}
							går ikke.
						</>
					) : (
						<>
							<HoleBtn
								empty={!days}
								onClick={() => setHole('days')}
								label="Dager"
							>
								{days ? 'Alle dager' : 'Hvilke dager'}
							</HoleBtn>{' '}
							går.
						</>
					)}{' '}
					Jeg vil løfte{' '}
					<HoleBtn onClick={() => setHole('strength')} label="Styrke">
						{!a.strengthPerWeek
							? 'ikke'
							: a.strengthPerWeek === 1
								? 'én gang i uka'
								: `${a.strengthPerWeek} ganger i uka`}
					</HoleBtn>
					.
				</p>
				<p className="b-p">
					Helst vil jeg ha{' '}
					<HoleBtn
						empty={!a.sessionPreferences?.length}
						onClick={() => setHole('prefs')}
						label="Hva du liker"
					>
						{a.sessionPreferences?.length
							? listText(a.sessionPreferences.map((p) => PREF_SHORT[p] ?? p))
							: 'det du synes passer'}
					</HoleBtn>
					. Jeg trener helst klokka{' '}
					<HoleBtn
						empty={!a.defaultTrainingTime}
						onClick={() => setHole('time')}
						label="Klokkeslett"
					>
						{a.defaultTrainingTime ?? '07:00'}
					</HoleBtn>
					{a.homePlace ? (
						<>
							, fra{' '}
							<HoleBtn onClick={() => setHole('place')} label="Sted">
								{a.homePlace.name}
							</HoleBtn>
						</>
					) : (
						<>
							. Været kan jeg ta med når du sier{' '}
							<HoleBtn empty onClick={() => setHole('place')} label="Sted">
								hvor du trener fra
							</HoleBtn>
						</>
					)}
					.
				</p>
				<p className="b-p" style={{ marginBottom: 0 }}>
					Hilsen{' '}
					<HoleBtn
						empty={!a.displayName}
						onClick={() => setHole('name')}
						label="Navn"
					>
						{a.displayName || a.username}
					</HoleBtn>
				</p>
				{note ? (
					<p className="b-margin b-fade-in" aria-live="polite">
						{note}
					</p>
				) : null}
				<ErrorLine message={prefW.error ?? capW.error} />
			</article>

			<SportsSheet
				open={hole === 'sports'}
				onClose={close}
				setup={setup}
				write={sportsW}
			/>
			<Sheet
				open={hole === 'level'}
				onClose={close}
				title="Hvor lenge har du trent?"
			>
				<ul className="b-menu">
					{setup.choices.levels.map((l) => {
						const [title, rest] = l.label.split(':')
						return (
							<li key={l.id}>
								<button
									type="button"
									className="b-choice"
									aria-pressed={a.level === l.id}
									disabled={levelW.pending}
									onClick={async () => {
										const r = await levelW.call({
											level: l.id as ExperienceLevel,
										})
										if (r.ok) close()
									}}
								>
									<span>
										<strong style={{ fontWeight: 600 }}>{title}</strong>
										<span className="b-small" style={{ display: 'block' }}>
											{rest?.trim()}
										</span>
									</span>
									<span className="b-check">✓</span>
								</button>
							</li>
						)
					})}
				</ul>
				<ErrorLine message={levelW.error} />
			</Sheet>
			<HoursSheet
				open={hole === 'hours'}
				onClose={close}
				initial={a.currentHoursPerWeek ?? 4}
				range={setup.choices.hoursPerWeek}
				write={hoursW}
				historyNote={setup.fromHistory.note}
			/>
			<CapSheet
				open={hole === 'cap'}
				onClose={close}
				initial={a.availability.hoursPerWeek}
				write={capW}
			/>
			<DaysSheet
				open={hole === 'days'}
				onClose={close}
				initial={days ?? [...WEEKDAY_ORDER]}
				write={daysWrite as unknown as Parameters<typeof DaysSheet>[0]['write']}
			/>
			<Sheet
				open={hole === 'strength'}
				onClose={close}
				title="Hvor ofte vil du løfte?"
			>
				<ul className="b-menu">
					{setup.choices.strengthPerWeek.map((n) => (
						<li key={n}>
							<button
								type="button"
								className="b-choice"
								aria-pressed={(a.strengthPerWeek ?? 0) === n}
								disabled={strengthW.pending}
								onClick={async () => {
									const r = await strengthW.call({ perWeek: n })
									if (r.ok) close()
								}}
							>
								<span>
									{n === 0
										? 'Ikke i planen'
										: n === 1
											? 'Én gang i uka'
											: `${n} ganger i uka`}
								</span>
								<span className="b-check">✓</span>
							</button>
						</li>
					))}
				</ul>
				<ErrorLine message={strengthW.error} />
			</Sheet>
			<PrefsSheet
				open={hole === 'prefs'}
				onClose={close}
				setup={setup}
				write={prefsW}
			/>
			<NameSheet
				open={hole === 'name'}
				onClose={close}
				initial={a.displayName ?? ''}
				write={nameW}
			/>
			<TimeSheet
				open={hole === 'time'}
				onClose={close}
				initial={a.defaultTrainingTime}
				write={prefW}
			/>
			<PlaceSheet
				open={hole === 'place'}
				onClose={close}
				current={a.homePlace}
			/>
		</main>
	)
}

function CapSheet({
	open,
	onClose,
	initial,
	write,
}: {
	open: boolean
	onClose: () => void
	initial: number | null
	write: ReturnType<
		typeof useWrite<{ hoursPerWeek: number | null }, SetAvailabilityOutput>
	>
}) {
	const [v, setV] = useState(initial ?? 6)
	return (
		<Sheet open={open} onClose={onClose} title="Hvor mye har du plass til?">
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
					onClick={() => setV((x) => Math.max(1, x - 0.5))}
					style={{ width: 56, padding: 0, fontSize: 24 }}
				>
					−
				</button>
				<output
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
					onClick={() => setV((x) => Math.min(20, x + 0.5))}
					style={{ width: 56, padding: 0, fontSize: 24 }}
				>
					+
				</button>
			</div>
			<p className="b-small" style={{ textAlign: 'center' }}>
				timer i uka på det meste
			</p>
			<div className="b-row">
				<button
					type="button"
					className="b-btn"
					disabled={write.pending}
					onClick={async () => {
						const r = await write.call({ hoursPerWeek: v })
						if (r.ok) onClose()
					}}
				>
					Skriv det inn
				</button>
				<button
					type="button"
					className="b-btn b-btn-ghost"
					disabled={write.pending}
					onClick={async () => {
						const r = await write.call({ hoursPerWeek: null })
						if (r.ok) onClose()
					}}
				>
					Ingen grense
				</button>
			</div>
			<ErrorLine message={write.error} />
		</Sheet>
	)
}

function TimeSheet({
	open,
	onClose,
	initial,
	write,
}: {
	open: boolean
	onClose: () => void
	initial: string | null
	write: ReturnType<typeof useWrite>
}) {
	const [v, setV] = useState(initial ?? '07:00')
	return (
		<Sheet open={open} onClose={onClose} title="Når trener du helst?">
			<form
				onSubmit={async (e) => {
					e.preventDefault()
					const r = await write.call({ defaultTrainingTime: v })
					if (r.ok) onClose()
				}}
			>
				<label className="b-label" htmlFor="t-time">
					Øktene legges på dette klokkeslettet.
				</label>
				<input
					id="t-time"
					type="time"
					className="b-input"
					value={v}
					onChange={(e) => setV(e.target.value)}
				/>
				<button
					type="submit"
					className="b-btn"
					style={{ width: '100%', marginTop: 12 }}
					disabled={write.pending}
				>
					Skriv det inn
				</button>
				<ErrorLine message={write.error} />
			</form>
		</Sheet>
	)
}

function PlaceSheet({
	open,
	onClose,
	current,
}: {
	open: boolean
	onClose: () => void
	current: HomePlace | null
}) {
	const [text, setText] = useState('')
	const search = useWrite<{ text: string }, SearchPlacesOutput>('search_places')
	const set = useWrite<HomePlace, SetupState>('set_home_place')
	const remove = useWrite<Record<string, never>, SetupState>(
		'remove_home_place',
	)
	const res = search.result?.ok ? search.result.value : null
	return (
		<Sheet open={open} onClose={onClose} title="Hvor trener du fra?">
			<form
				onSubmit={async (e) => {
					e.preventDefault()
					if (text.trim())
						await search.call({ text: text.trim() }, { revalidate: false })
				}}
			>
				<label className="b-label" htmlFor="p-q">
					Bare for været. Et sted i Norge.
				</label>
				<div style={{ display: 'flex', gap: 8 }}>
					<input
						id="p-q"
						className="b-input"
						value={text}
						onChange={(e) => setText(e.target.value)}
						enterKeyHint="search"
						autoComplete="off"
						placeholder="f.eks. Sandvika"
					/>
					<button type="submit" className="b-btn" disabled={search.pending}>
						Søk
					</button>
				</div>
			</form>
			{res?.status === 'unavailable' ? (
				<p className="b-small">{res.why}</p>
			) : null}
			{res?.status === 'found' ? (
				res.places.length ? (
					<ul className="b-menu" style={{ marginTop: 8 }}>
						{res.places.map(({ id, ...place }) => (
							<li key={id}>
								<button
									type="button"
									className="b-choice"
									disabled={set.pending}
									onClick={async () => {
										const r = await set.call(place)
										if (r.ok) onClose()
									}}
								>
									<span>
										{place.name}
										<span className="b-small" style={{ display: 'block' }}>
											{place.kind}, {place.municipality}
										</span>
									</span>
								</button>
							</li>
						))}
					</ul>
				) : (
					<p className="b-small">Fant ingen steder med det navnet.</p>
				)
			) : null}
			{current ? (
				<button
					type="button"
					className="b-word"
					style={{ marginTop: 10 }}
					disabled={remove.pending}
					onClick={async () => {
						const r = await remove.call({})
						if (r.ok) onClose()
					}}
				>
					Fjern {current.name}
				</button>
			) : null}
			<ErrorLine message={search.error ?? set.error ?? remove.error} />
		</Sheet>
	)
}
