import { describe, expect, test } from 'vitest'
import { type OutlineRows, type PhaseRow } from './from-rows.ts'
import {
	previewSeasonEdit,
	seasonAnchorChoices,
	type SeasonEditPreview,
} from './season-edit.ts'

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

	test('a hand-set figure that reads as the derived one still lists the week it writes', () => {
		// 44.12 shows as 44,1, the week's derived target, yet the confirm writes a
		// Week Volume Override: the week turns hand-set, so the preview lists it.
		const preview = ok(
			previewSeasonEdit(
				outline(),
				{
					kind: 'week-target',
					trackId: 'run',
					weekKey: '2026-10-19',
					value: 44.12,
				},
				UNBEGUN,
			),
		)
		expect(preview.write).toEqual(
			expect.objectContaining({ kind: 'week-target', value: 44.12 }),
		)
		expect(preview.weeks.map((week) => week.weekKey)).toEqual(['2026-10-19'])
		expect(preview.weeks[0]!.after?.targets[0]!.overridden).toBe(true)
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

describe('a Season Anchor (#673, ADR 0121)', () => {
	type Track = OutlineRows['tracks'][number]
	const withTrack = (change: Partial<Track>, unbegun = UNBEGUN) => {
		const rows = outline()
		return {
			rows: { ...rows, tracks: [{ ...rows.tracks[0]!, ...change }] },
			unbegun,
		}
	}
	const anchorEdit = (
		action: 'add' | 'set',
		fromWeekKey: string,
		value: number,
	) =>
		({
			kind: 'season-anchor',
			trackId: 'run',
			action,
			fromWeekKey,
			value,
		}) as const
	const levelAt = (rows: OutlineRows, weekKey: string, unbegun = UNBEGUN) =>
		seasonAnchorChoices(rows, unbegun)[0]!.weeks.find(
			(week) => week.weekKey === weekKey,
		)!.level!

	test('a fresh start from a week moves it and every week after it, and says what held', () => {
		const preview = ok(
			previewSeasonEdit(
				outline(),
				anchorEdit('add', '2026-10-19', 50),
				UNBEGUN,
			),
		)
		expect(preview.summary).toEqual({
			kind: 'season-anchor',
			trackId: 'run',
			discipline: 'run',
			currency: 'km',
			act: 'add',
			merged: false,
			weekKey: '2026-10-19',
			weekNumber: 43,
			before: null,
			after: 50,
			changedWeeks: 10,
		})
		expect(preview.weeks[0]!.weekKey).toBe('2026-10-19')
		expect(preview.weeks[0]!.after?.targets[0]).toMatchObject({
			value: 50,
			overridden: false,
		})
		expect(preview.relayWeekKeys).toHaveLength(10)
		expect(preview.held).toEqual(['phases', 'weeks-before'])
		expect(preview.heldWeeks).toEqual([])
		expect(preview.write).toEqual({
			kind: 'season-anchor',
			trackId: 'run',
			fromWeekKey: '2026-10-19',
			value: 50,
		})
		// The jump from 42 km to 50 is more than 10 % over the hard week before.
		expect(preview.warnings).toEqual([
			expect.objectContaining({ weekKey: '2026-10-19', from: 42, to: 50 }),
		])
	})

	test('every changed derived after-value carries how it was worked out, and it adds up', () => {
		const preview = ok(
			previewSeasonEdit(
				outline(),
				anchorEdit('add', '2026-10-19', 50),
				UNBEGUN,
			),
		)
		// Week 44 is Base's easy week: cut off week 43, the anchor itself.
		const easy = preview.weeks.find((week) => week.weekKey === '2026-10-26')!
		expect(easy.derivations[0]).toMatchObject({
			anchor: { weekKey: '2026-10-19', weekNumber: 43, value: 50 },
			reference: { weekKey: '2026-10-19', weekNumber: 43 },
			role: 'recovery',
			factor: 0.7,
			ramps: [],
		})
		for (const week of preview.weeks) {
			const target = week.after!.targets[0]!
			expect(week.derivations[0]?.value).toBeCloseTo(target.value!, 1)
		}
	})

	test('an untouched pre-fill on a loading week changes nothing', () => {
		const level = levelAt(outline(), '2026-10-19')
		expect(level).toBeCloseTo(44.1, 9)
		expect(
			previewSeasonEdit(
				outline(),
				anchorEdit('add', '2026-10-19', level),
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'no-change' })
	})

	test('an untouched pre-fill on an easy week moves only that week, by one ramp step', () => {
		const level = levelAt(outline(), '2026-10-26')
		expect(level).toBeCloseTo(40 * 1.05 ** 3, 9)
		// As the page pre-fills it: to three decimals.
		const prefill = Math.round(level * 1000) / 1000
		const preview = ok(
			previewSeasonEdit(
				outline(),
				anchorEdit('add', '2026-10-26', prefill),
				UNBEGUN,
			),
		)
		expect(preview.weeks.map((week) => week.weekKey)).toEqual(['2026-10-26'])
		expect(preview.weeks[0]!.before?.targets[0]!.value).toBeCloseTo(30.87, 9)
		expect(preview.weeks[0]!.after?.targets[0]!.value).toBeCloseTo(32.4135, 3)
	})

	test('an untouched pre-fill on a taper week moves only the taper weeks of that phase', () => {
		const tapering = outline([{}, { tapers: true }])
		const level = Math.round(levelAt(tapering, '2026-12-07') * 1000) / 1000
		const preview = ok(
			previewSeasonEdit(
				tapering,
				anchorEdit('add', '2026-12-07', level),
				UNBEGUN,
			),
		)
		// Build tapers from 30 Nov; a start on its second week lifts that week
		// and the taper weeks after it, by one ramp step.
		expect(preview.weeks.map((week) => week.weekKey)).toEqual([
			'2026-12-07',
			'2026-12-14',
			'2026-12-21',
		])
	})

	test('a fresh start on a week that has a segment edits it, and says so', () => {
		const { rows } = withTrack({
			anchors: [
				{ fromWeekKey: START, value: 40 },
				{ fromWeekKey: '2026-11-02', value: 45 },
			],
		})
		const preview = ok(
			previewSeasonEdit(rows, anchorEdit('add', '2026-11-02', 50), UNBEGUN),
		)
		expect(preview.summary).toMatchObject({
			act: 'set',
			merged: true,
			before: 45,
			after: 50,
		})
		expect(preview.write).toEqual({
			kind: 'season-anchor',
			trackId: 'run',
			fromWeekKey: '2026-11-02',
			value: 50,
		})
	})

	test('a fresh start before the first unbegun week is refused', () => {
		expect(
			previewSeasonEdit(outline(), anchorEdit('add', START, 50), UNBEGUN),
		).toEqual({ ok: false, reason: 'week-lived' })
	})

	test('a value change on a segment covering a begun week is refused, offering a fresh start', () => {
		expect(
			previewSeasonEdit(outline(), anchorEdit('set', START, 36), UNBEGUN),
		).toEqual({
			ok: false,
			reason: 'segment-lived',
			offer: {
				kind: 'season-anchor',
				trackId: 'run',
				action: 'add',
				fromWeekKey: UNBEGUN,
				value: 36,
			},
		})
	})

	test('no offer when a later segment is in force at the first unbegun week', () => {
		const { rows } = withTrack({
			anchors: [
				{ fromWeekKey: START, value: 40 },
				{ fromWeekKey: UNBEGUN, value: 42 },
			],
		})
		expect(
			previewSeasonEdit(rows, anchorEdit('set', START, 36), UNBEGUN),
		).toEqual({ ok: false, reason: 'segment-lived' })
		// That later segment's own value is the athlete's to change.
		expect(
			ok(previewSeasonEdit(rows, anchorEdit('set', UNBEGUN, 44), UNBEGUN))
				.summary,
		).toMatchObject({ act: 'set', merged: false, before: 42, after: 44 })
	})

	test('a re-anchor can be taken back; the season’s first cannot', () => {
		const { rows } = withTrack({
			anchors: [
				{ fromWeekKey: START, value: 40 },
				{ fromWeekKey: '2026-11-02', value: 45 },
			],
		})
		const removed = ok(
			previewSeasonEdit(
				rows,
				{
					kind: 'season-anchor',
					trackId: 'run',
					action: 'remove',
					fromWeekKey: '2026-11-02',
				},
				UNBEGUN,
			),
		)
		expect(removed.summary).toMatchObject({ act: 'remove', before: 45 })
		expect(removed.write).toEqual({
			kind: 'season-anchor',
			trackId: 'run',
			fromWeekKey: '2026-11-02',
			value: null,
		})
		// Back on the season's own climb: week 45 is 40 × 1.05³ again.
		expect(removed.weeks[0]).toMatchObject({ weekKey: '2026-11-02' })
		expect(removed.weeks[0]!.after?.targets[0]!.value).toBeCloseTo(46.305, 9)

		expect(
			previewSeasonEdit(
				rows,
				{
					kind: 'season-anchor',
					trackId: 'run',
					action: 'remove',
					fromWeekKey: START,
				},
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'earliest-anchor' })
		expect(
			previewSeasonEdit(
				rows,
				{
					kind: 'season-anchor',
					trackId: 'run',
					action: 'remove',
					fromWeekKey: '2026-11-09',
				},
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'anchor-not-found' })
	})

	test('a remove that would move a begun week is refused', () => {
		const { rows } = withTrack({
			anchors: [
				{ fromWeekKey: START, value: 40 },
				{ fromWeekKey: '2026-10-19', value: 45 },
			],
		})
		expect(
			previewSeasonEdit(
				rows,
				{
					kind: 'season-anchor',
					trackId: 'run',
					action: 'remove',
					fromWeekKey: '2026-10-19',
				},
				'2026-10-26',
			),
		).toEqual({ ok: false, reason: 'changes-lived-weeks' })
	})

	test('a hand-set week in the span is held: untouched, not laid again, and listed', () => {
		const { rows } = withTrack({
			overrides: [{ weekKey: '2026-11-09', value: 30 }],
		})
		const preview = ok(
			previewSeasonEdit(rows, anchorEdit('add', '2026-10-19', 50), UNBEGUN),
		)
		expect(preview.weeks.map((week) => week.weekKey)).not.toContain(
			'2026-11-09',
		)
		expect(preview.relayWeekKeys).not.toContain('2026-11-09')
		expect(preview.heldWeeks).toEqual([
			{
				trackId: 'run',
				weekKey: '2026-11-09',
				weekNumber: 46,
				currency: 'km',
				value: 30,
			},
		])
		expect(preview.held).toEqual(['phases', 'weeks-before', 'hand-set-weeks'])
	})

	test('strength, the Simple Activities and a track with no anchor are refused', () => {
		expect(
			previewSeasonEdit(
				withTrack({ discipline: 'other', currency: 'hours' }).rows,
				anchorEdit('add', '2026-10-19', 5),
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'not-endurance-track' })
		expect(
			previewSeasonEdit(
				withTrack({ discipline: 'strength', currency: 'sets' }).rows,
				anchorEdit('add', '2026-10-19', 5),
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'not-endurance-track' })
		expect(
			previewSeasonEdit(
				withTrack({ anchors: [] }).rows,
				anchorEdit('add', '2026-10-19', 5),
				UNBEGUN,
			),
		).toEqual({ ok: false, reason: 'no-season-anchor' })
	})

	test('the choices: endurance tracks with an anchor, from the first unbegun week, with the ramp’s level', () => {
		const [choice] = seasonAnchorChoices(outline(), UNBEGUN)
		expect(choice).toMatchObject({
			trackId: 'run',
			anchors: [
				{ fromWeekKey: START, value: 40, earliest: true, inPlan: true },
			],
		})
		expect(choice!.weeks[0]).toEqual({
			weekKey: UNBEGUN,
			role: 'loading',
			target: 42,
			overridden: false,
			level: 42,
		})
		expect(choice!.weeks).toHaveLength(11)
		expect(
			seasonAnchorChoices(
				withTrack({ discipline: 'other', currency: 'hours' }).rows,
				UNBEGUN,
			),
		).toEqual([])
	})

	test('the choices say which segments a remove may take: never the first, never one begun', () => {
		const { rows } = withTrack({
			anchors: [
				{ fromWeekKey: START, value: 40 },
				{ fromWeekKey: '2026-10-19', value: 42 },
				{ fromWeekKey: '2026-11-16', value: 45 },
			],
		})
		const [choice] = seasonAnchorChoices(rows, '2026-11-09')
		expect(
			choice!.anchors.map(({ fromWeekKey, removable }) => ({
				fromWeekKey,
				removable,
			})),
		).toEqual([
			{ fromWeekKey: START, removable: false },
			{ fromWeekKey: '2026-10-19', removable: false },
			{ fromWeekKey: '2026-11-16', removable: true },
		])
	})
})
