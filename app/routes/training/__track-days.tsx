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
import { useState } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import {
	DayChoiceModeControl,
	DayChoicePreview,
	type DayChoiceMode,
} from '#app/components/day-choice-controls.tsx'
import {
	dayChoiceKey,
	useOncePer,
	type ReplyDataOf,
} from '#app/components/day-choice.ts'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { WeekdayChips } from '#app/components/weekday-chips.tsx'
import { type action as trackDaysAction } from '#app/routes/resources/track-days.tsx'
import {
	nbPlannedDisciplineLabel,
	PLAN_TRACK_DAYS_LABELS,
	type TrackDaysName,
} from '#app/utils/labels.ts'
import { LANDED_MS } from '#app/utils/motion.ts'
import {
	type TrackDaysState,
	type TrackDaysUnit,
} from '#app/utils/plan-outline/track-days.server.ts'
import { type PatternWeekday } from '#app/utils/plan-outline/week-pattern.ts'
import { CollapsibleSection } from './__plan-chrome.tsx'

const L = PLAN_TRACK_DAYS_LABELS

const ACTION = '/resources/track-days'

/** A unit's name: the sport, or the Simple Activity's own. */
function nameOf(unit: TrackDaysUnit): TrackDaysName {
	return unit.kind === 'activity'
		? { text: L.activity(unit.title), activity: true }
		: { text: nbPlannedDisciplineLabel(unit.discipline), activity: false }
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
	const [mode, setMode] = useState<DayChoiceMode>(storedMode)
	const [chosen, setChosen] = useState<PatternWeekday[]>(unit.pinned ?? [])
	// A write that lands (or an undo) reloads the unit: start from it again.
	const [seen, setSeen] = useState(unit.version)
	if (seen !== unit.version) {
		setSeen(unit.version)
		setMode(storedMode)
		setChosen(unit.pinned ?? [])
	}

	const current = dayChoiceKey(mode, chosen)
	const stored = dayChoiceKey(storedMode, unit.pinned ?? [])
	const reply = fetcher.data && 'intent' in fetcher.data ? fetcher.data : null
	const preview =
		reply?.intent === 'preview' && reply.preview ? reply.preview : null
	// A preview stands only for the choice it was read for.
	const showing =
		preview &&
		dayChoiceKey(preview.choice ? 'own' : 'auto', preview.choice ?? []) ===
			current
			? preview
			: null
	const error =
		reply?.error && current !== stored ? L.refusals[reply.error] : null
	// Days chosen before they left Training Availability: a Simple Activity
	// keeps them until the athlete names new ones (ADR 0104 §4).
	const unavailable = available
		? chosen.filter((day) => !available.includes(day))
		: []
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
			summary={name.text}
			detail={
				<span className="[overflow-wrap:anywhere]">
					{L.days(unit.days)}
					{activity ? null : (
						<>
							{'\u00a0· '}
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
						<DayChoiceModeControl
							value={mode}
							onValueChange={setMode}
							labelledBy={`${unit.key}-mode`}
							labels={L}
						/>
						{mode === 'auto' ? (
							<p className="text-footnote text-muted-foreground">
								{L.autoNote}
							</p>
						) : null}
					</div>
				)}

				{activity || mode === 'own' ? (
					<fieldset className="flex flex-col gap-2">
						<legend className="text-callout mb-1.5 [overflow-wrap:anywhere]">
							{L.chipsLegend(name)}
						</legend>
						<WeekdayChips
							chosen={chosen}
							onChange={setChosen}
							available={available}
						/>
						{unavailable.length > 0 ? (
							<p className="text-footnote">{L.notAvailable(unavailable)}</p>
						) : null}
						<p className="text-footnote text-muted-foreground">
							{available ? L.chipsNote : L.chipsNoteNoAvailability}{' '}
							{activity ? L.activityNote : L.ownNote}
						</p>
					</fieldset>
				) : null}

				{error ? (
					<p className="text-footnote text-foreground-destructive" role="alert">
						{error}
					</p>
				) : null}

				{showing ? (
					<DayChoicePreview
						weeks={showing.weeks.map((week) => ({
							weekKey: week.weekKey,
							before: week.before.days,
							after: week.after.days,
							hard: week.after.hard,
							clashes: week.after.clashes,
						}))}
						line={(days) => L.unitDays(name, days)}
						chosen={showing.choice != null}
						version={showing.version}
						busy={busy}
						onCancel={reset}
						surface="inset"
						labels={L}
					/>
				) : (
					<StatusButton
						type="submit"
						name="intent"
						value="preview-days"
						variant="outline"
						className="w-full sm:w-auto"
						disabled={
							current === stored ||
							((activity || mode === 'own') &&
								(chosen.length === 0 || unavailable.length > 0))
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

type ReplyData = ReplyDataOf<typeof trackDaysAction>

/**
 * The write's toast (ADR 0088): what the days are now, and _Angre_, which
 * puts back exactly the rows the write replaced.
 */
function useWrittenToast(
	reply: ReplyData | null,
	name: TrackDaysName,
	outlineId: string,
	key: string,
	submit: ReturnType<typeof useFetcher>['submit'],
) {
	const written =
		reply && 'written' in reply && reply.written ? reply.written : null
	useOncePer(written, (written) => {
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
	})
}

/** The undo's own toast: the days are as they were. */
function useUndoneToast(reply: ReplyData | undefined, name: TrackDaysName) {
	const undone =
		reply && 'intent' in reply && reply.intent === 'undone' ? reply : null
	useOncePer(undone, (undone) => {
		// The same toast, so its _Angre_ goes: there is nothing left to undo.
		if (undone.ok)
			toast.success(L.undone(name), {
				id: `track-days-${undone.key}`,
				action: undefined,
			})
		else if (undone.error)
			toast.error(L.refusals[undone.error], {
				id: `track-days-${undone.key}`,
			})
	})
}
