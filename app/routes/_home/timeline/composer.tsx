/**
 * **The session composer** (owner decisions 1, 4, 5, 7 and 11, round 2; ADR
 * 0088; prototype variant D with C's tokens): one component, the same in
 * every container — the phone's Drawer, the Sheet between `lg` and `xl`, the
 * day pane from `xl`.
 *
 * The **compact** part is what a quick session needs: the day (a week strip,
 * on a phone), where to start from (Skriv · Bibliotek · Kopier · Appen), the
 * sport (with **Annet**), the line, and under it what the reader understood,
 * the week's sum before → after against its target, and _Legg til_ ·
 * _Gjør grundigere_ · _Avbryt_. With the line empty, _Legg til_ is the stamp
 * (`Legg til 45 min Z2`, ADR 0065 §5). On a day gone by, _Allerede gjort_.
 *
 * The **full** part ("Gjør grundigere") is the line's blocks and steps, with
 * steppers for a repeat and a rest that write back into the line, a part
 * added, and a note — and the way to the full editor for what no line says.
 *
 * Nothing here posts by itself: it builds `composerPost` and hands it to the
 * composer's context, the one write path.
 */
import {
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from 'react'
import { Link, useFetcher } from 'react-router'
import { ScoreStanza } from '#app/components/score-stanza.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Switch } from '#app/components/ui/switch.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import {
	SegmentedControl,
	ToggleGroup,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import { type loader as sourcesLoader } from '#app/routes/resources/composer-sources.tsx'
import { type loader as weekSumLoader } from '#app/routes/resources/week-sum.tsx'
import {
	addDays,
	mondayOfDay,
	weekdayIndex,
} from '#app/utils/athlete-calendar.ts'
import { STAMP_SENTENCE } from '#app/utils/day-stamp.ts'
import { formatNbVolumeFigure } from '#app/utils/format.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import {
	type ComposerSourceKey,
	NB_VOLUME_UNITS,
	NB_WEEKDAYS_SHORT,
	nbDisciplineLabel,
	nbDurationLabel,
	SESSION_COMPOSER_LABELS,
	WRITING_LINE_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { weekSumPreviewLine } from '#app/utils/plan-outline/week-sum-words.ts'
import {
	trackForDiscipline,
	weekSumPreview,
} from '#app/utils/plan-outline/week-sum.ts'
import {
	deriveWorkoutNotation,
	type NotationInput,
} from '#app/utils/workout-notation.ts'
import {
	MAX_SENTENCE_LENGTH,
	type ParsedSentence,
	replaceWord,
	sentenceNotationInput,
} from '#app/utils/workout-sentence.ts'
import { MAX_COMPOSER_NOTE_LENGTH } from '#app/utils/writing-line-schema.ts'
import { useComposer, useComposerStatus } from './composer-context.tsx'
import {
	COMPOSER_SPORTS,
	type ComposerPlan,
	composerPlan,
	composerPost,
	composerReducer,
	type ComposerSport,
	type ComposerState,
	initialComposerState,
	nudgeBlock,
	offersDone,
	planShape,
	readerChip,
	readLine,
} from './composer-model.ts'
import { dayTitle } from './day-lookup.ts'
import { DiscDot } from './disc-dot.tsx'

const SOURCES: readonly ComposerSourceKey[] = [
	'skriv',
	'bibliotek',
	'kopier',
	'appen',
]

export type ComposerLayout = 'drawer' | 'pane'

/** What the Drawer needs to know to size its compact snap. */
export type CompactLayout = { height: number; key: string }

export function SessionComposer({
	dayKey,
	layout,
	full,
	onDeeper,
	onCancel,
	onDayChange,
	onSourceChange,
	onCompactLayout,
	inputRef,
	headingId,
}: {
	/** The day it opens on — the tapped day, or the pane's picked day. */
	dayKey: string
	layout: ComposerLayout
	/** Whether the full part shows: the Drawer's top snap, or the pane opened. */
	full: boolean
	onDeeper: () => void
	onCancel: () => void
	/** The pane's day follows the composer's (and the other way round). */
	onDayChange?: (dayKey: string) => void
	/** The Drawer snaps up for a list and back for the line. */
	onSourceChange?: (source: ComposerSourceKey) => void
	onCompactLayout?: (layout: CompactLayout) => void
	inputRef?: React.RefObject<HTMLTextAreaElement | null>
	/** The container's title, for the composer's own group name. */
	headingId?: string
}) {
	const composer = useComposer()
	const status = useComposerStatus()
	const { todayKey, minDayKey, thresholds, prefill } = composer
	const [state, dispatch] = useReducer(
		composerReducer,
		{ dayKey, todayKey, prefill },
		initialComposerState,
	)
	// The container's day moves the composer's: a pick in the list beside the
	// pane is a new day for the composer, never a new composer.
	useEffect(() => {
		dispatch({ type: 'day', dayKey, todayKey })
	}, [dayKey, todayKey])
	// A write landed: the composer starts over on the same day.
	const landedCount = status.landedCount
	const seenLanded = useRef(landedCount)
	useEffect(() => {
		if (landedCount === seenLanded.current) return
		seenLanded.current = landedCount
		dispatch({
			type: 'reset',
			state: initialComposerState({ dayKey: state.dayKey, todayKey, prefill }),
		})
		// Only a landing resets; the day and the prefill at that moment are read.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [landedCount])

	const parsed = useMemo(
		() => readLine(state.text, state.sport),
		[state.text, state.sport],
	)
	const plan = composerPlan(state, parsed)
	const week = useWeekSum(state.dayKey)
	const sum = useMemo(
		() => weekSumLine(week, planShape(plan), state.sport === 'annet'),
		[plan, state.sport, week],
	)
	const outside = state.dayKey < minDayKey
	const pending = status.pending
	const doneOffered = offersDone(state, todayKey)
	const strengthDone =
		doneOffered && state.done && planDiscipline(plan) === 'strength'

	const submit = () => {
		if (outside || pending || strengthDone) return
		const post = composerPost(state, plan, { todayKey })
		if (!post) return
		composer.submit(post, { title: planTitle(state, plan) })
	}

	const setDay = (next: string) => {
		dispatch({ type: 'day', dayKey: next, todayKey })
		onDayChange?.(next)
	}
	const setSource = (source: ComposerSourceKey) => {
		dispatch({ type: 'source', source })
		onSourceChange?.(source)
	}

	// The compact part's height, for the Drawer's first snap point. Read
	// whenever it changes; the Drawer decides when a change may move it (never
	// on a keystroke — `composer-drawer.tsx`).
	const compactRef = useRef<HTMLDivElement>(null)
	const layoutKey = `${state.dayKey}|${state.source}|${state.sport}|${state.pick?.item.id ?? ''}|${doneOffered}`
	useLayoutEffect(() => {
		const node = compactRef.current
		if (!node || !onCompactLayout) return
		// From the top of the Drawer's popup (the nearest positioned box), so
		// the popup's own travel never enters the measure.
		const report = () =>
			onCompactLayout({
				height: node.offsetTop + node.offsetHeight,
				key: layoutKey,
			})
		report()
		if (typeof ResizeObserver === 'undefined') return
		const observer = new ResizeObserver(report)
		observer.observe(node)
		return () => observer.disconnect()
	}, [layoutKey, onCompactLayout])

	const groupId = useId()
	return (
		<div
			data-composer={layout}
			data-composer-day={state.dayKey}
			role="group"
			aria-labelledby={headingId}
			className="flex min-w-0 flex-col gap-3"
		>
			<div ref={compactRef} className="flex min-w-0 flex-col gap-3">
				{layout === 'drawer' ? (
					<DayStrip
						dayKey={state.dayKey}
						todayKey={todayKey}
						minDayKey={minDayKey}
						onDay={setDay}
					/>
				) : null}
				<SegmentedControl
					value={state.source}
					onValueChange={setSource}
					aria-label={SESSION_COMPOSER_LABELS.source}
					className="w-full"
				>
					{SOURCES.map((source) => (
						<ToggleGroupItem
							key={source}
							value={source}
							data-composer-source={source}
							// Shown but not working yet (owner decision 7): the tab says so
							// rather than vanishing, so the four ways to fill a day stay
							// where the athlete will find the fourth.
							disabled={source === 'appen'}
							className="h-9 flex-1 px-2 text-[13px]"
						>
							{SESSION_COMPOSER_LABELS.sources[source]}
							{source === 'appen' ? (
								<span className="text-muted-foreground ml-1 text-[11px] font-normal">
									{SESSION_COMPOSER_LABELS.soon}
								</span>
							) : null}
						</ToggleGroupItem>
					))}
				</SegmentedControl>

				{state.source === 'skriv' ? (
					<>
						<SportRow
							sport={state.sport}
							onSport={(sport) => dispatch({ type: 'sport', sport })}
						/>
						{state.pick ? (
							<PickedNote
								state={state}
								onClear={() => dispatch({ type: 'clear-pick' })}
							/>
						) : null}
						<ComposerLine
							state={state}
							parsed={parsed}
							plan={plan}
							inputRef={inputRef}
							onText={(text) => dispatch({ type: 'text', text })}
							onSubmit={submit}
							sum={outside ? null : sum}
							thresholds={thresholds}
						/>
					</>
				) : state.source === 'appen' ? (
					<p className="text-footnote text-muted-foreground">
						{SESSION_COMPOSER_LABELS.appenNote}
					</p>
				) : (
					<SourceList
						source={state.source}
						dayKey={state.dayKey}
						sport={state.sport}
						onPick={(pick) => {
							dispatch({ type: 'pick', pick })
							onSourceChange?.('skriv')
						}}
					/>
				)}

				{outside ? (
					<p className="text-footnote text-foreground">
						{WRITING_LINE_LABELS.outsideWindow}
					</p>
				) : null}

				{doneOffered ? (
					<div className="flex items-start gap-3">
						<Switch
							id={`${groupId}-done`}
							data-composer-done
							checked={state.done}
							onCheckedChange={(done) => dispatch({ type: 'done', done })}
							aria-describedby={`${groupId}-done-note`}
							className="mt-0.5"
						/>
						<div className="flex min-w-0 flex-col gap-0.5">
							<label
								htmlFor={`${groupId}-done`}
								className="text-callout text-foreground font-medium"
							>
								{SESSION_COMPOSER_LABELS.done}
							</label>
							<p
								id={`${groupId}-done-note`}
								className="text-footnote text-muted-foreground"
							>
								{strengthDone
									? SESSION_COMPOSER_LABELS.doneStrength
									: state.done
										? SESSION_COMPOSER_LABELS.doneNote
										: SESSION_COMPOSER_LABELS.dayPast}
							</p>
						</div>
					</div>
				) : null}

				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						data-composer-add
						disabled={
							outside ||
							pending ||
							strengthDone ||
							plan.kind === 'none' ||
							state.source !== 'skriv'
						}
						onClick={submit}
						className="rounded-full px-5"
					>
						{pending
							? SESSION_COMPOSER_LABELS.adding
							: plan.kind === 'stamp'
								? SESSION_COMPOSER_LABELS.addStamp(STAMP_SENTENCE)
								: SESSION_COMPOSER_LABELS.add}
					</Button>
					{full ? null : (
						<Button
							type="button"
							variant="outline"
							data-composer-deeper
							onClick={onDeeper}
							className="rounded-full"
						>
							<Icon name="pencil-1" size="xs" aria-hidden />
							{SESSION_COMPOSER_LABELS.deeper}
						</Button>
					)}
					<Button
						type="button"
						variant="ghost"
						data-composer-cancel
						onClick={onCancel}
						className="rounded-full"
					>
						{SESSION_COMPOSER_LABELS.cancel}
					</Button>
				</div>
				{status.failed ? (
					<p role="status" className="text-footnote text-destructive">
						{SESSION_COMPOSER_LABELS.failed}
					</p>
				) : null}
			</div>

			{full ? (
				<DeepSection
					state={state}
					parsed={parsed}
					plan={plan}
					onText={(text) => dispatch({ type: 'text', text })}
					onNotes={(notes) => dispatch({ type: 'notes', notes })}
					inputRef={inputRef}
				/>
			) : null}
		</div>
	)
}

/** The sport a plan writes, where it says one. */
function planDiscipline(plan: ComposerPlan): string | null {
	switch (plan.kind) {
		case 'stamp':
			return plan.discipline
		case 'sentence':
			return plan.parsed.structure?.discipline ?? null
		case 'pick':
			return plan.pick.item.discipline
		case 'none':
			return null
	}
}

/** What the toast quotes: the athlete's words, or the pick's name. */
function planTitle(state: ComposerState, plan: ComposerPlan): string {
	if (plan.kind === 'stamp') return STAMP_SENTENCE
	if (plan.kind === 'pick') return plan.pick.item.title
	return state.text.trim()
}

// ——— The week sum ———————————————————————————————————————————————————————

type WeekRead = NonNullable<Awaited<ReturnType<typeof weekSumLoader>>['week']>

/** The week a day belongs to, read once per day from `resources/week-sum`. */
function useWeekSum(dayKey: string): WeekRead | null {
	const fetcher = useFetcher<typeof weekSumLoader>()
	const { load } = fetcher
	useEffect(() => {
		void load(`/resources/week-sum?day=${dayKey}`)
	}, [dayKey, load])
	return fetcher.data?.day === dayKey ? fetcher.data.week : null
}

/** `Løping neste uke: 30 → 36 km, målet står på 52` — or Annet's, or none. */
function weekSumLine(
	week: WeekRead | null,
	shape: ReturnType<typeof planShape>,
	annet: boolean,
): string | null {
	if (!week || !shape) return null
	if (annet) {
		return weekSumPreviewLine({ kind: 'annet', discipline: shape.discipline })
	}
	const preview = weekSumPreview(
		week.volumes,
		shape,
		trackForDiscipline(week.volumes, shape.discipline),
	)
	const line = weekSumPreviewLine(preview)
	return preview.kind === 'track'
		? `${WRITING_LINE_LABELS.weekLead(nbDisciplineLabel(preview.discipline), week.weekName)} ${line}`
		: line
}

// ——— The day strip ——————————————————————————————————————————————————————

/**
 * One day picker for every way in (#505 story 40): the week of the composer's
 * day as seven days, a week back and forward, and any other day by the
 * platform's own date field — for months ahead, where seven taps a week
 * would be a chore.
 */
function DayStrip({
	dayKey,
	todayKey,
	minDayKey,
	onDay,
}: {
	dayKey: string
	todayKey: string
	minDayKey: string
	onDay: (dayKey: string) => void
}) {
	const monday = mondayOfDay(dayKey)
	const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
	const previous = addDays(monday, -7)
	const dateId = useId()
	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={SESSION_COMPOSER_LABELS.earlierWeek}
					disabled={addDays(previous, 6) < minDayKey}
					onClick={() => onDay(maxKey(addDays(dayKey, -7), minDayKey))}
					className="flex-none rounded-full"
				>
					<Icon name="chevron-right" className="rotate-180" aria-hidden />
				</Button>
				<ToggleGroup
					value={[dayKey]}
					onValueChange={(next) => {
						const picked = next[0]
						if (picked) onDay(picked)
					}}
					aria-label={SESSION_COMPOSER_LABELS.days}
					spacing={1}
					className="grid min-w-0 flex-1 grid-cols-7"
				>
					{days.map((key) => {
						const today = key === todayKey
						return (
							<ToggleGroupItem
								key={key}
								value={key}
								data-composer-day-option={key}
								disabled={key < minDayKey}
								aria-label={dayTitle(key)}
								className={cn(
									'h-14 min-w-0 flex-col gap-0 rounded-2xl px-0 tabular-nums',
									'aria-pressed:bg-primary! aria-pressed:text-primary-foreground!',
									today && 'ring-primary ring-[1.5px] ring-inset',
								)}
							>
								<span className="text-[10.5px] font-semibold tracking-[0.04em] uppercase">
									{NB_WEEKDAYS_SHORT[weekdayIndex(key)]}
								</span>
								<span className="text-[17px]/[1.15] font-semibold">
									{Number(key.slice(8, 10))}
								</span>
							</ToggleGroupItem>
						)
					})}
				</ToggleGroup>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={SESSION_COMPOSER_LABELS.laterWeek}
					onClick={() => onDay(addDays(dayKey, 7))}
					className="flex-none rounded-full"
				>
					<Icon name="chevron-right" aria-hidden />
				</Button>
			</div>
			<label
				htmlFor={dateId}
				className="text-footnote text-muted-foreground flex items-center justify-between gap-2"
			>
				<span>
					<span className="text-foreground font-medium">
						{dayTitle(dayKey)}
					</span>
				</span>
				<span className="flex items-center gap-2">
					{SESSION_COMPOSER_LABELS.otherDay}
					<input
						id={dateId}
						type="date"
						data-composer-date
						value={dayKey}
						min={minDayKey}
						onChange={(event) => {
							const next = event.currentTarget.value
							if (next) onDay(next)
						}}
						// 16px so iOS never zooms; the platform's own picker.
						className="border-border bg-background h-9 rounded-xl border px-2 text-[16px]"
					/>
				</span>
			</label>
		</div>
	)
}

function maxKey(a: string, b: string): string {
	return a > b ? a : b
}

// ——— The sport row ——————————————————————————————————————————————————————

/**
 * The four tracks' sports and **Annet** (owner decision 4): a session that
 * counts in no track — a bike to work — chosen when it is written, not only
 * once it is done.
 */
function SportRow({
	sport,
	onSport,
}: {
	sport: ComposerSport | null
	onSport: (sport: ComposerSport) => void
}) {
	return (
		<ToggleGroup
			value={sport ? [sport] : []}
			onValueChange={(next) => {
				const picked = next[0] as ComposerSport | undefined
				if (picked) onSport(picked)
			}}
			aria-label={SESSION_COMPOSER_LABELS.sport}
			variant="outline"
			spacing={1.5}
			className="flex w-full flex-wrap"
		>
			{COMPOSER_SPORTS.map((value) => (
				<ToggleGroupItem
					key={value}
					value={value}
					data-composer-sport={value}
					className="aria-pressed:border-primary aria-pressed:bg-primary/10! aria-pressed:text-primary h-9 rounded-full px-3 text-[13px] font-semibold"
				>
					{value === 'annet' ? (
						<span
							aria-hidden
							className="border-muted-foreground size-[7px] rounded-full border-[1.5px] border-dashed"
						/>
					) : (
						<DiscDot solid discipline={value} className="size-[7px]" />
					)}
					{value === 'annet'
						? SESSION_COMPOSER_LABELS.annet
						: nbDisciplineLabel(value)}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	)
}

// ——— The line ———————————————————————————————————————————————————————————

/**
 * The line and what it reads as. A textarea that grows with what is typed
 * (`field-sizing: content`, up to four lines) so a long session stays
 * readable while it is written; 16px so iOS never zooms; Enter writes, as
 * the return key's _done_ says.
 *
 * Nothing under it animates: it changes on every keystroke, and a keystroke
 * is the one action that must never wait for motion (Emil).
 */
function ComposerLine({
	state,
	parsed,
	plan,
	inputRef,
	onText,
	onSubmit,
	sum,
	thresholds,
}: {
	state: ComposerState
	parsed: ParsedSentence
	plan: ComposerPlan
	inputRef?: React.RefObject<HTMLTextAreaElement | null>
	onText: (text: string) => void
	onSubmit: () => void
	sum: string | null
	thresholds: DisciplineThresholdMap
}) {
	const ownRef = useRef<HTMLTextAreaElement>(null)
	const ref = inputRef ?? ownRef
	const typed = state.text.trim().length > 0
	const notationInput: NotationInput | null =
		plan.kind === 'pick'
			? plan.pick.item.notation
			: parsed.structure
				? sentenceNotationInput(parsed.structure)
				: null
	const notation = useMemo(
		() =>
			notationInput
				? deriveWorkoutNotation(notationInput, { thresholds })
				: null,
		[notationInput, thresholds],
	)
	const totals =
		plan.kind === 'sentence'
			? [
					parsed.totals.distanceM != null
						? `${formatNbVolumeFigure(parsed.totals.distanceM / 1000, 'km')} ${NB_VOLUME_UNITS.km}`
						: null,
					parsed.totals.durationSec != null
						? nbDurationLabel(parsed.totals.durationSec)
						: null,
				].filter((part): part is string => part != null)
			: []
	const hint =
		plan.kind === 'none' && plan.reason === 'annet'
			? SESSION_COMPOSER_LABELS.annetNote
			: plan.kind === 'none' && plan.reason === 'strength'
				? SESSION_COMPOSER_LABELS.strengthNote
				: !typed && plan.kind === 'stamp'
					? WRITING_LINE_LABELS.hint
					: null
	const problems = typed
		? parsed.problems
				.filter((problem) => problem !== 'empty')
				// An unknown word already says what is wrong with the part it stands
				// in; "no quantity" under it would be the same news twice.
				.filter(
					(problem) =>
						!(problem === 'no-quantity' && parsed.unknown.length > 0),
				)
		: []

	return (
		<div className="flex min-w-0 flex-col gap-2">
			<Textarea
				ref={ref}
				data-composer-input
				rows={1}
				value={state.text}
				onChange={(event) => onText(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key !== 'Enter' || event.shiftKey) return
					event.preventDefault()
					if (plan.kind !== 'none') onSubmit()
				}}
				aria-label={WRITING_LINE_LABELS.input}
				placeholder={WRITING_LINE_LABELS.placeholder}
				maxLength={MAX_SENTENCE_LENGTH}
				autoComplete="off"
				autoCapitalize="off"
				autoCorrect="off"
				spellCheck={false}
				enterKeyHint="done"
				className="max-h-[calc(4lh+1.5rem)] min-h-12 overflow-y-auto py-3 text-[16px]/[1.35] md:text-[16px]"
			/>
			{/* A fixed floor, so the Drawer's compact snap holds what the line
			    says as it is typed rather than moving with every keystroke. */}
			<div
				data-composer-preview
				aria-live="polite"
				className="flex min-h-[4.5rem] flex-col gap-1.5"
			>
				{hint ? (
					<p className="text-footnote text-muted-foreground">{hint}</p>
				) : null}
				{notation ? (
					<div data-composer-understood className="flex flex-col gap-1">
						<ScoreStanza notation={notation} className="text-[14px]" />
						{totals.length > 0 ? (
							<p className="text-footnote text-muted-foreground tabular-nums">
								{WRITING_LINE_LABELS.totals(totals)}
							</p>
						) : null}
					</div>
				) : null}
				{parsed.unknown.map((word) => (
					<div
						key={`${word.start}-${word.text}`}
						data-composer-unknown={word.text}
						className="flex flex-wrap items-center gap-1.5"
					>
						<span className="text-footnote text-foreground">
							{WRITING_LINE_LABELS.unread[word.reason](word.text)}
						</span>
						{word.suggestions.length > 0 ? (
							<span
								role="group"
								aria-label={WRITING_LINE_LABELS.suggestionsFor(word.text)}
								className="flex flex-wrap gap-1.5"
							>
								{word.suggestions.map((suggestion) => (
									<Button
										key={suggestion}
										type="button"
										variant="outline"
										size="sm"
										data-composer-suggestion={suggestion}
										aria-label={WRITING_LINE_LABELS.replace(
											word.text,
											suggestion,
										)}
										onClick={() => {
											onText(replaceWord(state.text, word, suggestion))
											ref.current?.focus()
										}}
										className="border-primary text-primary bg-primary/10 rounded-full"
									>
										{suggestion}
									</Button>
								))}
							</span>
						) : word.reason === 'unknown-word' ? (
							<span className="text-footnote text-muted-foreground">
								{WRITING_LINE_LABELS.noSuggestion}
							</span>
						) : null}
					</div>
				))}
				{problems.map((problem) => (
					<p
						key={problem}
						data-composer-problem={problem}
						className="text-footnote text-foreground"
					>
						{problem === 'no-discipline' && state.sport === 'annet'
							? SESSION_COMPOSER_LABELS.annetNoDiscipline
							: WRITING_LINE_LABELS.problems[problem]}
					</p>
				))}
				{sum ? (
					<p
						data-composer-week-sum
						className="text-footnote text-foreground font-semibold tabular-nums"
					>
						{sum}
					</p>
				) : null}
			</div>
		</div>
	)
}

/** Where the line was filled from, and the way to let go of it. */
function PickedNote({
	state,
	onClear,
}: {
	state: ComposerState
	onClear: () => void
}) {
	const pick = state.pick
	if (!pick) return null
	return (
		<div
			data-composer-picked={pick.source}
			className="bg-muted/60 flex items-start gap-2 rounded-2xl px-3 py-2"
		>
			<span aria-hidden className="text-muted-foreground pt-0.5">
				{pick.source === 'bibliotek' ? '▤' : '⧉'}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-callout text-foreground font-medium [overflow-wrap:anywhere]">
					{pick.item.title}
				</span>
				<span className="text-footnote text-muted-foreground">
					{pick.item.sentence == null
						? SESSION_COMPOSER_LABELS.whole
						: SESSION_COMPOSER_LABELS.picked[pick.source]}
				</span>
			</div>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label={SESSION_COMPOSER_LABELS.clearPick}
				onClick={onClear}
				className="flex-none rounded-full"
			>
				<Icon name="cross-1" aria-hidden />
			</Button>
		</div>
	)
}

// ——— Bibliotek and Kopier ——————————————————————————————————————————————

/**
 * The sessions a day can start from (owner decisions 1 and 11). Picking one
 * fills the line with it as tokens to adjust; one the line cannot say is
 * placed whole. A day that cannot be filled says why instead of listing
 * things that would write nothing.
 */
function SourceList({
	source,
	dayKey,
	sport,
	onPick,
}: {
	source: 'bibliotek' | 'kopier'
	dayKey: string
	sport: ComposerSport | null
	onPick: (pick: NonNullable<ComposerState['pick']>) => void
}) {
	const fetcher = useFetcher<typeof sourcesLoader>()
	const { load } = fetcher
	const [weeksBack, setWeeksBack] = useState(1)
	const discipline = sport && sport !== 'annet' ? sport : null
	useEffect(() => {
		const params = new URLSearchParams({ day: dayKey })
		if (discipline) params.set('discipline', discipline)
		if (source === 'kopier') params.set('weeksBack', String(weeksBack))
		void load(`/resources/composer-sources?${params}`)
	}, [dayKey, discipline, load, source, weeksBack])
	const data = fetcher.data?.day === dayKey ? fetcher.data : null
	if (!data) {
		return (
			<p className="text-footnote text-muted-foreground">
				{SESSION_COMPOSER_LABELS.loading}
			</p>
		)
	}
	const outside = data.firstDayKey != null && dayKey < data.firstDayKey
	const items = source === 'bibliotek' ? data.library : data.copy.items
	return (
		<div className="flex min-w-0 flex-col gap-2" data-composer-list={source}>
			{source === 'kopier' && data.copy.weekKey ? (
				<p className="text-footnote text-muted-foreground">
					{SESSION_COMPOSER_LABELS.copyFrom(weekPhrase(data.copy.weekKey))}
				</p>
			) : null}
			{items.length === 0 ? (
				<p className="text-footnote text-muted-foreground">
					{source === 'bibliotek'
						? SESSION_COMPOSER_LABELS.libraryEmpty
						: SESSION_COMPOSER_LABELS.copyEmpty}
				</p>
			) : (
				<ul className="flex flex-col gap-1.5">
					{items.map((item) => (
						<li key={item.id}>
							<button
								type="button"
								data-composer-pick={item.id}
								disabled={outside}
								aria-label={SESSION_COMPOSER_LABELS.pick(item.title)}
								onClick={() => onPick({ source, item })}
								className="pressable bg-muted/60 hover:bg-muted flex min-h-14 w-full flex-col items-start gap-0.5 rounded-2xl px-3 py-2 text-left disabled:opacity-50"
							>
								<span className="text-footnote text-muted-foreground flex items-center gap-1.5">
									<DiscDot
										solid
										discipline={item.discipline}
										className="size-[6px]"
									/>
									{[nbDisciplineLabel(item.discipline), item.label]
										.filter(Boolean)
										.join(' · ')}
								</span>
								<span className="text-callout text-foreground font-semibold [overflow-wrap:anywhere]">
									{item.title}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
			{source === 'kopier' ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setWeeksBack((weeks) => Math.min(26, weeks + 1))}
					className="self-start rounded-full"
				>
					{SESSION_COMPOSER_LABELS.copyEarlier}
				</Button>
			) : null}
		</div>
	)
}

/** `uke 41`, by its Monday. */
function weekPhrase(weekKey: string): string {
	return `uka som startet ${dayTitle(weekKey)}`
}

// ——— Gjør grundigere ————————————————————————————————————————————————————

/**
 * The full snap: the line's blocks and steps, each with what can be nudged
 * without the keyboard — the repeat count and the rest after the work — as
 * steppers that write back into the line, so the line stays the one source
 * of what is written. A number is typed on the numeric keypad
 * (`inputMode="numeric"`). Under them a note, and the full editor for what no
 * line says (a lift, a series, a cadence).
 */
function DeepSection({
	state,
	parsed,
	plan,
	onText,
	onNotes,
	inputRef,
}: {
	state: ComposerState
	parsed: ParsedSentence
	plan: ComposerPlan
	onText: (text: string) => void
	onNotes: (notes: string) => void
	inputRef?: React.RefObject<HTMLTextAreaElement | null>
}) {
	const structure = parsed.structure
	const notesId = useId()
	const params = new URLSearchParams({ date: state.dayKey })
	const editorSport =
		state.sport && state.sport !== 'annet' ? state.sport : null
	if (editorSport) params.set('discipline', editorSport)
	return (
		<div data-composer-deep className="flex flex-col gap-4 pt-1">
			<section className="flex flex-col gap-2">
				<h3 className="text-overline text-muted-foreground uppercase">
					{SESSION_COMPOSER_LABELS.blocks}
				</h3>
				{structure && plan.kind === 'sentence'
					? structure.blocks.map((block, index) => {
							const rest = block.steps.find((step) => step.kind === 'rest')
							const work = block.steps.filter((step) => step.kind !== 'rest')
							const nudge = (patch: Parameters<typeof nudgeBlock>[2]) => {
								const next = nudgeBlock(structure, index, patch)
								if (next) onText(next)
							}
							return (
								<div
									key={index}
									data-composer-block={index}
									className="bg-muted/60 flex flex-col gap-2 rounded-2xl p-3"
								>
									<p className="text-callout text-foreground">
										{work.map(stepWords).join(' · ')}
									</p>
									{work.length === 1 && work[0]?.kind === 'cardio' ? (
										<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
											<Stepper
												label={SESSION_COMPOSER_LABELS.repeat}
												value={block.repeatCount}
												display={
													block.repeatCount > 1
														? SESSION_COMPOSER_LABELS.times(block.repeatCount)
														: SESSION_COMPOSER_LABELS.once
												}
												onChange={(repeatCount) => nudge({ repeatCount })}
											/>
											{block.repeatCount > 1 ? (
												<RestField
													value={rest?.durationSec ?? null}
													onChange={(restSec) => nudge({ restSec })}
												/>
											) : null}
										</div>
									) : null}
								</div>
							)
						})
					: null}
				<div className="flex flex-wrap gap-2">
					{plan.kind === 'sentence' ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => {
								onText(`${state.text.trim()} + `)
								inputRef?.current?.focus()
							}}
							className="rounded-full"
						>
							<Icon name="plus" size="xs" aria-hidden />
							{SESSION_COMPOSER_LABELS.addPart}
						</Button>
					) : null}
					<Link
						to={`/training/sessions/new?${params}`}
						className={cn(
							buttonVariants({ variant: 'ghost', size: 'sm' }),
							'rounded-full',
						)}
					>
						{SESSION_COMPOSER_LABELS.fullEditor}
					</Link>
				</div>
			</section>
			<section className="flex flex-col gap-2">
				<label
					htmlFor={notesId}
					className="text-overline text-muted-foreground uppercase"
				>
					{SESSION_COMPOSER_LABELS.notes}
				</label>
				<Textarea
					id={notesId}
					data-composer-notes
					value={state.notes}
					maxLength={MAX_COMPOSER_NOTE_LENGTH}
					onChange={(event) => onNotes(event.currentTarget.value)}
					placeholder={SESSION_COMPOSER_LABELS.notesPlaceholder}
					className="max-h-48 min-h-20 text-[16px] md:text-[16px]"
				/>
			</section>
		</div>
	)
}

type Step = NonNullable<
	ParsedSentence['structure']
>['blocks'][number]['steps'][number]

function stepWords(step: Step): string {
	if (step.kind !== 'cardio') return ''
	return [
		step.distanceM != null
			? step.distanceM >= 1000
				? `${formatNbVolumeFigure(step.distanceM / 1000, 'km')} km`
				: `${step.distanceM} m`
			: null,
		step.durationSec != null ? nbDurationLabel(step.durationSec) : null,
	]
		.filter(Boolean)
		.join(' · ')
}

/** − value + — 44px each, the value set in tabular figures. */
function Stepper({
	label,
	value,
	display,
	onChange,
}: {
	label: string
	value: number
	display: string
	onChange: (value: number) => void
}) {
	return (
		<div role="group" aria-label={label} className="flex items-center gap-1.5">
			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				aria-label={SESSION_COMPOSER_LABELS.fewer(label)}
				disabled={value <= 1}
				onClick={() => onChange(value - 1)}
				className="rounded-full"
			>
				<Icon name="minus" aria-hidden />
			</Button>
			<span className="text-callout min-w-[5.5rem] text-center font-semibold tabular-nums">
				{display}
			</span>
			<Button
				type="button"
				variant="outline"
				size="icon-sm"
				aria-label={SESSION_COMPOSER_LABELS.more(label)}
				disabled={value >= 50}
				onClick={() => onChange(value + 1)}
				className="rounded-full"
			>
				<Icon name="plus" aria-hidden />
			</Button>
		</div>
	)
}

/** The rest after the work, typed on the numeric keypad, in seconds. */
function RestField({
	value,
	onChange,
}: {
	value: number | null
	onChange: (seconds: number | null) => void
}) {
	const id = useId()
	const [draft, setDraft] = useState(value == null ? '' : String(value))
	useEffect(() => setDraft(value == null ? '' : String(value)), [value])
	const commit = () => {
		const seconds = Number(draft)
		if (draft.trim() === '') onChange(null)
		else if (Number.isInteger(seconds) && seconds > 0 && seconds <= 3600)
			onChange(seconds)
		else setDraft(value == null ? '' : String(value))
	}
	return (
		<label
			htmlFor={id}
			className="text-footnote text-muted-foreground flex items-center gap-2"
		>
			{SESSION_COMPOSER_LABELS.rest}
			<input
				id={id}
				type="text"
				inputMode="numeric"
				pattern="[0-9]*"
				enterKeyHint="done"
				value={draft}
				onChange={(event) => setDraft(event.currentTarget.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key !== 'Enter') return
					event.preventDefault()
					commit()
				}}
				className="border-border bg-background text-foreground h-11 w-20 rounded-xl border px-3 text-[16px] tabular-nums"
			/>
		</label>
	)
}
