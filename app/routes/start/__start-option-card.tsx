/**
 * One **Start Option** as the athlete reads it (#566, #581): the presented
 * card (`cardOf`, every word from the labels module) and its week — the bar of
 * easy, middling and hard time, what the week comes to, and each day with its
 * session or _fri_ (`StartOptionWeekView`).
 *
 * Shared by the start's _Tre måter å trene på_ (`valg.tsx`) and _Plan_'s
 * _Bytt treningsform_ (`training/__treningsform.tsx`), so the ways to train read
 * the same in both places. Each page keeps its own card frame, heading and
 * action.
 */
import { Badge } from '#app/components/ui/badge.tsx'
import { type EffortWord } from '#app/utils/effort-word.ts'
import {
	type StartOption,
	type StartWeek,
	type StartWeekSession,
} from '#app/utils/first-run/start-draft.ts'
import {
	ACTIVITIES_EDIT_LABELS,
	FIRST_RUN_LABELS,
	NB_WEEKDAY_LABELS,
	nbDurationLabel,
	nbHoursWords,
	PHILOSOPHY_LABELS,
	SESONG_NOTICE_LABELS,
	SESSION_PREFERENCE_LABELS,
	START_OPTION_LABELS,
	START_SIMPLE_ACTIVITY_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { WeekBlocks } from './__week-sketch.tsx'

const L = START_OPTION_LABELS

function duration(minutes: number): string {
	return nbDurationLabel(minutes * 60)
}

function percent(part: number, whole: number): number {
	return whole === 0 ? 0 : Math.round((part / whole) * 100)
}

export type StartCard = StartWeekCard & {
	family: StartOption['family']
	name: string
	why: string
	familyName: string
	badge: string | null
	chooseLabel: string
}

/**
 * A Start Option's week as the athlete reads it, without the card around it
 * (its name, its reason, its badge): what `StartOptionWeekView` draws. _Meg_'s
 * activities edit reads a family's week this way, whatever the family
 * (ADR 0109 §5).
 */
export type StartWeekCard = {
	/** The week as _Uka di_ draws it: the card's blocks (#584). */
	week: StartWeek
	days: Array<{
		/** `mandag`, as a screen reader hears the row. */
		weekday: string
		/** `ma`, as the row shows it. */
		short: string
		sessions: Array<{
			title: string
			discipline: StartWeekSession['discipline']
			effort: EffortWord
			/** `45 min · rolig`. */
			facts: string
			/** The athlete's own session, kept on its day (ADR 0109 §5). */
			kept?: boolean
		}>
		/** The day's strength session, by its title and its lifts (#574). */
		lifting: Array<{ title: string; lifts: string; kept?: boolean }>
	}>
	/** Minutes at each effort, the bar's widths. */
	effortMinutes: Record<EffortWord, number>
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
}

/** A card as the athlete reads it, every word from the labels module. */
export function cardOf(
	option: StartOption,
	badge: string | null,
	hours: number,
	strengthChosen: number | null,
): StartCard {
	if (option.family === 'masters') throw new Error('Masters is not offered')
	const plain = L.plain[option.family]
	return {
		family: option.family,
		name: plain.name,
		why: plain.why,
		familyName: L.familyName(PHILOSOPHY_LABELS[option.family]),
		badge,
		chooseLabel: L.chooseLabel(plain.name),
		...weekCardOf(option, hours, strengthChosen),
	}
}

/**
 * A Start Option's week as the athlete reads it, every word from the labels
 * module: its days, its figures and the start's notes on it.
 */
export function weekCardOf(
	option: StartOption,
	hours: number,
	strengthChosen: number | null,
): StartWeekCard {
	const { week } = option
	return {
		week,
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
				...(session.kept ? { kept: true } : {}),
			})),
			lifting: day.lifting.map((lift) => ({
				title: lift.title,
				lifts: lift.lifts.join(' · '),
				...(lift.kept ? { kept: true } : {}),
			})),
		})),
		effortMinutes: week.minutesByEffort,
		barLabel: L.effortBar(
			percent(week.minutesByEffort.rolig, week.minutes),
			percent(week.minutesByEffort.middels, week.minutes),
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
						...liftingClashLines(option),
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
	}
}

/**
 * Where the lifts had to go on or the day before a hard day, or on the long
 * day, because the days left no other (spec #588 story 40): the day check's
 * own lines, once each, in week 1's order.
 */
function liftingClashLines(option: StartOption): string[] {
	const lines = option.draft.dayClashes
		.filter((clash) => clash.fromWeekIndex === 0)
		.filter((clash) => clash.reason.startsWith('lifting-'))
		.map((clash) => SESONG_NOTICE_LABELS.dayClash(clash.reason, clash.weekday))
	return [...new Set(lines)]
}

/**
 * _Din_ beside a session the athlete wrote or adopted, kept on its day in a
 * week the plan is laid again around it (ADR 0109 §5); a screen reader hears
 * _din økt_.
 */
function KeptBadge() {
	return (
		<Badge variant="secondary" className="shrink-0" data-kept-session>
			<span aria-hidden>{ACTIVITIES_EDIT_LABELS.yours}</span>
			<span className="sr-only">{ACTIVITIES_EDIT_LABELS.yoursSr}</span>
		</Badge>
	)
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
const EFFORT_FILL: Record<EffortWord, string> = {
	rolig: 'bg-primary/30',
	middels: 'bg-primary/65',
	hard: 'bg-primary',
}

const EFFORT_ORDER: EffortWord[] = ['rolig', 'middels', 'hard']

/**
 * A card's week: the week as blocks (the same blocks _Uka di_ draws, so the
 * top card reads as the sketch it morphs out of), the effort bar and its
 * figures, the days, and the notes on strength, short hours and what did not
 * fit. The blocks are a picture: the rows say the same week.
 */
export function StartOptionWeekView({ card }: { card: StartWeekCard }) {
	return (
		<>
			<WeekBlocks week={card.week} />
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
					<span className="text-foreground font-semibold">{card.total}</span>
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
						<span aria-hidden className="text-muted-foreground text-caption">
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
											{session.kept ? <KeptBadge /> : null}
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
											{lift.kept ? <KeptBadge /> : null}
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
		</>
	)
}
