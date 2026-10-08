import { describe, expect, test } from 'vitest'
import { type OutlineRows, type PhaseRow } from './from-rows.ts'
import { previewSeasonEdit, type SeasonEditPreview } from './season-edit.ts'

// Base(8, 3:1) → Build(4, 3:1), one run track at 40 km climbing 5 % a loading
// week. The plan opens Monday 5 October 2026 (ISO week 41).
const START = '2026-10-05'
// Thursday 8 October: week 41 is begun, week 42 is the first not begun.
const UNBEGUN = '2026-10-12'

function outline(phaseOverrides: Partial<PhaseRow>[] = []): OutlineRows {
	const phases: PhaseRow[] = [
		{
			id: 'base',
			orderIndex: 0,
			name: 'Base',
			weeks: 8,
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
	].map((phase, i) => ({ ...phase, ...phaseOverrides[i] }))
	return {
		startWeekKey: START,
		phases,
		tracks: [
			{
				id: 'run',
				discipline: 'run',
				currency: 'km',
				anchors: [{ fromWeekKey: START, value: 40 }],
				overrides: [],
				segments: phases.map((phase) => ({
					id: `seg-${phase.id}`,
					kind: 'endurance',
					phaseId: phase.id,
					ramp: 0.05,
					boundaryStep: null,
					recoveryCut: null,
					taperCut: null,
					startWeekKey: null,
					weeks: null,
					goal: null,
					sessionsPerWeek: null,
					deloadCut: null,
					deloadWeeks: null,
					mix: [],
				})),
			},
		],
	}
}

function ok(result: ReturnType<typeof previewSeasonEdit>): SeasonEditPreview {
	if (!result.ok) throw new Error(`refused: ${result.reason}`)
	return result
}

describe('a week target', () => {
	test('moves that week only, and says the phase and the other weeks held', () => {
		const preview = ok(
			previewSeasonEdit(
				outline(),
				{
					kind: 'week-target',
					trackId: 'run',
					weekKey: '2026-10-19',
					value: 44,
				},
				UNBEGUN,
			),
		)
		expect(preview.summary).toEqual({
			kind: 'week-target',
			weekKey: '2026-10-19',
			weekNumber: 43,
			currency: 'km',
			before: 44.1,
			after: 44,
			revert: false,
		})
		expect(preview.weeks.map((week) => week.weekKey)).toEqual(['2026-10-19'])
		expect(preview.weeks[0]!.after?.targets[0]!.value).toBe(44)
		expect(preview.held).toEqual(['phase', 'other-weeks'])
		expect(preview.relayWeekKeys).toEqual(['2026-10-19'])
		expect(preview.warnings).toEqual([])
		expect(preview.write).toEqual({
			kind: 'week-target',
			trackId: 'run',
			weekKey: '2026-10-19',
			value: 44,
		})
	})

	test('warns when it rises more than 10 % over the loading week before it', () => {
		const preview = ok(
			previewSeasonEdit(
				outline(),
				{
					kind: 'week-target',
					trackId: 'run',
					weekKey: '2026-10-19',
					value: 50,
				},
				UNBEGUN,
			),
		)
		expect(preview.warnings).toEqual([
			expect.objectContaining({
				trackId: 'run',
				weekKey: '2026-10-19',
				weekNumber: 43,
				fromWeekKey: '2026-10-12',
				from: 42,
				to: 50,
			}),
		])
	})

	test('says nothing about the rebound out of an easy week it lowers', () => {
		const preview = ok(
			previewSeasonEdit(
				outline(),
				{
					kind: 'week-target',
					trackId: 'run',
					weekKey: '2026-10-26',
					value: 20,
				},
				UNBEGUN,
			),
		)
		expect(preview.warnings).toEqual([])
	})

	test('refuses a week already begun, a week outside the plan, and the same number', () => {
		const edit = { kind: 'week-target' as const, trackId: 'run' }
		expect(
			previewSeasonEdit(
				outline(),
				{ ...edit, weekKey: START, value: 30 },
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'week-lived' })
		expect(
			previewSeasonEdit(
				outline(),
				{ ...edit, weekKey: '2027-06-07', value: 30 },
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'week-outside-plan' })
		expect(
			previewSeasonEdit(
				outline(),
				{ ...edit, weekKey: '2026-10-12', value: 42 },
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'no-change' })
		expect(
			previewSeasonEdit(
				outline(),
				{ ...edit, trackId: 'ride', weekKey: '2026-10-12', value: 42 },
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'track-not-found' })
	})
})

describe('a phase', () => {
	test('renamed, moves no number', () => {
		const preview = ok(
			previewSeasonEdit(
				outline(),
				{
					kind: 'phase',
					phaseId: 'build',
					name: 'Bygg',
					weeks: null,
					rhythm: null,
					tapers: null,
				},
				UNBEGUN,
			),
		)
		expect(preview.summary).toEqual({
			kind: 'phase',
			name: { before: 'Build', after: 'Bygg' },
			weeks: { before: 4, after: 4 },
			rhythm: { before: '3:1', after: '3:1' },
			tapers: { before: false, after: false },
		})
		expect(preview.weeks).toHaveLength(4)
		expect(
			preview.weeks.every((week) => week.after?.phaseName === 'Bygg'),
		).toBe(true)
		expect(preview.relayWeekKeys).toEqual([])
		expect(preview.held).toEqual(['phase-length', 'week-targets'])
	})

	test('lengthened, adds weeks at its end and keeps the plan’s start', () => {
		const preview = ok(
			previewSeasonEdit(
				outline(),
				{
					kind: 'phase',
					phaseId: 'build',
					name: null,
					weeks: 6,
					rhythm: null,
					tapers: null,
				},
				UNBEGUN,
			),
		)
		expect(preview.held).toEqual(['phase-name', 'plan-start', 'other-phases'])
		expect(preview.weeks.map((week) => week.weekKey)).toEqual([
			'2026-12-28',
			'2027-01-04',
		])
		expect(preview.weeks.at(-1)!.before).toBeNull()
		expect(preview.write).toEqual({
			kind: 'phase',
			phaseId: 'build',
			name: 'Build',
			weeks: 6,
			rhythm: '3:1',
			tapers: false,
			recoveryWeekIndex: null,
		})
	})

	test('refuses to change a week already begun', () => {
		expect(
			previewSeasonEdit(
				outline(),
				{
					kind: 'phase',
					phaseId: 'base',
					name: null,
					weeks: 2,
					rhythm: null,
					tapers: null,
				},
				'2026-10-26',
			),
		).toEqual({ ok: false, reason: 'changes-lived-weeks' })
	})

	test('a rename of a phase lived in is fine: a name is not a number', () => {
		expect(
			previewSeasonEdit(
				outline(),
				{
					kind: 'phase',
					phaseId: 'base',
					name: 'Grunn',
					weeks: null,
					rhythm: null,
					tapers: null,
				},
				'2026-10-26',
			).ok,
		).toBe(true)
	})

	test('clears a chosen easy week the phase no longer reaches', () => {
		const preview = ok(
			previewSeasonEdit(
				outline([{}, { recoveryWeekIndex: 3 }]),
				{
					kind: 'phase',
					phaseId: 'build',
					name: null,
					weeks: 2,
					rhythm: null,
					tapers: null,
				},
				UNBEGUN,
			),
		)
		expect(preview.write).toMatchObject({ weeks: 2, recoveryWeekIndex: null })
	})
})

describe('the easy week', () => {
	test('moves within its own block; the phase keeps its length and the other weeks hold', () => {
		const preview = ok(
			previewSeasonEdit(
				outline(),
				{ kind: 'easy-week', weekKey: '2026-11-09' },
				UNBEGUN,
			),
		)
		expect(preview.summary).toEqual({
			kind: 'easy-week',
			phaseName: 'Base',
			weekNumber: 46,
			previousWeekNumber: 48,
		})
		expect(
			preview.weeks.map((week) => [
				week.weekKey,
				week.before?.role,
				week.after?.role,
			]),
		).toEqual([
			['2026-11-09', 'loading', 'recovery'],
			['2026-11-16', 'loading', 'loading'],
			['2026-11-23', 'recovery', 'loading'],
		])
		expect(preview.held).toEqual(['phase-length', 'other-weeks'])
		expect(preview.write).toEqual({
			kind: 'easy-week',
			phaseId: 'base',
			recoveryWeekIndex: 5,
		})
	})

	test('refuses a phase whose rhythm has no easy week, and a week already easy', () => {
		expect(
			previewSeasonEdit(
				outline([{ rhythm: 'none' }]),
				{ kind: 'easy-week', weekKey: '2026-11-09' },
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'no-easy-week' })
		expect(
			previewSeasonEdit(
				outline(),
				{ kind: 'easy-week', weekKey: '2026-11-23' },
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'no-change' })
	})

	test('refuses to move a choice out of a block already lived', () => {
		expect(
			previewSeasonEdit(
				outline([{ recoveryWeekIndex: 1 }]),
				{ kind: 'easy-week', weekKey: '2026-11-09' },
				'2026-10-26',
			),
		).toEqual({ ok: false, reason: 'changes-lived-weeks' })
	})

	test('warns when the climb after it rises too fast', () => {
		// The easy week first in its block leaves three loading weeks climbing
		// from the week before it; a hand-set week on top of that overshoots.
		const rows = outline()
		rows.tracks[0]!.overrides.push({ weekKey: '2026-11-16', value: 60 })
		const preview = ok(
			previewSeasonEdit(
				rows,
				{ kind: 'easy-week', weekKey: '2026-11-02' },
				UNBEGUN,
			),
		)
		expect(preview.warnings.map((w) => w.weekKey)).toContain('2026-11-16')
	})
})

test('the digest tells two previews apart and repeats for the same one', () => {
	const edit = {
		kind: 'week-target' as const,
		trackId: 'run',
		weekKey: '2026-10-19',
		value: 44,
	}
	const a = ok(previewSeasonEdit(outline(), edit, UNBEGUN))
	const b = ok(previewSeasonEdit(outline(), edit, UNBEGUN))
	const c = ok(previewSeasonEdit(outline(), { ...edit, value: 45 }, UNBEGUN))
	expect(a.digest).toBe(b.digest)
	expect(a.digest).not.toBe(c.digest)
})

describe('back to the plan’s target', () => {
	test('removes the hand-set week, and says it goes back', () => {
		const rows = outline()
		rows.tracks[0]!.overrides.push({ weekKey: '2026-10-19', value: 50 })
		const preview = ok(
			previewSeasonEdit(
				rows,
				{
					kind: 'week-target',
					trackId: 'run',
					weekKey: '2026-10-19',
					value: null,
				},
				UNBEGUN,
			),
		)
		expect(preview.summary).toMatchObject({
			kind: 'week-target',
			before: 50,
			after: 44.1,
			revert: true,
		})
		expect(preview.write).toEqual({
			kind: 'week-target',
			trackId: 'run',
			weekKey: '2026-10-19',
			value: null,
		})
		expect(preview.held).toEqual(['phase', 'other-weeks'])
	})

	test('a week that already follows the plan is refused', () => {
		expect(
			previewSeasonEdit(
				outline(),
				{
					kind: 'week-target',
					trackId: 'run',
					weekKey: '2026-10-19',
					value: null,
				},
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'not-hand-set' })
	})
})

describe('a phase’s rhythm', () => {
	test('changes behind the preview, and clears a chosen easy week with the blocks it was chosen in', () => {
		const preview = ok(
			previewSeasonEdit(
				outline([{}, { recoveryWeekIndex: 1 }]),
				{
					kind: 'phase',
					phaseId: 'build',
					name: null,
					weeks: null,
					rhythm: '2:1',
					tapers: null,
				},
				UNBEGUN,
			),
		)
		expect(preview.write).toEqual({
			kind: 'phase',
			phaseId: 'build',
			name: 'Build',
			weeks: 4,
			rhythm: '2:1',
			tapers: false,
			recoveryWeekIndex: null,
		})
		expect(preview.summary).toMatchObject({
			rhythm: { before: '3:1', after: '2:1' },
		})
		expect(preview.held).toEqual(['phase-name', 'phase-length'])
		expect(preview.relayWeekKeys.length).toBeGreaterThan(0)
	})
})

describe('a strength track', () => {
	// Lifting blocks of their own (ADR 0047 §6): 3 weeks with a deload as the
	// last, then 4 more. The phases have no easy week, so only the lifting
	// block's deload is one.
	function withStrength(): OutlineRows {
		const rows = outline([{ rhythm: 'none' }, { rhythm: 'none' }])
		const block = (id: string, startWeekKey: string, weeks: number) => ({
			id,
			kind: 'strength',
			phaseId: null,
			ramp: null,
			boundaryStep: null,
			recoveryCut: null,
			taperCut: null,
			startWeekKey,
			weeks,
			goal: null,
			sessionsPerWeek: null,
			deloadCut: null,
			deloadWeeks: null,
			mix: [],
		})
		rows.tracks.push({
			id: 'lift',
			discipline: 'strength',
			currency: 'sets',
			anchors: [{ fromWeekKey: START, value: 12 }],
			overrides: [],
			segments: [block('b1', START, 3), block('b2', '2026-10-26', 4)],
		})
		return rows
	}

	test('the rebound out of a lifting deload is not a rise; the week is read against the last loading week', () => {
		const rows = withStrength()
		const quiet = ok(
			previewSeasonEdit(
				rows,
				{
					kind: 'week-target',
					trackId: 'lift',
					weekKey: '2026-10-26',
					value: 13,
				},
				UNBEGUN,
			),
		)
		expect(quiet.warnings).toEqual([])
		const steep = ok(
			previewSeasonEdit(
				rows,
				{
					kind: 'week-target',
					trackId: 'lift',
					weekKey: '2026-10-26',
					value: 18,
				},
				UNBEGUN,
			),
		)
		expect(steep.warnings).toEqual([
			expect.objectContaining({
				trackId: 'lift',
				weekKey: '2026-10-26',
				fromWeekKey: '2026-10-12',
				from: 12,
				to: 18,
			}),
		])
	})
})
