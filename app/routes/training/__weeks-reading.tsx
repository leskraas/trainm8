/**
 * The Weeks reading of the plan page (`plan.tsx`, #533): every week with its
 * role and targets, the typical week read against one of them, and the copy.
 */

import { Badge } from '#app/components/ui/badge.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { formatNbDayMonth, formatNbWeeklyVolume } from '#app/utils/format.ts'
import {
	NB_WEEK_ROLE_LABELS,
	NB_WEEKLY_UNITS,
	nbPhaseName,
	nbTrackName,
	SEASON_EDIT_LABELS,
	SESONG_PAGE_LABELS,
} from '#app/utils/labels.ts'
import { type Route } from './+types/plan.ts'
import { CopyWeekSection, type PendingCopy } from './__copy-week.tsx'
import { CollapsibleSection, PlanCard } from './__plan-chrome.tsx'
import {
	weekNumberOf,
	type SeasonData,
	type WeekData,
	type WeekTargetData,
} from './__plan-season.ts'
import { SeasonEditLink } from './__season-edits.tsx'
import { MixNotices } from './__season-notices.tsx'
import {
	type SeasonQuery,
	WeekPatternSection,
} from './__week-pattern-editor.tsx'

/**
 * One track's target in one week, read-only, with the way to change it.
 *
 * The Weeks reading used to carry an input per week per track (#406). Every
 * week target is now changed in _Endre sesongen_, behind a preview (#505
 * story 75), so this says what the week reads — and, for a hand-set week, what
 * the rule would give — and links there, pre-filled. A week already begun is
 * history and offers no link.
 */
function WeekTargetLine({
	week,
	target,
	editable,
}: {
	week: WeekData
	target: WeekTargetData
	editable: boolean
}) {
	const discipline = nbTrackName(target.discipline)
	return (
		<div className="space-y-1">
			<p className="text-sm font-medium">
				{discipline}, {NB_WEEKLY_UNITS[target.currency]}
			</p>
			{target.overridden ? (
				<p className="text-muted-foreground text-sm">
					{target.derivedValue == null
						? SESONG_PAGE_LABELS.handSetNoRule
						: SESONG_PAGE_LABELS.handSetRule(
								formatNbWeeklyVolume(target.derivedValue, target.currency),
							)}
				</p>
			) : null}
			{editable ? (
				<SeasonEditLink
					edit="week-target"
					fields={{ weekKey: week.weekKey, trackId: target.trackId }}
					aria-label={`${SEASON_EDIT_LABELS.weekTargetOpen}: uke ${weekNumberOf(week)} ${discipline.toLowerCase()}`}
				>
					{SEASON_EDIT_LABELS.weekTargetOpen}
				</SeasonEditLink>
			) : null}
		</div>
	)
}

/**
 * One week's targets as a **reading**: the row's own line, and the whole of what a
 * closed week says.
 *
 * Split from the field below it so a figure appears once per week per track. The
 * week grid is the surface's dense half by design (#399: "dense only where density
 * is the point"), and density here means every week legible in one line — which it
 * is not if each track's number arrives attached to its own input.
 *
 * Every honesty rule the field used to carry is carried here instead, unchanged: an
 * Unavailable target says so rather than printing a dash, a strength gap reads as
 * the athlete's own "no lifting", a deload names itself beside — never instead of —
 * the week's own role, and a hand-set week is marked in words.
 */
function WeekTargetsReading({
	week,
	tracks,
}: {
	week: WeekData
	/** Whether the plan measures more than one track, so a figure needs naming. */
	tracks: number
}) {
	return (
		<span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
			{week.targets.map((target) => (
				<span
					key={target.trackId}
					className="flex items-center gap-1.5 tabular-nums"
				>
					{/* Named only where there is a second track to tell it apart from. */}
					{tracks > 1 ? (
						<span className="text-muted-foreground text-caption">
							{nbTrackName(target.discipline)}
						</span>
					) : null}
					{target.value == null ? (
						<span className="text-muted-foreground">
							{SESONG_PAGE_LABELS.unavailable}
						</span>
					) : target.strengthRole === 'gap' && !target.overridden ? (
						// A gap week on a strength track is the athlete's own "no lifting
						// these weeks", so the rule's `0` reads as that sentence and never as
						// a dash, a blank or an Unavailable — it is something they said rather
						// than something the app failed to work out. Read off the target
						// rather than worked out here, so this row and the figure on it come
						// from one derivation (ADR 0047 §6).
						<span>{SESONG_PAGE_LABELS.noLifting}</span>
					) : (
						<>
							<span className="font-medium">
								{formatNbWeeklyVolume(target.value, target.currency)}
							</span>
							{/* The block's own tail, named on the row where the cut shows up.
							    Beside the week's `WeekRole` rather than instead of it: a week
							    can carry one of each, and they are roles in two different
							    things (ADR 0047 §6). */}
							{target.strengthRole === 'deload' ? (
								<span className="text-muted-foreground">
									· {SESONG_PAGE_LABELS.deload}
								</span>
							) : null}
						</>
					)}
					{target.overridden ? (
						<Badge variant="secondary">{SESONG_PAGE_LABELS.handSet}</Badge>
					) : null}
				</span>
			))}
		</span>
	)
}

/**
 * The Weeks reading: every Training Week with its role and its target per track, each
 * one hand-settable. One column per track in **that track's** own currency — never a
 * total across them, which would need an exchange rate the app refuses to invent
 * (ADR 0043 §5).
 *
 * This is the **write** surface for a **Week Volume Override**, and it belongs here
 * rather than on Blocks because hand-setting is a statement about one *week*, which is
 * what this reading audits. What the athlete types is that week's final target and
 * nothing else: an override is a leaf, so every later week still comes out of the
 * anchor and the ramps authored on Blocks (ADR 0044 §5).
 *
 * The **Week Pattern** lives here too, under the weeks it is read against (#410).
 * Not a third tab: Blocks and Weeks are two readings of one object and a tab is
 * for navigation only (#366) — and "what does my typical week come out as in week
 * 7" is a question about a week, which is what this reading audits.
 */
export function WeeksReading({
	season,
	error,
	chosenWeek,
	workouts,
	seasonQuery,
	pendingCopy,
	mixWarnings,
	firstUnbegunWeekKey,
}: {
	season: SeasonData
	/** A refused pattern edit, said once above the patterns it was aimed at. */
	error?: string
	/** The week the **Pattern Preview** is read against (`?week=`). */
	chosenWeek: SeasonData['weeks'][number] | null
	workouts: Route.ComponentProps['loaderData']['workouts']
	seasonQuery: SeasonQuery
	/** A week copy waiting on the athlete's yes, with what it would replace. */
	pendingCopy: PendingCopy | null
	mixWarnings: Route.ComponentProps['loaderData']['mixWarnings']
	/** Weeks before it are history: their targets are shown, not offered to edit. */
	firstUnbegunWeekKey: string
}) {
	// A track whose every week reads Unavailable gets its reason said once, rather
	// than a column of dashes the athlete has to interpret (Unavailable Metric).
	const unpricedTracks = season.tracks.filter((track) =>
		season.weeks.every(
			(week) =>
				week.targets.find((target) => target.discipline === track.discipline)
					?.value == null,
		),
	)
	// Said once, under the list, and only where a deload is actually on it.
	const anyDeload = season.weeks.some((week) =>
		week.targets.some((target) => target.strengthRole === 'deload'),
	)

	return (
		// The section ladder, exactly as `BlocksReading` has it: the weeks and the
		// pattern read against them are two sections, separated by the `space-y-8` gap
		// and by no margins of their own (§1.7).
		<div className="space-y-8">
			{error ? (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			) : null}
			{/* The audit half of the surface, and the one place density is the point
			    (#399): a season is 10–20 weeks and an athlete scanning for the week
			    that looks wrong needs them all on one screen. Each week reads as a
			    line — number, date, role, what it comes to — and opens onto its own
			    boxes. Before, every week rendered a labelled input per track whether
			    or not the athlete was hand-setting anything, which is what turned a
			    20-week season into a page of 40 empty fields. */}
			<PlanCard
				titleId="week-grid"
				contentClassName="space-y-3"
				title={SESONG_PAGE_LABELS.weekByWeek}
				aside={SESONG_PAGE_LABELS.weekCount(season.weeks.length)}
			>
				<ul
					aria-label={SESONG_PAGE_LABELS.weeksList}
					className="divide-border/70 divide-y"
				>
					{season.weeks.map((week, position) => {
						// The block's name once, over its own run of weeks, rather than on
						// every row: it is the same word for four rows running, and repeating
						// it is what pushes the figures off a phone's line.
						const phase = season.phases[week.phaseIndex]
						const opensBlock =
							position === 0 ||
							season.weeks[position - 1]?.phaseIndex !== week.phaseIndex
						return (
							<li key={week.weekKey}>
								{opensBlock && phase ? (
									<p className="text-muted-foreground text-overline pt-3 pb-1 uppercase">
										{nbPhaseName(phase.name)}
									</p>
								) : null}
								<Collapsible>
									<CollapsibleTrigger className="hover:bg-muted/50 active:bg-muted motion-safe:duration-press -mx-2 flex min-h-11 w-[calc(100%+1rem)] touch-manipulation items-center gap-3 rounded-2xl px-2 py-3 text-left motion-safe:transition-colors motion-safe:ease-out">
										{/* Wide enough for `12 Aug 2026` on one line: a date that wraps turns
										    every row into two, which is exactly the density this reading exists
										    for. */}
										<span className="w-[5.5rem] shrink-0">
											<span className="text-callout block font-semibold tabular-nums">
												Uke {weekNumberOf(week)}
											</span>
											<span className="text-muted-foreground text-caption block tabular-nums">
												{formatNbDayMonth(week.startsAt, season.timezone)}
											</span>
										</span>
										{/* The role drops off at 390 px rather than squeezing the figures: a
										    week's target is what the athlete scans for, and the rhythm is legible
										    from the chart above. */}
										<span className="text-muted-foreground text-caption hidden w-20 shrink-0 sm:block">
											{NB_WEEK_ROLE_LABELS[week.role]}
										</span>
										<span className="min-w-0 flex-1">
											<WeekTargetsReading
												week={week}
												tracks={season.tracks.length}
											/>
										</span>
										<Icon
											name="chevron-down"
											size="sm"
											className="text-muted-foreground motion-safe:duration-press shrink-0 motion-safe:transition-transform motion-safe:ease-out [[data-panel-open]>&]:rotate-180"
										/>
									</CollapsibleTrigger>

									{/* What each track's week reads, and the way to change it. The
									    Weeks reading edits nothing itself: every week target is
									    changed in _Endre sesongen_, behind a preview (#505 story 75),
									    and this link opens it on this week and this track. */}
									<CollapsibleContent>
										<div className="space-y-3 pt-1 pb-4 pl-2">
											{week.targets.map((target) => (
												<WeekTargetLine
													key={target.trackId}
													week={week}
													target={target}
													editable={week.weekKey >= firstUnbegunWeekKey}
												/>
											))}
										</div>
									</CollapsibleContent>
								</Collapsible>
							</li>
						)
					})}
				</ul>

				{/* The list's own footnotes, under it and inside its card: each says
				    something about the column above rather than about the page.

				    Said once for the whole list rather than inside every week, the way
				    the preset gallery states its convention once: **blank is a third
				    meaning of blank on this page**, and the one number an athlete is most
				    likely to doubt — `0` — is spelled out beside it. */}
				<div className="border-border/70 space-y-3 border-t pt-4">
					<p className="text-muted-foreground text-sm">
						{SESONG_PAGE_LABELS.weeksFootnote}
					</p>
					{/* Since ADR 0047 §1 **both** walks price their weeks — a strength track
					    derives its target from the same anchor and ramp an endurance one does
					    — so the only way a whole column is `null` is that no Season Anchor
					    covers the plan. The old reason, that a strength track's weekly sets
					    were not derived yet, is false and gone with it. */}
					{unpricedTracks.map((track) => (
						<p key={track.discipline} className="text-muted-foreground text-sm">
							{SESONG_PAGE_LABELS.unpricedTrack(nbTrackName(track.discipline))}
						</p>
					))}
					{anyDeload ? (
						<p className="text-muted-foreground text-sm">
							{SESONG_PAGE_LABELS.deloadFootnote}
						</p>
					) : null}
				</div>
			</PlanCard>

			{/* Where the weeks the plan has laid disagree with the mix their block
			    authors — a reading of the sessions, said under the weeks it is about.
			    It used to live in the stamp's section, which is gone (decision 14). */}
			{mixWarnings.length > 0 ? (
				<MixNotices notices={mixWarnings} startWeekKey={season.startWeekKey} />
			) : null}

			{/* Filling the weeks is the reading's second act. The weeks fill
			    themselves from the typical week as the horizon reaches them (round-2
			    decision 14, ADR 0090), so what is left to *do* is the typical week
			    itself and copying a week the athlete liked. The heading says the
			    ladder is a set of actions before one is opened. */}
			<div className="space-y-1">
				<h2 className="text-heading">{SESONG_PAGE_LABELS.fillTitle}</h2>
				<p className="text-footnote text-muted-foreground">
					{season.patterns.some((pattern) => pattern.days.length > 0)
						? SESONG_PAGE_LABELS.fillIntro
						: SESONG_PAGE_LABELS.fillWaiting}
				</p>
			</div>
			<div className="border-border/60 border-b">
				{/* The pattern, read against one of the weeks above. It is handed the
				    week's *derived* targets — the same rows the list just rendered — so a
				    preview and the week it claims to be about cannot disagree. */}
				<CollapsibleSection
					summary={SESONG_PAGE_LABELS.patternTitle}
					detail={patternSummary(season.patterns)}
					defaultOpen={season.patterns.length === 0}
				>
					<WeekPatternSection
						outlineId={season.outlineId}
						patterns={season.patterns}
						trainableWeekdays={season.trainableWeekdays}
						tracks={season.tracks}
						weeks={season.weeks}
						week={chosenWeek}
						workouts={workouts}
						seasonQuery={seasonQuery}
					/>
				</CollapsibleSection>

				{/* The other way to fill a week: a week the athlete liked, carried as
				    authored (ADR 0044 §6). It opens on its own whenever a copy came back
				    asking a question — re-keyed, because a confirmation the athlete has
				    to answer cannot sit behind a closed row. */}
				<CollapsibleSection
					key={pendingCopy ? 'pending' : 'quiet'}
					summary={SESONG_PAGE_LABELS.copyTitle}
					detail={SESONG_PAGE_LABELS.copyDetail}
					defaultOpen={pendingCopy !== null}
				>
					<CopyWeekSection
						outlineId={season.outlineId}
						weeks={season.weeks}
						timezone={season.timezone}
						pending={pendingCopy}
					/>
				</CollapsibleSection>
			</div>
		</div>
	)
}

/**
 * A closed pattern section, in one line.
 *
 * Names the patterns rather than counting them: an athlete with "Typical week" and
 * "Race week" recognises the words and learns nothing from "2 patterns".
 */
function patternSummary(patterns: SeasonData['patterns']): string {
	if (patterns.length === 0) {
		// Deliberately not the section's own empty state, which says "No pattern yet"
		// inside: a summary that repeats the sentence it is hiding says it twice the
		// moment the section opens.
		return SESONG_PAGE_LABELS.patternEmpty
	}
	return patterns.map((pattern) => pattern.name).join(' · ')
}
