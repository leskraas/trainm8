// The philosophy switch's preview, pure (#505 S7): which family a plan follows
// is read the way the Filosofi card reads it (`outlineFamily` over the phases),
// so a plan whose last phase is a taper still names its family.
import { expect, test } from 'vitest'
import {
	cutPhasesAt,
	familySegments,
	previewPhilosophySwitch,
	rowsAfter,
	type PhilosophyOutline,
} from './philosophy.ts'

/** A race plan that records no family: 3:1 blocks, then a taper. */
function racePlan(): PhilosophyOutline {
	return {
		startWeekKey: '2026-08-10',
		family: null,
		eventWeekKey: '2026-10-19',
		phases: [
			{
				id: 'base',
				orderIndex: 0,
				name: 'Base',
				weeks: 4,
				rhythm: '3:1',
				tapers: false,
			},
			{
				id: 'build',
				orderIndex: 1,
				name: 'Build',
				weeks: 4,
				rhythm: '3:1',
				tapers: false,
			},
			{
				id: 'taper',
				orderIndex: 2,
				name: 'Taper',
				weeks: 2,
				rhythm: 'none',
				tapers: true,
			},
		],
		tracks: [],
	}
}

test('a plan whose last phase is a taper follows the family its blocks read as', () => {
	// Klassisk 3:1, read off the first phase that is not a taper — so switching
	// to it changes nothing and is refused, as the Filosofi card would say.
	expect(previewPhilosophySwitch(racePlan(), 'classic', '2026-08-10')).toEqual({
		ok: false,
		reason: 'same-family',
	})
})

test('the preview names the family it switches from, not none', () => {
	const preview = previewPhilosophySwitch(racePlan(), 'masters', '2026-08-10')
	expect(preview.ok).toBe(true)
	if (preview.ok) expect(preview.from).toBe('classic')
})

test('a plan is cut at a week: lived phases kept, the one it falls in cut to the weeks lived, the rest gone', () => {
	const plan = racePlan()
	// Week 5 is the second week of Build: Base stays, Build keeps one week.
	expect(cutPhasesAt(plan, 5)).toEqual({
		kept: [plan.phases[0], plan.phases[1]],
		resize: [{ phaseId: 'build', weeks: 1 }],
		remove: ['taper'],
		boundary: 5,
	})
	// On a phase's first week, that phase goes whole.
	expect(cutPhasesAt(plan, 4)).toMatchObject({
		kept: [plan.phases[0]],
		resize: [],
		remove: ['build', 'taper'],
	})
	// Before the plan opens, nothing is kept.
	expect(cutPhasesAt(plan, -2)).toMatchObject({ kept: [], boundary: 0 })
	// Past its end, the last phase runs on over the weeks lived since.
	expect(cutPhasesAt(plan, 12)).toMatchObject({
		kept: plan.phases,
		resize: [{ phaseId: 'taper', weeks: 4 }],
		remove: [],
	})
})

test('the laid phases get the segments their caller says, track by track', () => {
	const plan = {
		...racePlan(),
		tracks: [
			{
				id: 'run',
				discipline: 'run',
				currency: 'hours',
				anchors: [{ fromWeekKey: '2026-08-10', value: 5 }],
				segments: [],
				overrides: [],
			},
			{
				id: 'bike',
				discipline: 'bike',
				currency: 'hours',
				anchors: [{ fromWeekKey: '2026-08-10', value: 2 }],
				segments: [],
				overrides: [],
			},
		],
	}
	const phase = {
		name: 'Runde 2',
		weeks: 4,
		rhythm: '3:1' as const,
		tapers: false,
		ramp: 0.05,
		boundaryStep: 0.1,
		mix: [{ zone: 4 as const, sessionsPerWeek: 1 }],
	}
	const { kept, resize, remove } = cutPhasesAt(plan, 4)
	// The switch's rule: the round's mix on every endurance track.
	const switched = rowsAfter(
		plan,
		kept,
		resize,
		remove,
		[phase],
		familySegments,
	)
	expect(switched.tracks.map((track) => track.segments.length)).toEqual([1, 1])
	// A caller's own rule: the mix on one track, nothing on the other.
	const own = rowsAfter(plan, kept, resize, remove, [phase], (track) =>
		track.id === 'run'
			? {
					ramp: null,
					boundaryStep: null,
					recoveryCut: null,
					taperCut: null,
					mix: phase.mix,
				}
			: null,
	)
	expect(own.tracks[0]!.segments).toMatchObject([
		{ kind: 'endurance', mix: phase.mix, ramp: null },
	])
	expect(own.tracks[1]!.segments).toEqual([])
})
