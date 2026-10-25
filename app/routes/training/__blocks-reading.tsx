/**
 * The Blocks reading of the plan page (`plan.tsx`, #533): the phases with their
 * segments' progression, the guards above them, and Avansert below.
 */

import {
	formatNbEmphasisLabel,
	formatNbSignedPercent,
	formatNbWeeklyVolume,
} from '#app/utils/format.ts'
import {
	nbPhaseName,
	nbTrackName,
	PRESET_GALLERY_LABELS,
	SEASON_ADVANCED_LABELS,
	SESONG_ANCHOR_LABELS,
	SESONG_LIFTING_LABELS,
	SESONG_PAGE_LABELS,
	SESONG_PHASE_LABELS,
	SESONG_SEGMENT_LABELS,
} from '#app/utils/labels.ts'
import { proposeFit } from '#app/utils/plan-outline/fit-proposal.ts'
import {
	emphasisTerms,
	qualitySessionCount,
} from '#app/utils/plan-outline/quality-mix.ts'
import { isCardioDiscipline } from '#app/utils/workout-schema.ts'
import { type Route } from './+types/plan.ts'
import { FitToEventOffer } from './__fit-to-event.tsx'
import {
	AddPhaseForm,
	DeletePlanSection,
	PhaseCard,
} from './__phase-editor.tsx'
import { CollapsibleSection, PhaseSpark } from './__plan-chrome.tsx'
import {
	anchorPlacementsOf,
	type SeasonData,
	type SeasonTrack,
	type SegmentActionData,
} from './__plan-season.ts'
import { PresetGallery } from './__preset-gallery.tsx'
import {
	SeasonAnchorSection,
	type EditableAnchorTrack,
} from './__season-anchor-editor.tsx'
import { SeasonChart } from './__season-chart.tsx'
import {
	RampGuardNotice,
	AvailabilityFitNotice,
	BandFitNotice,
} from './__season-notices.tsx'
import {
	boundaryStepStanding,
	SegmentProgressionForm,
	SegmentMixForm,
} from './__segment-editor.tsx'
import {
	StrengthBlocksSection,
	type EditableStrengthTrack,
} from './__strength-segment-editor.tsx'

/**
 * The Blocks reading: the phases in authored order, each with the progression its
 * endurance segments author.
 *
 * A phase still carries a name, a span and a rhythm and nothing about volume
 * (ADR 0041) — the ramp and the cuts belong to the **Training Track segment**
 * measured over it, which is why they are inside the card and not part of the
 * phase's own line.
 */
export function BlocksReading({
	season,
	error,
	actionData,
	strengthTracks,
	anchorTracks,
	firstUnbegunWeekKey,
	conversionContexts,
	fitnessAnchor,
	seasonFitness,
}: {
	season: SeasonData
	/**
	 * The first week not yet begun: a plan whose start is before it has begun,
	 * and a shape would rewrite weeks lived (#505 story 14).
	 */
	firstUnbegunWeekKey: string
	/** The analytical chart's two inputs (#413), for its place under Avansert. */
	conversionContexts: Route.ComponentProps['loaderData']['conversionContexts']
	fitnessAnchor: Route.ComponentProps['loaderData']['fitnessAnchor']
	/** The chart's fitness layer, replayed by the loader. */
	seasonFitness: Route.ComponentProps['loaderData']['seasonFitness']
	/** A refused *structural* edit, said once above the phases it was aimed at. */
	error?: string
	actionData: SegmentActionData
	strengthTracks: EditableStrengthTrack[]
	/** Each track's **Season Anchor** segments, the level the ramps below multiply. */
	anchorTracks: EditableAnchorTrack[]
}) {
	// A track with no phase-bound segment authors no progression here: a strength
	// track's segments are dated and float free of the phases (ADR 0047 §6).
	const enduranceTracks = season.tracks.filter(
		(track) => track.segments.length > 0,
	)
	// **Every** track's guard, not the endurance half of it: ADR 0047 §1 gave a
	// strength segment the same ramp and the same boundary step, and the guard gained
	// a second track to guard with them. Each line carries the track it came from, so
	// a lifting warning can say where it opens instead of naming a phase as its
	// subject.
	const warnings = season.tracks.flatMap((track) =>
		track.warnings.map((warning) => ({
			...warning,
			discipline: track.discipline,
			lifting: !isCardioDiscipline(track.discipline),
		})),
	)
	// Both fit checks, read off the season rather than derived here: the days check is
	// the **combined** one across both tracks (ADR 0047 §4) and the hours one prices
	// the weeks through the **Volume Conversion** (ADR 0050), and a component that
	// recomputed either would put two overlapping claims about one week on the same
	// page.
	const availability = season.availabilityWarnings
	const hoursFit = season.hoursWarnings
	const dayClashes = season.dayClashWarnings

	// The spark on each phase's closed card, read off the *first* track that prices
	// its weeks. One track and never a sum: no figure spans two tracks in either
	// direction (ADR 0046 §1), and a shape drawn from two currencies added together
	// would be exactly that figure, drawn instead of printed.
	const sparkTrack = season.tracks.find((track) =>
		season.weeks.some(
			(week) =>
				week.targets.find((target) => target.trackId === track.trackId)
					?.value != null,
		),
	)

	return (
		<div className="space-y-6">
			{error ? (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			) : null}
			{/* The guards **open** here, always, and above everything they are about:
			    they warn and never block (ADR 0040 §12), which only works if the athlete
			    reads them without asking, so none of the three sits behind a
			    `Disclosure`. Hiding a warning before it has been read is a warning
			    withheld — progressive disclosure is for controls, never for what the
			    plan is trying to tell you.

			    Closing one **after** reading it is the opposite act, and it is the
			    athlete's (#399 story 95): see `DismissibleNotice`, which is where the
			    distinction and the per-visit rule are written down. */}
			{warnings.length > 0 ? (
				<RampGuardNotice
					warnings={warnings}
					phases={season.phases}
					anyStrength={warnings.some((warning) => warning.lifting)}
				/>
			) : null}
			{availability.length > 0 ||
			hoursFit.length > 0 ||
			dayClashes.length > 0 ? (
				<AvailabilityFitNotice
					warnings={availability}
					hoursWarnings={hoursFit}
					dayClashes={dayClashes}
					weeklyCapacityHours={season.weeklyCapacityHours}
					startWeekKey={season.startWeekKey}
				/>
			) : null}
			{season.bandWarnings.length > 0 ? (
				<BandFitNotice
					warnings={season.bandWarnings}
					timezone={season.timezone}
					startWeekKey={season.startWeekKey}
				/>
			) : null}

			<ol aria-label={SESONG_PAGE_LABELS.phasesList} className="space-y-3">
				{season.phases.map((phase, position) => {
					// This phase's weeks, in plan order, as the track that prices them
					// reads them. Roles come from the week rather than from the rhythm, so
					// a hand-set week draws where the athlete put it.
					const phaseWeeks = season.weeks.filter(
						(week) => week.phaseIndex === position,
					)
					return (
						// Keyed by the phase's own id: position orders the season and identity
						// edits it, and an index key would carry a card's local state onto its
						// neighbour the moment two phases swap places.
						<li key={phase.id}>
							{/* The structure and the progression are two acts on one card: the
							    phase's own controls come from the editor module, and each
							    endurance track's rates are nested inside it. */}
							<PhaseCard
								phase={phase}
								position={position}
								phaseCount={season.phases.length}
								// Compared by *position*, so a season with two phases named "Base"
								// lights up one of them rather than both (ADR 0044 §2).
								isCurrent={position === season.currentPhaseIndex}
								timezone={season.timezone}
								spark={
									sparkTrack && phaseWeeks.length > 0 ? (
										<PhaseSpark
											label={SESONG_PHASE_LABELS.sparkLabel(
												nbPhaseName(phase.name),
												phaseWeeks.length,
												nbTrackName(sparkTrack.discipline),
											)}
											values={phaseWeeks.map(
												(week) =>
													week.targets.find(
														(target) => target.trackId === sparkTrack.trackId,
													)?.value ?? null,
											)}
											recovery={phaseWeeks.map(
												(week) => week.role !== 'loading',
											)}
										/>
									) : null
								}
								reading={phaseReading(enduranceTracks, position)}
							>
								{enduranceTracks.map((track) => {
									const segment = track.segments.find(
										(candidate) => candidate.phaseIndex === position,
									)
									// Named only where there is more than one track to tell apart;
									// one runner reads one form, unlabelled.
									const trackLabel =
										enduranceTracks.length > 1
											? nbTrackName(track.discipline)
											: null
									return segment ? (
										// The two authored axes of one segment, as two saves: volume
										// (#403) and the **Quality Session Mix** (ADR 0042 §3). Separate
										// forms because they are separate acts — fixing a ramp is not a
										// re-submission of the mix — and each reads only its own reply.
										<div key={track.discipline} className="space-y-4">
											<SegmentProgressionForm
												segment={segment}
												phase={phase}
												boundaryStep={boundaryStepStanding(
													season.phases,
													anchorPlacementsOf(
														season.startWeekKey,
														track.anchors,
													),
													position,
												)}
												trackLabel={trackLabel}
												actionData={actionData}
											/>
											<SegmentMixForm
												segment={segment}
												trackLabel={trackLabel}
												actionData={actionData}
											/>
										</div>
									) : null
								})}
							</PhaseCard>
						</li>
					)
				})}
			</ol>

			{/* Everything below the phases is something an athlete does **once, or
			    rarely** — pick a shape, say what they start from, lay out a lifting
			    block, add a phase, fit the season to its Event. None of them is one of
			    the four Sesong edits of #505 v1 (ADR 0084 §1): they apply directly,
			    with no preview, so they wait behind one closed _Avansert_ line that
			    says so before it opens. Inside, each is exactly the surface that
			    shipped. */}
			<div className="border-border/70 border-b">
				<CollapsibleSection
					summary={SEASON_ADVANCED_LABELS.title}
					detail={SEASON_ADVANCED_LABELS.note}
				>
					{/* Where the season misses its Event, the edit that would close the
					    gap, named in full before it is offered. The proposal is
					    recomputed server-side when it is applied, so a stale reading can
					    never land an edit the athlete was not shown. */}
					{season.fit ? (
						<FitToEventOffer
							outlineId={season.outlineId}
							proposal={proposeFit(season.phases, season.fit)}
						/>
					) : null}

					{/* The analytical season chart (#413) — layers, read-in, the
					    derivation behind each week — under Avansert since round 2
					    (decision 12): the season picture at the top is what the
					    athlete reads first, and this is the instrument behind it.
					    Mounted only once opened, so its replay costs nothing until
					    asked for. */}
					<CollapsibleSection
						summary={SESONG_PAGE_LABELS.advancedChart}
						detail={SESONG_PAGE_LABELS.advancedChartDetail}
					>
						<SeasonChart
							season={season}
							contexts={conversionContexts}
							fitnessAnchor={fitnessAnchor}
							fitness={seasonFitness}
							bare
						/>
					</CollapsibleSection>

					{/* A shape replaces every phase, so it is offered only while no week
					    of the plan has begun. After that the way to another method is
					    _Bytt filosofi_, which keeps the weeks lived and the athlete's
					    sessions and previews first (#505 stories 13–14). */}
					{season.startWeekKey < firstUnbegunWeekKey ? (
						<div
							className="border-border/70 space-y-1 border-t py-3"
							data-preset-gallery-begun
						>
							<p className="text-sm font-medium">
								{SESONG_PAGE_LABELS.shapeTitle}
							</p>
							<p className="text-muted-foreground text-sm">
								{PRESET_GALLERY_LABELS.begun}
							</p>
							{/* A line of text and the only way there, so it carries an
							    invisible box to 44px (ADR 0028 §2) without moving the
							    reading's rhythm. */}
							<a
								href="#philosophy"
								className="text-footnote relative inline-flex min-h-11 touch-manipulation items-center font-semibold underline underline-offset-4"
							>
								{PRESET_GALLERY_LABELS.switchLink}
							</a>
						</div>
					) : (
						<CollapsibleSection
							summary={SESONG_PAGE_LABELS.shapeTitle}
							detail={SESONG_PAGE_LABELS.shapeDetail}
						>
							<PresetGallery outlineId={season.outlineId} />
						</CollapsibleSection>
					)}

					{/* The anchor is the level the ramps above multiply, and re-anchoring
					    is a statement about the *season*, not about a phase: it takes
					    effect from a week the athlete picks and floats free of where the
					    blocks fall (ADR 0040 §5). */}
					<CollapsibleSection
						summary={SESONG_PAGE_LABELS.anchorsTitle}
						detail={anchorSummary(anchorTracks)}
					>
						<SeasonAnchorSection
							tracks={anchorTracks}
							weeks={season.weeks}
							timezone={season.timezone}
							actionData={actionData}
						/>
					</CollapsibleSection>

					{/* The lifting blocks sit *beside* the phase list rather than inside
					    it, because a dated block has no phase card to belong to (ADR 0047
					    §6) — it is laid out along the plan's own weeks instead. */}
					{strengthTracks.length > 0 ? (
						<CollapsibleSection
							summary={SESONG_PAGE_LABELS.liftingTitle}
							detail={strengthSummary(strengthTracks)}
						>
							<StrengthBlocksSection
								tracks={strengthTracks}
								weeks={season.weeks}
								timezone={season.timezone}
								actionData={actionData}
							/>
						</CollapsibleSection>
					) : null}

					<CollapsibleSection
						summary={SESONG_PAGE_LABELS.addPhaseTitle}
						detail={SESONG_PAGE_LABELS.addPhaseDetail}
					>
						<AddPhaseForm outlineId={season.outlineId} phases={season.phases} />
					</CollapsibleSection>
				</CollapsibleSection>

				<CollapsibleSection
					summary={SESONG_PAGE_LABELS.deleteTitle}
					detail={
						season.eventId
							? SESONG_PAGE_LABELS.deleteDetailEvent
							: SESONG_PAGE_LABELS.deleteDetail
					}
				>
					<DeletePlanSection
						outlineId={season.outlineId}
						eventName={season.eventName}
					/>
				</CollapsibleSection>
			</div>
		</div>
	)
}

/**
 * What a block *does*, in a sentence, for the top of its opened card.
 *
 * The card's controls say it in the vocabulary the model uses — a **Volume Ramp**
 * as a signed percentage, a **Quality Session Mix** as a count per **Training
 * Zone**. That vocabulary is exact and it is the right label on a field an athlete
 * is editing; it is the wrong thing to meet *first* on the block you opened to
 * understand. This is the same three facts as prose, and it is derived from the
 * same segments the forms below write, so it cannot describe a block the controls
 * would not produce.
 *
 * A ramp of `null` is said out loud rather than skipped: "does not climb" is the
 * fact an athlete is least likely to notice and most likely to have not meant,
 * and the app must not imply a convention was applied where none was (ADR 0044 §4).
 * Empty for a plan whose tracks have no segment over this phase — a strength-only
 * plan, whose blocks are dated and float free of the phases (ADR 0047 §6).
 */
function phaseReading(
	tracks: SeasonTrack[],
	phaseIndex: number,
): string | null {
	const sentences = tracks.flatMap((track) => {
		const segment = track.segments.find(
			(candidate) => candidate.phaseIndex === phaseIndex,
		)
		if (!segment) return []
		const subject = SESONG_SEGMENT_LABELS.readingSubject(
			tracks.length > 1 ? nbTrackName(track.discipline) : null,
		)
		const climb =
			segment.ramp == null
				? SESONG_SEGMENT_LABELS.readingFlat
				: SESONG_SEGMENT_LABELS.readingClimb(
						formatNbSignedPercent(segment.ramp),
					)
		const step =
			segment.boundaryStep == null
				? ''
				: SESONG_SEGMENT_LABELS.readingStep(
						formatNbSignedPercent(segment.boundaryStep),
					)
		const quality = SESONG_SEGMENT_LABELS.readingQuality(
			qualitySessionCount(segment.mix),
			formatNbEmphasisLabel(emphasisTerms(segment.mix)),
		)
		return [`${subject} ${climb}${step}, ${quality}.`]
	})
	return sentences.length === 0 ? null : sentences.join(' ')
}

/**
 * A closed anchor section, in one line: what each track starts at, and whether it
 * has been re-anchored.
 *
 * Its own function rather than inline because a summary line is a *reading* — it
 * has to stay true for one track and four, and for a track that has re-anchored
 * three times. Each figure is in its own track's currency, which is the same rule
 * the roster and the week grid follow and the reason no total appears here.
 */
function anchorSummary(tracks: EditableAnchorTrack[]): string {
	if (tracks.length === 0) return SESONG_ANCHOR_LABELS.summaryNone
	return tracks
		.map((track) => {
			const first = track.anchors[0]
			const opening = first
				? formatNbWeeklyVolume(first.value, track.currency)
				: SESONG_ANCHOR_LABELS.summaryNotSet
			return SESONG_ANCHOR_LABELS.summary(
				nbTrackName(track.discipline),
				opening,
				track.anchors.length - 1,
			)
		})
		.join(' · ')
}

/** The same, for the dated lifting blocks: how many, over how many weeks. */
function strengthSummary(tracks: EditableStrengthTrack[]): string {
	const blocks = tracks.reduce(
		(count, track) => count + track.segments.length,
		0,
	)
	if (blocks === 0) return SESONG_LIFTING_LABELS.summaryNone
	return SESONG_LIFTING_LABELS.summary(blocks)
}
