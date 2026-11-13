// Editing the activities in _Meg_ (#587, ADR 0109): the sports, the Simple
// Activities and strength the plan lays, changed, and the plan's tracks and
// days laid again from the first week not yet begun.
//
// Pure: the plan's rows, the start's draft for the new activities and the
// sessions the athlete keeps go in; out come the rows the apply will store,
// what else the edit changes (the tracks re-anchored, added or retired, the
// Pinned days handed back, the Week Volume Overrides cleared), the boundary
// week laid from those rows exactly as the stamp will lay it, and a digest
// of all of it. The preview and the apply run the same computation
// (`activities-edit.server.ts`), so the week confirmed is the week laid.
//
// The rules, from ADR 0109:
//   - **Lived weeks are never touched** (§6). The phase being lived is cut at
//     the boundary (`cutPhasesAt`) and nothing before it is written: no
//     anchor, no override, no block, no segment.
//   - **One round of the plan's family opens at the boundary** (§2), laid by
//     the start's draft for the new activities, and every track it lays is
//     anchored there on the draft's hours: a re-anchor is the new base (ADR
//     0040 §5), so from the boundary the stored rows are the draft's rows.
//   - **Retire, never delete** (§3). A track the edit drops is anchored at 0
//     from the boundary (`trackRetiredAt`) and gets no segment, pattern day or
//     lifting slot after it; taking it up again reuses it. A sport that never
//     had a track gets one, anchored at 0 from the plan's first week.
//   - **The boundary week is laid from the rows as the apply will store them**
//     (§5): `resolvedTracks` over the spliced rows, the stamp's own week input
//     (`stampWeekInput`), `planStamp` on the draft's pattern, and the kept
//     sessions' slots filled (`fillKeptSlots`). Never the draft's own week.

import { type EffortWord } from '../effort-word.ts'
import { openEndedRoundName } from '../labels.ts'
import { type PlacedSession } from '../plan-outline/day-rule.ts'
import {
	DEFAULT_DELOAD_WEEKS,
	type StrengthGoal,
	type VolumeCurrency,
} from '../plan-outline/derive.ts'
import {
	isSimpleActivityTrack,
	phaseSpecs,
	resolvedTracks,
	SIMPLE_ACTIVITY_SEGMENT,
	trackRetiredAt,
	type OutlineRows,
	type SegmentRow,
	type TrackRow,
} from '../plan-outline/from-rows.ts'
import { digestOf } from '../plan-outline/outline-preview.ts'
import {
	cutPhasesAt,
	rowsAfter,
	type LaidPhase,
	type LaidSegment,
} from '../plan-outline/philosophy.ts'
import { parsePinnedDays } from '../plan-outline/pinned-days.ts'
import { type PresetFamily } from '../plan-outline/presets.ts'
import {
	fillKeptSlots,
	planStamp,
	stampWeekInput,
	type StampSession,
	type StampTrack,
} from '../plan-outline/stamp.ts'
import { weekIndexOf, weekKeyAt } from '../plan-outline/week-keys.ts'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import { type ActivityKind } from '../simple-activity.ts'
import { type CardioDiscipline, type Discipline } from '../workout-schema.ts'
import { DRAFT_STRENGTH_TRACK_ID } from './draft.ts'
import {
	startSports,
	startWeekFrom,
	type StartAnswers,
	type StartDraft,
	type StartStrengthSession,
	type StartWeek,
	type StrengthPerWeek,
} from './start-draft.ts'

/** What the athlete picks in the editor: the start's own choices. */
export type ActivitiesChoice = {
	/** The endurance sports, the main sport (_Hovedidrett_) first. */
	sports: CardioDiscipline[]
	/** The **Simple Activities**, in the order picked. */
	activities: ActivityKind[]
	/** The **Strength Frequency** tapped, or null for no strength. */
	strength: StrengthPerWeek | null
}

/** The plan's activities now, as the editor is pre-filled with them. */
export function activitiesOf(
	answers: StartAnswers,
	strengthPerWeek: StrengthPerWeek | null,
): ActivitiesChoice {
	return {
		sports: answers.discipline
			? startSports(answers.discipline, answers.otherSports)
			: [],
		activities: [...(answers.activities ?? [])],
		strength: strengthPerWeek,
	}
}

/**
 * Why a choice is not laid, before anything is read: nothing picked, only
 * strength (which the start lays beside a sport or an activity, never alone),
 * or the activities the plan has now. Each writes nothing and says so.
 */
export type ActivitiesChoiceRefusal = 'no-activity' | 'lifting-only' | 'same'

export function choiceRefusal(
	current: ActivitiesChoice,
	next: ActivitiesChoice,
): ActivitiesChoiceRefusal | null {
	if (next.sports.length === 0 && next.activities.length === 0) {
		return next.strength != null ? 'lifting-only' : 'no-activity'
	}
	const sameSet = <T>(a: readonly T[], b: readonly T[]) =>
		a.length === b.length && a.every((item) => b.includes(item))
	return current.sports[0] === next.sports[0] &&
		sameSet(current.sports, next.sports) &&
		sameSet(current.activities, next.activities) &&
		current.strength === next.strength
		? 'same'
		: null
}

/**
 * The start's answers for the edit: the plan's own (its level, preferences,
 * days and hours, `readPlanStartAnswers`) with only the activities replaced
 * (ADR 0109 §1). Strength is laid where it is picked and there is a session
 * to copy.
 */
export function editedAnswers(
	answers: StartAnswers,
	choice: ActivitiesChoice,
	session: StartStrengthSession | null,
): StartAnswers {
	const [main, ...others] = choice.sports
	return {
		...answers,
		discipline: main ?? null,
		otherSports: others,
		activities: choice.activities,
		strength:
			choice.strength != null && session
				? { perWeek: choice.strength, session }
				: null,
	}
}

/** A Training Track as the edit reads it: its rows and its Pinned days. */
export type EditTrackRow = TrackRow & { pinnedDays: string | null }

/** The plan as the edit reads it. */
export type ActivitiesEditOutline = Omit<OutlineRows, 'tracks'> & {
	tracks: EditTrackRow[]
}

/**
 * What the edit does to one track from the boundary on (ADR 0109 §3):
 *
 * - `keep`: a track the edit lays (kept, or a retired one taken up again),
 *   re-anchored at the boundary on the draft's hours;
 * - `add`: a sport that never had a track, made now;
 * - `retire`: a track the edit drops, anchored at 0 from the boundary.
 */
export type TrackChange = {
	kind: 'keep' | 'add' | 'retire'
	/** The stored track's id, or a preview id for one `add` makes. */
	trackId: string
	discipline: string
	currency: VolumeCurrency
	/** Its Season Anchor from the boundary on: 0 for a retired track. */
	anchor: number
	/** The draft's track it lays, or null for a retired one. */
	draftTrackId: string | null
}

/** What the edit does to the dated strength blocks (ADR 0109 §3). */
export type StrengthBlockEdit = {
	/**
	 * Blocks that run past the boundary, cut to the weeks before it. Their
	 * deload weeks are the lived weeks that were in the block's deload tail,
	 * so a lived week keeps the role it had: a deload tail is the block's last
	 * weeks, and cutting a block would otherwise move it onto them.
	 */
	cut: Array<{ segmentId: string; weeks: number; deloadWeeks: number }>
	/** Blocks that open on or after the boundary, which go. */
	remove: string[]
	/** The block the edit opens at the boundary, where it lifts. */
	open: {
		startWeekKey: string
		weeks: number
		goal: StrengthGoal
		sessionsPerWeek: number
	} | null
}

/** The strength the edit lays, read where the start reads it. */
export type ActivitiesStrength = {
	/** The lifts a week the draft laid. */
	lifts: number
	/** The sets the session each lift copies prescribes. */
	setsPerSession: number
	/** The goal a block opens on where no block is cut (the general one). */
	goal: StrengthGoal
}

export type ActivitiesSplice = {
	/** The boundary as a week index of the plan. */
	boundary: number
	/** Its Monday: the first week not yet begun, or the plan's first. */
	boundaryWeekKey: string
	/** The phase cut, and the round laid after it. */
	phases: {
		keptIds: string[]
		resize: Array<{ phaseId: string; weeks: number }>
		remove: string[]
		add: LaidPhase[]
	}
	tracks: TrackChange[]
	/** Each laid phase's segment on each track that lays it. */
	segments: Array<{ trackId: string; phaseIndex: number; segment: LaidSegment }>
	/**
	 * The segments a track `add` makes takes on the phases kept, so it walks
	 * the plan's phases one to one (ADR 0042 §8); at an anchor of 0.
	 */
	livedSegments: Array<{
		trackId: string
		phaseId: string
		segment: LaidSegment
	}>
	strength: StrengthBlockEdit
	/** Every track's Pinned days, which go back to _La appen velge_. */
	pinned: Array<{ trackId: string; discipline: string; days: PatternWeekday[] }>
	/** Every Week Volume Override from the boundary on, which is cleared. */
	overrides: Array<{ trackId: string; discipline: string; weekKey: string }>
	/** The rows as the apply will store them, new rows under preview ids. */
	rows: OutlineRows
}

/** Prefix of the ids the edit gives rows it has not written yet. */
export const ACTIVITIES_PREVIEW_ID = 'activities:'

/** A mixless, flat segment: what a track takes on a phase it never laid. */
function quietSegment(discipline: string): LaidSegment {
	return isSimpleActivityTrack(discipline)
		? { ...SIMPLE_ACTIVITY_SEGMENT, mix: [] }
		: {
				ramp: null,
				boundaryStep: null,
				recoveryCut: null,
				taperCut: null,
				mix: [],
			}
}

/**
 * The plan's rows with the draft spliced on at the boundary (ADR 0109
 * §2–§3): the phases cut there and one round of the draft's phases after
 * them; every track the draft lays re-anchored (or made) on its hours there,
 * with the draft's segment on each new phase; every other track retired;
 * the strength blocks cut there, and one opened where the edit lifts; every
 * Week Volume Override from the boundary on gone, and the Pinned days named.
 */
export function spliceActivitiesEdit({
	outline,
	boundaryWeekKey,
	draft,
	strength,
}: {
	outline: ActivitiesEditOutline
	/** The first week not yet begun (`readFirstUnbegunWeekKey`). */
	boundaryWeekKey: string
	draft: StartDraft['options'][number]['draft']
	/** Where the edit lifts; null without strength. */
	strength: ActivitiesStrength | null
}): ActivitiesSplice {
	const cut = cutPhasesAt(
		outline,
		weekIndexOf(outline.startWeekKey, boundaryWeekKey),
	)
	const { boundary } = cut
	const boundaryKey = weekKeyAt(outline.startWeekKey, boundary)
	const add: LaidPhase[] = draft.phases.map((phase, index) => ({
		name: openEndedRoundName(cut.kept.length + 1 + index),
		weeks: phase.weeks,
		rhythm: phase.rhythm,
		tapers: phase.tapers,
		ramp: phase.ramp,
		boundaryStep: phase.boundaryStep,
		mix: phase.mix.map((entry) => ({ ...entry })),
	}))
	const laidWeeks = add.reduce((sum, phase) => sum + phase.weeks, 0)

	// The tracks: each the draft lays found by its Discipline (one a plan),
	// retired or not, else made; every other one retired.
	const tracks: TrackChange[] = draft.tracks.map((drafted) => {
		const stored = outline.tracks.find(
			(track) => track.discipline === drafted.discipline,
		)
		return {
			kind: stored ? 'keep' : 'add',
			trackId:
				stored?.id ?? `${ACTIVITIES_PREVIEW_ID}track-${drafted.discipline}`,
			discipline: drafted.discipline,
			currency: 'hours',
			anchor: drafted.anchor,
			draftTrackId: drafted.trackId,
		}
	})
	for (const stored of outline.tracks) {
		if (stored.discipline === 'strength') continue
		if (tracks.some((change) => change.trackId === stored.id)) continue
		if (trackRetiredAt(stored, boundaryKey)) continue
		tracks.push(retired(stored))
	}
	const strengthRow = outline.tracks.find(
		(track) => track.discipline === 'strength',
	)
	const lifts = strength && strength.lifts > 0 ? strength : null
	if (lifts) {
		tracks.push({
			kind: strengthRow ? 'keep' : 'add',
			trackId: strengthRow?.id ?? `${ACTIVITIES_PREVIEW_ID}track-strength`,
			discipline: 'strength',
			currency: 'sets',
			anchor: lifts.setsPerSession * lifts.lifts,
			draftTrackId: DRAFT_STRENGTH_TRACK_ID,
		})
	} else if (strengthRow && !trackRetiredAt(strengthRow, boundaryKey)) {
		tracks.push(retired(strengthRow))
	}

	// The strength blocks: cut at the boundary, and one opened there.
	const blocks = (strengthRow?.segments ?? []).filter(
		(segment) =>
			segment.kind === 'strength' &&
			segment.startWeekKey != null &&
			segment.weeks != null,
	)
	const strengthEdit: StrengthBlockEdit = { cut: [], remove: [], open: null }
	let cutGoal: string | null = null
	for (const block of blocks) {
		const opens = weekIndexOf(outline.startWeekKey, block.startWeekKey!)
		if (opens >= boundary) strengthEdit.remove.push(block.id)
		else if (opens + block.weeks! > boundary) {
			const weeks = boundary - opens
			const tail = Math.min(
				Math.max(block.deloadWeeks ?? DEFAULT_DELOAD_WEEKS, 0),
				block.weeks!,
			)
			strengthEdit.cut.push({
				segmentId: block.id,
				weeks,
				deloadWeeks: Math.max(0, weeks - (block.weeks! - tail)),
			})
			cutGoal = block.goal
		}
	}
	if (lifts && laidWeeks > 0) {
		strengthEdit.open = {
			startWeekKey: boundaryKey,
			weeks: laidWeeks,
			goal: (cutGoal as StrengthGoal | null) ?? lifts.goal,
			sessionsPerWeek: lifts.lifts,
		}
	}

	// Each new phase's segment, track by track: the draft's.
	const segments = tracks.flatMap((change) => {
		if (change.discipline === 'strength' || change.draftTrackId == null) {
			return []
		}
		const row = draft.rows.tracks.find(
			(track) => track.id === change.draftTrackId,
		)
		return add.flatMap((_, phaseIndex) => {
			const segment = row?.segments[phaseIndex]
			return segment
				? [
						{
							trackId: change.trackId,
							phaseIndex,
							segment: {
								ramp: segment.ramp,
								boundaryStep: segment.boundaryStep,
								recoveryCut: segment.recoveryCut,
								taperCut: segment.taperCut,
								mix: segment.mix.map((entry) => ({ ...entry })),
							},
						},
					]
				: []
		})
	})
	const livedSegments = tracks
		.filter(
			(change) => change.kind === 'add' && change.discipline !== 'strength',
		)
		.flatMap((change) =>
			cut.kept.map((phase) => ({
				trackId: change.trackId,
				phaseId: phase.id,
				segment: quietSegment(change.discipline),
			})),
		)

	// The rows as stored after the edit.
	const changeOf = (trackId: string) =>
		tracks.find((change) => change.trackId === trackId)
	const anchorsFrom = (
		anchors: TrackRow['anchors'],
		change: TrackChange | undefined,
	) =>
		change
			? [
					...anchors.filter((anchor) => anchor.fromWeekKey < boundaryKey),
					{ fromWeekKey: boundaryKey, value: change.anchor },
				]
			: anchors
	const openBlock = (trackId: string): SegmentRow[] =>
		strengthEdit.open
			? [
					{
						id: `${ACTIVITIES_PREVIEW_ID}${trackId}-block`,
						kind: 'strength',
						phaseId: null,
						ramp: null,
						boundaryStep: null,
						recoveryCut: null,
						taperCut: null,
						startWeekKey: strengthEdit.open.startWeekKey,
						weeks: strengthEdit.open.weeks,
						goal: strengthEdit.open.goal,
						sessionsPerWeek: strengthEdit.open.sessionsPerWeek,
						deloadCut: null,
						deloadWeeks: null,
						mix: [],
					},
				]
			: []
	const storedTracks: TrackRow[] = outline.tracks.map((track) => {
		const change = changeOf(track.id)
		const cutWeeks = new Map(
			strengthEdit.cut.map((one) => [one.segmentId, one]),
		)
		return {
			id: track.id,
			discipline: track.discipline,
			currency: track.currency,
			anchors: anchorsFrom(track.anchors, change),
			overrides: track.overrides.filter(
				(override) => override.weekKey < boundaryKey,
			),
			segments:
				track.discipline === 'strength'
					? [
							...track.segments
								.filter((segment) => !strengthEdit.remove.includes(segment.id))
								.map((segment) =>
									cutWeeks.has(segment.id)
										? {
												...segment,
												weeks: cutWeeks.get(segment.id)!.weeks,
												deloadWeeks: cutWeeks.get(segment.id)!.deloadWeeks,
											}
										: segment,
								),
							...(change?.kind === 'keep' ? openBlock(track.id) : []),
						]
					: track.segments,
		}
	})
	const addedTracks: TrackRow[] = tracks
		.filter((change) => change.kind === 'add')
		.map((change) => ({
			id: change.trackId,
			discipline: change.discipline,
			currency: change.currency,
			anchors:
				boundaryKey === outline.startWeekKey
					? [{ fromWeekKey: boundaryKey, value: change.anchor }]
					: [
							{ fromWeekKey: outline.startWeekKey, value: 0 },
							{ fromWeekKey: boundaryKey, value: change.anchor },
						],
			overrides: [],
			segments: [
				...livedSegments
					.filter((lived) => lived.trackId === change.trackId)
					.map(
						(lived, index): SegmentRow => ({
							id: `${ACTIVITIES_PREVIEW_ID}${change.trackId}-lived-${index}`,
							kind: 'endurance',
							phaseId: lived.phaseId,
							startWeekKey: null,
							weeks: null,
							goal: null,
							sessionsPerWeek: null,
							deloadCut: null,
							deloadWeeks: null,
							...lived.segment,
						}),
					),
				...(change.discipline === 'strength' ? openBlock(change.trackId) : []),
			],
		}))
	const rows = rowsAfter(
		{
			startWeekKey: outline.startWeekKey,
			phases: outline.phases,
			tracks: [...storedTracks, ...addedTracks],
		},
		cut.kept,
		cut.resize,
		cut.remove,
		add,
		(track, _phase, index) =>
			segments.find(
				(one) => one.trackId === track.id && one.phaseIndex === index,
			)?.segment ?? null,
	)

	return {
		boundary,
		boundaryWeekKey: boundaryKey,
		phases: {
			keptIds: cut.kept.map((phase) => phase.id),
			resize: cut.resize,
			remove: cut.remove,
			add,
		},
		tracks,
		segments,
		livedSegments,
		strength: strengthEdit,
		pinned: outline.tracks.flatMap((track) => {
			const days = parsePinnedDays(track.pinnedDays)
			return days
				? [{ trackId: track.id, discipline: track.discipline, days }]
				: []
		}),
		overrides: outline.tracks
			.flatMap((track) =>
				track.overrides
					.filter((override) => override.weekKey >= boundaryKey)
					.map((override) => ({
						trackId: track.id,
						discipline: track.discipline,
						weekKey: override.weekKey,
					})),
			)
			.sort(
				(a, b) =>
					a.discipline.localeCompare(b.discipline) ||
					a.weekKey.localeCompare(b.weekKey),
			),
		rows,
	}
}

function retired(track: EditTrackRow): TrackChange {
	return {
		kind: 'retire',
		trackId: track.id,
		discipline: track.discipline,
		currency: track.currency as VolumeCurrency,
		anchor: 0,
		draftTrackId: null,
	}
}

/**
 * The boundary week as the stamp will lay it once the edit is stored (ADR
 * 0109 §5): the spliced rows' targets and mixes (`stampWeekInput` over
 * `resolvedTracks`), the draft's own pattern under the stored tracks' ids,
 * the lifting slots on the athlete's days, laid around the sessions the
 * athlete holds (`held`) and with the slots their kept plan sessions fill
 * left unlaid (`fillKeptSlots`). `planned` is the week before the kept
 * slots are filled; `laid` is what the stamp writes.
 */
export function layBoundaryWeek({
	splice,
	draft,
	held,
	kept,
	liftingDays,
}: {
	splice: ActivitiesSplice
	draft: StartDraft['options'][number]['draft']
	held: readonly PlacedSession[]
	/** The slots the plan's kept sessions fill (`readKeptSlots`). */
	kept: ReadonlyMap<string, number>
	/** The athlete's **Training Availability**, or none: the stamp's own. */
	liftingDays: readonly PatternWeekday[] | undefined
}): { planned: StampSession[]; laid: StampSession[] } {
	const { rows } = splice
	const idOf = new Map(
		splice.tracks.flatMap((change) =>
			change.draftTrackId && change.kind !== 'retire'
				? [[change.draftTrackId, change.trackId] as const]
				: [],
		),
	)
	const input = draft.stampInput
	const days = input.days.flatMap((day) => {
		const trackId = idOf.get(day.trackId)
		return trackId ? [{ ...day, trackId }] : []
	})
	// One lifting slot per lift the edit lays, as the apply writes them.
	const liftCount = splice.strength.open?.sessionsPerWeek ?? 0
	const lifting = (input.lifting ?? []).slice(0, liftCount).flatMap((slot) => {
		const trackId = idOf.get(slot.trackId)
		return trackId ? [{ ...slot, trackId }] : []
	})
	// The stamp's tracks, as it reads them after the edit: no Pinned days.
	const tracks: StampTrack[] = rows.tracks.map((track) => ({
		trackId: track.id,
		discipline: track.discipline as Discipline,
		currency: track.currency as VolumeCurrency,
		pinned: false,
	}))
	const [week] = planStamp({
		days,
		lifting,
		liftingDays,
		tracks,
		weeks: [
			{
				...stampWeekInput(
					splice.boundaryWeekKey,
					splice.boundary,
					phaseSpecs(rows),
					resolvedTracks(rows),
				),
				held,
			},
		],
	})
	const planned = week?.sessions ?? []
	return { planned, laid: fillKeptSlots(planned, kept) }
}

/**
 * One of the athlete's sessions in the boundary week, kept where it is: one
 * they wrote (`authored`), or one the plan laid that they adopted or trained.
 */
export type KeptSession = {
	id: string
	weekday: PatternWeekday
	/** Its Workout's Discipline, or `other` for a Simple Activity. */
	discipline: string
	title: string
	/** Its planned minutes, or null where no step is timed. */
	minutes: number | null
	effort: EffortWord
	/** A strength session's lifts (`Knebøy 3×10`); empty otherwise. */
	lifts: string[]
}

export type ActivitiesEditPreview = {
	choice: ActivitiesChoice
	/** The family laid: the plan's own, or the top option for one with none. */
	family: PresetFamily
	/** The plan's family read as none, and the edit gives it `family`. */
	familyTaken: boolean
	start: StartDraft
	splice: ActivitiesSplice
	/** What the stamp writes in the boundary week. */
	laid: StampSession[]
	/** The boundary week as the athlete reads it, their own sessions in it. */
	week: StartWeek
	/** The week's minutes from the plan, and from the athlete's own. */
	plannedMinutes: number
	keptMinutes: number
	/** The athlete's own and adopted sessions from the boundary on, kept. */
	keptFromBoundary: { count: number; onRemoved: number }
	/** The Disciplines the edit retires. */
	removed: string[]
	/** A fingerprint of all of it, which the confirm posts back. */
	digest: string
}

/**
 * The whole edit as the athlete confirms it, and as the apply recomputes it:
 * the splice, the boundary week laid from it, and the digest over both and
 * the sessions the week was laid around (ADR 0109 §5).
 */
export function previewActivitiesEdit({
	outline,
	boundaryWeekKey,
	choice,
	family,
	familyTaken,
	start,
	strength,
	liftingSession,
	held,
	keptSlots,
	kept,
	keptAhead,
	liftingDays,
}: {
	outline: ActivitiesEditOutline
	boundaryWeekKey: string
	choice: ActivitiesChoice
	family: PresetFamily
	familyTaken: boolean
	/** The start's draft for the edited answers: one option, the family laid. */
	start: StartDraft
	strength: Omit<ActivitiesStrength, 'lifts'> | null
	liftingSession: StartStrengthSession | null
	held: readonly PlacedSession[]
	keptSlots: ReadonlyMap<string, number>
	/** Every session of the athlete's kept in the boundary week. */
	kept: readonly KeptSession[]
	/**
	 * The Discipline of each of the athlete's own and adopted sessions from
	 * the boundary on: they all stay where they are (ADR 0100 §3).
	 */
	keptAhead: readonly string[]
	liftingDays: readonly PatternWeekday[] | undefined
}): ActivitiesEditPreview {
	const option = start.options[0]!
	const { draft } = option
	const splice = spliceActivitiesEdit({
		outline,
		boundaryWeekKey,
		draft,
		strength: strength
			? { ...strength, lifts: option.strengthDays.length }
			: null,
	})
	const { laid } = layBoundaryWeek({
		splice,
		draft,
		held,
		kept: keptSlots,
		liftingDays,
	})
	const lifts = laid.filter((session) => session.discipline === 'strength')
	const week = startWeekFrom(
		laid.filter((session) => session.discipline !== 'strength'),
		draft.simpleActivities,
		liftingSession && lifts.length > 0
			? {
					days: lifts.map((session) => session.weekday),
					session: liftingSession,
				}
			: null,
		kept.map((session) =>
			session.discipline === 'strength'
				? {
						weekday: session.weekday,
						lift: { title: session.title, lifts: session.lifts },
					}
				: {
						weekday: session.weekday,
						session: {
							title: session.title,
							discipline: session.discipline as Discipline | 'other',
							minutes: session.minutes ?? 0,
							effort: session.effort,
						},
					},
		),
	)
	const keptMinutes = kept.reduce(
		(sum, session) =>
			session.discipline === 'strength' ? sum : sum + (session.minutes ?? 0),
		0,
	)
	const removed = splice.tracks
		.filter((change) => change.kind === 'retire')
		.map((change) => change.discipline)
	const keptFromBoundary = {
		count: keptAhead.length,
		onRemoved: keptAhead.filter((discipline) => removed.includes(discipline))
			.length,
	}
	return {
		choice,
		family,
		familyTaken,
		start,
		splice,
		laid,
		week,
		plannedMinutes: week.minutes - keptMinutes,
		keptMinutes,
		keptFromBoundary,
		removed,
		digest: digestOf({
			boundaryWeekKey: splice.boundaryWeekKey,
			family,
			familyTaken,
			choice,
			phases: splice.phases,
			tracks: splice.tracks,
			strength: splice.strength,
			pinned: splice.pinned,
			overrides: splice.overrides,
			laid: laid.map((session) => [
				session.weekday,
				session.orderInDay,
				session.discipline,
				session.kind,
				session.volume,
				session.zone,
				session.role,
			]),
			kept: kept.map((session) => [
				session.id,
				session.weekday,
				session.discipline,
			]),
			keptFromBoundary,
		}),
	}
}
