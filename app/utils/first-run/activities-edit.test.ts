import { describe, expect, test } from 'vitest'
import { resolvedTracks, trackRetiredAt } from '../plan-outline/from-rows.ts'
import {
	keptSlotsOf,
	planStamp,
	type StampSession,
} from '../plan-outline/stamp.ts'
import { weekKeyAt } from '../plan-outline/week-keys.ts'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import {
	activitiesOf,
	choiceRefusal,
	editedAnswers,
	layBoundaryWeek,
	previewActivitiesEdit,
	spliceActivitiesEdit,
	type ActivitiesEditOutline,
} from './activities-edit.ts'
import { layStartFamily, type StartAnswers } from './start-draft.ts'

// Editing the activities in Meg, pure (#587, ADR 0109): the plan's rows and
// the draft for the new activities in, the rows the apply stores and the
// boundary week laid from them out.

const PLAN_START = '2030-01-07'
/** Week 7 of the plan: the third week of its second round. */
const BOUNDARY = weekKeyAt(PLAN_START, 6)
const LIFT = { title: 'Helkropp A', lifts: ['Knebøy 3×10'] }

const answers: StartAnswers = {
	level: 'recreational',
	discipline: 'run',
	otherSports: ['bike'],
	activities: [],
	hours: 6,
	days: [0, 1, 3, 5, 6],
	startWeekKey: PLAN_START,
	strength: null,
	preferences: [],
}

/**
 * A plan the start made for run and bike, lived into its second round: the
 * first round's rows, a second round climbing on with a boundary step, an
 * override on bike after the boundary and one before it, and run's Pinned
 * days.
 */
function livedPlan(): ActivitiesEditOutline {
	const made = layStartFamily(answers, 'polarized')!.options[0]!.draft
	const round = made.rows.phases[0]!
	return {
		startWeekKey: PLAN_START,
		phases: [
			round,
			{ ...round, id: 'phase-1', orderIndex: 1, name: 'Blokk 2' },
		],
		tracks: made.rows.tracks.map((track) => ({
			...track,
			segments: [
				...track.segments,
				{
					...track.segments[0]!,
					id: `${track.id}-segment-1`,
					phaseId: 'phase-1',
					boundaryStep: 0.1,
				},
			],
			overrides:
				track.discipline === 'bike'
					? [
							{ weekKey: weekKeyAt(PLAN_START, 2), value: 3 },
							{ weekKey: weekKeyAt(PLAN_START, 8), value: 1 },
						]
					: [],
			pinnedDays: track.discipline === 'run' ? '[6]' : null,
		})),
	}
}

/** The start's draft for the edited activities, from the boundary. */
function draftFor(choice: Parameters<typeof editedAnswers>[1]) {
	return layStartFamily(
		editedAnswers({ ...answers, startWeekKey: BOUNDARY }, choice, LIFT),
		'polarized',
	)!
}

/** A session as it lands on the calendar, whatever ids it went by. */
const landed = (session: StampSession) => [
	session.weekday,
	session.discipline,
	session.kind,
	session.volume,
	session.zone,
	session.role,
]

describe('the boundary week is laid from the rows the apply stores', () => {
	test('with nothing kept it is the draft’s week 1, for a plan cut mid-round', () => {
		const choice = {
			sports: ['run' as const, 'swim' as const],
			activities: [],
			strength: 2,
		}
		const start = draftFor(choice)
		const { draft } = start.options[0]!
		const splice = spliceActivitiesEdit({
			outline: livedPlan(),
			boundaryWeekKey: BOUNDARY,
			draft,
			strength: {
				lifts: start.options[0]!.strengthDays.length,
				setsPerSession: 9,
				goal: 'hypertrophy',
			},
		})
		const { laid } = layBoundaryWeek({
			splice,
			draft,
			held: [],
			kept: new Map(),
			liftingDays: answers.days,
		})
		const [week1] = planStamp(draft.stampInput)
		expect(laid.map(landed)).toEqual(week1!.sessions.map(landed))
		expect(laid.some((session) => session.discipline === 'strength')).toBe(true)
	})

	test('lived weeks keep their targets; from the boundary every track is on the draft’s hours', () => {
		const outline = livedPlan()
		const choice = {
			sports: ['run' as const, 'swim' as const],
			activities: [],
			strength: null,
		}
		const { draft } = draftFor(choice).options[0]!
		const splice = spliceActivitiesEdit({
			outline,
			boundaryWeekKey: BOUNDARY,
			draft,
			strength: null,
		})
		const before = resolvedTracks(outline)
		const after = resolvedTracks(splice.rows)
		for (const track of before) {
			const stored = after.find((one) => one.trackId === track.trackId)!
			for (let week = 0; week < 6; week++) {
				expect(stored.targets[week]!.value).toBe(track.targets[week]!.value)
			}
		}
		const runTarget = after.find((track) => track.discipline === 'run')!
		expect(runTarget.targets[6]!.value).toBe(
			draft.tracks.find((track) => track.discipline === 'run')!.anchor,
		)
		// Bike is retired from the boundary: 0, never deleted.
		const bike = splice.rows.tracks.find(
			(track) => track.discipline === 'bike',
		)!
		expect(trackRetiredAt(bike, BOUNDARY)).toBe(true)
		expect(trackRetiredAt(bike, weekKeyAt(PLAN_START, 5))).toBe(false)
		expect(
			after.find((track) => track.discipline === 'bike')!.targets[6]!.value,
		).toBe(0)
	})
})

describe('the splice', () => {
	test('a removed sport is retired, an added one made, the round restarted, and lived rows left alone', () => {
		const outline = livedPlan()
		const { draft } = draftFor({
			sports: ['run', 'swim'],
			activities: ['climb'],
			strength: null,
		}).options[0]!
		const splice = spliceActivitiesEdit({
			outline,
			boundaryWeekKey: BOUNDARY,
			draft,
			strength: null,
		})
		const bikeId = outline.tracks.find(
			(track) => track.discipline === 'bike',
		)!.id
		const runId = outline.tracks.find((track) => track.discipline === 'run')!.id
		expect(
			splice.tracks.map((change) => [change.kind, change.discipline]),
		).toEqual([
			['keep', 'run'],
			['add', 'swim'],
			['add', 'other'],
			['retire', 'bike'],
		])
		// The round being lived is cut to its two weeks; a fresh round follows.
		expect(splice.phases.resize).toEqual([{ phaseId: 'phase-1', weeks: 2 }])
		expect(splice.phases.add.map((phase) => phase.name)).toEqual(['Blokk 3'])
		// The family's mix on the main sport only; none on the others; nothing
		// at all on the retired track.
		const segmentOf = (trackId: string) =>
			splice.segments.filter((one) => one.trackId === trackId)
		expect(segmentOf(runId)[0]!.segment.mix.length).toBeGreaterThan(0)
		const swim = splice.tracks.find((change) => change.discipline === 'swim')!
		expect(segmentOf(swim.trackId)[0]!.segment.mix).toEqual([])
		expect(segmentOf(bikeId)).toEqual([])
		// A sport that never had a track: 0 from the plan's first week.
		const swimRow = splice.rows.tracks.find(
			(track) => track.id === swim.trackId,
		)!
		expect(swimRow.anchors).toEqual([
			{ fromWeekKey: PLAN_START, value: 0 },
			{ fromWeekKey: BOUNDARY, value: swim.anchor },
		])
		// The lived anchors stay; anchors before the boundary are not touched.
		const runRow = splice.rows.tracks.find((track) => track.id === runId)!
		expect(runRow.anchors[0]).toEqual(
			outline.tracks.find((track) => track.id === runId)!.anchors[0],
		)
		// Overrides from the boundary on go and are named; one before it stays.
		expect(splice.overrides).toEqual([
			{
				trackId: bikeId,
				discipline: 'bike',
				weekKey: weekKeyAt(PLAN_START, 8),
			},
		])
		const bikeRow = splice.rows.tracks.find((track) => track.id === bikeId)!
		expect(bikeRow.overrides).toEqual([
			{ weekKey: weekKeyAt(PLAN_START, 2), value: 3 },
		])
		// Pinned days are named, to go back to La appen velge.
		expect(splice.pinned).toEqual([
			{ trackId: runId, discipline: 'run', days: [6] },
		])
	})

	test('a retired sport taken up again reuses its track and is laid from the boundary', () => {
		const outline = livedPlan()
		const bike = outline.tracks.find((track) => track.discipline === 'bike')!
		bike.anchors.push({ fromWeekKey: weekKeyAt(PLAN_START, 4), value: 0 })
		bike.segments = bike.segments.filter(
			(segment) => segment.phaseId !== 'phase-1',
		)
		const { draft } = draftFor({
			sports: ['run', 'bike'],
			activities: [],
			strength: null,
		}).options[0]!
		const splice = spliceActivitiesEdit({
			outline,
			boundaryWeekKey: BOUNDARY,
			draft,
			strength: null,
		})
		const change = splice.tracks.find((one) => one.discipline === 'bike')!
		expect(change).toMatchObject({ kind: 'keep', trackId: bike.id })
		const row = splice.rows.tracks.find((track) => track.id === bike.id)!
		// The 0 it was retired at stays among its lived anchors.
		expect(row.anchors.map((anchor) => anchor.value)).toContain(0)
		expect(trackRetiredAt(row, BOUNDARY)).toBe(false)
		// A retired track not taken up again is left as it is.
		const again = spliceActivitiesEdit({
			outline,
			boundaryWeekKey: BOUNDARY,
			draft: draftFor({ sports: ['run'], activities: [], strength: null })
				.options[0]!.draft,
			strength: null,
		})
		expect(again.tracks.map((one) => one.discipline)).toEqual(['run'])
	})

	test('strength: a block cut at the boundary and one opened there; removed, the track retires', () => {
		const outline = livedPlan()
		outline.tracks.push({
			id: 'strength-track',
			discipline: 'strength',
			currency: 'sets',
			anchors: [{ fromWeekKey: PLAN_START, value: 18 }],
			overrides: [],
			pinnedDays: null,
			segments: [
				{
					id: 'block',
					kind: 'strength',
					phaseId: null,
					ramp: null,
					boundaryStep: null,
					recoveryCut: null,
					taperCut: null,
					startWeekKey: PLAN_START,
					weeks: 8,
					goal: 'strength',
					sessionsPerWeek: 2,
					deloadCut: null,
					deloadWeeks: null,
					mix: [],
				},
			],
		})
		const lifting = draftFor({ sports: ['run'], activities: [], strength: 3 })
		const kept = spliceActivitiesEdit({
			outline,
			boundaryWeekKey: BOUNDARY,
			draft: lifting.options[0]!.draft,
			strength: { lifts: 3, setsPerSession: 9, goal: 'hypertrophy' },
		})
		expect(kept.strength).toEqual({
			cut: [{ segmentId: 'block', weeks: 6 }],
			remove: [],
			open: {
				startWeekKey: BOUNDARY,
				weeks: 4,
				// The goal of the block it cuts.
				goal: 'strength',
				sessionsPerWeek: 3,
			},
		})
		expect(
			kept.tracks.find((one) => one.discipline === 'strength'),
		).toMatchObject({
			kind: 'keep',
			anchor: 27,
		})

		const none = spliceActivitiesEdit({
			outline,
			boundaryWeekKey: BOUNDARY,
			draft: draftFor({ sports: ['run'], activities: [], strength: null })
				.options[0]!.draft,
			strength: null,
		})
		expect(none.strength.open).toBeNull()
		const row = none.rows.tracks.find((track) => track.id === 'strength-track')!
		expect(trackRetiredAt(row, BOUNDARY)).toBe(true)
		const resolved = resolvedTracks(none.rows).find(
			(track) => track.trackId === 'strength-track',
		)!
		expect(resolved.targets[6]!.value).toBe(0)
		expect(resolved.targets[5]!.value).toBeGreaterThan(0)
	})
})

describe('kept sessions', () => {
	test('a kept lift fills a lifting slot, so no second lift is laid; the athlete’s hard session is laid around', () => {
		const choice = { sports: ['run' as const], activities: [], strength: 2 }
		const start = draftFor(choice)
		const { draft } = start.options[0]!
		const splice = spliceActivitiesEdit({
			outline: livedPlan(),
			boundaryWeekKey: BOUNDARY,
			draft,
			strength: { lifts: 2, setsPerSession: 9, goal: 'hypertrophy' },
		})
		const plain = layBoundaryWeek({
			splice,
			draft,
			held: [],
			kept: new Map(),
			liftingDays: answers.days,
		})
		const hardDay = plain.laid.find(
			(session) => session.zone != null && session.discipline === 'run',
		)!.weekday
		// The athlete's own hard session on the plan's hard day's eve, and a
		// lift they adopted on a Wednesday.
		const eve = ((hardDay + 6) % 7) as PatternWeekday
		const around = layBoundaryWeek({
			splice,
			draft,
			held: [{ weekday: eve, kind: 'session', effort: 'hard' }],
			kept: keptSlotsOf([{ weekday: 2, discipline: 'strength' }]),
			liftingDays: answers.days,
		})
		expect(
			around.laid.filter((session) => session.discipline === 'strength'),
		).toHaveLength(1)
		// No hard session of the plan's the day after the athlete's.
		expect(
			around.laid.some(
				(session) => session.zone != null && session.weekday === hardDay,
			),
		).toBe(false)
	})

	test('the preview counts the athlete’s minutes apart and fingerprints the week', () => {
		const choice = { sports: ['run' as const], activities: [], strength: null }
		const start = draftFor(choice)
		const base = {
			outline: livedPlan(),
			boundaryWeekKey: BOUNDARY,
			choice,
			family: 'polarized' as const,
			familyTaken: false,
			start,
			strength: null,
			liftingSession: null,
			held: [],
			keptSlots: new Map<string, number>(),
			keptFromBoundary: { count: 1, onRemoved: 1 },
			liftingDays: answers.days,
		}
		const kept = {
			id: 'ride',
			weekday: 2 as PatternWeekday,
			discipline: 'bike',
			title: 'Fellestur',
			minutes: 90,
			effort: 'rolig' as const,
			lifts: [],
		}
		const preview = previewActivitiesEdit({ ...base, kept: [kept] })
		expect(preview.keptMinutes).toBe(90)
		expect(preview.plannedMinutes).toBe(preview.week.minutes - 90)
		expect(preview.removed).toEqual(['bike'])
		expect(
			preview.week.days[2]!.sessions.find((session) => session.kept),
		).toMatchObject({ title: 'Fellestur', minutes: 90 })
		// The same inputs give the same digest; a session moved gives another.
		expect(previewActivitiesEdit({ ...base, kept: [kept] }).digest).toBe(
			preview.digest,
		)
		expect(
			previewActivitiesEdit({ ...base, kept: [{ ...kept, weekday: 3 }] })
				.digest,
		).not.toBe(preview.digest)
	})
})

describe('the choice', () => {
	const current = activitiesOf(answers, 2)

	test('the plan’s activities now, the main sport first', () => {
		expect(current).toEqual({
			sports: ['run', 'bike'],
			activities: [],
			strength: 2,
		})
	})

	test('the same activities, none, or strength alone are refused', () => {
		expect(
			choiceRefusal(current, { ...current, sports: ['run', 'bike'] }),
		).toBe('same')
		expect(
			choiceRefusal(current, { sports: [], activities: [], strength: null }),
		).toBe('no-activity')
		expect(
			choiceRefusal(current, { sports: [], activities: [], strength: 2 }),
		).toBe('lifting-only')
		// Another main sport, another frequency, or another activity is a change.
		expect(
			choiceRefusal(current, { ...current, sports: ['bike', 'run'] }),
		).toBeNull()
		expect(choiceRefusal(current, { ...current, strength: 3 })).toBeNull()
		expect(
			choiceRefusal(current, { ...current, activities: ['hike'] }),
		).toBeNull()
	})
})
