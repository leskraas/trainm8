/**
 * The **writing line** (#505 stories 35–41): a session typed as a short
 * sentence, and — while the athlete types — what the app understood, what it
 * does to the week, and what to write instead of a word it did not know.
 *
 * It lives where writing already lived on I dag: in the tapped empty day's
 * draft (ADR 0065 §5), beside the Discipline chips and the stamp it extends,
 * and behind the creation menu's "Skriv en økt" for a day the list does not
 * show as empty — a day that already has a session, or one far ahead of the
 * weeks the list has mounted. Both post the same intent to home's own action.
 *
 * Three things under the input, and none of them is the typed text echoed back:
 * the session as the **Token Sentence** rendered from the structure the reader
 * produced (the same rendering the row will show once saved), the week sum
 * before → after against the **Week Target** (`weekSumPreview`, which never
 * moves the target), and a suggestion for every word the reader did not know.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { ScoreStanza } from '#app/components/score-stanza.tsx'
import { type loader as weekSumLoader } from '#app/routes/resources/week-sum.tsx'
import { addDays } from '#app/utils/athlete-calendar.ts'
import { isStampableDiscipline } from '#app/utils/day-stamp.ts'
import { formatNbVolumeFigure } from '#app/utils/format.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import {
	DAY_STAMP_LABELS,
	NB_VOLUME_UNITS,
	nbDisciplineLabel,
	nbDurationLabel,
	WRITING_LINE_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { weekSumPreviewLine } from '#app/utils/plan-outline/week-sum-words.ts'
import {
	trackForDiscipline,
	weekSumPreview,
} from '#app/utils/plan-outline/week-sum.ts'
import { deriveWorkoutNotation } from '#app/utils/workout-notation.ts'
import {
	CARDIO_DISCIPLINES,
	type CardioDiscipline,
	DISCIPLINES,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import {
	MAX_SENTENCE_LENGTH,
	type ParsedSentence,
	parseWorkoutSentence,
	replaceWord,
	sentenceNotationInput,
} from '#app/utils/workout-sentence.ts'
import { useDayStamp } from './day-stamp-context.tsx'
import { DiscDot } from './disc-dot.tsx'

/** The chip, as the reader takes it: a sport the line can say, or none. */
export function cardioChip(chip: Discipline | null): CardioDiscipline | null {
	return chip != null && isStampableDiscipline(chip) ? chip : null
}

/** The sentence as the reader sees it, for the chip the athlete has chosen. */
export function useParsedSentence(
	text: string,
	chip: Discipline | null,
): ParsedSentence {
	return useMemo(
		() => parseWorkoutSentence(text, { discipline: cardioChip(chip) }),
		[text, chip],
	)
}

/**
 * The input and its preview. Controlled: the draft that holds it decides what
 * its button does with the text (stamp `45 min Z2` while it is empty, write the
 * sentence once it says something).
 */
export function WritingLine({
	dayKey,
	text,
	onText,
	parsed,
	thresholds,
	onSubmit,
	autoFocus = false,
	emptyHint = null,
}: {
	dayKey: string
	text: string
	onText: (text: string) => void
	parsed: ParsedSentence
	thresholds: DisciplineThresholdMap
	/** Enter on a sentence the reader is sure of. */
	onSubmit: () => void
	autoFocus?: boolean
	/** What the line says while it is empty — the draft's stamp, if any. */
	emptyHint?: string | null
}) {
	const inputRef = useRef<HTMLInputElement>(null)
	const week = useWeekSum(dayKey)
	const typed = text.trim().length > 0

	const notation = useMemo(
		() =>
			parsed.structure
				? deriveWorkoutNotation(sentenceNotationInput(parsed.structure), {
						thresholds,
					})
				: null,
		[parsed.structure, thresholds],
	)

	const sum = useMemo(() => {
		if (!parsed.structure || !week) return null
		const preview = weekSumPreview(
			week.volumes,
			parsed.structure,
			trackForDiscipline(week.volumes, parsed.structure.discipline),
		)
		const line = weekSumPreviewLine(preview)
		return preview.kind === 'track'
			? `${WRITING_LINE_LABELS.weekLead(nbDisciplineLabel(preview.discipline), week.weekName)} ${line}`
			: line
	}, [parsed.structure, week])

	const totals = [
		parsed.totals.distanceM != null
			? `${formatNbVolumeFigure(parsed.totals.distanceM / 1000, 'km')} ${NB_VOLUME_UNITS.km}`
			: null,
		parsed.totals.durationSec != null
			? nbDurationLabel(parsed.totals.durationSec)
			: null,
	].filter((part): part is string => part != null)

	return (
		<div className="flex min-w-0 flex-col gap-2">
			<input
				ref={inputRef}
				data-writing-input
				type="text"
				value={text}
				onChange={(event) => onText(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key !== 'Enter') return
					event.preventDefault()
					if (parsed.structure) onSubmit()
				}}
				aria-label={WRITING_LINE_LABELS.input}
				placeholder={WRITING_LINE_LABELS.placeholder}
				autoFocus={autoFocus}
				maxLength={MAX_SENTENCE_LENGTH}
				autoComplete="off"
				autoCapitalize="off"
				autoCorrect="off"
				spellCheck={false}
				enterKeyHint="done"
				// 16px, never less: iOS zooms the page into any input whose text is
				// smaller, and a list that jumps every time the athlete writes is the
				// opposite of a notebook (#505 story 41).
				className="border-border bg-background focus-visible:border-primary h-11 w-full min-w-0 rounded-[10px] border px-3 text-[16px]/[1.2] outline-none"
			/>
			<div
				data-writing-preview
				aria-live="polite"
				className="flex flex-col gap-1.5"
			>
				{!typed && emptyHint ? (
					<p className="text-muted-foreground text-[11px]/[1.35]">
						{emptyHint}
					</p>
				) : null}
				{notation ? (
					<div data-writing-understood className="flex flex-col gap-1">
						<span className="text-muted-foreground text-[10.5px]/[1.2] font-bold tracking-[0.04em] uppercase">
							{WRITING_LINE_LABELS.understood}
						</span>
						<ScoreStanza notation={notation} className="text-[13px]" />
						{totals.length > 0 ? (
							<p
								data-writing-totals
								className="text-foreground text-[12px]/[1.35] tabular-nums"
							>
								{WRITING_LINE_LABELS.totals(totals)}
							</p>
						) : null}
					</div>
				) : null}
				{sum ? (
					<p
						data-writing-week-sum
						className="text-foreground text-[12.5px]/[1.35] font-semibold tabular-nums"
					>
						{sum}
					</p>
				) : null}
				{parsed.unknown.map((word) => (
					<div
						key={`${word.start}-${word.text}`}
						data-writing-unknown={word.text}
						className="flex flex-wrap items-center gap-1.5"
					>
						<span className="text-foreground text-[12px]/[1.35]">
							{WRITING_LINE_LABELS.unread[word.reason](word.text)}
						</span>
						{word.suggestions.length > 0 ? (
							<span
								role="group"
								aria-label={WRITING_LINE_LABELS.suggestionsFor(word.text)}
								className="flex flex-wrap gap-1.5"
							>
								{word.suggestions.map((suggestion) => (
									<button
										key={suggestion}
										type="button"
										data-writing-suggestion={suggestion}
										aria-label={WRITING_LINE_LABELS.replace(
											word.text,
											suggestion,
										)}
										onClick={() => {
											onText(replaceWord(text, word, suggestion))
											inputRef.current?.focus()
										}}
										className="border-primary text-primary bg-primary/10 flex h-[30px] items-center rounded-[9px] border px-2.5 text-[12px]/[1] font-semibold"
									>
										{suggestion}
									</button>
								))}
							</span>
						) : word.reason === 'unknown-word' ? (
							<span className="text-muted-foreground text-[11px]/[1.35]">
								{WRITING_LINE_LABELS.noSuggestion}
							</span>
						) : null}
					</div>
				))}
				{typed
					? parsed.problems
							.filter((problem) => problem !== 'empty')
							// An unknown word already says what is wrong with the part it
							// stands in; "no quantity" under it would be the same news twice.
							.filter(
								(problem) =>
									!(problem === 'no-quantity' && parsed.unknown.length > 0),
							)
							.map((problem) => (
								<p
									key={problem}
									data-writing-problem={problem}
									className="text-foreground text-[12px]/[1.35]"
								>
									{WRITING_LINE_LABELS.problems[problem]}
								</p>
							))
					: null}
			</div>
		</div>
	)
}

/** The week a day belongs to, read once per day from `resources/week-sum`. */
function useWeekSum(dayKey: string) {
	const fetcher = useFetcher<typeof weekSumLoader>()
	const { load } = fetcher
	useEffect(() => {
		void load(`/resources/week-sum?day=${dayKey}`)
	}, [dayKey, load])
	return fetcher.data?.day === dayKey ? fetcher.data.week : null
}

const CHIP =
	'flex h-[30px] items-center gap-1.5 rounded-[9px] border px-2.5 text-[11.5px]/[1] font-semibold'

/** The Discipline chips, shared by the day's draft and the panel. */
export function DisciplineChips({
	chosen,
	onChoose,
	label,
	disciplines = DISCIPLINES,
}: {
	chosen: Discipline | null
	onChoose: (discipline: Discipline) => void
	label: string
	disciplines?: readonly Discipline[]
}) {
	return (
		<div
			role="radiogroup"
			aria-label={label}
			className="flex flex-wrap gap-1.5"
		>
			{disciplines.map((discipline) => {
				const active = chosen === discipline
				return (
					<button
						key={discipline}
						type="button"
						role="radio"
						aria-checked={active}
						onClick={() => onChoose(discipline)}
						className={cn(
							CHIP,
							active
								? 'border-primary text-primary bg-primary/10'
								: 'border-border text-muted-foreground',
						)}
					>
						<DiscDot solid discipline={discipline} className="size-[6px]" />
						{nbDisciplineLabel(discipline)}
					</button>
				)
			})}
		</div>
	)
}

/**
 * The creation menu's way in (#505 story 40): the same line, with the day as a
 * field — for a day the list does not offer as empty, months or years out
 * included. **Any distance ahead**: the day has a first day (half a year back,
 * where I dag stops reading) and no last one, so a race can be placed past
 * the season the list shows. It sits under I dag's header row and closes once
 * the write lands; the toast says what it did to the week and carries Angre,
 * since the row may be past anything on screen (`day-stamp-context.tsx`).
 */
export function WritingPanel({
	todayKey,
	minDayKey,
	onClose,
}: {
	todayKey: string
	minDayKey: string
	onClose: () => void
}) {
	const stamp = useDayStamp()
	const [dayKey, setDayKey] = useState(() => addDays(todayKey, 1))
	const [chosen, setChosen] = useState<Discipline | null>(
		cardioChip(stamp.prefill),
	)
	const [text, setText] = useState('')
	const [submittedFor, setSubmittedFor] = useState<string | null>(null)
	const parsed = useParsedSentence(text, chosen)
	const validDay = dayKey >= minDayKey
	const pending = submittedFor != null && stamp.pendingDayKey === submittedFor
	const failed = submittedFor != null && stamp.failedDayKey === submittedFor

	// The write landed: nothing left for the panel to say. The toast carries the
	// week sum and Angre, and the row arrives through the ledger like any other
	// where the list reads that far.
	useEffect(() => {
		if (submittedFor == null || pending || failed) return
		onClose()
	}, [failed, onClose, pending, submittedFor])

	const submit = () => {
		if (!parsed.structure || !validDay || pending) return
		setSubmittedFor(dayKey)
		stamp.write(dayKey, cardioChip(chosen), text, { open: false })
	}

	return (
		<section
			data-writing-panel
			aria-label={WRITING_LINE_LABELS.open}
			className="border-border bg-primary/4 flex flex-col gap-2.5 border-t px-[18px] py-3"
		>
			<div className="flex items-center gap-3">
				<h2 className="text-[13px]/[1.2] font-semibold">
					{WRITING_LINE_LABELS.open}
				</h2>
				<label className="text-muted-foreground ml-auto flex items-center gap-2 text-[11.5px]/[1] font-semibold">
					{WRITING_LINE_LABELS.day}
					<input
						type="date"
						data-writing-day
						value={dayKey}
						min={minDayKey}
						onChange={(event) => {
							const next = event.currentTarget.value
							if (next) setDayKey(next)
						}}
						className="border-border bg-background h-9 rounded-[9px] border px-2 text-[16px]/[1]"
					/>
				</label>
			</div>
			{/* The sports a sentence can say. A lift has to be named, which the
			    draft's **Mer** route does and this line cannot yet. */}
			<DisciplineChips
				chosen={chosen}
				onChoose={setChosen}
				label={DAY_STAMP_LABELS.discipline}
				disciplines={CARDIO_DISCIPLINES}
			/>
			{validDay ? (
				<WritingLine
					dayKey={dayKey}
					text={text}
					onText={setText}
					parsed={parsed}
					thresholds={stamp.thresholds}
					onSubmit={submit}
					autoFocus
				/>
			) : (
				<p className="text-foreground text-[12px]/[1.35]">
					{WRITING_LINE_LABELS.outsideWindow}
				</p>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<WriteButton
					text={text}
					parsed={parsed}
					pending={pending}
					disabled={!validDay}
					onWrite={submit}
				/>
				<button
					type="button"
					onClick={onClose}
					className="text-muted-foreground h-[34px] px-1 text-[12.5px]/[1] font-semibold"
				>
					{WRITING_LINE_LABELS.close}
				</button>
			</div>
			{failed ? (
				<p role="status" className="text-destructive text-[11px]/[1.35]">
					{WRITING_LINE_LABELS.failed}
				</p>
			) : null}
		</section>
	)
}

/**
 * The line's save, shared by the day's draft and the panel: `Legg til «…»`,
 * offered only once the reader understood every word, so what is written is
 * what the preview above it showed.
 */
export function WriteButton({
	text,
	parsed,
	pending,
	disabled = false,
	onWrite,
}: {
	text: string
	parsed: ParsedSentence
	pending: boolean
	disabled?: boolean
	onWrite: () => void
}) {
	const typed = text.trim()
	return (
		<button
			type="button"
			disabled={disabled || pending || !parsed.structure}
			onClick={onWrite}
			className="bg-primary text-primary-foreground hover:bg-primary/85 flex h-[34px] items-center rounded-[10px] px-[13px] text-[12.5px]/[1] font-bold disabled:opacity-60"
		>
			{pending
				? DAY_STAMP_LABELS.adding
				: typed
					? WRITING_LINE_LABELS.add(typed)
					: WRITING_LINE_LABELS.addEmpty}
		</button>
	)
}
