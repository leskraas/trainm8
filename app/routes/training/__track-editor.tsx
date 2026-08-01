/**
 * The plan's **Training Tracks**, read and changed: one row per Discipline, plus
 * the two acts that alter the set — add a track, take one away (#414).
 *
 * Split out of `plan.tsx` for the reason `__phase-editor.tsx` is: the route owns
 * the loader, the action and the two readings; this module owns one reading's
 * controls.
 *
 * Three rules run through it.
 *
 * - **A track is per Discipline, and the database says so** (ADR 0043 §1). The
 *   Discipline picker offers only the Disciplines this plan does not already
 *   measure, so the unique index is a backstop rather than the athlete's first
 *   encounter with the rule.
 * - **Currency and the first Season Anchor are one act** (ADR 0043 §2), so the add
 *   form asks for both in one submission and never creates a track that has to be
 *   anchored afterwards. Which currencies a Discipline may author is
 *   `currencyOptionsFor`'s — strength speaks `sets` and only `sets`.
 * - **A currency is never edited** (ADR 0044 §8). There is no control here that
 *   changes one, and the removal copy says what re-authoring a unit actually costs:
 *   the track goes, and everything authored on it goes with it.
 *
 * No **Season Span** is stated per row. A span belongs to a **commensurability
 * group** and not to a track (ADR 0043 §5), and the headline above the roster is
 * where the grouping is rendered — one figure per group, so a triathlete's three
 * TSS tracks read as one line and not as three.
 */
import { useState } from 'react'
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
import { Button } from '#app/components/ui/button.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { formatWeeklyVolume } from '#app/utils/format.ts'
import {
	DISCIPLINE_LABELS,
	VOLUME_CURRENCY_LABELS,
	VOLUME_CURRENCY_UNITS,
} from '#app/utils/labels.ts'
import { type VolumeCurrency } from '#app/utils/plan-outline/derive.ts'
import { currencyOptionsFor } from '#app/utils/plan-outline/proposal.ts'
import { DISCIPLINES, type Discipline } from '#app/utils/workout-schema.ts'

/**
 * One track as this module reads it — its Discipline, its locked currency and the
 * number the season opens at. Declared here rather than imported from the route so
 * the dependency runs one way; the route's own track reading satisfies it
 * structurally.
 */
export type RosterTrack = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	anchors: Array<{ fromWeekKey: string; value: number }>
}

/**
 * The tracks this plan measures, and the controls that change the set.
 *
 * The roster sits under the **Season Span** headline because it answers the
 * question the headline raises: a triathlete reading one accumulated figure needs
 * to see the three tracks behind it, each in the currency it was authored in.
 */
export function TrackRoster({
	outlineId,
	tracks,
	error,
}: {
	outlineId: string
	tracks: RosterTrack[]
	/** A refused add or remove, said once above the roster it was aimed at. */
	error?: string
}) {
	const untracked = DISCIPLINES.filter(
		(discipline) => !tracks.some((track) => track.discipline === discipline),
	)

	return (
		<div className="space-y-2">
			{error ? (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			) : null}
			{/* Named on the list rather than on a heading: the roster is a line of the
			    plan's summary, not a section of it, and a visible heading over three
			    words of text would be chrome at 390 px. */}
			<ul aria-label="Training tracks" className="space-y-1">
				{tracks.map((track) => (
					<li
						key={track.trackId}
						className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
					>
						<span className="font-medium">
							{DISCIPLINE_LABELS[track.discipline]}
						</span>
						<span className="text-muted-foreground">
							· authored in {VOLUME_CURRENCY_UNITS[track.currency]}
							{track.anchors[0]
								? ` · starts at ${formatWeeklyVolume(track.anchors[0].value, track.currency)}`
								: null}
							{/* Whether the athlete has re-anchored is part of what their season
							    *is*, so it is stated here and not only down in the anchor
							    section: a **Season Anchor** is an ordered list, and a line that
							    named only its first value would describe a plan that stopped
							    being the whole truth the moment they re-anchored (ADR 0040 §5).
							    The list itself, with the weeks and the controls, is on the
							    Blocks reading. */}
							{track.anchors.length > 1
								? ` · re-anchored ${track.anchors.length - 1 === 1 ? 'once' : `${track.anchors.length - 1} times`}, most recently to ${formatWeeklyVolume(
										track.anchors[track.anchors.length - 1]!.value,
										track.currency,
									)}`
								: null}
						</span>
						{/* Only where there is another track to fall back on. A plan with no
						    track measures nothing, so the honest action for an athlete who
						    wants none is deleting the plan, which says what it takes. */}
						{tracks.length > 1 ? <RemoveTrackButton track={track} /> : null}
					</li>
				))}
			</ul>
			{untracked.length > 0 ? (
				<AddTrackForm outlineId={outlineId} untracked={untracked} />
			) : null}
		</div>
	)
}

/**
 * Removing a track, behind a confirmation that names what goes with it.
 *
 * Confirmed rather than undoable because the loss is real and cascades: the
 * **Season Anchors**, the segments and their **Quality Session Mix**, every
 * hand-set week, and any **Week Pattern** day that drew from the track. The phases
 * stay — they carry no volume and no Discipline (ADR 0041) — which is what the copy
 * says, so an athlete removing a track does not fear losing their season's shape.
 */
function RemoveTrackButton({ track }: { track: RosterTrack }) {
	const label = DISCIPLINE_LABELS[track.discipline]
	return (
		<AlertDialog>
			<AlertDialogTrigger
				// `aria-label` and not an `sr-only` child: the trigger owns its own
				// children, so a hidden span inside it is dropped — and every row's
				// button would then read as a bare "Remove" with no track named.
				render={
					<Button
						variant="ghost"
						size="sm"
						aria-label={`Remove the ${label} track`}
					>
						Remove
					</Button>
				}
			/>
			<AlertDialogPopup>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove the {label} track?</AlertDialogTitle>
					<AlertDialogDescription>
						This removes its starting volume, its progression and any week you
						hand-set on it, and any pattern day that drew from it. Your phases
						stay exactly as they are, and so does every session you have already
						trained. You can author a {label.toLowerCase()} track again
						afterwards — it starts fresh, and you pick its unit again.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Form method="POST">
					<input type="hidden" name="intent" value="remove-track" />
					<input type="hidden" name="trackId" value={track.trackId} />
					<AlertDialogFooter>
						<AlertDialogCancel type="button">Keep track</AlertDialogCancel>
						<AlertDialogAction type="submit" variant="destructive">
							Remove track
						</AlertDialogAction>
					</AlertDialogFooter>
				</Form>
			</AlertDialogPopup>
		</AlertDialog>
	)
}

/**
 * Authoring another track over the season that already exists: a Discipline, a
 * **Volume Currency** and a first **Season Anchor**, in one submission.
 *
 * The currency list is driven off the chosen Discipline in local state, so a
 * strength track is never offered a unit strength cannot express and an endurance
 * one is never offered `sets` (ADR 0043 §2). It is `currencyOptionsFor` that
 * decides, the same function the write schema refuses against, so the control and
 * the gate cannot drift.
 *
 * Choosing a Discipline resets the currency rather than keeping the previous pick,
 * because a currency the new Discipline cannot author would otherwise sit selected
 * and be refused on submit — the choice is per Discipline and the control says so
 * by forgetting.
 */
function AddTrackForm({
	outlineId,
	untracked,
}: {
	outlineId: string
	/** The Disciplines this plan does not measure yet — never an empty list. */
	untracked: Discipline[]
}) {
	const [discipline, setDiscipline] = useState<Discipline>(untracked[0]!)
	const options = currencyOptionsFor(discipline)
	const [currency, setCurrency] = useState<VolumeCurrency>(options[0]!)
	const chosen = options.includes(currency) ? currency : options[0]!

	return (
		<Form method="POST" className="space-y-4 pt-2">
			<h3 className="text-sm font-semibold">Add a training track</h3>
			<input type="hidden" name="intent" value="add-track" />
			<input type="hidden" name="outlineId" value={outlineId} />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="new-track-discipline">Discipline</Label>
					<Select
						value={discipline}
						onValueChange={(value) => {
							const next = value as Discipline
							setDiscipline(next)
							setCurrency(currencyOptionsFor(next)[0]!)
						}}
					>
						<SelectTrigger id="new-track-discipline" className="w-full">
							<SelectValue>
								{(value) => DISCIPLINE_LABELS[value as Discipline]}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{untracked.map((option) => (
								<SelectItem key={option} value={option}>
									{DISCIPLINE_LABELS[option]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<input type="hidden" name="discipline" value={discipline} />
				</div>
				<div className="space-y-2">
					<Label htmlFor="new-track-currency">Unit</Label>
					<Select
						value={chosen}
						onValueChange={(value) => setCurrency(value as VolumeCurrency)}
					>
						<SelectTrigger id="new-track-currency" className="w-full">
							<SelectValue>
								{(value) => VOLUME_CURRENCY_LABELS[value as VolumeCurrency]}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{options.map((option) => (
								<SelectItem key={option} value={option}>
									{VOLUME_CURRENCY_LABELS[option]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<input type="hidden" name="currency" value={chosen} />
				</div>
			</div>
			<Field
				labelProps={{
					children: `Starting volume (${VOLUME_CURRENCY_UNITS[chosen]})`,
				}}
				inputProps={{
					id: 'new-track-anchor',
					name: 'anchorValue',
					type: 'number',
					min: 0,
					step: 'any',
					inputMode: 'decimal',
					required: true,
				}}
			/>
			<p className="text-muted-foreground text-sm">
				The unit is fixed once the track exists — changing it would rewrite the
				unit of weeks you have already trained, so it is a new track rather than
				an edit. Your starting volume takes effect from your plan’s first week,
				and the phases you already have are the phases this track is measured
				over.
			</p>
			<Button type="submit" size="sm">
				Add track
			</Button>
		</Form>
	)
}
