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
 *   `currencyOptionsFor`'s — strength speaks `sets` and only `sets` — and which of
 *   them is *proposed*, with the anchor pre-filled beside it, is the athlete's own
 *   history read by `proposeTrack`. The second track an athlete authors is not a
 *   lesser track than the first: it meets the same proposal the creation flow
 *   makes, and the same honest "the app cannot read this" where there is no
 *   history behind it.
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
import { formatVolumeTotal, formatWeeklyVolume } from '#app/utils/format.ts'
import {
	DISCIPLINE_LABELS,
	VOLUME_CURRENCY_LABELS,
	VOLUME_CURRENCY_UNITS,
} from '#app/utils/labels.ts'
import { type VolumeCurrency } from '#app/utils/plan-outline/derive.ts'
import {
	ANCHOR_WINDOW_WEEKS,
	currencyOptionsFor,
	type AnchorPrefill,
	type TrackProposal,
} from '#app/utils/plan-outline/proposal.ts'
import { DISCIPLINES, type Discipline } from '#app/utils/workout-schema.ts'
import { Disclosure } from './__plan-chrome.tsx'

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
 * Where a pre-filled anchor came from, said in a sentence — or that it came from
 * nowhere, which is the answer for an athlete who has not trained the Discipline
 * they are adding.
 *
 * Lives here rather than in either route because **both** authoring surfaces owe
 * the athlete the same words: the creation flow's first track and the plan page's
 * second one are one act happening twice (ADR 0043 §2), and two hand-written
 * derivation sentences would drift into two vocabularies for one arithmetic.
 * The numbers travel as a value object and this is where they are worded, so the
 * display layer stays the one that formats them (ADR 0023, ADR 0040 §6).
 */
export function anchorSentence(prefill: AnchorPrefill | undefined): string {
	if (!prefill) {
		return `Nothing in your last ${ANCHOR_WINDOW_WEEKS} weeks to read this from — type the weekly volume you are starting at.`
	}
	const { derivation } = prefill
	const average = derivation.total / derivation.windowWeeks
	// Named only where it is not the whole window: "you trained 2 of them" is what
	// tells an athlete who trained twice in four weeks why the number reads low.
	const trained =
		derivation.weeksTrained === derivation.windowWeeks
			? ''
			: ` — you trained ${derivation.weeksTrained} of them`
	return `Your last ${derivation.windowWeeks} weeks averaged ${formatWeeklyVolume(
		average,
		derivation.currency,
	)} (${formatVolumeTotal(derivation.total, derivation.currency)} in total)${trained}.`
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
	proposals,
	error,
}: {
	outlineId: string
	tracks: RosterTrack[]
	/**
	 * What the app proposes for each Discipline this plan does not measure yet, read
	 * from the athlete's own history at the loader. Looked up by Discipline rather
	 * than indexed, so the picker's own rule about which Disciplines are on offer
	 * stays the only one in the file.
	 */
	proposals: TrackProposal[]
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
			{/* Behind a disclosure, because authoring a track is a **once-per-season**
			    act and the roster above it is read every visit. Left open, its two
			    selects, its number field and its four-line explanation of the currency
			    lock were the tallest thing on the plan's summary card — a setup form
			    sitting permanently on top of the plan it sets up. */}
			{untracked.length > 0 ? (
				<Disclosure
					summary="Add a training track"
					detail={`${untracked.map((discipline) => DISCIPLINE_LABELS[discipline]).join(' · ')} — each in a unit it keeps for life.`}
				>
					<AddTrackForm
						outlineId={outlineId}
						untracked={untracked}
						proposals={proposals}
					/>
				</Disclosure>
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
 * decides — the same function the write schema refuses against, so the control and
 * the gate cannot drift — and the Discipline's own `TrackProposal` that orders the
 * list, proposed unit first.
 *
 * Nothing here preselects a unit the history did not name. An athlete adding a
 * bike track after four weeks of rides meets `km` already chosen with the anchor
 * pre-filled beneath it; an athlete adding one having never ridden meets an
 * unselected picker and a sentence saying the app cannot read a unit from
 * anything — "honest beats guessing" (ADR 0043 §2), which is the whole reason the
 * proposal can be null.
 *
 * Choosing a Discipline resets the currency to *that* Discipline's proposal rather
 * than keeping the previous pick, because a currency the new Discipline cannot
 * author would otherwise sit selected and be refused on submit — the choice is per
 * Discipline and the control says so by forgetting.
 */
function AddTrackForm({
	outlineId,
	untracked,
	proposals,
}: {
	outlineId: string
	/** The Disciplines this plan does not measure yet — never an empty list. */
	untracked: Discipline[]
	/** What the athlete's own history proposes, one per untracked Discipline. */
	proposals: TrackProposal[]
}) {
	const proposalFor = (option: Discipline) =>
		proposals.find((proposal) => proposal.discipline === option)

	const [discipline, setDiscipline] = useState<Discipline>(untracked[0]!)
	const proposal = proposalFor(discipline)
	// `currencyOptionsFor` stays the authority on *which* units a Discipline may
	// author; the proposal only reorders them. Falling back to it keeps the form
	// working for a Discipline the loader read nothing for at all.
	const options = proposal?.offered ?? currencyOptionsFor(discipline)
	const [currency, setCurrency] = useState<VolumeCurrency | ''>(
		proposalFor(untracked[0]!)?.currency ?? '',
	)

	// Strength authors `sets` and is offered nothing else (ADR 0043 §2), so its unit
	// is stated rather than picked — a one-option select is the dead control
	// ADR 0044 §8 argues against.
	const soleCurrency = options.length === 1 ? options[0]! : undefined
	const chosen =
		soleCurrency ??
		(currency !== '' && options.includes(currency) ? currency : '')
	// The pre-fill belongs to the currency actually chosen, never to the proposed
	// one: an athlete taking the offered hours instead of the proposed distance gets
	// the hours figure and the hours derivation (ADR 0043 §2).
	const prefill = chosen === '' ? undefined : proposal?.anchors[chosen]

	return (
		<Form method="POST" className="space-y-4 pt-2">
			{/* The visible name is the disclosure summary that opens this form; the
			    heading stays for assistive technology rather than printing it twice. */}
			<h3 className="sr-only">Add a training track</h3>
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
							setCurrency(proposalFor(next)?.currency ?? '')
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
					{soleCurrency ? (
						// No field to make dead: the unit is stated and submitted, the same
						// treatment the creation flow gives a strength track.
						<>
							<input type="hidden" name="currency" value={soleCurrency} />
							<p className="text-sm">
								Planned in{' '}
								<span className="font-medium">
									{VOLUME_CURRENCY_LABELS[soleCurrency].toLowerCase()}
								</span>{' '}
								<span className="text-muted-foreground">
									· strength&rsquo;s own unit, not a choice
								</span>
							</p>
						</>
					) : (
						<>
							<Label htmlFor="new-track-currency">Unit</Label>
							<Select
								value={chosen}
								onValueChange={(value) => setCurrency(value as VolumeCurrency)}
							>
								<SelectTrigger id="new-track-currency" className="w-full">
									<SelectValue placeholder="Pick the unit you plan in">
										{(value) =>
											value
												? VOLUME_CURRENCY_LABELS[value as VolumeCurrency]
												: 'Pick the unit you plan in'
										}
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
						</>
					)}
				</div>
			</div>
			<p className="text-muted-foreground text-sm">
				{soleCurrency ? null : proposal?.currency ? (
					<>Proposed from your own history. </>
				) : (
					<>
						Nothing in your last {ANCHOR_WINDOW_WEEKS} weeks to read a unit
						from, so this one is yours to choose.{' '}
					</>
				)}
				The unit is fixed once the track exists — changing it would rewrite the
				unit of weeks you have already trained, so it is a new track rather than
				an edit.
			</p>
			{/* Re-keyed on the currency so switching units brings that unit's own
			    pre-fill: anchor value and Volume Currency are one act (ADR 0043 §2),
			    and a distance figure relabelled as hours is a number nobody authored.
			    The unit is named in the label only once there is one to name. */}
			<Field
				key={chosen || 'unset'}
				labelProps={{
					children: chosen
						? `Starting volume (${VOLUME_CURRENCY_UNITS[chosen]})`
						: 'Starting volume',
				}}
				inputProps={{
					id: 'new-track-anchor',
					name: 'anchorValue',
					type: 'number',
					min: 0,
					step: 'any',
					inputMode: 'decimal',
					required: true,
					defaultValue: prefill?.value ?? '',
				}}
			/>
			<p className="text-muted-foreground text-sm">
				{anchorSentence(prefill)} Your starting volume takes effect from your
				plan’s first week, and the phases you already have are the phases this
				track is measured over.
			</p>
			<Button type="submit" size="sm">
				Add track
			</Button>
		</Form>
	)
}
