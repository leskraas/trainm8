/**
 * The **Week Pattern** controls, and the **Pattern Preview** read off them (#410).
 *
 * Split out of `plan.tsx` the way `__phase-editor.tsx` is: the route owns the
 * loader, the action and the two readings; this module owns the controls and the
 * reading one of them is built from. It sits on the **Weeks** reading, because
 * "what does my typical week come out as in week 7" is a question about a week —
 * and because Blocks and Weeks are two readings of one object with no third tab
 * for anything that is not navigation (#366).
 *
 * Four rules run through all of it.
 *
 * **A pattern holds no absolute quantity.** A day is either *fixed* — a Workout
 * prescribed as authored, `5×1000m Z4` in a 50 km week and a 65 km week alike —
 * or a *share*, a relative weight absorbing its part of what is left. There is no
 * volume field anywhere in this module and no way to add one (ADR 0044 §7).
 *
 * **The preview reads the week's real derived target.** It calls
 * `resolveWeekPattern`, the same pure resolution a stamp will call, against the
 * target the loader derived for the week the athlete chose — never a
 * representative or averaged week — for the reason `RecoveryPreview` reads
 * `phaseWeekRoles`: a preview must not promise a volume the stamp would not
 * write.
 *
 * **Numbers as text, never a picture.** Every figure here is a per-value reading,
 * and a picture that grows one has to graduate onto `ChartFigure` with an
 * accessible equivalent (ADR 0029/0030). Text avoids that entirely, so this
 * follows `WeeksReading`'s `<dl>` of formatted values — `Unavailable` with its
 * reason wherever a value is `null`, and never a `0` standing in for one.
 *
 * **The two warnings warn and never block.** A pattern whose fixed days overshoot
 * the week is reported and never corrected: the athlete prescribed those
 * intervals, so nothing here shrinks them and no copy claims it did. A prescribed
 * session the track's currency cannot read costs the shares their number rather
 * than letting the app guess one.
 */
import { useState, type ReactNode } from 'react'
import { Form, Link } from 'react-router'
import { Field } from '#app/components/forms.tsx'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogPopup,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import {
	formatPercent,
	formatVolumeTotal,
	formatWeeklyVolume,
} from '#app/utils/format.ts'
import {
	DISCIPLINE_LABELS,
	getDisciplineLabel,
	PATTERN_DAY_KIND_LABELS,
	PATTERN_WEEKDAY_LABELS,
	VOLUME_UNITS,
} from '#app/utils/labels.ts'
import { type VolumeCurrency } from '#app/utils/plan-outline/derive.ts'
import {
	PATTERN_DAY_KINDS,
	PATTERN_WEEKDAYS,
	resolveWeekPattern,
	type PatternDayKind,
	type PatternDayReading,
	type PatternDaySpec,
	type PatternTrackReading,
	type PatternTrackSpec,
	type PatternWarning,
} from '#app/utils/plan-outline/week-pattern.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'

/**
 * One pattern day as this module edits it: exactly the spec the resolution takes,
 * plus the Workout's name for the athlete to recognise. Declared here rather than
 * imported from the route so the dependency runs one way — the route's own
 * reading satisfies it structurally, the way `EditablePhase` does.
 */
export type EditablePatternDay = PatternDaySpec & {
	workout: { id: string; title: string } | null
}

export type EditablePattern = {
	id: string
	name: string
	orderIndex: number
	days: EditablePatternDay[]
}

/** A track a pattern day can draw from, in its own **Volume Currency**. */
export type PatternTrackOption = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
}

/** The week the preview resolves against, with its own derived targets. */
export type PreviewWeek = {
	weekKey: string
	weekInPlan: number
	targets: Array<{ trackId: string; value: number | null }>
}

/** A Workout a fixed day can prescribe — the athlete's own, newest first. */
export type PickableWorkout = { id: string; title: string; discipline: string }

/**
 * The two directions, worded — a UI direction rather than a domain enum, so it
 * lives beside the control (the rule `MOVE_LABELS` follows in `__phase-editor`).
 * The day pair says *in the day*, because a day moves within its own weekday:
 * ordering two sessions on one Tuesday is what `orderInDay` is for, and the
 * weekday itself is not what these buttons change.
 */
const PATTERN_MOVE_LABELS = {
	earlier: 'Move earlier',
	later: 'Move later',
} as const satisfies Record<'earlier' | 'later', string>

const DAY_MOVE_LABELS = {
	earlier: 'Earlier in the day',
	later: 'Later in the day',
} as const satisfies Record<'earlier' | 'later', string>

/**
 * The whole Week Pattern reading: which week it is read against, the patterns
 * themselves, and the form that adds one.
 */
export function WeekPatternSection({
	outlineId,
	patterns,
	tracks,
	weeks,
	week,
	workouts,
	eventQuery,
}: {
	outlineId: string
	patterns: EditablePattern[]
	tracks: PatternTrackOption[]
	/** Every week of the plan — what the chooser offers. */
	weeks: PreviewWeek[]
	/** The chosen week, or null for a plan with no weeks at all. */
	week: PreviewWeek | null
	workouts: PickableWorkout[]
	/** The `?event=` season being read, kept on the chooser's own navigation. */
	eventQuery: string | null
}) {
	return (
		// No top margin: the gap to the weeks above is the reading's own `space-y-8`
		// section gap, and a heading carries no margin of its own (§1.7).
		<section aria-labelledby="week-patterns" className="space-y-4">
			{/* The section's name lives on the `Disclosure` summary that opens it, so
			    this heading is the accessible name only — dropping it would leave the
			    region unnamed, and showing it would print the name twice. */}
			<h2 id="week-patterns" className="sr-only">
				Your typical week
			</h2>
			<p className="text-muted-foreground text-sm">
				Describe the week you actually train once, instead of scheduling every
				week by hand. A day is either a <strong>fixed session</strong> —
				prescribed as you authored it, the same intervals in a big week and a
				small one — or a <strong>share</strong> of what is left, by relative
				weight. A pattern stores no distances and no hours: each week&rsquo;s
				volume is derived, so the same pattern comes out differently in week 1
				and week 8.
			</p>
			<p className="text-muted-foreground text-sm">
				Below is what each day comes out as against one week&rsquo;s real
				derived target. Reading it schedules nothing — nothing is written to
				your calendar here.
			</p>

			<WeekChooser weeks={weeks} week={week} eventQuery={eventQuery} />

			{patterns.length === 0 ? (
				<p className="text-sm">
					No pattern yet. Name one below, then add the days you train.
				</p>
			) : (
				<ol aria-label="Week patterns" className="space-y-3">
					{patterns.map((pattern, position) => (
						// Keyed by the pattern's own id: position orders them and identity
						// edits them, so an index key would carry a card's local state onto
						// its neighbour the moment two patterns swap places.
						<li key={pattern.id}>
							<PatternCard
								pattern={pattern}
								position={position}
								patternCount={patterns.length}
								tracks={tracks}
								week={week}
								workouts={workouts}
							/>
						</li>
					))}
				</ol>
			)}

			<AddPatternForm outlineId={outlineId} patternCount={patterns.length} />
		</section>
	)
}

/**
 * Which week the pattern is read against.
 *
 * A `GET` form rather than a button that posts: the chosen week is URL state,
 * like the reading's own `?tab=`, so it survives a reload and can be linked. The
 * `?event=` season travels as a hidden input for the reason the tab links carry
 * it — choosing a week must not silently jump to the nearest plan — and so does
 * the tab, because this reading is the Weeks one and lands back on it.
 */
function WeekChooser({
	weeks,
	week,
	eventQuery,
}: {
	weeks: PreviewWeek[]
	week: PreviewWeek | null
	eventQuery: string | null
}) {
	const [chosen, setChosen] = useState(week?.weekKey ?? '')
	if (weeks.length === 0) return null

	return (
		<Form method="GET" className="flex flex-col gap-2 sm:flex-row sm:items-end">
			{eventQuery ? (
				<input type="hidden" name="event" value={eventQuery} />
			) : null}
			<input type="hidden" name="tab" value="weeks" />
			<div className="flex-1 space-y-2">
				<Label htmlFor="preview-week">Read against</Label>
				<Select
					value={chosen}
					onValueChange={(value) => setChosen(String(value ?? ''))}
				>
					<SelectTrigger id="preview-week" className="w-full">
						<SelectValue>
							{(value) =>
								weekLabel(
									weeks.find((entry) => entry.weekKey === value) ?? week,
								)
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{weeks.map((entry) => (
							<SelectItem key={entry.weekKey} value={entry.weekKey}>
								{weekLabel(entry)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<input type="hidden" name="week" value={chosen} />
			</div>
			<Button type="submit" variant="outline" className="w-full sm:w-auto">
				Read this week
			</Button>
		</Form>
	)
}

function weekLabel(week: PreviewWeek | null): string {
	return week ? `Week ${week.weekInPlan}` : 'Week'
}

/**
 * One pattern: its name, its days with what each one comes out as, the totals
 * behind those figures, and the controls that reorder or remove it.
 *
 * Every control submits alone — rename, add a day, move a day, remove a day, move
 * the pattern, delete it — because the mistake an athlete is fixing is usually one
 * field of one row, and because a submit carries a single name/value pair.
 */
function PatternCard({
	pattern,
	position,
	patternCount,
	tracks,
	week,
	workouts,
}: {
	pattern: EditablePattern
	position: number
	patternCount: number
	tracks: PatternTrackOption[]
	week: PreviewWeek | null
	workouts: PickableWorkout[]
}) {
	// One resolution per pattern, per track it uses, against the chosen week's own
	// derived target. The same function a stamp will call: a preview computed some
	// other way could promise a volume the stamp would not write.
	const readings = resolveWeekPattern({
		days: pattern.days,
		tracks: patternTrackSpecs(pattern, tracks, week),
	})
	const dayReadings = new Map(
		readings.flatMap((reading) =>
			reading.days.map((day) => [day.dayId, { day, track: reading }] as const),
		),
	)
	const trackById = new Map(tracks.map((track) => [track.trackId, track]))

	return (
		<Card>
			<CardHeader className="gap-1">
				<CardTitle className="text-base">{pattern.name}</CardTitle>
				<p className="text-muted-foreground text-sm">
					{pattern.days.length === 1 ? '1 day' : `${pattern.days.length} days`}{' '}
					· read against {week ? `week ${week.weekInPlan}` : 'no week'}
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<Form
					method="POST"
					className="flex flex-col gap-2 sm:flex-row sm:items-end"
				>
					<input type="hidden" name="intent" value="rename-week-pattern" />
					<input type="hidden" name="patternId" value={pattern.id} />
					{/* Re-keyed on the stored value, so a rename that lands is what the box
					    shows — an uncontrolled input would keep the old default. */}
					<Field
						key={pattern.name}
						className="flex-1"
						labelProps={{ children: 'Name' }}
						inputProps={{
							id: `pattern-name-${pattern.id}`,
							name: 'name',
							type: 'text',
							defaultValue: pattern.name,
							maxLength: 60,
							required: true,
						}}
					/>
					<Button type="submit" variant="outline" className="w-full sm:w-auto">
						Rename
					</Button>
				</Form>

				{pattern.days.length === 0 ? (
					<p className="text-sm">
						No days yet. Add the sessions you train in a normal week.
					</p>
				) : (
					<ol
						aria-label={`${pattern.name} days`}
						className="divide-border divide-y"
					>
						{pattern.days.map((day) => {
							const resolved = dayReadings.get(day.dayId)
							return (
								<li key={day.dayId} className="py-3">
									<PatternDayRow
										day={day}
										track={trackById.get(day.trackId) ?? null}
										reading={resolved?.day ?? null}
										trackReading={resolved?.track ?? null}
										siblings={sameWeekday(pattern.days, day)}
									/>
								</li>
							)
						})}
					</ol>
				)}

				{readings.map((reading) => (
					<TrackTotals
						key={reading.trackId}
						reading={reading}
						track={trackById.get(reading.trackId) ?? null}
						week={week}
					/>
				))}

				<AddPatternDayForm
					pattern={pattern}
					tracks={tracks}
					workouts={workouts}
				/>

				<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
					<MoveButtons
						intent="move-week-pattern"
						idName="patternId"
						id={pattern.id}
						labels={PATTERN_MOVE_LABELS}
						position={position}
						count={patternCount}
					/>
					<DeletePatternDialog pattern={pattern} />
				</div>
			</CardContent>
		</Card>
	)
}

/**
 * One authored day, and what it comes out as this week.
 *
 * The authored side and the resolved side sit on one row on purpose: "Saturday,
 * long run, weight 2.5" and "16.8 km" are the same fact read two ways, and
 * separating them would make the athlete match a list against a list.
 */
function PatternDayRow({
	day,
	track,
	reading,
	trackReading,
	siblings,
}: {
	day: EditablePatternDay
	track: PatternTrackOption | null
	reading: PatternDayReading | null
	trackReading: PatternTrackReading | null
	/** The days sharing this weekday, in order — what "orderable" means here. */
	siblings: EditablePatternDay[]
}) {
	const position = siblings.findIndex((entry) => entry.dayId === day.dayId)
	return (
		<div className="space-y-2">
			<div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
				<div className="text-sm">
					<span className="font-medium">
						{PATTERN_WEEKDAY_LABELS[day.weekday]}
					</span>{' '}
					<span className="text-muted-foreground">
						· {track ? DISCIPLINE_LABELS[track.discipline] : 'Unknown track'} ·{' '}
						{day.kind === 'fixed'
							? `${day.workout?.title ?? 'Workout removed'} · prescribed as authored, never scaled`
							: `Share, weight ${day.weight}${
									reading?.share == null
										? ''
										: ` · ${formatPercent(reading.share)} of what is left`
								}`}
						{day.kind === 'share' && day.workout
							? ` · shaped on ${day.workout.title}`
							: null}
					</span>
				</div>
				<p className="text-sm font-medium tabular-nums">
					{reading == null || reading.value == null || track == null ? (
						<span className="text-muted-foreground font-normal">
							Unavailable
						</span>
					) : (
						// A day's volume, not a weekly rate: this is one session's share of
						// the week, so it carries the bare unit rather than `/wk`.
						formatVolumeTotal(reading.value, track.currency)
					)}
				</p>
			</div>

			{reading?.value == null && track ? (
				<p className="text-muted-foreground text-sm">
					{dayUnavailableReason(day, track, trackReading)}
				</p>
			) : null}

			<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
				{/* Only where the weekday holds more than one session: a Tuesday with a
				    single session has nothing to order, so there is no control for it. */}
				{siblings.length > 1 ? (
					<MoveButtons
						intent="move-week-pattern-day"
						idName="dayId"
						id={day.dayId}
						labels={DAY_MOVE_LABELS}
						position={position}
						count={siblings.length}
					/>
				) : null}
				<Form method="POST">
					<input type="hidden" name="intent" value="remove-week-pattern-day" />
					<input type="hidden" name="dayId" value={day.dayId} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						className="w-full sm:w-auto"
					>
						Remove {PATTERN_WEEKDAY_LABELS[day.weekday]}
						{siblings.length > 1 ? ` #${position + 1}` : ''}
					</Button>
				</Form>
			</div>
		</div>
	)
}

/**
 * The pair of move buttons for one row — a pattern in the plan's list, or a session
 * within its weekday.
 *
 * One component for both, because the two differ only in what is being moved: the
 * intent, the id field it carries, and how the two directions are worded (a pattern
 * moves *through the list*, a session moves *within its day*). The edge is disabled
 * here and refused by the service besides, so a page rendered before a sibling moved
 * gets a sentence rather than a silent no-op.
 */
function MoveButtons({
	intent,
	idName,
	id,
	labels,
	position,
	count,
}: {
	intent: 'move-week-pattern' | 'move-week-pattern-day'
	idName: 'patternId' | 'dayId'
	id: string
	labels: Record<'earlier' | 'later', string>
	/** The row's 0-based position in the sequence it moves through. */
	position: number
	count: number
}) {
	return (
		<>
			{(['earlier', 'later'] as const).map((direction) => (
				<Form method="POST" key={direction}>
					<input type="hidden" name="intent" value={intent} />
					<input type="hidden" name={idName} value={id} />
					<input type="hidden" name="direction" value={direction} />
					<Button
						type="submit"
						variant="outline"
						size="sm"
						className="w-full sm:w-auto"
						// The first has nothing earlier and the last nothing later.
						disabled={
							direction === 'earlier' ? position === 0 : position === count - 1
						}
					>
						{labels[direction]}
					</Button>
				</Form>
			))}
		</>
	)
}

/**
 * Why a day has no number, said in the day's own terms.
 *
 * Three distinct absences, and they must not read alike: the week has no derived
 * target for this track at all; a prescribed session cannot be read in this
 * track's currency, which leaves the shares nothing definite to divide; or this
 * fixed day's own Workout is gone. Each is an Unavailable Metric with its reason,
 * and none of them is a `0`.
 */
function dayUnavailableReason(
	day: EditablePatternDay,
	track: PatternTrackOption,
	trackReading: PatternTrackReading | null,
): string {
	const unit = VOLUME_UNITS[track.currency]
	if (day.kind === 'fixed') {
		return day.workout == null
			? 'The workout this day prescribed is gone, so there is nothing to read a volume off.'
			: `This session cannot be read in ${unit}, so it has no volume to prescribe here.`
	}
	if (trackReading?.target == null) {
		return `Week has no derived ${DISCIPLINE_LABELS[track.discipline].toLowerCase()} target, so there is nothing for this share to take a part of.`
	}
	return `A prescribed session in this pattern cannot be read in ${unit}, so what is left to divide is not known — and a share of an unknown remainder would be a made-up number.`
}

/**
 * One track's totals behind the day figures: the week's target, what the fixed
 * days prescribe out of it, and what the shares divide.
 *
 * The order is the arithmetic's order, because that order is the domain rule:
 * fixed volume is subtracted *before* the shares divide the remainder (ADR 0044
 * §7).
 */
function TrackTotals({
	reading,
	track,
	week,
}: {
	reading: PatternTrackReading
	track: PatternTrackOption | null
	week: PreviewWeek | null
}) {
	if (!track) return null
	const label = DISCIPLINE_LABELS[track.discipline]

	return (
		<div className="space-y-2">
			<p className="text-sm font-medium">
				{label}
				{week ? ` · week ${week.weekInPlan}` : null}
			</p>
			<dl className="text-sm">
				<Total label="Week target">
					{reading.target == null ? (
						<Unavailable />
					) : (
						// The one weekly *rate* on this reading — the derived target the whole
						// pattern divides. Everything under it is a part of that week.
						formatWeeklyVolume(reading.target, reading.currency)
					)}
				</Total>
				<Total label="Prescribed by fixed days">
					{reading.fixed == null ? (
						<Unavailable />
					) : (
						formatVolumeTotal(reading.fixed, reading.currency)
					)}
				</Total>
				<Total label="Left for the share days">
					{reading.remainder == null ? (
						<Unavailable />
					) : (
						formatVolumeTotal(reading.remainder, reading.currency)
					)}
				</Total>
				{reading.unallocated != null && reading.unallocated > 0 ? (
					<Total label="Taken by no day">
						{formatVolumeTotal(reading.unallocated, reading.currency)}
					</Total>
				) : null}
			</dl>
			{reading.unallocated != null && reading.unallocated > 0 ? (
				<p className="text-muted-foreground text-sm">
					This pattern has no {label.toLowerCase()} share day, so nothing
					absorbs the rest of the week. Add one, or leave it — a pattern does
					not have to spend the whole week.
				</p>
			) : null}
			{reading.warnings.map((warning) => (
				<PatternWarningNotice
					key={warning.kind}
					warning={warning}
					currency={reading.currency}
					label={label}
					// So the overshoot notice only speaks about share days where there are
					// some: a pattern of nothing but fixed sessions has none to be left out.
					hasShareDays={reading.days.some((day) => day.kind === 'share')}
				/>
			))}
		</div>
	)
}

function Total({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-wrap gap-x-2">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="font-medium tabular-nums">{children}</dd>
		</div>
	)
}

function Unavailable() {
	return <span className="text-muted-foreground font-normal">Unavailable</span>
}

/**
 * The two pattern warnings, worded — advisory, exactly like the ramp guard and the
 * mix availability notice, and for the same reasons (ADR 0040 §12).
 *
 * `fixed-exceeds-target` **warns and never corrects**. The athlete prescribed
 * those intervals, so nothing shrinks them and this copy must not suggest anything
 * did: it names the two figures, says the sessions stand as authored, and states
 * the consequence for the shares — they get nothing this week — as a fact rather
 * than as a fix.
 *
 * `fixed-day-unpriced` says plainly that the week **cannot be divided**, because a
 * prescribed session cannot be read in this track's currency. A guessed price
 * would flow into every share day's number, so the honest answer is Unavailable
 * with its reason.
 */
function PatternWarningNotice({
	warning,
	currency,
	label,
	hasShareDays,
}: {
	warning: PatternWarning
	currency: VolumeCurrency
	label: string
	hasShareDays: boolean
}) {
	if (warning.kind === 'fixed-exceeds-target') {
		return (
			<p className="text-sm">
				Your fixed {label.toLowerCase()} sessions prescribe{' '}
				{formatVolumeTotal(warning.fixed, currency)} and this week&rsquo;s
				target is {formatWeeklyVolume(warning.target, currency)}. They stay
				exactly as you authored them — intervals are prescribed, so nothing here
				shortens a session you wrote.
				{hasShareDays
					? ' There is nothing left for the share days this week, which is what the figures above say.'
					: ' This week is simply smaller than the sessions you prescribed for it.'}
			</p>
		)
	}
	return (
		<p className="text-sm">
			{warning.days === 1
				? 'One fixed day cannot'
				: `${warning.days} fixed days cannot`}{' '}
			be read in {VOLUME_UNITS[currency]}, so this week cannot be divided: what
			the share days would split is not known, and a share of an unknown
			remainder would be a number the app made up. The fixed sessions themselves
			are unaffected.
		</p>
	)
}

/**
 * Add a day to a pattern.
 *
 * Three fields are always here — the weekday, the track and the kind — and the
 * fourth depends on the kind, which is why the kind is held in local state: a
 * fixed day needs its Workout and a share day needs its weight, and neither field
 * has anything to do on the other kind. There is deliberately **no volume field
 * and no zone field**: a pattern day carries neither (ADR 0044 §7, ADR 0042 §9),
 * so this is not a control that was left out — it is one that cannot exist.
 *
 * **The picker only ever offers the chosen track's own discipline.** A day draws its
 * volume from its track, and no figure spans incommensurable disciplines (ADR 0041,
 * ADR 0043 §5): a bike session on a run-track day would count bike duration as run
 * volume. The track is local form state, so the list of Workouts follows the track
 * choice. Where a track has no Workout of its discipline the fixed kind is not
 * offered for it and the form says why with a way out — the same posture it takes for
 * an athlete with no Workouts at all, rather than a picker with nothing in it.
 * `addWeekPatternDay` refuses a mismatch as well: the UI prevents it, the service
 * refuses it.
 */
function AddPatternDayForm({
	pattern,
	tracks,
	workouts,
}: {
	pattern: EditablePattern
	tracks: PatternTrackOption[]
	workouts: PickableWorkout[]
}) {
	/** The Workouts a day on `id` may prescribe or be shaped on: that track's own. */
	function workoutsOnTrack(id: string): PickableWorkout[] {
		const discipline = tracks.find((track) => track.trackId === id)?.discipline
		return discipline == null
			? []
			: workouts.filter((workout) => workout.discipline === discipline)
	}

	const firstTrackId = tracks[0]?.trackId ?? ''
	const [weekday, setWeekday] = useState('0')
	const [trackId, setTrackId] = useState(firstTrackId)
	const [kind, setKind] = useState<PatternDayKind>(
		workoutsOnTrack(firstTrackId).length > 0 ? 'fixed' : 'share',
	)
	// The newest Workout on the opening track, which is right *because* the opening
	// kind is `fixed` exactly when there is one — and `''` (no shape) otherwise, so a
	// share day never opens carrying a Workout the athlete has not chosen.
	const [workoutId, setWorkoutId] = useState(
		workoutsOnTrack(firstTrackId)[0]?.id ?? '',
	)
	const suffix = pattern.id
	const pickable = workoutsOnTrack(trackId)
	// A fixed day needs a Workout *on this day's track*, so with none the kind is not
	// on offer: a control that cannot be completed is worse than one that is not there.
	const offeredKinds: readonly PatternDayKind[] =
		pickable.length > 0 ? PATTERN_DAY_KINDS : ['share']

	function chooseTrack(next: string) {
		setTrackId(next)
		const offered = workoutsOnTrack(next)
		// The Workout travels with the track or not at all: a session from the track
		// just left would fund this track's week with another discipline's work.
		if (offered.length === 0) {
			setKind('share')
			setWorkoutId('')
		} else if (kind === 'fixed') {
			setWorkoutId(offered[0]!.id)
		} else if (!offered.some((workout) => workout.id === workoutId)) {
			setWorkoutId('')
		}
	}

	function chooseKind(next: PatternDayKind) {
		setKind(next)
		// A share day's shape is **optional**, so it opens unchosen: carrying the fixed
		// day's prescription across would store a shape the athlete never picked. A
		// fixed day *is* its Workout, so there the pre-selection is the right default.
		setWorkoutId(next === 'fixed' ? (pickable[0]?.id ?? '') : '')
	}

	if (tracks.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				This plan has no training track yet, and a pattern day draws its volume
				from one.
			</p>
		)
	}

	return (
		<Form method="POST" className="space-y-4">
			<p className="text-sm font-medium">Add a day</p>
			<input type="hidden" name="intent" value="add-week-pattern-day" />
			<input type="hidden" name="patternId" value={pattern.id} />

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor={`weekday-${suffix}`}>Weekday</Label>
					<Select value={weekday} onValueChange={(v) => setWeekday(String(v))}>
						<SelectTrigger id={`weekday-${suffix}`} className="w-full">
							<SelectValue>
								{(value) =>
									PATTERN_WEEKDAY_LABELS[
										Number(
											value ?? weekday,
										) as (typeof PATTERN_WEEKDAYS)[number]
									]
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{/* Monday first, matching the Training Week (ADR 0019) rather than
							    the Sunday-first calendar index the profile stores (ADR 0005).
							    The labels are derived across that mapping, never retyped. */}
							{PATTERN_WEEKDAYS.map((option) => (
								<SelectItem key={option} value={String(option)}>
									{PATTERN_WEEKDAY_LABELS[option]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<input type="hidden" name="weekday" value={weekday} />
				</div>

				<div className="space-y-2">
					<Label htmlFor={`track-${suffix}`}>Training track</Label>
					<Select value={trackId} onValueChange={(v) => chooseTrack(String(v))}>
						<SelectTrigger id={`track-${suffix}`} className="w-full">
							<SelectValue>
								{(value) =>
									trackLabel(tracks, String(value ?? trackId) || trackId)
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{tracks.map((track) => (
								<SelectItem key={track.trackId} value={track.trackId}>
									{trackLabel(tracks, track.trackId)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<input type="hidden" name="trackId" value={trackId} />
					<p className="text-muted-foreground text-sm">
						A swim day draws swim volume, so the day says which track it belongs
						to.
					</p>
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor={`kind-${suffix}`}>What kind of day</Label>
				<Select
					value={kind}
					onValueChange={(value) => chooseKind(value as PatternDayKind)}
				>
					<SelectTrigger id={`kind-${suffix}`} className="w-full">
						<SelectValue>
							{(value) =>
								PATTERN_DAY_KIND_LABELS[(value as PatternDayKind) ?? kind]
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{offeredKinds.map((option) => (
							<SelectItem key={option} value={option}>
								{PATTERN_DAY_KIND_LABELS[option]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{/* The label names the kind and this says the rule it carries. The rule is
				    the whole of the choice, so it is stated in full here rather than inside
				    a 316 px trigger that would clip it at the reference viewport (§2.5). */}
				<p className="text-muted-foreground text-sm">
					{kind === 'fixed'
						? 'Prescribed as you authored it and never scaled — the same intervals in a big week and a small one.'
						: 'A relative weight, normalised across the week — this day absorbs its part of whatever the fixed sessions leave.'}
				</p>
				<input type="hidden" name="kind" value={kind} />
			</div>

			{kind === 'share' ? (
				<Field
					labelProps={{ children: 'Relative weight' }}
					inputProps={{
						id: `weight-${suffix}`,
						name: 'weight',
						type: 'number',
						// No `min`: a weight is a *ratio*, so `0.05` is a legal answer and any
						// bound written here would have to guess where the legal ones stop.
						// `ShareWeightSchema` is the gate — strictly positive, with the message
						// the athlete reads — and a `min: 0` here would have contradicted it by
						// letting the browser pass a zero the server refuses.
						step: 'any',
						inputMode: 'decimal',
						defaultValue: '1',
						required: true,
					}}
				/>
			) : null}

			{pickable.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					{workouts.length === 0
						? 'A fixed day prescribes a workout, and you have none yet'
						: `A fixed day prescribes a workout from the day’s own track, and you have no ${getDisciplineLabel(
								trackDiscipline(tracks, trackId),
							).toLowerCase()} workout yet`}{' '}
					— this app authors a workout together with a session, so{' '}
					<Link to="/training/sessions/new" className="underline">
						author a session
					</Link>{' '}
					and it will be offered here. Until then a day can still take a share
					of the week.
				</p>
			) : (
				<div className="space-y-2">
					<Label htmlFor={`workout-${suffix}`}>
						{kind === 'fixed' ? 'Workout' : 'Shape (optional)'}
					</Label>
					<Select
						value={workoutId}
						onValueChange={(value) => setWorkoutId(String(value))}
					>
						<SelectTrigger id={`workout-${suffix}`} className="w-full">
							<SelectValue>
								{(value) => workoutLabel(pickable, String(value ?? workoutId))}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{/* A share day may carry a Workout as a *shape* or none at all, so
							    the empty option is a real choice rather than a missing value —
							    the same empty-string option the event form's target uses. */}
							{kind === 'share' ? (
								<SelectItem value="">No shape — volume only</SelectItem>
							) : null}
							{/* This track's own discipline only: a bike session on a run-track
							    day would count bike duration as run volume, which is the
							    cross-discipline funding ADR 0041 and ADR 0043 §5 rule out. */}
							{pickable.map((workout) => (
								<SelectItem key={workout.id} value={workout.id}>
									{workoutLabel(pickable, workout.id)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<input type="hidden" name="workoutId" value={workoutId} />
					<p className="text-muted-foreground text-sm">
						{kind === 'fixed'
							? 'Stamped as you authored it. Its volume is read off the session itself, so it is the same in every week.'
							: 'A shape is scaled to the share this day takes. Leave it out for volume with no structure.'}
					</p>
				</div>
			)}

			<Button type="submit" variant="outline" className="w-full sm:w-auto">
				Add day
			</Button>
		</Form>
	)
}

function trackLabel(tracks: PatternTrackOption[], trackId: string): string {
	const track = tracks.find((entry) => entry.trackId === trackId)
	return track ? DISCIPLINE_LABELS[track.discipline] : 'Training track'
}

/** A track's Discipline, for the copy that names what a day may prescribe. */
function trackDiscipline(
	tracks: PatternTrackOption[],
	trackId: string,
): Discipline | '' {
	return tracks.find((entry) => entry.trackId === trackId)?.discipline ?? ''
}

/**
 * One Workout as the picker names it: its title and its discipline.
 *
 * `getDisciplineLabel` and not `DISCIPLINE_LABELS`, so a bike session reads as a
 * **Ride** — this names an actual session being prescribed, which is the *activity*
 * register (§4.1 of the UI conventions), while the track picker above it configures a
 * training domain and stays on the sport register. It also capitalizes anything
 * unknown, so no raw enum can reach the trigger as a fallback.
 */
function workoutLabel(workouts: PickableWorkout[], workoutId: string): string {
	const workout = workouts.find((entry) => entry.id === workoutId)
	if (!workout) return 'No shape — volume only'
	return `${workout.title} · ${getDisciplineLabel(workout.discipline)}`
}

/** Name a new pattern. Its position is the service's; nothing here submits one. */
function AddPatternForm({
	outlineId,
	/** How many patterns the plan holds — what makes the box empty again once one lands. */
	patternCount,
}: {
	outlineId: string
	patternCount: number
}) {
	return (
		<Form method="POST" className="space-y-4">
			<p className="text-sm font-medium">Add a week pattern</p>
			<input type="hidden" name="intent" value="add-week-pattern" />
			<input type="hidden" name="outlineId" value={outlineId} />
			{/* Re-keyed on the number of patterns, so an add that lands clears the box —
			    the same trick the rename Field plays with the stored name. An
			    uncontrolled input keeps what was typed, and a second click on an unchanged
			    box would quietly author a second pattern of the same name. */}
			<Field
				key={patternCount}
				labelProps={{ children: 'Name' }}
				inputProps={{
					id: 'new-pattern-name',
					name: 'name',
					type: 'text',
					placeholder: 'e.g. Weekday base week',
					maxLength: 60,
					required: true,
				}}
			/>
			<Button type="submit" className="w-full sm:w-auto">
				Add pattern
			</Button>
		</Form>
	)
}

/**
 * Delete a pattern, confirmed — and the confirmation says what goes and what
 * stays. What goes is this pattern and its days. What stays is everything else:
 * the blocks, the tracks, and every session already trained, because nothing has
 * been scheduled from a pattern at all.
 */
function DeletePatternDialog({ pattern }: { pattern: EditablePattern }) {
	return (
		<AlertDialog>
			<AlertDialogTrigger
				render={
					<Button variant="ghost" size="sm" className="w-full sm:w-auto">
						Delete pattern
					</Button>
				}
			/>
			<AlertDialogPopup>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete {pattern.name}?</AlertDialogTitle>
					<AlertDialogDescription>
						{/* Three cases, because "and its 0 days" is not a sentence: a named
						    pattern the athlete has not filled in yet is an ordinary state,
						    and it reads as one. */}
						This removes {pattern.name}
						{pattern.days.length === 0
							? ', which has no days in it yet'
							: pattern.days.length === 1
								? ' and its one day'
								: ` and its ${pattern.days.length} days`}
						. Your blocks, your training tracks and every session you have
						already trained stay exactly as they are — nothing on your calendar
						came from this pattern. This cannot be undone.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Form method="POST">
					<input type="hidden" name="intent" value="remove-week-pattern" />
					<input type="hidden" name="patternId" value={pattern.id} />
					<AlertDialogFooter>
						<AlertDialogCancel type="button">Keep pattern</AlertDialogCancel>
						<AlertDialogAction type="submit" variant="destructive">
							Delete pattern
						</AlertDialogAction>
					</AlertDialogFooter>
				</Form>
			</AlertDialogPopup>
		</AlertDialog>
	)
}

/**
 * The tracks this pattern actually draws from, each with the chosen week's own
 * derived target — the input `resolveWeekPattern` resolves one reading per.
 *
 * Only the tracks the pattern uses, in the season's track order: a track no day
 * belongs to has nothing to resolve, and a reading for it would be an empty
 * column the athlete has to interpret.
 */
function patternTrackSpecs(
	pattern: EditablePattern,
	tracks: PatternTrackOption[],
	week: PreviewWeek | null,
): PatternTrackSpec[] {
	const used = new Set(pattern.days.map((day) => day.trackId))
	return tracks
		.filter((track) => used.has(track.trackId))
		.map((track) => ({
			trackId: track.trackId,
			currency: track.currency,
			// The week's *real* derived figure, or `null`: a fabricated or averaged
			// target would make the preview promise a volume the stamp would not write.
			target:
				week?.targets.find((target) => target.trackId === track.trackId)
					?.value ?? null,
		}))
}

/** The days sharing one day's weekday, in authored order within that day. */
function sameWeekday(
	days: EditablePatternDay[],
	day: EditablePatternDay,
): EditablePatternDay[] {
	return days
		.filter((entry) => entry.weekday === day.weekday)
		.sort((a, b) => a.orderInDay - b.orderInDay)
}
