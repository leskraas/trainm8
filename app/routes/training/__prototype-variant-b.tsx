/**
 * PROTOTYPE — variant B, "One thing at a time".
 *
 * Thesis: the journey is three decisions, so it is three screens, and each one
 * owns the whole viewport. A step is a short question in big type, the answers
 * as thumb-sized targets, and nothing else — no helper paragraph, no derivation
 * sentence, no ADR justification. Every step here is under twelve words of
 * chrome; the rest of the pixels are the athlete's own numbers.
 *
 * The Season Anchor step is the load-bearing one: the number arrives pre-filled
 * from the last four weeks of history, wearing `≈`, so confirming is a single
 * tap and inventing a number is the unusual path, not the default one.
 *
 * THROWAWAY — do not ship. Delete with the /training/plan/prototype route.
 */
import { useMemo, useState } from 'react'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	buildSeason,
	DEFAULT_PRESET_KEY,
	describeLevel,
	INTENTS,
	orderTracks,
	tracksFor,
	type Currency,
	type Discipline,
	type Intent,
	type PrototypeEvent,
	type VariantProps,
	type Week,
	type WeekRole,
} from './__prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

/** The Volume Currency, as an athlete reads it. */
const CURRENCY_UNIT: Record<Currency, string> = {
	km: 'km/wk',
	hours: 'h/wk',
	tss: 'TSS/wk',
}

/** Sport register — configuring a Training Track, so "Bike", never "Ride". */
const DISCIPLINE: Record<Discipline, string> = {
	run: 'Run',
	bike: 'Bike',
	swim: 'Swim',
}

/** The shape that fits the athlete's intent — so step 2 is not a dead end. */
const PRESET_FOR_INTENT: Record<Intent, string> = {
	'first-season': 'gentle-ramp',
	'returning-from-injury': 'back-from-injury',
	'deliberately-building': DEFAULT_PRESET_KEY,
}

/** One stepper tap should feel like a real change in that currency. */
const STEP: Record<Currency, number> = { km: 1, hours: 0.5, tss: 5 }

function round1(n: number): number {
	return Math.round(n * 10) / 10
}

/* -------------------------------------------------------------------------- */
/* Week Role colours                                                           */
/* -------------------------------------------------------------------------- */

const ROLE_BAR: Record<WeekRole, string> = {
	loading: 'bg-primary',
	recovery: 'bg-primary/35',
	taper: 'bg-muted-foreground/45',
	race: 'bg-foreground',
}

const ROLES: WeekRole[] = ['loading', 'recovery', 'taper', 'race']

/* -------------------------------------------------------------------------- */
/* Stages                                                                      */
/* -------------------------------------------------------------------------- */

type Stage =
	| { kind: 'event' }
	| { kind: 'intent' }
	| { kind: 'anchor'; trackIndex: number }
	| { kind: 'preview' }

/* -------------------------------------------------------------------------- */
/* Chrome                                                                      */
/* -------------------------------------------------------------------------- */

/** The whole progress indicator: one dot per decision, no titles, no prose. */
function Dots({ count, active }: { count: number; active: number }) {
	return (
		<div className="flex items-center justify-center gap-2 py-4">
			{Array.from({ length: count }, (_, i) => (
				<span
					key={i}
					className={cn(
						'h-1.5 rounded-full transition-all',
						i === active
							? 'bg-foreground w-6'
							: i < active
								? 'bg-foreground/50 w-1.5'
								: 'bg-muted-foreground/30 w-1.5',
					)}
				/>
			))}
		</div>
	)
}

/** A step: question at the top, answers in the middle, thumb row at the bottom. */
function Step({
	dots,
	question,
	children,
	onBack,
	forward,
	onForward,
}: {
	dots: { count: number; active: number }
	question: string
	children: React.ReactNode
	onBack?: () => void
	forward: string
	onForward: () => void
}) {
	return (
		// The min-h leaves room for the app header, pb-20 for the switcher pill.
		<div className="flex min-h-[calc(100dvh-6rem)] flex-col px-4 pb-20 md:mx-auto md:max-w-md">
			<Dots count={dots.count} active={dots.active} />
			<h1 className="pb-8 text-3xl font-semibold tracking-tight sm:text-4xl">
				{question}
			</h1>
			<div className="flex-1">{children}</div>
			<div className="flex items-center gap-3 pt-8">
				{onBack ? (
					<button
						type="button"
						onClick={onBack}
						aria-label="Back"
						className="border-border text-muted-foreground hover:bg-muted flex size-14 shrink-0 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
					>
						<Icon name="arrow-left" size="md" />
					</button>
				) : null}
				<button
					type="button"
					onClick={onForward}
					className="bg-primary text-primary-foreground hover:bg-primary/85 h-14 flex-1 rounded-full text-lg font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
				>
					{forward}
				</button>
			</div>
		</div>
	)
}

/** A full-width tappable answer. The only decoration is the selected check. */
function Choice({
	primary,
	secondary,
	selected,
	onSelect,
}: {
	primary: string
	secondary?: string
	selected: boolean
	onSelect: () => void
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={cn(
				'flex w-full items-center justify-between gap-3 rounded-2xl border px-5 py-5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
				selected
					? 'border-primary bg-primary/10'
					: 'border-border hover:bg-muted',
			)}
		>
			<span className="min-w-0">
				<span className="block truncate text-xl font-medium">{primary}</span>
				{secondary ? (
					<span className="text-muted-foreground block text-base tabular-nums">
						{secondary}
					</span>
				) : null}
			</span>
			{selected ? (
				<Icon name="check" size="md" className="text-primary shrink-0" />
			) : null}
		</button>
	)
}

/* -------------------------------------------------------------------------- */
/* Plan Preview                                                                */
/* -------------------------------------------------------------------------- */

function LoadProfile({
	season,
	openIndex,
	onOpen,
}: {
	season: Week[]
	openIndex: number | null
	onOpen: (index: number | null) => void
}) {
	const max = Math.max(...season.map((w) => w.targetVolume))
	const phases: { name: string; weeks: number }[] = []
	for (const week of season) {
		const last = phases.at(-1)
		if (last && last.name === week.phase) last.weeks += 1
		else phases.push({ name: week.phase, weeks: 1 })
	}

	return (
		<div>
			<div className="flex h-44 items-end gap-[3px]">
				{season.map((week) => {
					const open = openIndex === week.index
					return (
						<button
							key={week.weekKey}
							type="button"
							onClick={() => onOpen(open ? null : week.index)}
							aria-label={`Week ${week.index}, ${week.phase}, ${week.role}, ${week.targetVolume} ${week.currency}`}
							aria-pressed={open}
							className="group flex h-full flex-1 items-end focus-visible:ring-2 focus-visible:outline-none"
						>
							<span
								className={cn(
									'w-full rounded-t-sm transition-opacity',
									ROLE_BAR[week.role],
									openIndex !== null && !open && 'opacity-40',
								)}
								style={{
									height: `${Math.max(6, (week.targetVolume / max) * 100)}%`,
								}}
							/>
						</button>
					)
				})}
			</div>
			<div className="mt-2 flex gap-[3px]">
				{phases.map((phase) => (
					<div
						key={phase.name}
						className="border-border/70 min-w-0 border-t pt-1"
						style={{ flexGrow: phase.weeks, flexBasis: 0 }}
					>
						<span className="text-muted-foreground block truncate text-xs">
							{phase.name}
						</span>
					</div>
				))}
			</div>
		</div>
	)
}

function WeekPanel({ week }: { week: Week }) {
	return (
		<div className="border-border mt-6 rounded-2xl border p-4">
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-lg font-semibold tabular-nums">
					Week {week.index}
				</span>
				<span className="text-muted-foreground text-sm tabular-nums">
					{week.role} · ≈ {week.targetVolume} {week.currency}
				</span>
			</div>
			<ul className="mt-3 divide-y">
				{week.sessions.map((session) => (
					<li
						key={`${session.day}-${session.title}`}
						className="flex items-baseline gap-3 py-2"
					>
						<span className="text-muted-foreground w-9 shrink-0 text-sm">
							{session.day}
						</span>
						<span className="min-w-0 flex-1 truncate">{session.title}</span>
						<span className="text-muted-foreground shrink-0 text-sm tabular-nums">
							{session.volume}
						</span>
					</li>
				))}
			</ul>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* The journey                                                                 */
/* -------------------------------------------------------------------------- */

export default function VariantB({
	athlete,
	events,
	seasonStartMonday,
	seasonWeeks,
}: VariantProps) {
	const [eventId, setEventId] = useState(events[0]!.id)
	const [intent, setIntent] = useState<Intent>('deliberately-building')
	const [anchors, setAnchors] = useState<Record<Discipline, number>>(
		() =>
			Object.fromEntries(
				athlete.tracks.map((track) => [track.discipline, track.proposedAnchor]),
			) as Record<Discipline, number>,
	)
	const [touched, setTouched] = useState<Partial<Record<Discipline, boolean>>>(
		{},
	)
	const [stepIndex, setStepIndex] = useState(0)
	const [openWeek, setOpenWeek] = useState<number | null>(null)
	const [saved, setSaved] = useState(false)

	const event = events.find((e) => e.id === eventId) ?? events[0]!

	// The athlete's biggest track is asked about first, so a triathlete confirms
	// their 170 km of cycling before their 4 km of swimming.
	const tracks = useMemo(() => orderTracks(athlete.tracks), [athlete.tracks])

	const stages: Stage[] = useMemo(
		() => [
			{ kind: 'event' },
			{ kind: 'intent' },
			...tracks.map(
				(_, trackIndex) => ({ kind: 'anchor', trackIndex }) as Stage,
			),
			{ kind: 'preview' },
		],
		[tracks],
	)

	const stage = stages[Math.min(stepIndex, stages.length - 1)]!
	const decisionCount = stages.length - 1

	const season = useMemo(
		() =>
			buildSeason({
				tracks: tracksFor({ ...athlete, tracks }, anchors),
				presetKey: PRESET_FOR_INTENT[intent],
				trainableDays: athlete.trainableDays,
				startMonday: seasonStartMonday,
				weeks: event.weeksAway || seasonWeeks,
				raceDiscipline: event.discipline,
			}),
		[
			athlete,
			tracks,
			anchors,
			intent,
			seasonStartMonday,
			seasonWeeks,
			event.weeksAway,
			event.discipline,
		],
	)
	const sessionCount = season.reduce((sum, w) => sum + w.sessions.length, 0)
	const firstLoading = season.find((week) => week.role === 'loading')

	const back = () => setStepIndex((i) => Math.max(0, i - 1))
	const next = () => setStepIndex((i) => Math.min(stages.length - 1, i + 1))

	if (stage.kind === 'event') {
		return (
			<Step
				dots={{ count: decisionCount, active: 0 }}
				question="Racing what?"
				forward="Next"
				onForward={next}
			>
				<div className="space-y-3">
					{events.map((candidate: PrototypeEvent) => (
						<Choice
							key={candidate.id}
							primary={candidate.name}
							secondary={`${candidate.weeksAway} weeks · ${candidate.priority}`}
							selected={candidate.id === eventId}
							onSelect={() => setEventId(candidate.id)}
						/>
					))}
				</div>
			</Step>
		)
	}

	if (stage.kind === 'intent') {
		return (
			<Step
				dots={{ count: decisionCount, active: 1 }}
				question="Where are you now?"
				forward="Next"
				onBack={back}
				onForward={next}
			>
				<div className="space-y-3">
					{INTENTS.map((option) => (
						<Choice
							key={option.key}
							primary={option.label}
							selected={option.key === intent}
							onSelect={() => setIntent(option.key)}
						/>
					))}
				</div>
			</Step>
		)
	}

	if (stage.kind === 'anchor') {
		const track = tracks[stage.trackIndex]!
		const value = anchors[track.discipline] ?? track.proposedAnchor
		const step = STEP[track.currency]
		const isTouched = touched[track.discipline] ?? false
		const bump = (delta: number) => {
			setTouched((t) => ({ ...t, [track.discipline]: true }))
			setAnchors((a) => ({
				...a,
				[track.discipline]: Math.max(step, round1(value + delta)),
			}))
		}
		const last = stage.trackIndex === tracks.length - 1
		// What this number buys, in numbers: band, sessions, long-run cap.
		const level = describeLevel(value, track.currency, track.discipline)

		return (
			<Step
				dots={{ count: decisionCount, active: 2 + stage.trackIndex }}
				question={`${DISCIPLINE[track.discipline]} per week?`}
				forward={last ? 'Build' : 'Next'}
				onBack={back}
				onForward={next}
			>
				<div className="flex flex-col items-center pt-6">
					<div className="flex w-full items-center justify-between gap-4">
						<button
							type="button"
							onClick={() => bump(-step)}
							aria-label="Less"
							className="border-border hover:bg-muted flex size-16 shrink-0 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						>
							<Icon name="minus" size="lg" />
						</button>
						<span className="text-6xl font-semibold tabular-nums">{value}</span>
						<button
							type="button"
							onClick={() => bump(step)}
							aria-label="More"
							className="border-border hover:bg-muted flex size-16 shrink-0 items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						>
							<Icon name="plus" size="lg" />
						</button>
					</div>
					<span className="text-muted-foreground mt-3 text-xl">
						{CURRENCY_UNIT[track.currency]}
					</span>
					{isTouched ? (
						<button
							type="button"
							onClick={() => {
								setTouched((t) => ({ ...t, [track.discipline]: false }))
								setAnchors((a) => ({
									...a,
									[track.discipline]: track.proposedAnchor,
								}))
							}}
							className="border-border hover:bg-muted mt-8 rounded-full border px-4 py-2 text-base tabular-nums focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
						>
							≈ {track.proposedAnchor} {CURRENCY_UNIT[track.currency]}
						</button>
					) : (
						<span className="text-muted-foreground mt-8 text-base tabular-nums">
							≈ {track.proposedAnchor} {CURRENCY_UNIT[track.currency]} from
							history
						</span>
					)}
					<span className="text-muted-foreground mt-4 text-base tabular-nums">
						{level.summary}
					</span>
				</div>
			</Step>
		)
	}

	return (
		<Step
			dots={{ count: decisionCount, active: decisionCount }}
			question={saved ? 'On the Tape' : `${season.length} weeks`}
			forward={saved ? 'Saved' : 'Save'}
			onBack={back}
			onForward={() => setSaved(true)}
		>
			<div className="space-y-6">
				<LoadProfile
					season={season}
					openIndex={openWeek}
					onOpen={setOpenWeek}
				/>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					{ROLES.map((role) => (
						<span
							key={role}
							className="text-muted-foreground flex items-center gap-1.5 text-xs"
						>
							<span
								className={cn('size-2.5 rounded-sm', ROLE_BAR[role])}
								aria-hidden
							/>
							{role}
						</span>
					))}
				</div>
				{/* The adaptation, in numbers, for the first loading week. */}
				<dl className="grid grid-cols-3 gap-3 tabular-nums">
					{[
						{
							label: 'sessions/wk',
							value: `${firstLoading?.sessions.length ?? 0}`,
						},
						{
							label: 'long run',
							value:
								firstLoading?.tracks[0]?.longRun == null
									? '—'
									: `${firstLoading.tracks[0].longRun} ${firstLoading.tracks[0].currency}`,
							note:
								firstLoading?.tracks[0]?.longRun == null
									? undefined
									: `${Math.round(firstLoading.tracks[0].longRunShare * 100)} % of week`,
						},
						{
							label: 'easy',
							value: `${Math.round((firstLoading?.tracks[0]?.easyShare ?? 1) * 100)} %`,
						},
					].map((cell) => (
						<div key={cell.label}>
							<dd className="text-2xl font-semibold">{cell.value}</dd>
							<dt className="text-muted-foreground text-xs">{cell.label}</dt>
							{cell.note ? (
								<dd className="text-muted-foreground text-xs">{cell.note}</dd>
							) : null}
						</div>
					))}
				</dl>
				<p className="text-2xl font-semibold tabular-nums">
					{sessionCount} sessions
					{saved ? (
						<span
							role="status"
							className="text-primary ml-2 inline-flex items-center gap-1 align-middle text-base font-medium"
						>
							<Icon name="check" size="sm" />
							saved
						</span>
					) : null}
				</p>
				{openWeek === null ? null : <WeekPanel week={season[openWeek - 1]!} />}
			</div>
		</Step>
	)
}
