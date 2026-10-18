import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { useEffect, useMemo, useRef, useState } from 'react'
import { data, Form, Link, redirect, useRevalidator } from 'react-router'
import { ErrorList, RadioGroupField } from '#app/components/forms.tsx'
import { SourceCredits } from '#app/components/source-credits.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import {
	readFirstRunFindings,
	type FirstRunReading,
} from '#app/utils/first-run/findings.server.ts'
import { startPrefill } from '#app/utils/first-run/first-run.ts'
import {
	readPlanStartWeekKey,
	requireSimpleStartAthlete,
} from '#app/utils/first-run/plan.server.ts'
import {
	draftStart,
	levelDefaults,
	MAX_START_HOURS,
	MIN_START_HOURS,
	START_HOURS_STEP,
	TRAINING_LEVELS,
	weekSketch,
	type TrainingLevel,
} from '#app/utils/first-run/start-draft.ts'
import {
	LevelStepSchema,
	otherSportsOf,
	readStartAnswers,
	startSearch,
} from '#app/utils/first-run/start-schema.ts'
import {
	FINDING_ABSENCE_LABELS,
	hoursEstimateLabel,
	nbHoursWords,
	nbWeekdayList,
	SIMPLE_START_LABELS,
	START_HISTORY_LABELS,
} from '#app/utils/labels.ts'
import { derivedAttributionLines } from '#app/utils/source-attribution.ts'
import { type Route } from './+types/niva.ts'
import { QUESTION_LEGEND } from './__first-run-fields.tsx'
import {
	DISCLOSURE_CHEVRON,
	DISCLOSURE_TRIGGER,
	FirstRunFrame,
	SIMPLE_START_STEP_COUNT,
} from './__first-run-frame.tsx'
import { WeekSketch } from './__week-sketch.tsx'

/**
 * The simple start, screen 1 (#558 _Levende start_, #563): _Hvor er du nå?_ —
 * the **Training Level** — and on the same screen _Omtrent hvor mye tid i
 * uka?_, pre-filled by the level and changed in half hours with a large − and
 * +. _Uka di_ fills in above as the athlete answers, laid by the same draft the
 * plan is made from (`draftStart`).
 *
 * The start's entry (#578): where the athlete has history, the hours and days
 * come from their last four weeks instead of the level, with a line saying so
 * and the arithmetic behind a disclosure. Connecting intervals.icu is a quiet
 * link here, never a step, and so is _Jeg vil heller sette opp sesongen
 * selv_, which opens today's plan authoring.
 */

const L = SIMPLE_START_LABELS
const H = START_HISTORY_LABELS

/** How often the screen looks again while the history is still arriving. */
const IMPORT_POLL_MS = 3000

/** Where the expert path starts: today's plan authoring. */
const SELF_SET_UP_HREF = '/training/plan/new'

export const meta: Route.MetaFunction = () => [
	{ title: `${L.level.title} | Trainm8` },
]

/**
 * What the history gives the start, and the words for it — or null where
 * there is no history and no link that could bring one.
 *
 * - While the import is on its way, it says so and gives nothing: the level's
 *   own hours and days stand.
 * - Where the last four weeks read, their hours and days, with the
 *   arithmetic and the credits the data asks for (ADR 0098 §3).
 * - Connected, but nothing to read: why, and that the level's stand.
 */
function startHistory({ connection, findings, bindingSet }: FirstRunReading) {
	if (connection === 'importing') {
		return {
			hours: null,
			days: null,
			importing: true,
			line: H.importing,
			arithmetic: null,
			credits: [],
		}
	}
	const { hours, days } = startPrefill(findings)
	if (hours != null || days != null) {
		return {
			hours,
			days,
			importing: false,
			line: H.fromHistory(
				hours != null ? nbHoursWords(hours) : null,
				days != null ? nbWeekdayList(days) : null,
			),
			arithmetic: findings.volume.measured
				? hoursEstimateLabel(findings.volume.value)
				: null,
			credits: derivedAttributionLines(bindingSet),
		}
	}
	if (connection === 'ready' && !findings.volume.measured) {
		return {
			hours: null,
			days: null,
			importing: false,
			line: H.noHours(FINDING_ABSENCE_LABELS[findings.volume.reason]),
			arithmetic: null,
			credits: [],
		}
	}
	return null
}

type StartHistory = NonNullable<ReturnType<typeof startHistory>>

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireSimpleStartAthlete(request)
	const [startWeekKey, reading] = await Promise.all([
		readPlanStartWeekKey(userId),
		readFirstRunFindings(userId),
	])
	return {
		// Back from the next screen: every answer given comes back with it.
		answers: readStartAnswers(new URL(request.url).searchParams),
		startWeekKey,
		history: startHistory(reading),
		connectHref: reading.connection === 'none' ? '/start/koble' : null,
		selfSetUpHref: SELF_SET_UP_HREF,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireSimpleStartAthlete(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: LevelStepSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}
	const { level, hours, discipline, sports, activities, days, strength } =
		submission.value
	// What the athlete gave wins; else the history's, as the screen showed
	// it; else the level's own hours, and the next screen's own days.
	const history =
		hours == null || days == null
			? startHistory(await readFirstRunFindings(userId))
			: null
	throw redirect(
		`/start/trening?${startSearch({
			level,
			hours: hours ?? history?.hours ?? levelDefaults(level).hours,
			discipline,
			activities,
			otherSports: discipline ? otherSportsOf(discipline, sports) : undefined,
			days: days ?? history?.days ?? undefined,
			strength,
		})}`,
	)
}

function clampHours(hours: number): number {
	return Math.min(MAX_START_HOURS, Math.max(MIN_START_HOURS, hours))
}

export default function LevelStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { answers, startWeekKey, history } = loaderData
	const [level, setLevel] = useState<TrainingLevel | null>(
		answers.level ?? null,
	)
	/** A level's hours before the athlete touches them: the history's first. */
	const startingHours = (picked: TrainingLevel) =>
		history?.hours ?? levelDefaults(picked).hours
	const [hours, setHours] = useState<number | null>(
		answers.hours ?? (answers.level ? startingHours(answers.level) : null),
	)
	// Whether the hours are the athlete's own (changed, or brought back from
	// the next screen): then the history landing never moves them.
	const ownHours = useRef(answers.hours != null)
	useImportPoll(history?.importing ?? false)
	// The history landing while the screen is open replaces the level's
	// hours, the way it would have on opening; never the athlete's own.
	const historyHours = history?.hours ?? null
	useEffect(() => {
		if (historyHours == null || ownHours.current) return
		setHours((current) => (current == null ? current : historyHours))
	}, [historyHours])
	const changeHours = (next: number) => {
		ownHours.current = true
		setHours(clampHours(next))
	}

	// The next screen's answers ride along while the level is the one they
	// were given for; a new level brings its own days, or the history's.
	const sameLevel = level != null && level === answers.level
	const carriedDays = sameLevel ? answers.days : undefined
	const startingDays = carriedDays ?? history?.days ?? undefined
	const activities = sameLevel ? answers.activities : undefined
	const discipline = answers.discipline ?? (activities ? null : 'run')
	const otherSports = sameLevel ? answers.otherSports : undefined

	const sketch = useMemo(
		() =>
			weekSketch(
				level && hours != null
					? draftStart({
							level,
							discipline,
							activities,
							otherSports,
							hours,
							days: startingDays ?? levelDefaults(level).days,
							startWeekKey,
						})
					: null,
			),
		[
			level,
			hours,
			discipline,
			otherSports,
			activities,
			startingDays,
			startWeekKey,
		],
	)

	const [form, fields] = useForm({
		id: 'simple-start-level',
		constraint: getZodConstraint(LevelStepSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: LevelStepSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	// Hours the history gave say where they came from in the history's own
	// line below, not as "usual for the level".
	const hoursFromHistory = hours != null && hours === history?.hours
	const hoursNote =
		level == null || hours == null
			? null
			: hours <= MIN_START_HOURS
				? L.level.atMin
				: hours >= MAX_START_HOURS
					? L.level.atMax
					: hoursFromHistory
						? null
						: L.level.typical[level]

	return (
		<FirstRunFrame
			step={1}
			stepCount={SIMPLE_START_STEP_COUNT}
			title={L.level.title}
		>
			<WeekSketch sketch={sketch} />
			<Form method="POST" className="space-y-8" {...getFormProps(form)}>
				<RadioGroupField
					name={fields.level.name}
					legend={<span className="sr-only">{L.level.legend}</span>}
					value={level ?? ''}
					onValueChange={(next) => {
						const picked = TRAINING_LEVELS.find((value) => value === next)
						if (!picked) return
						setLevel(picked)
						if (picked === answers.level && answers.hours != null) {
							ownHours.current = true
							setHours(answers.hours)
						} else {
							ownHours.current = false
							setHours(startingHours(picked))
						}
					}}
					options={TRAINING_LEVELS.map((value) => ({
						value,
						label: L.levels[value].name,
						description: L.levels[value].description,
					}))}
					errorId={fields.level.errorId}
					errors={fields.level.errors}
				/>

				{level != null && hours != null ? (
					<fieldset className="space-y-3" data-start-hours>
						<legend className={QUESTION_LEGEND}>{L.level.hours}</legend>
						<input type="hidden" name={fields.hours.name} value={hours} />
						<div className="flex items-center justify-between gap-3">
							<Button
								type="button"
								variant="outline"
								className="size-14 shrink-0 rounded-full p-0"
								aria-label={L.level.fewer}
								disabled={hours <= MIN_START_HOURS}
								onClick={() => changeHours(hours - START_HOURS_STEP)}
							>
								<Icon name="minus" size="lg" />
							</Button>
							<output
								aria-live="polite"
								className="text-display min-w-0 text-center tabular-nums"
								data-start-hours-value
							>
								{nbHoursWords(hours)}
							</output>
							<Button
								type="button"
								variant="outline"
								className="size-14 shrink-0 rounded-full p-0"
								aria-label={L.level.more}
								disabled={hours >= MAX_START_HOURS}
								onClick={() => changeHours(hours + START_HOURS_STEP)}
							>
								<Icon name="plus" size="lg" />
							</Button>
						</div>
						<p
							className="text-footnote text-muted-foreground"
							data-start-hours-note
						>
							{hoursNote ? `${hoursNote} ` : null}
							{L.level.meaning}
						</p>
						<ErrorList errors={fields.hours.errors} id={fields.hours.errorId} />
						{history ? <StartHistoryCard history={history} /> : null}
					</fieldset>
				) : null}

				{answers.discipline && sameLevel ? (
					<input
						type="hidden"
						name={fields.discipline.name}
						value={answers.discipline}
					/>
				) : null}
				{activities?.map((kind) => (
					<input key={kind} type="hidden" name="activities" value={kind} />
				))}
				{answers.discipline && otherSports?.length
					? [answers.discipline, ...otherSports].map((sport) => (
							<input
								key={sport}
								type="hidden"
								name={fields.sports.name}
								value={sport}
							/>
						))
					: null}
				{startingDays?.map((day) => (
					<input key={day} type="hidden" name={fields.days.name} value={day} />
				))}
				{answers.strength != null ? (
					<input
						type="hidden"
						name={fields.strength.name}
						value={answers.strength}
					/>
				) : null}

				<ErrorList errors={form.errors} id={form.errorId} />
				{/* In the thumb's reach while the answers scroll under it. */}
				<div className="bg-background sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
					<Button type="submit" className="text-callout w-full">
						{L.level.next}
					</Button>
				</div>
			</Form>
			{/* The quiet ways: under the way on, never in its place. */}
			<div className="-mt-2 flex flex-col items-start" data-start-quiet-links>
				{loaderData.connectHref ? (
					<Link to={loaderData.connectHref} className={QUIET_LINK}>
						{H.connect}
					</Link>
				) : null}
				<Link to={loaderData.selfSetUpHref} className={QUIET_LINK}>
					{H.selfSetUp}
				</Link>
			</div>
		</FirstRunFrame>
	)
}

/**
 * A quiet way out of the start: a footnote-sized text link whose whole line
 * is the 44px target (mobile-native), underlined so it reads as a link
 * without a button's weight. An instant tint on press; no motion.
 */
const QUIET_LINK =
	'text-footnote text-muted-foreground decoration-muted-foreground/40 hover:text-foreground active:bg-muted/60 focus-visible:ring-ring/30 -mx-2 flex min-h-11 max-w-full items-center rounded-lg px-2 py-2 underline underline-offset-4 outline-none [text-wrap:pretty] [-webkit-tap-highlight-color:transparent] focus-visible:ring-3'

/** Look again every few seconds while the history is on its way. */
function useImportPoll(importing: boolean) {
	const revalidator = useRevalidator()
	useEffect(() => {
		if (!importing) return
		const timer = window.setInterval(() => {
			if (revalidator.state === 'idle') void revalidator.revalidate()
		}, IMPORT_POLL_MS)
		return () => window.clearInterval(timer)
	}, [importing, revalidator])
}

/**
 * Where the hours and days came from (#578): one line, the arithmetic behind
 * a closed disclosure, and the credits the data asks for, in view under the
 * figures (ADR 0098 §3). `role="status"`, so the import's line giving way to
 * the history's is read out, and the line rises in once as it lands
 * (`motion-reveal`, the history's one moment, seen once).
 */
function StartHistoryCard({ history }: { history: StartHistory }) {
	return (
		<div className="bg-card rounded-4xl shadow-xs" data-start-history>
			<div role="status" className="px-4 py-3">
				{/* Keyed by its words, so the history's line replacing the
				    import's is a new element and `motion-reveal` plays once. */}
				<p
					key={history.line}
					className="text-footnote motion-reveal [text-wrap:pretty]"
					data-start-history-line
				>
					{history.line}
				</p>
			</div>
			{history.arithmetic ? (
				<Collapsible>
					<CollapsibleTrigger className={DISCLOSURE_TRIGGER}>
						<span className="text-footnote">{H.arithmetic}</span>
						<Icon
							name="chevron-down"
							size="md"
							className={DISCLOSURE_CHEVRON}
						/>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div className="space-y-1 px-4 pb-4">
							<p
								className="text-callout break-words tabular-nums"
								data-start-history-arithmetic
							>
								{history.arithmetic}
							</p>
							<p className="text-footnote text-muted-foreground">
								{H.arithmeticNote}
							</p>
						</div>
					</CollapsibleContent>
				</Collapsible>
			) : null}
			<SourceCredits credits={history.credits} className="gap-2 px-4 pb-3" />
		</div>
	)
}
