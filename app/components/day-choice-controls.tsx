// The controls the two day-choice surfaces share (ADR 0104 §4): the lifting
// days in _Meg → Trening → Styrke_ (#597) and every other track's days under
// _Plan → Avansert_ (#598). Each surface brings its own words; the shape, the
// sizes and the motion live here, so the two cannot drift apart.

import { Button } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	SegmentedControl,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { isoWeekSpanLabel, SESONG_NOTICE_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type ClashReason } from '#app/utils/plan-outline/day-rule.ts'
import { type PatternWeekday } from '#app/utils/plan-outline/week-pattern.ts'

export type DayChoiceMode = 'auto' | 'own'

/**
 * _La appen velge_ or _Velg dager_. The items wrap their words rather than
 * clip them at large text sizes, and keep the 44px row.
 */
export function DayChoiceModeControl({
	value,
	onValueChange,
	labelledBy,
	labels,
}: {
	value: DayChoiceMode
	onValueChange: (mode: DayChoiceMode) => void
	labelledBy: string
	labels: { auto: string; own: string }
}) {
	return (
		<SegmentedControl
			value={value}
			onValueChange={(next) => {
				if (next === 'auto' || next === 'own') onValueChange(next)
			}}
			aria-labelledby={labelledBy}
			className="w-full"
		>
			{(['auto', 'own'] as const).map((mode) => (
				<ToggleGroupItem
					key={mode}
					value={mode}
					className="text-callout h-auto min-h-11 flex-1 py-1.5 text-center whitespace-normal"
				>
					{labels[mode]}
				</ToggleGroupItem>
			))}
		</SegmentedControl>
	)
}

/** One coming week as a preview reads it, before and after the change. */
export type DayChoicePreviewWeek = {
	weekKey: string
	before: readonly PatternWeekday[]
	after: readonly PatternWeekday[]
	/** The week's **Hard days** after the change, across every track. */
	hard: readonly PatternWeekday[]
	clashes: ReadonlyArray<{
		reason: ClashReason
		weekday: PatternWeekday
		pinned: boolean
	}>
}

/**
 * One line per clash — the same reason on the same weekday, the same choice
 * behind it — over every run of weeks that holds it, worded as the fit check
 * words it (`Uke 43–46: …`), so four weeks of one clash read once.
 */
function clashLines(weeks: readonly DayChoicePreviewWeek[]) {
	const lines = new Map<
		string,
		{
			clash: DayChoicePreviewWeek['clashes'][number]
			spans: Array<[number, number]>
		}
	>()
	weeks.forEach((week, at) => {
		for (const clash of week.clashes) {
			const key = `${clash.weekday}|${clash.reason}|${clash.pinned}`
			const line = lines.get(key) ?? { clash, spans: [] }
			const last = line.spans.at(-1)
			if (last && last[1] === at - 1) last[1] = at
			else line.spans.push([at, at])
			lines.set(key, line)
		}
	})
	return [...lines.values()].map(({ clash, spans }) => {
		const span = SESONG_NOTICE_LABELS.weekSpans(
			spans.map(([from, to]) =>
				isoWeekSpanLabel(
					isoWeekNumber(weeks[from]!.weekKey),
					isoWeekNumber(weeks[to]!.weekKey),
				),
			),
		)
		return {
			key: `${clash.weekday}-${clash.reason}-${clash.pinned}`,
			text: SESONG_NOTICE_LABELS.dayClashLine(
				span,
				SESONG_NOTICE_LABELS.dayClash(clash.reason, clash.weekday),
				clash.pinned,
			),
		}
	})
}

/**
 * The coming weeks with the change, beside how they are laid now, and the
 * write itself — so nothing is written the athlete has not seen (ADR 0084).
 * It rises 4px and fades in as it mounts (`@starting-style`, 200ms ease-out);
 * reduced motion keeps the fade. `inset` sits inside a card (Plan's rows),
 * `card` stands on the page (Meg).
 */
export function DayChoicePreview({
	weeks,
	line,
	chosen,
	version,
	busy,
	onCancel,
	surface,
	labels,
}: {
	weeks: readonly DayChoicePreviewWeek[]
	/** The week's main line: `Sykling onsdag og søndag`, `Styrke tirsdag`. */
	line: (days: readonly PatternWeekday[]) => string
	/** Whether the athlete chose the days, so a clash is kept and said. */
	chosen: boolean
	version: string
	busy: boolean
	onCancel: () => void
	surface: 'inset' | 'card'
	labels: {
		previewHeading: string
		week: (isoWeek: number) => string
		hard: (days: readonly number[]) => string
		was: (days: readonly number[]) => string
		same: string
		clashNote: string
		apply: string
		applying: string
		cancel: string
	}
}) {
	const clashes = clashLines(weeks)
	return (
		<div
			className={cn(
				'flex flex-col gap-4 p-4',
				surface === 'inset'
					? 'bg-muted/40 rounded-3xl'
					: 'bg-card ring-foreground/5 dark:ring-foreground/10 rounded-4xl shadow-xs ring-1',
				'duration-collapse [transition-property:opacity,translate] ease-out',
				'starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0',
			)}
		>
			<input type="hidden" name="version" value={version} />
			<h3 className="text-callout font-semibold">{labels.previewHeading}</h3>
			<ul className="divide-border/70 flex flex-col divide-y">
				{weeks.map((week) => {
					const changed = week.before.join(',') !== week.after.join(',')
					return (
						<li
							key={week.weekKey}
							className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0"
						>
							<p className="text-footnote text-muted-foreground tabular-nums">
								{labels.week(isoWeekNumber(week.weekKey))}
							</p>
							<p className="text-callout [overflow-wrap:anywhere]">
								{line(week.after)}
								<span className="text-muted-foreground">
									{' · '}
									{labels.hard(week.hard)}
								</span>
							</p>
							<p className="text-footnote text-muted-foreground [overflow-wrap:anywhere]">
								{changed ? labels.was(week.before) : labels.same}
							</p>
						</li>
					)
				})}
			</ul>
			{clashes.length > 0 ? (
				<div className="flex flex-col gap-1.5">
					<ul className="flex flex-col gap-1.5">
						{clashes.map(({ key, text }) => (
							<li key={key} className="text-footnote [overflow-wrap:anywhere]">
								{text}
							</li>
						))}
					</ul>
					{chosen ? (
						<p className="text-footnote text-muted-foreground">
							{labels.clashNote}
						</p>
					) : null}
				</div>
			) : null}
			<div className="flex flex-col gap-2 sm:flex-row">
				<StatusButton
					type="submit"
					name="intent"
					value="apply-days"
					className="w-full sm:w-auto"
					status={busy ? 'pending' : 'idle'}
				>
					{busy ? labels.applying : labels.apply}
				</StatusButton>
				<Button
					type="button"
					variant="ghost"
					className="w-full sm:w-auto"
					onClick={onCancel}
				>
					{labels.cancel}
				</Button>
			</div>
		</div>
	)
}
