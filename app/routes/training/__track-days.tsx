/**
 * _Dagene i uka_ under _Plan → Avansert_ (#598, ADR 0104 §4): one row per
 * endurance track and Simple Activity, each saying which days it trains on
 * and who chose them. Opened, a row holds the same control as the strength
 * days in Meg (#597): _La appen velge_ or weekday chips limited to the
 * athlete's **Training Availability**. A change shows the coming weeks before
 * it writes (ADR 0084) and is undone from its toast (ADR 0088).
 *
 * Motion is the system's own: each row opens on `motion-collapse`
 * (`CollapsibleSection`), and the preview rises 4px and fades in on mount, as
 * the strength days' preview does. Nothing else moves.
 */
import { useEffect, useRef, useState } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import { Button } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	SegmentedControl,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import { WeekdayChips } from '#app/components/weekday-chips.tsx'
import { type action as trackDaysAction } from '#app/routes/resources/track-days.tsx'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import {
	NB_DISCIPLINE_LABELS,
	PLAN_TRACK_DAYS_LABELS,
	SESONG_NOTICE_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	type TrackDaysPreviewWeek,
	type TrackDaysState,
	type TrackDaysUnit,
} from '#app/utils/plan-outline/track-days.server.ts'
import { type PatternWeekday } from '#app/utils/plan-outline/week-pattern.ts'
import { CollapsibleSection } from './__plan-chrome.tsx'

const L = PLAN_TRACK_DAYS_LABELS

/** How long the toast and its _Angre_ stand (ADR 0088's `LANDED_MS`). */
const LANDED_MS = 10_000

const ACTION = '/resources/track-days'

/** A unit's name: the sport, or the Simple Activity's own. */
function nameOf(unit: TrackDaysUnit): string {
	return unit.kind === 'activity'
		? L.activity(unit.title)
		: ((NB_DISCIPLINE_LABELS as Record<string, string>)[unit.discipline] ??
				unit.discipline)
}

export function TrackDaysCard({ state }: { state: TrackDaysState }) {
	const [open, setOpen] = useState<string | null>(null)
	return (
		<div className="space-y-3">
			<p className="text-footnote text-muted-foreground">{L.intro}</p>
			<div>
				{state.units.map((unit) => (
					<TrackDaysRow
						key={unit.key}
						unit={unit}
						outlineId={state.outlineId}
						available={state.available}
						open={open === unit.key}
						onOpenChange={(next) => setOpen(next ? unit.key : null)}
					/>
				))}
			</div>
		</div>
	)
}

/** `'auto'` or the chosen days, Monday first, as one comparable key. */
function choiceKey(mode: 'auto' | 'own', chosen: readonly number[]): string {
	return mode === 'auto' ? 'auto' : [...chosen].sort().join(',')
}

function TrackDaysRow({
	unit,
	outlineId,
	available,
	open,
	onOpenChange,
}: {
	unit: TrackDaysUnit
	outlineId: string
	available: PatternWeekday[] | null
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const name = nameOf(unit)
	const fetcher = useFetcher<typeof trackDaysAction>({
		key: `track-days-${unit.key}`,
	})
	const undo = useFetcher<typeof trackDaysAction>({
		key: `track-days-undo-${unit.key}`,
	})
	const activity = unit.kind === 'activity'
	const storedMode = unit.pinned ? 'own' : 'auto'
	const [mode, setMode] = useState<'auto' | 'own'>(storedMode)
	const [chosen, setChosen] = useState<PatternWeekday[]>(unit.pinned ?? [])
	// A write that lands (or an undo) reloads the unit: start from it again.
	const [seen, setSeen] = useState(unit.version)
	if (seen !== unit.version) {
		setSeen(unit.version)
		setMode(storedMode)
		setChosen(unit.pinned ?? [])
	}

	const current = choiceKey(mode, chosen)
	const stored = choiceKey(storedMode, unit.pinned ?? [])
	const reply = fetcher.data && 'intent' in fetcher.data ? fetcher.data : null
	const preview =
		reply?.intent === 'preview' && reply.preview ? reply.preview : null
	// A preview stands only for the choice it was read for.
	const showing =
		preview &&
		choiceKey(preview.choice ? 'own' : 'auto', preview.choice ?? []) === current
			? preview
			: null
	const error =
		reply?.error && current !== stored
			? L.refusals[reply.error as keyof typeof L.refusals]
			: null
	const busy = fetcher.state !== 'idle'
	const reset = () => {
		setMode(storedMode)
		setChosen(unit.pinned ?? [])
	}

	useWrittenToast(reply, name, outlineId, unit.key, undo.submit)
	useUndoneToast(undo.data, name)

	return (
		<CollapsibleSection
			open={open}
			onOpenChange={onOpenChange}
			summary={name}
			detail={
				<span className="break-words">
					{L.days(unit.days)}
					{activity ? null : (
						<>
							{' · '}
							{unit.pinned ? L.ownChoice : L.appChooses}
						</>
					)}
				</span>
			}
		>
			<fetcher.Form method="POST" action={ACTION} className="space-y-5">
				<input type="hidden" name="outlineId" value={outlineId} />
				<input type="hidden" name="key" value={unit.key} />
				<input type="hidden" name="mode" value={activity ? 'own' : mode} />

				{activity ? null : (
					<div className="space-y-2">
						<p className="text-callout" id={`${unit.key}-mode`}>
							{L.modeLegend}
						</p>
						<SegmentedControl
							value={mode}
							onValueChange={(next) => {
								if (next === 'auto' || next === 'own') setMode(next)
							}}
							aria-labelledby={`${unit.key}-mode`}
							className="w-full"
						>
							<ToggleGroupItem
								value="auto"
								className="text-callout h-11 flex-1"
							>
								{L.auto}
							</ToggleGroupItem>
							<ToggleGroupItem value="own" className="text-callout h-11 flex-1">
								{L.own}
							</ToggleGroupItem>
						</SegmentedControl>
						{mode === 'auto' ? (
							<p className="text-footnote text-muted-foreground">
								{L.autoNote}
							</p>
						) : null}
					</div>
				)}

				{activity || mode === 'own' ? (
					<fieldset className="flex flex-col gap-2">
						<legend className="text-callout mb-1.5">
							{L.chipsLegend(name)}
						</legend>
						<WeekdayChips
							idPrefix={`track-day-${unit.key}`}
							chosen={chosen}
							onChange={setChosen}
							available={available}
						/>
						<p className="text-footnote text-muted-foreground">
							{available ? L.chipsNote : L.chipsNoteNoAvailability}{' '}
							{activity ? L.activityNote : L.ownNote}
						</p>
					</fieldset>
				) : null}

				{error ? (
					<p className="text-footnote text-destructive" role="alert">
						{error}
					</p>
				) : null}

				{showing ? (
					<TrackDaysPreview
						name={name}
						weeks={showing.weeks}
						chosen={showing.choice != null}
						version={showing.version}
						busy={busy}
						onCancel={reset}
					/>
				) : (
					<StatusButton
						type="submit"
						name="intent"
						value="preview-days"
						variant="outline"
						className="text-callout w-full sm:w-auto"
						disabled={
							current === stored ||
							((activity || mode === 'own') && chosen.length === 0)
						}
						status={busy ? 'pending' : 'idle'}
					>
						{busy ? L.previewing : L.preview}
					</StatusButton>
				)}
			</fetcher.Form>
		</CollapsibleSection>
	)
}

/**
 * The coming weeks with the change, beside how they are laid now, and the
 * write itself — so nothing is written the athlete has not seen (ADR 0084).
 */
function TrackDaysPreview({
	name,
	weeks,
	chosen,
	version,
	busy,
	onCancel,
}: {
	name: string
	weeks: TrackDaysPreviewWeek[]
	chosen: boolean
	version: string
	busy: boolean
	onCancel: () => void
}) {
	const clashes = weeks.flatMap((week) =>
		week.after.clashes.map((clash) => ({ week, clash })),
	)
	return (
		<div
			className={cn(
				'bg-muted/40 flex flex-col gap-4 rounded-3xl p-4',
				// It rises 4px and fades in as it mounts (`@starting-style`, 200ms
				// ease-out); reduced motion keeps the fade.
				'duration-collapse [transition-property:opacity,translate] ease-out',
				'starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0',
			)}
		>
			<input type="hidden" name="version" value={version} />
			<h3 className="text-callout font-semibold">{L.previewHeading}</h3>
			<ul className="divide-border/70 flex flex-col divide-y">
				{weeks.map((week) => {
					const changed =
						week.before.days.join(',') !== week.after.days.join(',')
					return (
						<li
							key={week.weekKey}
							className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0"
						>
							<p className="text-footnote text-muted-foreground tabular-nums">
								{L.week(isoWeekNumber(week.weekKey))}
							</p>
							<p className="text-callout break-words">
								{L.unitDays(name, week.after.days)}
								<span className="text-muted-foreground">
									{' · '}
									{L.hard(week.after.hard)}
								</span>
							</p>
							<p className="text-footnote text-muted-foreground break-words">
								{changed ? L.was(week.before.days) : L.same}
							</p>
						</li>
					)
				})}
			</ul>
			{clashes.length > 0 ? (
				<div className="flex flex-col gap-1.5">
					<ul className="flex flex-col gap-1.5">
						{clashes.map(({ week, clash }) => (
							<li
								key={`${week.weekKey}-${clash.reason}-${clash.weekday}`}
								className="text-footnote break-words"
							>
								{L.week(isoWeekNumber(week.weekKey))}:{' '}
								{L.clash(
									SESONG_NOTICE_LABELS.dayClash(clash.reason, clash.weekday),
									clash.pinned,
								)}
							</li>
						))}
					</ul>
					{chosen ? (
						<p className="text-footnote text-muted-foreground">{L.clashNote}</p>
					) : null}
				</div>
			) : null}
			<div className="flex flex-col gap-2 sm:flex-row">
				<StatusButton
					type="submit"
					name="intent"
					value="apply-days"
					className="text-callout w-full sm:w-auto"
					status={busy ? 'pending' : 'idle'}
				>
					{busy ? L.applying : L.apply}
				</StatusButton>
				<Button
					type="button"
					variant="ghost"
					className="text-callout w-full sm:w-auto"
					onClick={onCancel}
				>
					{L.cancel}
				</Button>
			</div>
		</div>
	)
}

type ActionReply = Awaited<ReturnType<typeof trackDaysAction>>
type ReplyData = ActionReply extends infer R
	? R extends { data: infer D }
		? D
		: R
	: never

/**
 * The write's toast (ADR 0088): what the days are now, and _Angre_, which
 * puts back exactly the rows the write replaced.
 */
function useWrittenToast(
	reply: ReplyData | null,
	name: string,
	outlineId: string,
	key: string,
	submit: ReturnType<typeof useFetcher>['submit'],
) {
	const shown = useRef<unknown>(null)
	const written =
		reply && 'written' in reply && reply.written ? reply.written : null
	useEffect(() => {
		if (!written || shown.current === written) return
		shown.current = written
		toast.success(L.saved(name, written.choice), {
			id: `track-days-${key}`,
			duration: LANDED_MS,
			action: {
				label: L.undo,
				onClick: () =>
					void submit(
						{
							intent: 'undo-days',
							outlineId,
							key,
							undo: JSON.stringify({
								pinned: written.previous.pinned,
								rows: written.previous.rows,
								elsewhere: written.previous.elsewhere,
								version: written.version,
							}),
						},
						{ method: 'POST', action: ACTION },
					),
			},
		})
	}, [written, submit, name, outlineId, key])
}

/** The undo's own toast: the days are as they were. */
function useUndoneToast(reply: ReplyData | undefined, name: string) {
	const shown = useRef<unknown>(null)
	useEffect(() => {
		if (!reply || shown.current === reply || !('intent' in reply)) return
		if (reply.intent !== 'undone') return
		shown.current = reply
		if (reply.ok)
			toast.success(L.undone(name), { id: `track-days-${reply.key}` })
		else if (reply.error)
			toast.error(L.refusals[reply.error as keyof typeof L.refusals], {
				id: `track-days-${reply.key}`,
			})
	}, [reply, name])
}
