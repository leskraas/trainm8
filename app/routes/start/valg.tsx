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
	type StartDraft,
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
	nbHoursWords,
	nbLongDay,
	SESSION_PREFERENCE_LABELS,
	SIMPLE_START_LABELS,
	START_OPTION_LABELS,
	START_SIMPLE_ACTIVITY_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { prefersReducedMotion } from '#app/utils/motion.ts'
import { MORPH } from '#app/utils/view-morph.ts'
import { type Route } from './+types/valg.ts'
import { FirstRunFrame, SIMPLE_START_STEP_COUNT } from './__first-run-frame.tsx'
import { cardOf, StartOptionWeekView } from './__start-option-card.tsx'

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
 * recomputes the cards. The cards scroll natively. Motion (#582): the top
 * card is what _Uka di_ morphs into on the way here, and the card being
 * chosen morphs into the plan's curve on _Planen er klar_ (`view-morph.ts`).
 */

const L = START_OPTION_LABELS

export const meta: Route.MetaFunction = () => [
	{ title: `${L.metaTitle} | Trainm8` },
]

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
							// The top card is what _Uka di_ became; the one being chosen
							// becomes the plan's curve (#582).
							style={{
								viewTransitionName:
									choosing != null
										? choosing === card.family
											? MORPH.plan
											: undefined
										: index === 0
											? MORPH.week
											: undefined,
							}}
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

							<StartOptionWeekView card={card} />
							<p className="text-footnote text-muted-foreground">
								{loaderData.startsOn}
							</p>

							<Form method="POST" viewTransition className="mt-auto pt-1">
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
