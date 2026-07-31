/**
 * The **Blocks** reading's editing controls: one phase per card, and one action
 * per control (#402).
 *
 * Split out of `plan.tsx` the way `__workout-editor.tsx` is split out of the
 * session routes — the route owns the loader, the action and the two readings; this
 * module owns the controls one of those readings is built from.
 *
 * Two rules run through all of it. **Nothing here authors a volume quantity**: a
 * phase says *when* and *why* (ADR 0041), so a rhythm chooses which weeks recover
 * and never how deep the cut is — that belongs to the **Training Track segment**.
 * And **every control submits alone**: rename, resize, rhythm, move and remove are
 * five actions on the row rather than one save of the season, because the mistake
 * an athlete is fixing is usually one field of one phase.
 */
import { type ReactNode, useState } from 'react'
import { Form } from 'react-router'
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
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Checkbox } from '#app/components/ui/checkbox.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { formatDate } from '#app/utils/format.ts'
import { RHYTHM_LABELS, WEEK_ROLE_LABELS } from '#app/utils/labels.ts'
import {
	phaseWeekRoles,
	RHYTHMS,
	type PhaseSpec,
	type Rhythm,
} from '#app/utils/plan-outline/derive.ts'

/**
 * A phase as this module edits it: what it stores, plus the span the route derived
 * for it. Declared here rather than imported from the route so the dependency runs
 * one way — the route's own phase reading satisfies it structurally.
 */
export type EditablePhase = PhaseSpec & {
	id: string
	name: string
	/** 1-based first and last week within the plan, derived from the start week. */
	fromWeekInPlan: number
	toWeekInPlan: number
	/** The Monday the phase opens on, as the instant of local midnight. */
	startsAt: Date
}

/**
 * The two directions a phase moves, worded. A UI direction rather than a domain
 * enum — it labels a nudge through a sequence, not a value anything stores — so it
 * lives beside the control rather than in `labels.ts` (the rule `TAB_LABELS`
 * follows).
 */
const MOVE_LABELS = {
	earlier: 'Move earlier',
	later: 'Move later',
} as const satisfies Record<'earlier' | 'later', string>

/**
 * One phase, read and edited.
 *
 * The rhythm and the taper flag are held in local state so the recovery weeks below
 * them redraw as the athlete chooses — the rhythm's consequence is visible *before*
 * it is saved rather than discovered on the Weeks reading afterwards. The week
 * count is **not** previewed against: it belongs to a different action, and drawing
 * a rhythm over a span that has not been saved would mark weeks that do not exist.
 */
export function PhaseCard({
	phase,
	position,
	phaseCount,
	isCurrent,
	timezone,
	children,
}: {
	phase: EditablePhase
	position: number
	phaseCount: number
	isCurrent: boolean
	timezone: string
	/**
	 * What is authored *over* this phase rather than about it — each endurance
	 * **Training Track segment**'s progression (#403). Passed in rather than reached
	 * for, because a segment belongs to a track and this module knows only phases.
	 */
	children?: ReactNode
}) {
	const [rhythm, setRhythm] = useState<Rhythm>(phase.rhythm)
	const [tapers, setTapers] = useState(phase.tapers)

	return (
		<Card>
			<CardHeader className="gap-1">
				<CardTitle className="flex flex-wrap items-center gap-2 text-base">
					{phase.name}
					{isCurrent ? <Badge>Current</Badge> : null}
					{phase.tapers ? <Badge variant="secondary">Tapers</Badge> : null}
				</CardTitle>
				<p className="text-muted-foreground text-sm">
					{phase.fromWeekInPlan === phase.toWeekInPlan
						? `Week ${phase.fromWeekInPlan}`
						: `Weeks ${phase.fromWeekInPlan}–${phase.toWeekInPlan}`}{' '}
					· from {formatDate(phase.startsAt, timezone)}
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<Form
					method="POST"
					className="flex flex-col gap-2 sm:flex-row sm:items-end"
				>
					<input type="hidden" name="intent" value="rename-phase" />
					<input type="hidden" name="phaseId" value={phase.id} />
					{/* Re-keyed on the stored value: an edit that lands changes the field's
					    default, and an uncontrolled input would keep the old one — and Base UI
					    warns about exactly that. Remounting shows what the season now says. */}
					<Field
						key={phase.name}
						className="flex-1"
						labelProps={{ children: 'Name' }}
						inputProps={{
							id: `name-${phase.id}`,
							name: 'name',
							type: 'text',
							defaultValue: phase.name,
							maxLength: 60,
							// Free text, and no vocabulary: "Off-season" and "Return to run"
							// store exactly as well as "Base" (ADR 0044 §2).
							required: true,
						}}
					/>
					<Button type="submit" variant="outline" className="w-full sm:w-auto">
						Rename
					</Button>
				</Form>

				<Form
					method="POST"
					className="flex flex-col gap-2 sm:flex-row sm:items-end"
				>
					<input type="hidden" name="intent" value="resize-phase" />
					<input type="hidden" name="phaseId" value={phase.id} />
					<Field
						key={phase.weeks}
						className="sm:w-28"
						labelProps={{ children: 'Weeks' }}
						inputProps={{
							id: `weeks-${phase.id}`,
							name: 'weeks',
							type: 'number',
							min: 1,
							max: 52,
							inputMode: 'numeric',
							defaultValue: phase.weeks,
						}}
					/>
					<Button type="submit" variant="outline" className="w-full sm:w-auto">
						Save weeks
					</Button>
				</Form>

				<Form method="POST" className="space-y-4">
					<input type="hidden" name="intent" value="set-phase-rhythm" />
					<input type="hidden" name="phaseId" value={phase.id} />
					<RhythmFields
						idSuffix={phase.id}
						rhythm={rhythm}
						onRhythmChange={setRhythm}
						tapers={tapers}
						onTapersChange={setTapers}
					/>
					<RecoveryPreview phase={{ weeks: phase.weeks, rhythm, tapers }} />
					<Button type="submit" variant="outline" className="w-full sm:w-auto">
						Save rhythm
					</Button>
				</Form>

				{children}

				{/* One form per button: a submit carries a single name/value pair, and the
				    move needs its direction alongside its intent. */}
				<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
					{(['earlier', 'later'] as const).map((direction) => (
						<Form method="POST" key={direction}>
							<input type="hidden" name="intent" value="move-phase" />
							<input type="hidden" name="phaseId" value={phase.id} />
							<input type="hidden" name="direction" value={direction} />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								className="w-full sm:w-auto"
								// The first phase has nothing earlier and the last nothing later.
								disabled={
									direction === 'earlier'
										? position === 0
										: position === phaseCount - 1
								}
							>
								{MOVE_LABELS[direction]}
							</Button>
						</Form>
					))}
					<Form method="POST">
						<input type="hidden" name="intent" value="remove-phase" />
						<input type="hidden" name="phaseId" value={phase.id} />
						<Button
							type="submit"
							variant="ghost"
							size="sm"
							className="w-full sm:w-auto"
							// A plan keeps at least one phase; the service refuses it too, and
							// says so, for a page rendered before a sibling was removed.
							disabled={phaseCount === 1}
						>
							Remove
						</Button>
					</Form>
				</div>
			</CardContent>
		</Card>
	)
}

/**
 * The rhythm and taper controls, shared by an existing phase and a new one.
 *
 * Both are the phase's *time* structure (ADR 0044 §4): which weeks recover, and
 * whether the phase descends toward the event. Neither carries a magnitude — how
 * deep a recovery week or a taper cuts is the **Training Track segment**'s, and a
 * phase that carried it would be a phase carrying volume.
 */
function RhythmFields({
	idSuffix,
	rhythm,
	onRhythmChange,
	tapers,
	onTapersChange,
}: {
	idSuffix: string
	rhythm: Rhythm
	onRhythmChange: (rhythm: Rhythm) => void
	tapers: boolean
	onTapersChange: (tapers: boolean) => void
}) {
	const rhythmId = `rhythm-${idSuffix}`
	const tapersId = `tapers-${idSuffix}`
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor={rhythmId}>Loading rhythm</Label>
				{/* The shared Base UI `Select` (ui-conventions §2.4) driven by local state
				    rather than by `SelectField`, which binds to a Conform field: the
				    recovery-week preview below reads this value as it changes, and these
				    row-scoped forms carry no Conform state. `w-full` is reproduced by hand
				    because that is what `SelectField` would have forced (§2.5), and the
				    submitted value rides in a hidden input, so the body is the same either
				    way. */}
				<Select
					value={rhythm}
					onValueChange={(value) => onRhythmChange(value as Rhythm)}
				>
					<SelectTrigger id={rhythmId} className="w-full">
						<SelectValue>
							{(value) => RHYTHM_LABELS[(value as Rhythm) ?? rhythm]}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{RHYTHMS.map((option) => (
							<SelectItem key={option} value={option}>
								{RHYTHM_LABELS[option]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<input type="hidden" name="rhythm" value={rhythm} />
			</div>
			<div className="flex items-center gap-2">
				<Checkbox
					id={tapersId}
					checked={tapers}
					onCheckedChange={(state) => onTapersChange(Boolean(state.valueOf()))}
				/>
				<Label htmlFor={tapersId}>This phase tapers</Label>
				{tapers ? <input type="hidden" name="tapers" value="on" /> : null}
			</div>
		</div>
	)
}

/**
 * Which weeks of the phase recover, drawn for the rhythm currently chosen — before
 * anything is saved.
 *
 * It reads `phaseWeekRoles`, the same function the season derivation uses, so the
 * preview cannot promise a recovery week that lands elsewhere once stored.
 */
function RecoveryPreview({ phase }: { phase: PhaseSpec }) {
	// A new phase's week count is a live form value, so it can be empty or nonsense
	// mid-edit; there is nothing honest to draw until it is a real span.
	if (!Number.isInteger(phase.weeks) || phase.weeks < 1 || phase.weeks > 52) {
		return null
	}
	const roles = phaseWeekRoles(phase)
	const recoveryWeeks = roles
		.map((role, index) => (role === 'recovery' ? index + 1 : null))
		.filter((week): week is number => week != null)

	return (
		<div className="space-y-2">
			{/* A group of marks rather than a list, so `listitem` keeps meaning "phase"
			    on this reading. Each mark says its own role out loud, because the mark
			    itself is a colour. A dense chip row is one of ui-conventions §2.2's named
			    exceptions, so the gap sits below the ladder deliberately: 52 of these
			    have to fit at 390px. */}
			<div role="group" aria-label="Week roles" className="flex flex-wrap gap-1">
				{roles.map((role, index) => (
					<span
						key={index}
						className={
							role === 'loading'
								? 'bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs tabular-nums'
								: 'bg-primary/15 text-primary rounded-md px-2 py-1 text-xs font-medium tabular-nums'
						}
					>
						<span className="sr-only">{`Week ${index + 1}: ${WEEK_ROLE_LABELS[role]}`}</span>
						<span aria-hidden="true">{index + 1}</span>
					</span>
				))}
			</div>
			<p className="text-muted-foreground text-sm">
				{phase.tapers
					? 'Every week of this phase steps down toward your event, so it holds no recovery week.'
					: recoveryWeeks.length === 0
						? 'No recovery weeks in this phase.'
						: `Recovery weeks: ${recoveryWeeks
								.map((week) => `week ${week}`)
								.join(', ')} of this phase. How deeply they cut is the track's, not the phase's.`}
			</p>
		</div>
	)
}

/**
 * Add a phase, at a position in the season.
 *
 * A form on the page background rather than in a card (ui-conventions §1.6). The
 * position is offered as "at the start" or "after ⟨phase⟩" because that is how a
 * season reads out loud, and because an insert is *between* phases — there is no
 * gap for a phase to land in (ADR 0044 §3).
 */
export function AddPhaseForm({
	outlineId,
	phases,
}: {
	outlineId: string
	phases: Array<{ id: string; name: string }>
}) {
	const [weeks, setWeeks] = useState('4')
	const [rhythm, setRhythm] = useState<Rhythm>('3:1')
	const [tapers, setTapers] = useState(false)
	const [atIndex, setAtIndex] = useState(String(phases.length))
	const positions = [
		{ value: '0', label: 'At the start' },
		...phases.map((phase, index) => ({
			value: String(index + 1),
			label: `After ${phase.name}`,
		})),
	]

	return (
		<Form method="POST" className="space-y-4">
			<h2 className="text-lg font-semibold">Add a phase</h2>
			<input type="hidden" name="intent" value="add-phase" />
			<input type="hidden" name="outlineId" value={outlineId} />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field
					labelProps={{ children: 'Name' }}
					inputProps={{
						id: 'new-phase-name',
						name: 'name',
						type: 'text',
						placeholder: 'e.g. Off-season',
						maxLength: 60,
						required: true,
					}}
				/>
				<Field
					labelProps={{ children: 'Weeks' }}
					inputProps={{
						id: 'new-phase-weeks',
						name: 'weeks',
						type: 'number',
						min: 1,
						max: 52,
						inputMode: 'numeric',
						// Controlled, because the preview below is drawn for this span — here
						// the span and the rhythm are one action, so previewing both is honest.
						value: weeks,
						onChange: (event) => setWeeks(event.currentTarget.value),
					}}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="new-phase-position">Where it goes</Label>
				<Select
					value={atIndex}
					onValueChange={(value) => setAtIndex(String(value))}
				>
					<SelectTrigger id="new-phase-position" className="w-full">
						<SelectValue>
							{(value) =>
								positions.find((option) => option.value === value)?.label
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{positions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<input type="hidden" name="atIndex" value={atIndex} />
				<p className="text-muted-foreground text-sm">
					Your plan grows forward — adding a phase never moves the week your plan
					starts on.
				</p>
			</div>
			<RhythmFields
				idSuffix="new-phase"
				rhythm={rhythm}
				onRhythmChange={setRhythm}
				tapers={tapers}
				onTapersChange={setTapers}
			/>
			<RecoveryPreview phase={{ weeks: Number(weeks), rhythm, tapers }} />
			<Button type="submit" className="w-full sm:w-auto">
				Add phase
			</Button>
		</Form>
	)
}

/**
 * Delete the plan, confirmed — and the confirmation says what goes and what stays.
 *
 * What goes is the **Plan Outline**: the phases, the tracks and their **Season
 * Anchors**. What stays is the **Event** and every **Workout Session** already
 * trained, because a session anchors to the Event and never to a phase. Saying both
 * halves is the point: "this cannot be undone" alone would leave an athlete
 * guessing whether their training history goes with it.
 */
export function DeletePlanSection({
	outlineId,
	eventName,
}: {
	outlineId: string
	eventName: string
}) {
	return (
		<section aria-labelledby="delete-plan" className="space-y-4">
			<h2 id="delete-plan" className="text-lg font-semibold">
				Delete this plan
			</h2>
			<p className="text-muted-foreground text-sm">
				Removes the season you authored. {eventName} stays on your calendar, and
				every session you have already trained stays exactly as it is.
			</p>
			<AlertDialog>
				<AlertDialogTrigger
					render={
						<Button variant="destructive" size="sm">
							Delete plan
						</Button>
					}
				/>
				<AlertDialogPopup>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this plan?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes your phases, your training tracks and your starting
							volumes. It does not touch {eventName} or any session you have
							already trained — your event stays on your calendar as a marker.
							This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Form method="POST">
						<input type="hidden" name="intent" value="delete-plan" />
						<input type="hidden" name="outlineId" value={outlineId} />
						<AlertDialogFooter>
							<AlertDialogCancel type="button">Keep plan</AlertDialogCancel>
							<AlertDialogAction type="submit" variant="destructive">
								Delete plan
							</AlertDialogAction>
						</AlertDialogFooter>
					</Form>
				</AlertDialogPopup>
			</AlertDialog>
		</section>
	)
}
