import { useEffect, useMemo, useRef, useState } from 'react'
import { useRevalidator, useSearchParams } from 'react-router'
import { uploadToCapability } from '#app/lab/engine/client.ts'
import {
	type AcceptPlanOutput,
	type ConnectOutput,
	type ExperienceLevel,
	type GoalWriteOutput,
	type OtherActivity,
	type PlanPreviewOutput,
	type SetAvailabilityOutput,
	type SetupState,
	type Sport,
	type StartOption,
	type UploadOutput,
	type Weekday,
} from '#app/lab/engine/setup.types.ts'
import { useAsk, useConvo } from './__convo.tsx'
import {
	WEEKDAY_SHORT,
	addDays,
	hoursText,
	joinList,
	minutesText,
	monthYear,
	num1,
	plural,
	shortDate,
} from './__fmt.ts'
import { SeasonCard, planExplain } from './__season.tsx'
import { type Flags, type OnboardingData } from './__types.ts'
import {
	Bubble,
	Chip,
	Chips,
	Mine,
	Turn,
	Typing,
	WeekdayToggles,
	cx,
} from './__ui.tsx'

type StepKey =
	| 'sports'
	| 'level'
	| 'hours'
	| 'daycount'
	| 'days'
	| 'strength'
	| 'connect'
	| 'goal'
	| 'plan'

const LEVEL_WORDS: Record<ExperienceLevel, string> = {
	beginner: 'Nettopp begynt',
	recreational: 'Noen år, på hobbybasis',
	experienced: 'Lenge, og jeg kan treningslære',
	competitive: 'Jeg konkurrerer',
}

const SPORT_WORD: Record<Sport, string> = {
	run: 'løping',
	bike: 'sykkel',
	swim: 'svømming',
}

const SPREAD: Record<number, Weekday[]> = {
	1: ['sat'],
	2: ['tue', 'sat'],
	3: ['tue', 'thu', 'sat'],
	4: ['tue', 'thu', 'sat', 'sun'],
	5: ['mon', 'tue', 'thu', 'sat', 'sun'],
	6: ['mon', 'tue', 'wed', 'thu', 'sat', 'sun'],
	7: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
}

const ALL_DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function writeFlags(flags: Flags) {
	try {
		document.cookie = `prat_onb=${encodeURIComponent(JSON.stringify(flags))}; path=/lab; max-age=31536000; samesite=lax`
	} catch {
		// Cookies blocked: the question just comes back next time.
	}
}

export function Onboarding({ data }: { data: OnboardingData }) {
	const { setup, athlete, flags } = data
	const revalidator = useRevalidator()
	const [editing, setEditing] = useState<StepKey | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [dayCount, setDayCount] = useState<number | null>(null)
	const ask = useAsk()
	const firstActive = useRef<StepKey | null>(null)

	const setFlag = (patch: Partial<Flags>) => {
		writeFlags({ ...flags, ...patch, u: athlete.username })
		void revalidator.revalidate()
	}

	async function write<O>(name: string, input: unknown) {
		setBusy(true)
		setError(null)
		const r = await ask<O>(name, input)
		setBusy(false)
		if (!r.ok) setError(r.message)
		else setEditing(null)
		return r
	}

	if (!setup) {
		return (
			<>
				<Turn who="partner">
					<Bubble>
						Hei. Jeg fikk ikke hentet det du har sagt så langt.{' '}
						{data.setupError ?? ''}
					</Bubble>
					<Chips>
						<Chip primary onClick={() => void revalidator.revalidate()}>
							Prøv igjen
						</Chip>
					</Chips>
				</Turn>
			</>
		)
	}

	const a = setup.answers
	const answered: Record<StepKey, boolean> = {
		sports:
			(a.sports !== null && a.sports.length > 0) ||
			(a.otherActivities?.length ?? 0) > 0,
		level: a.level !== null,
		hours: a.currentHoursPerWeek !== null || !!flags.hoursSkipped,
		daycount: a.availability.days !== null || dayCount !== null,
		days: a.availability.days !== null,
		strength: a.strengthPerWeek !== null || !!flags.strengthAnswered,
		connect: athlete.setup.hasSessionSource || !!flags.connectSkipped,
		goal: athlete.setup.hasGoal || !!flags.goalOpen,
		plan: false,
	}
	const order: StepKey[] = [
		'sports',
		'level',
		'hours',
		'daycount',
		'days',
		'strength',
		'connect',
		'goal',
		'plan',
	]
	const active = order.find((k) => !answered[k]) ?? 'plan'
	if (firstActive.current === null) firstActive.current = active

	const steps: React.ReactNode[] = []
	for (const key of order) {
		const isOpen = key === active || key === editing
		const enter = key !== firstActive.current && key === active
		const props: StepProps = {
			data,
			setup,
			open: isOpen,
			enter,
			busy,
			edit: () => setEditing(key),
			write,
			setFlag,
			dayCount,
			setDayCount,
			editNext: setEditing,
		}
		steps.push(<Step key={key} k={key} {...props} />)
		if (key === active) break
	}

	return (
		<>
			<Turn who="partner">
				<Bubble>
					Hei{athlete.name ? `, ${athlete.name}` : ''}. Jeg skal legge
					treningsplanen din. Først litt om deg.
				</Bubble>
			</Turn>
			{steps}
			{busy ? <Typing /> : null}
			{error ? (
				<Turn who="partner" enter>
					<Bubble>{error}</Bubble>
				</Turn>
			) : null}
		</>
	)
}

type StepProps = {
	data: OnboardingData
	setup: SetupState
	open: boolean
	enter: boolean
	busy: boolean
	edit: () => void
	write: <T>(
		name: string,
		input: unknown,
	) => Promise<{ ok: boolean; value?: T }>
	setFlag: (patch: Partial<Flags>) => void
	dayCount: number | null
	setDayCount: (n: number | null) => void
	editNext: (k: StepKey) => void
}

function Step(p: StepProps & { k: StepKey }) {
	switch (p.k) {
		case 'sports':
			return <SportsStep {...p} />
		case 'level':
			return <LevelStep {...p} />
		case 'hours':
			return <HoursStep {...p} />
		case 'daycount':
			return <DayCountStep {...p} />
		case 'days':
			return <DaysStep {...p} />
		case 'strength':
			return <StrengthStep {...p} />
		case 'connect':
			return <ConnectStep {...p} />
		case 'goal':
			return <GoalStep {...p} />
		case 'plan':
			return <PlanStep {...p} />
	}
}

function Q({
	enter,
	children,
	id,
}: {
	enter: boolean
	children: React.ReactNode
	id?: string
}) {
	return (
		<Turn who="partner" enter={enter} id={id}>
			{children}
		</Turn>
	)
}

// ── 1. sports ───────────────────────────────────────────────────────────────

function SportsStep({ setup, open, enter, busy, edit, write }: StepProps) {
	const a = setup.answers
	const [picked, setPicked] = useState<Sport[]>(a.sports ?? [])
	const [other, setOther] = useState<OtherActivity[]>(a.otherActivities ?? [])
	const sportLabel = (id: Sport) =>
		setup.choices.sports.find((s) => s.id === id)?.label ?? SPORT_WORD[id]
	const otherLabel = (id: OtherActivity) =>
		setup.choices.otherActivities.find((s) => s.id === id)?.label ?? id
	const answer = joinList([
		...(a.sports ?? []).map((s) => sportLabel(s)),
		...(a.otherActivities ?? []).map((s) => otherLabel(s).toLowerCase()),
	])
	return (
		<>
			<Q enter={enter} id="idrett">
				<Bubble>Hva trener du? Velg alt som passer.</Bubble>
				{open ? (
					<>
						<Chips>
							{setup.choices.sports.map((s) => (
								<Chip
									key={s.id}
									pressed={picked.includes(s.id)}
									onClick={() =>
										setPicked((v) =>
											v.includes(s.id)
												? v.filter((x) => x !== s.id)
												: [...v, s.id],
										)
									}
								>
									{s.label}
								</Chip>
							))}
						</Chips>
						<span className="prat-meta">Annet du gjør fast:</span>
						<Chips>
							{setup.choices.otherActivities.map((s) => (
								<Chip
									key={s.id}
									quiet
									pressed={other.includes(s.id)}
									onClick={() =>
										setOther((v) =>
											v.includes(s.id)
												? v.filter((x) => x !== s.id)
												: [...v, s.id],
										)
									}
								>
									{s.label}
								</Chip>
							))}
						</Chips>
						<Chips>
							<Chip
								primary
								busy={busy}
								disabled={!picked.length && !other.length}
								onClick={() =>
									void write('set_sports', {
										sports: picked,
										otherActivities: other,
									})
								}
							>
								Ferdig
							</Chip>
						</Chips>
						{picked.length > 1 ? (
							<span className="prat-meta">
								{sportLabel(picked[0]!)} blir hovedidretten, siden du valgte den
								først.
							</span>
						) : null}
					</>
				) : null}
			</Q>
			{!open && answer ? (
				<Mine onEdit={edit} fly>
					{answer}
				</Mine>
			) : null}
		</>
	)
}

// ── 2. level ────────────────────────────────────────────────────────────────

function LevelStep({ setup, open, enter, busy, edit, write }: StepProps) {
	const level = setup.answers.level
	return (
		<>
			<Q enter={enter}>
				<Bubble>Hvor lenge har du trent jevnt?</Bubble>
				{open ? (
					<Chips>
						{setup.choices.levels.map((l) => (
							<Chip
								key={l.id}
								busy={busy}
								pressed={level === l.id}
								onClick={() =>
									void write('set_experience_level', { level: l.id })
								}
							>
								{LEVEL_WORDS[l.id]}
							</Chip>
						))}
					</Chips>
				) : null}
			</Q>
			{!open && level ? (
				<Mine onEdit={edit} fly>
					{LEVEL_WORDS[level]}
				</Mine>
			) : null}
		</>
	)
}

// ── 3. hours now ────────────────────────────────────────────────────────────

function HoursStep({
	setup,
	data,
	open,
	enter,
	busy,
	edit,
	write,
	setFlag,
}: StepProps) {
	const range = setup.choices.hoursPerWeek
	const hist = setup.fromHistory.hoursPerWeek.value
	const start =
		setup.answers.currentHoursPerWeek ??
		(hist !== null ? Math.round(hist * 2) / 2 : null) ??
		setup.suggested?.currentHoursPerWeek ??
		4
	const [h, setH] = useState(Math.min(range.max, Math.max(range.min, start)))
	const source =
		setup.answers.currentHoursPerWeek !== null
			? null
			: hist !== null
				? `Klokka di sier ${hoursText(hist)} i snitt.`
				: setup.suggested
					? 'Forhåndsvalgt ut fra nivået ditt. Det er et forslag.'
					: null
	const answer =
		setup.answers.currentHoursPerWeek !== null
			? `Omtrent ${hoursText(setup.answers.currentHoursPerWeek)} i uka`
			: data.flags.hoursSkipped
				? 'Vet ikke'
				: null
	return (
		<>
			<Q enter={enter}>
				<Bubble>Hvor mye trener du nå, omtrent?</Bubble>
				{open ? (
					<div className="prat-card" style={{ maxWidth: 420 }}>
						<div
							className="prat-card-row"
							style={{ justifyContent: 'space-between' }}
						>
							<span className="prat-card-sub">Timer i uka</span>
							<b className="num" style={{ fontSize: 22 }}>
								{hoursText(h)}
							</b>
						</div>
						<input
							className="prat-range"
							type="range"
							min={range.min}
							max={range.max}
							step={range.step}
							value={h}
							onChange={(e) => setH(Number(e.target.value))}
							aria-label="Timer i uka"
						/>
						{source ? <span className="prat-note">{source}</span> : null}
						<Chips>
							<Chip
								primary
								busy={busy}
								onClick={() => {
									void write('set_current_volume', { hoursPerWeek: h }).then(
										(r) => {
											if (r.ok && data.flags.hoursSkipped)
												setFlag({ hoursSkipped: false })
										},
									)
								}}
							>
								Ca. {hoursText(h)}
							</Chip>
							<Chip quiet onClick={() => setFlag({ hoursSkipped: true })}>
								Vet ikke
							</Chip>
						</Chips>
					</div>
				) : null}
			</Q>
			{!open && answer ? (
				<Mine onEdit={edit} fly>
					{answer}
				</Mine>
			) : null}
			{!open &&
			data.flags.hoursSkipped &&
			setup.answers.currentHoursPerWeek === null ? (
				<Turn who="partner">
					<Bubble>
						Greit. Da bruker jeg klokka di eller nivået ditt, og sier fra når
						jeg gjør det.
					</Bubble>
				</Turn>
			) : null}
		</>
	)
}

// ── 4. how many days, then which ────────────────────────────────────────────

function DayCountStep({
	setup,
	open,
	enter,
	edit,
	editNext,
	dayCount,
	setDayCount,
}: StepProps) {
	const days = setup.answers.availability.days
	const shown = dayCount ?? days?.length ?? null
	return (
		<>
			<Q enter={enter}>
				<Bubble>Hvor mange dager i uka kan du trene?</Bubble>
				{open ? (
					<Chips>
						{[1, 2, 3, 4, 5, 6, 7].map((n) => (
							<Chip
								key={n}
								pressed={shown === n}
								onClick={() => {
									setDayCount(n)
									if (open && setup.answers.availability.days) editNext('days')
								}}
							>
								<span className="num">{n}</span>
							</Chip>
						))}
					</Chips>
				) : null}
			</Q>
			{!open && shown !== null ? (
				<Mine onEdit={edit} fly>
					{plural(shown, 'dag', 'dager')}
				</Mine>
			) : null}
		</>
	)
}

function DaysStep({
	setup,
	open,
	enter,
	busy,
	edit,
	write,
	dayCount,
	setDayCount,
}: StepProps) {
	const days = setup.answers.availability.days
	const count = dayCount ?? days?.length ?? 4
	const suggestion =
		setup.suggested?.days.length === count
			? setup.suggested.days
			: SPREAD[count]
	const fromHistory =
		setup.fromHistory.days?.length === count ? setup.fromHistory.days : null
	const [picked, setPicked] = useState<Weekday[]>(
		days ?? fromHistory ?? suggestion ?? [],
	)
	useEffect(() => {
		if (!days) setPicked(fromHistory ?? suggestion ?? [])
		// Re-pick when the count changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [count])
	const blocked = ALL_DAYS.filter((d) => !(days ?? []).includes(d))
	const answer = days
		? blocked.length === 0
			? 'Alle dager går'
			: `${joinList(days.map((d) => WEEKDAY_SHORT[d]))}. Ikke ${joinList(blocked.map((d) => WEEKDAY_SHORT[d]))}.`
		: null
	return (
		<>
			<Q enter={enter}>
				<Bubble>
					{count === 7
						? 'Alle dager, altså. Trykk bort en dag om den likevel ikke går.'
						: `Hvilke ${count === 1 ? 'dag' : `${count} dager`}? Jeg har foreslått noen. Trykk bort dager som ikke går.`}
				</Bubble>
				{open ? (
					<div className="prat-card">
						<WeekdayToggles value={picked} onChange={setPicked} />
						{picked.length !== count ? (
							<span className="prat-note">
								Du har valgt {plural(picked.length, 'dag', 'dager')}. Det er
								greit: jeg bruker dagene du velger.
							</span>
						) : null}
						<Chips>
							<Chip
								primary
								busy={busy}
								disabled={!picked.length}
								onClick={() => {
									void write<SetAvailabilityOutput>('set_availability', {
										days: picked,
									}).then((r) => {
										if (r.ok) setDayCount(null)
									})
								}}
							>
								Ferdig
							</Chip>
						</Chips>
					</div>
				) : null}
			</Q>
			{!open && answer ? (
				<Mine onEdit={edit} fly>
					{answer}
				</Mine>
			) : null}
		</>
	)
}

// ── 5. strength ─────────────────────────────────────────────────────────────

function StrengthStep({
	setup,
	data,
	open,
	enter,
	busy,
	edit,
	write,
	setFlag,
}: StepProps) {
	const per = setup.answers.strengthPerWeek
	const answered = per !== null || data.flags.strengthAnswered
	const choose = (n: 0 | 1 | 2 | 3) => {
		void write('set_strength', { perWeek: n }).then((r) => {
			if (r.ok) setFlag({ strengthAnswered: true })
		})
	}
	return (
		<>
			<Q enter={enter}>
				<Bubble>Vil du løfte? Styrke holder deg hel.</Bubble>
				{open ? (
					<Chips>
						<Chip
							busy={busy}
							pressed={answered && per === null}
							onClick={() => choose(0)}
						>
							Nei
						</Chip>
						{([1, 2, 3] as const).map((n) => (
							<Chip
								key={n}
								busy={busy}
								pressed={per === n}
								onClick={() => choose(n)}
							>
								{n === 1 ? '1 gang' : `${n} ganger`} i uka
							</Chip>
						))}
					</Chips>
				) : null}
			</Q>
			{!open && answered ? (
				<Mine onEdit={edit} fly>
					{per === null
						? 'Nei'
						: `${per === 1 ? '1 gang' : `${per} ganger`} i uka`}
				</Mine>
			) : null}
		</>
	)
}

// ── 6. the watch ────────────────────────────────────────────────────────────

function ConnectStep({ data, open, enter, edit, setFlag }: StepProps) {
	const revalidator = useRevalidator()
	const [mode, setMode] = useState<'intervals' | 'polar' | 'file' | null>(null)
	const st = data.importStatus
	const connected = data.athlete.setup.hasSessionSource
	const importing = !!st?.importing
	const intervals = data.connections?.sources.find(
		(s) => s.id === 'intervalsicu',
	)
	const polar = data.connections?.sources.find((s) => s.id === 'polar')

	// Poll while history is still coming in.
	useEffect(() => {
		if (!importing) return
		const t = window.setInterval(() => void revalidator.revalidate(), 3000)
		return () => window.clearInterval(t)
	}, [importing, revalidator])

	const myAnswer = connected
		? intervals?.state && intervals.state !== 'not-connected'
			? 'Intervals.icu'
			: 'Jeg lastet opp filer'
		: data.flags.connectSkipped
			? 'Ikke nå'
			: null

	return (
		<>
			<Q enter={enter}>
				<Bubble>
					Har klokka di en tjeneste den synker til? Da henter jeg øktene dine
					selv.
				</Bubble>
				{open ? (
					<>
						<Chips>
							<Chip
								pressed={mode === 'intervals'}
								onClick={() => setMode('intervals')}
							>
								Intervals.icu
							</Chip>
							<Chip pressed={mode === 'polar'} onClick={() => setMode('polar')}>
								Polar
							</Chip>
							<Chip pressed={mode === 'file'} onClick={() => setMode('file')}>
								Jeg laster opp en fil
							</Chip>
							<Chip quiet onClick={() => setFlag({ connectSkipped: true })}>
								Ikke nå
							</Chip>
						</Chips>
						{mode === 'intervals' ? <IntervalsCard /> : null}
						{mode === 'polar' ? (
							<Bubble>
								{polar?.why ??
									'Polar kan ikke kobles direkte herfra ennå. Koble Polar til Intervals.icu, eller last opp filer.'}
							</Bubble>
						) : null}
						{mode === 'file' ? <UploadCard /> : null}
					</>
				) : null}
			</Q>
			{!open && myAnswer ? (
				<Mine onEdit={edit} fly>
					{myAnswer}
				</Mine>
			) : null}
			{!open && connected ? <HistoryNews data={data} /> : null}
			{!open && !connected && data.flags.connectSkipped ? (
				<Turn who="partner">
					<Bubble>
						Da starter vi uten historikk. Jeg blir mer presis etter hvert. Skriv
						«koblinger» når du vil koble til.
					</Bubble>
				</Turn>
			) : null}
		</>
	)
}

function HistoryNews({ data }: { data: OnboardingData }) {
	const st = data.importStatus
	if (!st) return null
	const total = st.recordings.total
	if (st.importing)
		return (
			<Turn who="partner" enter>
				<Bubble>
					Henter historikken … <b className="num">{total}</b> av ukjent antall
					økter så langt.
				</Bubble>
			</Turn>
		)
	const h = st.history.hoursPerWeek
	return (
		<Turn who="partner" enter>
			<Bubble>
				{total === 0 ? (
					'Ferdig, men jeg fant ingen økter ennå. Jeg blir mer presis etter hvert.'
				) : (
					<>
						Ferdig. <b className="num">{total}</b>{' '}
						{total === 1 ? 'økt' : 'økter'}
						{st.recordings.earliest
							? `, den eldste fra ${monthYear(st.recordings.earliest)}`
							: ''}
						.{' '}
						{h.value !== null ? (
							<>
								Du har trent snitt <b className="num">{hoursText(h.value)}</b> i
								uka de siste fire ukene.
							</>
						) : (
							(h.why ?? 'Hvor mye du trener i uka vet jeg ikke ennå.')
						)}
					</>
				)}
			</Bubble>
		</Turn>
	)
}

export function IntervalsCard({ onDone }: { onDone?: (ok: boolean) => void }) {
	const [key, setKey] = useState('')
	const [msg, setMsg] = useState<string | null>(null)
	const ask = useAsk()
	const [busy, setBusy] = useState(false)
	return (
		<form
			className="prat-card"
			onSubmit={(e) => {
				e.preventDefault()
				setBusy(true)
				setMsg(null)
				void ask<ConnectOutput>('connect_intervals_icu', {
					apiKey: key.trim(),
				}).then((r) => {
					setBusy(false)
					if (!r.ok) setMsg(r.message)
					onDone?.(r.ok)
				})
			}}
		>
			<label className="prat-field">
				<span>
					API-nøkkel fra intervals.icu → Settings → Developer Settings. Jeg
					bruker den bare til å hente øktene dine.
				</span>
				<input
					className="prat-input"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					autoComplete="off"
					autoCapitalize="off"
					spellCheck={false}
					placeholder="Lim inn nøkkelen"
					aria-invalid={!!msg}
				/>
			</label>
			{msg ? <span className="prat-err">{msg}</span> : null}
			<Chips>
				<button
					type="submit"
					className={cx('prat-chip', 'primary', busy && 'busy')}
					disabled={busy || !key.trim()}
				>
					<span>{busy ? 'Kobler til …' : 'Koble til'}</span>
				</button>
			</Chips>
		</form>
	)
}

export function UploadCard({
	onDone,
}: {
	onDone?: (r: UploadOutput | null) => void
}) {
	const revalidator = useRevalidator()
	const [busy, setBusy] = useState(false)
	const [result, setResult] = useState<UploadOutput | null>(null)
	const [msg, setMsg] = useState<string | null>(null)
	return (
		<div className="prat-card">
			<span className="prat-note">
				.fit, .tcx, .gpx eller en .zip (for eksempel en Strava-eksport). Opptil
				20 filer om gangen.
			</span>
			<label
				className={cx('prat-chip', 'primary', busy && 'busy')}
				style={{ alignSelf: 'flex-start' }}
			>
				<span>{busy ? 'Laster opp …' : 'Velg filer'}</span>
				<input
					type="file"
					multiple
					accept=".fit,.tcx,.gpx,.zip,.gz"
					className="sr"
					disabled={busy}
					onChange={(e) => {
						const files = Array.from(e.target.files ?? [])
						if (!files.length) return
						const form = new FormData()
						for (const f of files) form.append('file', f)
						setBusy(true)
						setMsg(null)
						void uploadToCapability<UploadOutput>('upload_activity_files', form)
							.then((r) => {
								setBusy(false)
								if (r.ok) {
									setResult(r.value)
									onDone?.(r.value)
									void revalidator.revalidate()
								} else {
									setMsg(r.message)
									onDone?.(null)
								}
							})
							.catch(() => {
								setBusy(false)
								setMsg('Fikk ikke kontakt. Prøv igjen.')
							})
					}}
				/>
			</label>
			{msg ? <span className="prat-err">{msg}</span> : null}
			{result ? (
				<span className="prat-note">
					{plural(result.imported, 'økt', 'økter')} lagt inn
					{result.duplicates ? `, ${result.duplicates} fantes fra før` : ''}.
					{result.failed.map((f) => ` ${f.file}: ${f.reason}`).join('')}
				</span>
			) : null}
		</div>
	)
}

// ── 7. goal ─────────────────────────────────────────────────────────────────

const DISTANCES: Record<Sport, { km: number; label: string }[]> = {
	run: [
		{ km: 5, label: '5 km' },
		{ km: 10, label: '10 km' },
		{ km: 21.0975, label: 'Halvmaraton' },
		{ km: 42.195, label: 'Maraton' },
	],
	bike: [
		{ km: 50, label: '50 km' },
		{ km: 100, label: '100 km' },
		{ km: 160, label: '160 km' },
	],
	swim: [
		{ km: 1, label: '1 km' },
		{ km: 1.5, label: '1,5 km' },
		{ km: 3, label: '3 km' },
	],
}

function GoalStep({
	data,
	setup,
	open,
	enter,
	busy,
	edit,
	write,
	setFlag,
}: StepProps) {
	const [form, setForm] = useState(false)
	const goal = data.goal?.goal ?? null
	const answer = goal
		? `${goal.name}, ${shortDate(goal.date)}`
		: data.flags.goalOpen
			? 'Bare bli i bedre form'
			: null
	return (
		<>
			<Q enter={enter}>
				<Bubble>Har du et løp eller ritt du sikter mot?</Bubble>
				{open ? (
					<>
						<Chips>
							<Chip pressed={form} onClick={() => setForm(true)}>
								Ja
							</Chip>
							<Chip
								busy={busy}
								onClick={() => {
									if (goal) {
										void write('remove_goal', {}).then((r) => {
											if (r.ok) setFlag({ goalOpen: true })
										})
										return
									}
									void write('set_goal', { kind: 'open-ended' }).then(() =>
										setFlag({ goalOpen: true }),
									)
								}}
							>
								Bare bli i bedre form
							</Chip>
						</Chips>
						{form ? (
							<GoalForm
								sports={(setup.answers.sports ?? ['run']) as Sport[]}
								today={data.athlete.today}
								busy={busy}
								onSubmit={(input) =>
									void write<GoalWriteOutput>(
										goal ? 'update_goal' : 'set_goal',
										goal ? input : { kind: 'event', ...input },
									).then((r) => {
										if (r.ok && data.flags.goalOpen)
											setFlag({ goalOpen: false })
									})
								}
								initial={goal}
							/>
						) : null}
					</>
				) : null}
			</Q>
			{!open && answer ? (
				<Mine onEdit={edit} fly>
					{answer}
				</Mine>
			) : null}
			{!open && goal ? <GoalReaction data={data} /> : null}
			{!open && !goal && data.flags.goalOpen ? (
				<Turn who="partner">
					<Bubble>
						Da legger jeg en plan uten dato, en blokk om gangen. Sier du et løp
						senere, legger jeg om mot det.
					</Bubble>
				</Turn>
			) : null}
		</>
	)
}

function GoalReaction({ data }: { data: OnboardingData }) {
	const goal = data.goal?.goal
	if (!goal) return null
	const weeks = Math.floor(goal.daysLeft / 7)
	const problem =
		data.preview?.towardGoal?.problem ?? data.goal?.problem ?? null
	const distance = goal.distanceKm
		? (DISTANCES.run.find((d) => Math.abs(d.km - (goal.distanceKm ?? 0)) < 0.2)
				?.label ?? `${num1(goal.distanceKm)} km`)
		: null
	return (
		<Turn who="partner" enter>
			<Bubble>
				{goal.daysLeft < 14 ? (
					<>
						<b className="num">{plural(goal.daysLeft, 'dag', 'dager')}</b> til.
					</>
				) : (
					<>
						<b className="num">{weeks} uker</b> til
						{distance
							? ` ${distance.toLowerCase().startsWith('halv') || distance.toLowerCase().startsWith('mara') ? distance.toLowerCase() : distance}`
							: ''}
						.
					</>
				)}{' '}
				{problem ?? 'Planen legges frem mot den dagen.'}
			</Bubble>
			{goal.targetTime ? (
				<Bubble>
					Om <b className="num">{goal.targetTime.text}</b> er realistisk vet jeg
					ikke ennå. Jeg sier ifra når jeg har seks uker med trening å gå på.
				</Bubble>
			) : null}
		</Turn>
	)
}

export function GoalForm({
	sports,
	today,
	busy,
	onSubmit,
	initial,
}: {
	sports: Sport[]
	today: string
	busy: boolean
	onSubmit: (input: {
		name: string
		date: string
		sport: Sport
		distanceKm?: number
		targetTime?: string
	}) => void
	initial?: {
		name: string
		date: string
		sports: string[]
		distanceKm: number | null
		targetTime: { text: string } | null
	} | null
}) {
	const firstSport = (initial?.sports.find((s) =>
		sports.includes(s as Sport),
	) ??
		sports[0] ??
		'run') as Sport
	const [name, setName] = useState(initial?.name ?? '')
	const [date, setDate] = useState(initial?.date ?? '')
	const [sport, setSport] = useState<Sport>(firstSport)
	const [distance, setDistance] = useState<string>(
		initial?.distanceKm ? String(initial.distanceKm).replace('.', ',') : '',
	)
	const [time, setTime] = useState(initial?.targetTime?.text ?? '')
	const km = Number(distance.replace(',', '.'))
	return (
		<form
			className="prat-card"
			onSubmit={(e) => {
				e.preventDefault()
				onSubmit({
					name: name.trim(),
					date,
					sport,
					...(distance && km > 0 ? { distanceKm: km } : {}),
					...(time.trim() ? { targetTime: time.trim() } : {}),
				})
			}}
		>
			<label className="prat-field">
				<span>Navn</span>
				<input
					className="prat-input"
					value={name}
					maxLength={80}
					onChange={(e) => setName(e.target.value)}
					placeholder="Bergen halvmaraton"
					required
				/>
			</label>
			<label className="prat-field">
				<span>Dato</span>
				<input
					className="prat-input"
					type="date"
					min={addDays(today, 1)}
					value={date}
					onChange={(e) => setDate(e.target.value)}
					required
				/>
			</label>
			{sports.length > 1 ? (
				<div className="prat-field">
					<span>Idrett</span>
					<Chips>
						{sports.map((s) => (
							<Chip key={s} pressed={sport === s} onClick={() => setSport(s)}>
								{SPORT_WORD[s].charAt(0).toUpperCase() + SPORT_WORD[s].slice(1)}
							</Chip>
						))}
					</Chips>
				</div>
			) : null}
			<div className="prat-field">
				<span>Distanse</span>
				<Chips>
					{DISTANCES[sport].map((d) => (
						<Chip
							key={d.label}
							quiet
							pressed={Math.abs(km - d.km) < 0.01}
							onClick={() => setDistance(String(d.km).replace('.', ','))}
						>
							{d.label}
						</Chip>
					))}
				</Chips>
				<input
					className="prat-input"
					inputMode="decimal"
					value={distance}
					onChange={(e) => setDistance(e.target.value)}
					placeholder="Eller skriv km"
					aria-label="Distanse i km"
				/>
			</div>
			<label className="prat-field">
				<span>Måltid (valgfritt), som 1:45:00</span>
				<input
					className="prat-input"
					value={time}
					inputMode="numeric"
					onChange={(e) => setTime(e.target.value)}
					placeholder="t:mm:ss"
				/>
			</label>
			<Chips>
				<button
					type="submit"
					className={cx('prat-chip', 'primary', busy && 'busy')}
					disabled={busy || !name.trim() || !date}
				>
					<span>Lagre målet</span>
				</button>
			</Chips>
		</form>
	)
}

// ── 8. the plan ─────────────────────────────────────────────────────────────

type Round = {
	choice: string
	reply: string
	preview: PlanPreviewOutput
	option: StartOption | null
	prev: PlanPreviewOutput | null
}

function PlanStep({ data, setup, enter }: StepProps) {
	const [, setParams] = useSearchParams()
	const ask = useAsk()
	const { push } = useConvo()
	const [showWeeks, setShowWeeks] = useState(false)
	const [busy, setBusy] = useState<string | null>(null)
	const [msg, setMsg] = useState<string | null>(null)
	const [rounds, setRounds] = useState<Round[]>([])
	const waiting = useRef<{ choice: string; reply: string } | null>(null)
	const base = useRef<{
		preview: PlanPreviewOutput
		option: StartOption | null
	} | null>(null)

	const { options, preview } = data
	const option = useMemo(
		() => options?.options.find((o) => o.style === preview?.style) ?? null,
		[options, preview],
	)
	if (preview && !base.current) base.current = { preview, option }

	// When a new preview arrives after a choice, it becomes a new round.
	useEffect(() => {
		if (!preview || !waiting.current) return
		const w = waiting.current
		waiting.current = null
		setRounds((r) => [
			...r,
			{
				...w,
				preview,
				option,
				prev: r.length
					? r[r.length - 1]!.preview
					: (base.current?.preview ?? null),
			},
		])
	}, [preview, option])

	if (data.optionsError || !options) {
		return (
			<Q enter={enter}>
				<Bubble>
					{data.optionsError?.message ??
						'Jeg fikk ikke laget forslag akkurat nå. Prøv igjen om litt.'}
				</Bubble>
			</Q>
		)
	}
	if (!preview || !base.current) {
		return (
			<Q enter={enter}>
				<Bubble>{data.previewError ?? 'Jeg fikk ikke vist forslaget.'}</Bubble>
			</Q>
		)
	}

	const hoursNow =
		setup.answers.currentHoursPerWeek ??
		(options.assumed.find((x) => x.question === 'currentHoursPerWeek')
			?.value as number | undefined) ??
		setup.suggested?.currentHoursPerWeek ??
		null

	const adjust = async (dir: -1 | 1, choice: string) => {
		if (hoursNow === null) return
		const range = setup.choices.hoursPerWeek
		const next = Math.min(range.max, Math.max(range.min, hoursNow + dir))
		if (next === hoursNow) {
			setMsg(
				dir < 0
					? 'Lavere enn dette går jeg ikke. Vil du ha færre dager, si «tilgjengelighet».'
					: 'Høyere enn dette legger jeg ikke opp til.',
			)
			return
		}
		setBusy(choice)
		setMsg(null)
		waiting.current = {
			choice,
			reply: `Ok. Jeg går ut fra ${hoursText(next)} i uka i stedet for ${hoursText(hoursNow)}.`,
		}
		const r = await ask('set_current_volume', { hoursPerWeek: next })
		setBusy(null)
		if (!r.ok) {
			waiting.current = null
			setMsg(r.message)
		}
	}

	const otherStyle = () => {
		const list = options.options
		const i = list.findIndex((o) => o.style === preview.style)
		const next = list[(i + 1) % list.length]
		if (!next || next.style === preview.style) return
		waiting.current = {
			choice: 'Vis et annet forslag',
			reply: `Her er et annet: «${next.name}».`,
		}
		setParams(
			(p) => {
				p.set('stil', next.style)
				return p
			},
			{ preventScrollReset: true, replace: true },
		)
	}

	const accept = async () => {
		setBusy('accept')
		setMsg(null)
		const r = await ask<AcceptPlanOutput>('accept_plan', {
			style: preview.style,
		})
		setBusy(null)
		if (!r.ok) {
			setMsg(r.message)
			return
		}
		push(
			<Turn who="partner" enter>
				<Bubble>
					Planen er lagt. <b className="num">{r.value.sessionsLaid}</b> økter
					ligger klare de neste to ukene, og jeg legger hver ny uke ut fra
					hvordan den forrige gikk.
				</Bubble>
				{r.value.goalProblem ? <Bubble>{r.value.goalProblem}</Bubble> : null}
				<Bubble>
					Skriv «flytt», «bytt» eller «hopp over» når livet skjer, eller trykk
					på en økt.
				</Bubble>
			</Turn>,
		)
	}

	const last = rounds.length ? rounds[rounds.length - 1]! : null

	const assumed = options.assumed.map((x) =>
		x.question === 'currentHoursPerWeek'
			? `${hoursText(x.value as number)} i uka (fra ${x.from === 'history' ? 'klokka di' : 'nivået ditt'})`
			: `${joinList((x.value as Weekday[]).map((d) => WEEKDAY_SHORT[d]))} (fra ${x.from === 'history' ? 'klokka di' : 'nivået ditt'})`,
	)

	const ex = planExplain(base.current.preview, base.current.option)

	return (
		<>
			<Q enter={enter} id="forslag">
				<Bubble>Her er forslaget mitt.</Bubble>
				{assumed.length ? (
					<Bubble>
						Du sa ikke alt, så jeg har gått ut fra {joinList(assumed)}. Si fra
						om det er feil.
					</Bubble>
				) : null}
				<SeasonCard
					preview={base.current.preview}
					option={base.current.option}
					showWeeks={showWeeks && !last}
				/>
				{ex.map((line, i) => (
					<Bubble key={i}>{line}</Bubble>
				))}
				{[...options.notes, ...base.current.preview.notes].length ? (
					<span className="prat-meta">
						{[...options.notes, ...base.current.preview.notes].join(' ')}
					</span>
				) : null}
			</Q>
			{rounds.map((r, i) => (
				<RoundView
					key={i}
					round={r}
					showWeeks={showWeeks && i === rounds.length - 1}
				/>
			))}
			<Turn who="partner">
				<span className="prat-meta">
					Når du sier ja, legger jeg de to første ukene i kalenderen. Det kan
					ikke angres, men alt kan endres etterpå.
				</span>
				<Chips>
					<Chip primary busy={busy === 'accept'} onClick={() => void accept()}>
						Ser bra ut
					</Chip>
					{hoursNow !== null ? (
						<>
							<Chip
								busy={busy === 'For mye'}
								onClick={() => void adjust(-1, 'For mye')}
							>
								For mye
							</Chip>
							<Chip
								busy={busy === 'For lite'}
								onClick={() => void adjust(1, 'For lite')}
							>
								For lite
							</Chip>
						</>
					) : null}
					{options.options.length > 1 ? (
						<Chip onClick={otherStyle}>Annet forslag</Chip>
					) : null}
					<Chip
						quiet
						pressed={showWeeks}
						onClick={() => setShowWeeks((v) => !v)}
					>
						{showWeeks ? 'Skjul ukene' : 'Vis uke for uke'}
					</Chip>
					<Chip
						quiet
						onClick={() =>
							setMsg(
								'Langturen flytter du når planen er lagt: trykk på den og velg «Flytt», så husker jeg det.',
							)
						}
					>
						Flytt langturen
					</Chip>
				</Chips>
			</Turn>
			{msg ? (
				<Turn who="partner" enter>
					<Bubble>{msg}</Bubble>
				</Turn>
			) : null}
		</>
	)
}

function RoundView({ round, showWeeks }: { round: Round; showWeeks: boolean }) {
	const before = round.prev?.weeks[0]?.totals.minutes ?? null
	const after = round.preview.weeks[0]?.totals.minutes ?? null
	return (
		<>
			<Mine fly>{round.choice}</Mine>
			<Turn who="partner" enter>
				<Bubble>
					{round.reply}
					{before !== null && after !== null && before !== after ? (
						<>
							{' '}
							Uke 1 går fra <b className="num">
								{minutesText(before)}
							</b> til <b className="num">{minutesText(after)}</b>.
						</>
					) : before !== null && after === before ? (
						' Uke 1 ble den samme.'
					) : null}
				</Bubble>
				<SeasonCard
					preview={round.preview}
					option={round.option}
					compareTo={round.prev}
					showWeeks={showWeeks}
				/>
			</Turn>
		</>
	)
}
