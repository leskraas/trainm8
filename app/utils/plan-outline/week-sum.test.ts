import { describe, expect, test } from 'vitest'
import { parseWorkoutSentence } from '../workout-sentence.ts'
import { weekSumChangeLine, weekSumPreviewLine } from './week-sum-words.ts'
import { trackForDiscipline, weekSumPreview } from './week-sum.ts'
import {
	buildWeekVolumes,
	type PlanTrackTargets,
	type VolumeSession,
	type WeekVolumes,
} from './week-volumes.ts'

const PLAN_START = '2026-02-16'
const MONDAY = '2026-03-02'
const TUESDAY = '2026-03-03'

const runTrack: PlanTrackTargets = {
	trackId: 'track-run',
	discipline: 'run',
	currency: 'km',
	// Plan week 3 (2 March) targets 52 km.
	targets: [40, 44, 52, 35],
	overridden: [false, false, false, false],
	sessionTargets: null,
}
const bikeHours: PlanTrackTargets = {
	...runTrack,
	trackId: 'track-bike',
	discipline: 'bike',
	currency: 'hours',
	targets: [5, 6, 7, 4],
}
const swimTss: PlanTrackTargets = {
	...runTrack,
	trackId: 'track-swim',
	discipline: 'swim',
	currency: 'tss',
	targets: [100, 120, 140, 90],
}

function run(dayKey: string, km: number | null): VolumeSession {
	return {
		dayKey,
		status: 'planned',
		discipline: 'run',
		easy: true,
		prescribed: { km, hours: null, tss: null, sets: null },
		recorded: null,
		plannedZones: [],
		doneZones: [],
		countsInNoTrack: false,
	}
}

function weekOf(
	sessions: VolumeSession[],
	tracks: PlanTrackTargets[] = [runTrack],
): WeekVolumes {
	return buildWeekVolumes({
		weekKey: MONDAY,
		todayKey: MONDAY,
		planStartWeekKey: tracks.length > 0 ? PLAN_START : null,
		tracks,
		sessions,
	})
}

const FORTY = [run(MONDAY, 10), run(TUESDAY, 30)]

function structure(text: string, discipline: 'run' | 'bike' | 'swim' = 'run') {
	const parsed = parseWorkoutSentence(text, { discipline })
	expect(parsed.structure).not.toBeNull()
	return parsed.structure!
}

describe('weekSumPreview', () => {
	test('a session in the track’s unit moves the sum and never the target', () => {
		const volumes = weekOf(FORTY)
		const preview = weekSumPreview(
			volumes,
			structure('6 km rolig'),
			trackForDiscipline(volumes, 'run'),
		)
		expect(preview).toEqual({
			kind: 'track',
			discipline: 'run',
			currency: 'km',
			before: 40,
			after: 46,
			added: 6,
			addedAbsence: null,
			unmeasuredAdded: 0,
			target: 52,
		})
		expect(weekSumPreviewLine(preview)).toBe('40 → 46 km, målet står på 52')
	})

	test('a repeat counts every rep in the track’s unit', () => {
		const volumes = weekOf(FORTY)
		const preview = weekSumPreview(
			volumes,
			structure('5x2 km terskel'),
			trackForDiscipline(volumes, 'run'),
		)
		expect(preview).toMatchObject({ before: 40, after: 50, added: 10 })
	})

	test('a timed rest between reps adds no km and does not unmeasure the reps', () => {
		const volumes = weekOf(FORTY)
		const preview = weekSumPreview(
			volumes,
			structure('6x1 km p 1 min'),
			trackForDiscipline(volumes, 'run'),
		)
		expect(preview).toMatchObject({ before: 40, after: 46, added: 6 })
	})

	test('a session with no number in the track’s unit is counted, not added as zero', () => {
		const volumes = weekOf(FORTY)
		const preview = weekSumPreview(
			volumes,
			structure('3x10 min terskel p 1 min'),
			trackForDiscipline(volumes, 'run'),
		)
		expect(preview).toMatchObject({
			before: 40,
			after: 40,
			added: null,
			addedAbsence: 'no-number',
			unmeasuredAdded: 1,
		})
		expect(weekSumPreviewLine(preview)).toBe(
			'40 km, +1 uten km — målet står på 52',
		)
	})

	test('an hours track reads hours', () => {
		const volumes = weekOf([], [runTrack, bikeHours])
		const preview = weekSumPreview(
			volumes,
			structure('1,5 t rolig', 'bike'),
			trackForDiscipline(volumes, 'bike'),
		)
		expect(preview).toMatchObject({ before: 0, after: 1.5, target: 7 })
		expect(weekSumPreviewLine(preview)).toBe('0 → 1,5 t, målet står på 7')
	})

	test('a TSS track is priced only once the session is saved', () => {
		const volumes = weekOf([], [swimTss])
		const preview = weekSumPreview(
			volumes,
			structure('2 km rolig', 'swim'),
			trackForDiscipline(volumes, 'swim'),
		)
		expect(preview).toMatchObject({
			added: null,
			addedAbsence: 'priced-on-save',
			unmeasuredAdded: 0,
		})
		expect(weekSumPreviewLine(preview)).toBe(
			'0 TSS, TSS regnes ut når økta er lagret — målet står på 140',
		)
	})

	test('a discipline the plan has no track for counts in Annet', () => {
		const volumes = weekOf(FORTY)
		const preview = weekSumPreview(
			volumes,
			structure('1 t rolig', 'bike'),
			trackForDiscipline(volumes, 'bike'),
		)
		expect(preview).toEqual({ kind: 'annet', discipline: 'bike' })
		expect(weekSumPreviewLine(preview)).toBe(
			'Teller i Annet — ingen ukesum flytter seg',
		)
	})

	test('with no plan there is no target to hold the session against', () => {
		const volumes = weekOf(FORTY, [])
		const preview = weekSumPreview(
			volumes,
			structure('6 km rolig'),
			trackForDiscipline(volumes, 'run'),
		)
		expect(preview).toEqual({ kind: 'no-plan', discipline: 'run' })
	})
})

describe('weekSumChangeLine', () => {
	test('states the sum before → after and that the target stayed', () => {
		const before = weekOf(FORTY)
		const after = weekOf([...FORTY, run(TUESDAY, 6)])
		expect(
			weekSumChangeLine({
				before,
				after,
				discipline: 'run',
				weekName: 'Denne uka',
				change: 'added',
			}),
		).toBe('Løping denne uka: 40 → 46 km. Ukemålet står på 52.')
	})

	test('a removed session reads the other way', () => {
		const before = weekOf([...FORTY, run(TUESDAY, 6)])
		const after = weekOf(FORTY)
		expect(
			weekSumChangeLine({
				before,
				after,
				discipline: 'run',
				weekName: 'Uke 41',
				change: 'removed',
			}),
		).toBe('Løping uke 41: 46 → 40 km. Ukemålet står på 52.')
	})

	test('a session with no km is said, not summed', () => {
		const before = weekOf(FORTY)
		const after = weekOf([...FORTY, run(TUESDAY, null)])
		expect(
			weekSumChangeLine({
				before,
				after,
				discipline: 'run',
				weekName: 'Neste uke',
				change: 'added',
			}),
		).toBe('Løping neste uke: 40 km, +1 uten km. Ukemålet står på 52.')
	})

	test('a removed session with no km takes its count with it', () => {
		expect(
			weekSumChangeLine({
				before: weekOf([...FORTY, run(TUESDAY, null)]),
				after: weekOf(FORTY),
				discipline: 'run',
				weekName: 'Denne uka',
				change: 'removed',
			}),
		).toBe('Løping denne uka: 40 km, −1 uten km. Ukemålet står på 52.')
	})

	test('no plan and Annet say what happened without a sum', () => {
		expect(
			weekSumChangeLine({
				before: weekOf([], []),
				after: weekOf(FORTY, []),
				discipline: 'run',
				weekName: 'Denne uka',
				change: 'added',
			}),
		).toBe('Økta er lagt inn. Uten plan er det ikke noe ukemål.')
		expect(
			weekSumChangeLine({
				before: weekOf(FORTY),
				after: weekOf(FORTY),
				discipline: 'bike',
				weekName: 'Denne uka',
				change: 'added',
			}),
		).toBe('Økta teller i Annet. Ingen ukesum flyttet seg.')
	})
})
