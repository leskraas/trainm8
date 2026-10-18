import { useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v3'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { data, Form, redirect, useNavigation } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	createFirstRunPlan,
	readPlanStartWeekKey,
	requireSimpleStartAthlete,
} from '#app/utils/first-run/plan.server.ts'
import {
	draftStart,
	levelDefaults,
	type Effort,
	type StartDraft,
	type StartOption,
	type StartWeekSession,
} from '#app/utils/first-run/start-draft.ts'
import {
	otherSportsOf,
	readStartAnswers,
	StartChoiceSchema,
	startSearch,
} from '#app/utils/first-run/start-schema.ts'
import { readStartStrength } from '#app/utils/first-run/start-strength.server.ts'
import {
	FIRST_RUN_LABELS,
	FIRST_RUN_REFUSAL_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_WEEKDAY_LABELS,
	nbDurationLabel,
	nbHoursWords,
	nbLongDay,
	PHILOSOPHY_LABELS,
	SESSION_PREFERENCE_LABELS,
	SIMPLE_START_LABELS,
	START_OPTION_LABELS,
	START_SIMPLE_ACTIVITY_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type Route } from './+types/valg.ts'
import { FirstRunFrame, SIMPLE_START_STEP_COUNT } from './__first-run-frame.tsx'

/**
 * The simple start, screen 3 (#558 _Levende start_, #566): _Tre måter å trene
 * på_ — the **Start Options**. Each card is one family's real first week for
 * the answers, day by day, laid by the engine the plan is made with
 * (`draftStart`): its plain name first and the family's small, every day with
 * its session or _fri_, a bar of easy, middling and hard time, the total and
 * the hard sessions, and when the plan starts. The athlete swipes between the
 * cards (or uses the dots or the arrow keys) and picks one with _Velg denne_,
 * which makes exactly that plan (`createFirstRunPlan`) and goes to _Planen er
 * klar_ (#570).
 *
 * The answers travel in the URL, so going back to a question and changing it
 * recomputes the cards. No motion of its own yet: the cards scroll natively
 * (#558 S10 adds the morphs).
 */

const L = START_OPTION_LABELS

export const meta: Route.MetaFunction = () => [
	{ title: `${L.metaTitle} | Trainm8` },
]

function duration(minutes: number): string {
	return nbDurationLabel(minutes * 60)
}

function percent(part: number, whole: number): number {
	return whole === 0 ? 0 : Math.round((part / whole) * 100)
}

export type StartCard = {
	family: StartOption['family']
	name: string
	why: string
	familyName: string
	badge: string | null
	days: Array<{
		/** `mandag`, as a screen reader hears the row. */
		weekday: string
		/** `ma`, as the row shows it. */
		short: string
		sessions: Array<{
			title: string
			discipline: StartWeekSession['discipline']
			effort: Effort
			/** `45 min · rolig`. */
			facts: string
		}>
		/** The day's strength session, by its title and its lifts (#574). */
		lifting: Array<{ title: string; lifts: string }>
	}>
	/** Minutes at each effort, the bar's widths. */
	effortMinutes: Record<Effort, number>
	barLabel: string
	total: string
	sessions: string
	hard: string
	/** `+2 styrkeøkter`, beside the hours and never in them; null without. */
	strength: string | null
	/** The frequency as the athlete's own answer, and why fewer were laid. */
	strengthNotes: string[]
	shortOfHours: string | null
	/** _Fikk ikke plass denne uka: …_, with what would make room (#572). */
	notFitted: string | null
	chooseLabel: string
}

/** A card as the athlete reads it, every word from the labels module. */
function cardOf(
	option: StartOption,
	badge: string | null,
	hours: number,
	strengthChosen: number | null,
): StartCard {
	if (option.family === 'masters') throw new Error('Masters is not offered')
	const plain = L.plain[option.family]
	const { week } = option
	return {
		family: option.family,
		name: plain.name,
		why: plain.why,
		familyName: L.familyName(PHILOSOPHY_LABELS[option.family]),
		badge,
		days: week.days.map((day) => ({
			weekday: NB_WEEKDAY_LABELS[day.weekday]!,
			short: FIRST_RUN_LABELS.dayShort[day.weekday]!,
			sessions: day.sessions.map((session) => ({
				title: session.title,
				discipline: session.discipline,
				effort: session.effort,
				facts: L.sessionFacts(
					duration(session.minutes),
					L.effort[session.effort],
				),
			})),
			lifting: day.lifting.map((lift) => ({
				title: lift.title,
				lifts: lift.lifts.join(' · '),
			})),
		})),
		effortMinutes: week.minutesByEffort,
		barLabel: L.effortBar(
			percent(week.minutesByEffort.easy, week.minutes),
			percent(week.minutesByEffort.moderate, week.minutes),
			percent(week.minutesByEffort.hard, week.minutes),
		),
		total: L.total(duration(week.minutes)),
		sessions: L.sessions(week.sessionCount),
		hard: L.hardSessions(week.hardSessions),
		strength:
			week.strengthSessions > 0 ? L.plusStrength(week.strengthSessions) : null,
		strengthNotes:
			strengthChosen == null
				? []
				: [
						L.strengthChoice(strengthChosen),
						...(week.strengthSessions < strengthChosen
							? [L.strengthFewer(week.strengthSessions, strengthChosen)]
							: []),
					],
		shortOfHours:
			option.shortOfHours == null
				? null
				: (option.shortByPreference
						? SESSION_PREFERENCE_LABELS.shortOfHours
						: L.shortOfHours)(
						duration(option.shortOfHours),
						nbHoursWords(hours),
					),
		notFitted: option.notFitted
			? START_SIMPLE_ACTIVITY_LABELS.notFitted(
					option.notFitted.kinds,
					option.notFitted.room,
				)
			: null,
		chooseLabel: L.chooseLabel(plain.name),
	}
}

/**
 * What the start says above the cards: why there are fewer than three, and
 * why the plan lays on fewer days than were picked.
 */
function notesOf(start: StartDraft, sessionCap: number): string[] {
	const notes: string[] = []
	if (start.simpleOnly) notes.push(START_SIMPLE_ACTIVITY_LABELS.simpleOnly)
	if (start.sportsLeftOut.length > 0) {
		notes.push(
			L.sportsLeftOut(
				start.daysUsed,
				start.sportsLeftOut.map((sport) =>
					NB_DISCIPLINE_LABELS[sport].toLowerCase(),
				),
			),
		)
	}
	if (start.merged > 0) notes.push(L.merged(start.options.length))
	if (start.strengthCapped != null) {
		notes.push(L.strengthTakesDays(sessionCap, start.strengthCapped))
	} else if (start.capped) {
		notes.push(SIMPLE_START_LABELS.activities.beginnerCap(sessionCap))
	} else if (start.restDayKept) {
		notes.push(SIMPLE_START_LABELS.activities.restDay)
	} else if (start.daysUsed < start.daysPicked) {
		notes.push(
			FIRST_RUN_LABELS.weeks.fewerDays(start.daysPicked, start.daysUsed),
		)
	}
	return notes
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireSimpleStartAthlete(request)
	const answers = readStartAnswers(new URL(request.url).searchParams)
	const {
		level,
		hours,
		discipline,
		otherSports = [],
		activities,
		days,
		strength,
		preferences = [],
	} = answers
	// Every answer comes first; without one, back to where it is asked.
	if (!level || hours == null) {
		const search = startSearch(answers)
		throw redirect(search ? `/start/niva?${search}` : '/start/niva')
	}
	const back = `/start/okter?${startSearch(answers)}`
	if ((!discipline && !activities) || !days) {
		throw redirect(`/start/trening?${startSearch(answers)}`)
	}
	const startWeekKey = await readPlanStartWeekKey(userId)
	// _Styrke_ (#574): read as the writer reads it, so the card is the plan.
	const lifting = strength != null ? await readStartStrength(userId) : null
	const start = draftStart({
		level,
		discipline,
		otherSports,
		activities,
		hours,
		days,
		startWeekKey,
		strength:
			lifting && strength != null
				? { perWeek: strength, session: lifting.session }
				: null,
		preferences,
	})
	if (!start) throw redirect(`/start/trening?${startSearch(answers)}`)
	const badge = start.badge ? L.badge[start.badge] : null
	return {
		answers: {
			level,
			hours,
			discipline,
			otherSports,
			activities: activities ?? [],
			days,
			strength: lifting ? (strength ?? null) : null,
			preferences,
		},
		title: L.title(start.options.length),
		intro: L.intro(start.options.length, nbHoursWords(hours), start.daysUsed),
		back,
		notes: [
			...notesOf(start, levelDefaults(level).sessionCap),
			// How _Korte økter_ and _Lange, rolige turer_ are met (story 24).
			...(preferences.includes('short') && preferences.includes('long')
				? [SESSION_PREFERENCE_LABELS.shortAndLong]
				: []),
		],
		startsOn: L.startsOn(nbLongDay(startWeekKey)),
		cards: start.options.map((option, index) =>
			cardOf(
				option,
				index === 0 ? badge : null,
				hours,
				lifting ? (strength ?? null) : null,
			),
		),
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireSimpleStartAthlete(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: StartChoiceSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}
	const {
		level,
		hours,
		discipline,
		sports,
		activities,
		days,
		family,
		strength,
		preferences,
	} = submission.value
	const created = await createFirstRunPlan(userId, {
		discipline,
		otherSports: discipline ? otherSportsOf(discipline, sports) : undefined,
		activities,
		hours,
		days,
		family,
		level,
		...(strength != null ? { strength } : {}),
		// Stored as the athlete's answer, `[]` for a skip (#571).
		preferences: preferences ?? [],
	})
	if (!created.ok) {
		return data(
			{
				result: submission.reply({
					formErrors: [FIRST_RUN_REFUSAL_LABELS[created.reason]],
				}),
			},
			{ status: 409 },
		)
	}
	// _Planen er klar_ says what was made; it reads the plan, so a reload or
	// the back button shows it again and makes nothing.
	return redirect('/start/klar')
}

/** One mark colour per sport (design-system: track hues are marks). */
const TRACK_MARK: Partial<Record<StartWeekSession['discipline'], string>> = {
	run: 'bg-track-run',
	bike: 'bg-track-bike',
	swim: 'bg-track-swim',
	strength: 'bg-track-strength',
}

/**
 * The bar's three efforts: easy faint, middling stronger, hard solid, in the
 * primary hue, so it reads in both themes and never by colour alone (the
 * label says the shares).
 */
const EFFORT_FILL: Record<Effort, string> = {
	easy: 'bg-primary/30',
	moderate: 'bg-primary/65',
	hard: 'bg-primary',
}

const EFFORT_ORDER: Effort[] = ['easy', 'moderate', 'hard']

function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function StartOptions({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { answers, cards } = loaderData
	const navigation = useNavigation()
	const choosing =
		navigation.state !== 'idle' && navigation.formMethod === 'POST'
			? String(navigation.formData?.get('family') ?? '')
			: null
	const [form] = useForm({
		id: 'start-options',
		lastResult: actionData?.result,
	})

	const railRef = useRef<HTMLDivElement>(null)
	const [active, setActive] = useState(0)

	// The dot follows the finger: whichever card's centre is nearest the
	// rail's centre is the one shown.
	useEffect(() => {
		const rail = railRef.current
		if (!rail) return
		let frame = 0
		const sync = () => {
			cancelAnimationFrame(frame)
			frame = requestAnimationFrame(() => {
				const centre = rail.scrollLeft + rail.clientWidth / 2
				let nearest = 0
				let distance = Infinity
				Array.from(rail.children).forEach((child, index) => {
					const card = child as HTMLElement
					const apart = Math.abs(
						card.offsetLeft - rail.offsetLeft + card.offsetWidth / 2 - centre,
					)
					if (apart < distance) {
						distance = apart
						nearest = index
					}
				})
				setActive(nearest)
			})
		}
		sync()
		rail.addEventListener('scroll', sync, { passive: true })
		return () => {
			cancelAnimationFrame(frame)
			rail.removeEventListener('scroll', sync)
		}
	}, [cards.length])

	/**
	 * Bring a card to the middle. A tap on a dot glides there; a key press,
	 * repeated quickly, lands at once (keyboard actions never animate), and so
	 * does everything under reduced motion.
	 */
	function show(index: number, by: 'pointer' | 'key') {
		const rail = railRef.current
		const card = rail?.children[index] as HTMLElement | undefined
		if (!rail || !card) return
		const smooth = by === 'pointer' && !prefersReducedMotion()
		rail.scrollTo({
			left:
				card.offsetLeft -
				rail.offsetLeft -
				(rail.clientWidth - card.offsetWidth) / 2,
			behavior: smooth ? 'smooth' : 'auto',
		})
		if (by === 'key') card.focus({ preventScroll: true })
		setActive(index)
	}

	function onRailKey(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
		const next = active + (event.key === 'ArrowRight' ? 1 : -1)
		if (next < 0 || next >= cards.length) return
		event.preventDefault()
		show(next, 'key')
	}

	return (
		<FirstRunFrame
			step={4}
			stepCount={SIMPLE_START_STEP_COUNT}
			title={loaderData.title}
			intro={loaderData.intro}
			back={{ to: loaderData.back, label: SESSION_PREFERENCE_LABELS.backHere }}
		>
			{loaderData.notes.length > 0 ? (
				<div
					className="text-footnote text-muted-foreground space-y-1"
					data-start-options-notes
				>
					{loaderData.notes.map((note) => (
						<p key={note}>{note}</p>
					))}
				</div>
			) : null}

			<ErrorList errors={form.errors} id={form.errorId} />

			<section
				aria-label={L.rail}
				aria-roledescription={L.railRole}
				className="space-y-3"
			>
				<div
					ref={railRef}
					onKeyDown={onRailKey}
					className={cn(
						'-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-3',
						'scroll-px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
						cards.length === 1 && 'overflow-x-visible',
					)}
					data-start-options
				>
					{cards.map((card, index) => (
						<article
							key={card.family}
							role="group"
							aria-roledescription={L.cardRole}
							aria-label={L.card(index + 1, cards.length, card.name)}
							tabIndex={-1}
							className={cn(
								// `relative`, so a card's screen-reader text is clipped with
								// the card rather than widening the page.
								'bg-card relative flex shrink-0 snap-center flex-col gap-3 rounded-4xl p-4 shadow-md',
								'focus-visible:ring-ring/30 outline-none focus-visible:ring-3',
								cards.length === 1 ? 'w-full' : 'w-[86%]',
							)}
							data-start-option={card.family}
						>
							<div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
								{card.badge ? (
									<Badge data-start-option-badge>{card.badge}</Badge>
								) : null}
								<span className="text-footnote text-muted-foreground">
									{card.familyName}
								</span>
							</div>
							<div className="space-y-1">
								<h2 className="text-heading text-balance">{card.name}</h2>
								<p className="text-footnote text-muted-foreground">
									{card.why}
								</p>
							</div>

							<div className="space-y-2">
								<div
									role="img"
									aria-label={card.barLabel}
									className="bg-muted flex h-2 gap-0.5 overflow-hidden rounded-full"
								>
									{EFFORT_ORDER.map((effort) =>
										card.effortMinutes[effort] > 0 ? (
											<span
												key={effort}
												className={cn('block h-full', EFFORT_FILL[effort])}
												style={{ flexGrow: card.effortMinutes[effort] }}
											/>
										) : null,
									)}
								</div>
								<p className="text-footnote text-muted-foreground flex flex-wrap gap-x-3 tabular-nums">
									<span className="text-foreground font-semibold">
										{card.total}
									</span>
									<span>{card.sessions}</span>
									<span>{card.hard}</span>
									{card.strength ? (
										<span data-start-option-strength>{card.strength}</span>
									) : null}
								</p>
							</div>

							<ol className="divide-border/60 divide-y">
								{card.days.map((day) => (
									<li
										key={day.weekday}
										className="text-footnote grid min-h-9 grid-cols-[1.75rem_minmax(0,1fr)] items-baseline gap-x-2 py-2"
									>
										<span
											aria-hidden
											className="text-muted-foreground text-caption"
										>
											{day.short}
										</span>
										<span className="sr-only">{day.weekday}: </span>
										{day.sessions.length === 0 && day.lifting.length === 0 ? (
											<span className="text-muted-foreground">{L.free}</span>
										) : (
											<span className="space-y-0.5">
												{day.sessions.map((session, at) => (
													<span
														key={at}
														className="flex flex-wrap items-baseline justify-between gap-x-2"
													>
														<span className="flex min-w-0 items-baseline gap-1.5">
															<span
																aria-hidden
																className={cn(
																	'size-2 shrink-0 translate-y-[-1px] self-center rounded-full',
																	TRACK_MARK[session.discipline] ??
																		'bg-muted-foreground',
																)}
															/>
															<span className="text-foreground min-w-0 break-words">
																{session.title}
															</span>
														</span>
														<span className="text-muted-foreground tabular-nums">
															{session.facts}
														</span>
													</span>
												))}
												{day.lifting.map((lift, at) => (
													<span
														key={`lift-${at}`}
														className="block"
														data-start-option-lifting
													>
														<span className="flex min-w-0 items-baseline gap-1.5">
															<span
																aria-hidden
																className="bg-track-strength size-2 shrink-0 translate-y-[-1px] self-center rounded-full"
															/>
															<span className="text-foreground min-w-0 break-words">
																{lift.title}
															</span>
														</span>
														{lift.lifts ? (
															<span className="text-muted-foreground block pl-3.5 break-words">
																{lift.lifts}
															</span>
														) : null}
													</span>
												))}
											</span>
										)}
									</li>
								))}
							</ol>

							{card.strengthNotes.map((note) => (
								<p key={note} className="text-footnote text-muted-foreground">
									{note}
								</p>
							))}
							{card.shortOfHours ? (
								<p className="text-footnote text-muted-foreground">
									{card.shortOfHours}
								</p>
							) : null}
							{card.notFitted ? (
								<p
									className="text-footnote text-muted-foreground"
									data-start-option-not-fitted
								>
									{card.notFitted}
								</p>
							) : null}
							<p className="text-footnote text-muted-foreground">
								{loaderData.startsOn}
							</p>

							<Form method="POST" className="mt-auto pt-1">
								<input type="hidden" name="level" value={answers.level} />
								<input type="hidden" name="hours" value={answers.hours} />
								{answers.discipline ? (
									<input
										type="hidden"
										name="discipline"
										value={answers.discipline}
									/>
								) : null}
								{answers.discipline && answers.otherSports.length > 0
									? [answers.discipline, ...answers.otherSports].map(
											(sport) => (
												<input
													key={sport}
													type="hidden"
													name="sports"
													value={sport}
												/>
											),
										)
									: null}
								{answers.activities.map((kind) => (
									<input
										key={kind}
										type="hidden"
										name="activities"
										value={kind}
									/>
								))}
								{answers.days.map((day) => (
									<input key={day} type="hidden" name="days" value={day} />
								))}
								{answers.strength != null ? (
									<input
										type="hidden"
										name="strength"
										value={answers.strength}
									/>
								) : null}
								{answers.preferences.map((preference) => (
									<input
										key={preference}
										type="hidden"
										name="preferences"
										value={preference}
									/>
								))}
								<input type="hidden" name="family" value={card.family} />
								<StatusButton
									type="submit"
									aria-label={card.chooseLabel}
									className="text-callout w-full"
									status={choosing === card.family ? 'pending' : 'idle'}
									disabled={choosing != null}
								>
									{L.choose}
								</StatusButton>
							</Form>
						</article>
					))}
				</div>

				{cards.length > 1 ? (
					<div
						role="group"
						aria-label={L.pager}
						className="flex justify-center"
						data-start-options-pager
					>
						{cards.map((card, index) => (
							<button
								key={card.family}
								type="button"
								aria-label={L.dot(index + 1, cards.length, card.name)}
								aria-current={index === active ? 'true' : undefined}
								onClick={() => show(index, 'pointer')}
								className="group grid size-11 place-items-center outline-none"
							>
								<span
									aria-hidden
									className={cn(
										'block h-1.5 rounded-full',
										'group-focus-visible:ring-ring/50 group-focus-visible:ring-3',
										index === active
											? 'bg-primary w-4.5'
											: 'bg-muted-foreground/40 w-1.5',
									)}
								/>
							</button>
						))}
					</div>
				) : null}
			</section>
		</FirstRunFrame>
	)
}
