import { expect, test } from 'vitest'
import {
	availabilityFitWarnings,
	weekSessionDemand,
	type FitSegment,
} from './availability-fit.ts'
import { type PhaseSpec } from './derive.ts'
import { type QualitySessionMixEntry } from './quality-mix.ts'

/** A phase of `weeks` with no rhythm — the roles decide nothing about a fit check. */
function phase(weeks: number): PhaseSpec {
	return { weeks, rhythm: 'none', tapers: false }
}

function mix(
	...entries: [zone: 3 | 4 | 5, sessionsPerWeek: number][]
): QualitySessionMixEntry[] {
	return entries.map(([zone, sessionsPerWeek]) => ({ zone, sessionsPerWeek }))
}

function endurance(
	phaseIndex: number,
	...entries: [zone: 3 | 4 | 5, sessionsPerWeek: number][]
): FitSegment {
	return { kind: 'endurance', phaseIndex, mix: mix(...entries) }
}

function strength(
	startWeekIndex: number,
	weeks: number,
	sessionsPerWeek: number | null,
): FitSegment {
	return { kind: 'strength', startWeekIndex, weeks, sessionsPerWeek }
}

test('a week asks for its phase’s quality sessions plus the covering segment’s Strength Frequency', () => {
	// The two halves ADR 0047 §4 says are now both stored: the derived **Quality
	// Session Count** and the authored **Strength Frequency**.
	const demand = weekSessionDemand(
		[phase(4)],
		[endurance(0, [4, 2], [5, 1]), strength(0, 4, 3)],
		2,
	)

	expect(demand).toEqual({ qualitySessions: 3, strengthSessions: 3 })
})

test('a week in a gap between strength segments asks for zero lifting sessions, not an Unavailable Metric', () => {
	// The gap is the authored "no lifting these weeks" state, exactly as it is for
	// the volume target (ADR 0047 §6) — a positive statement, never a hole.
	const segments = [endurance(0, [4, 1]), strength(0, 2, 3), strength(4, 2, 3)]

	expect(weekSessionDemand([phase(6)], segments, 2)).toEqual({
		qualitySessions: 1,
		strengthSessions: 0,
	})
})

test('a week outside the plan has no demand at all', () => {
	const segments = [endurance(0, [4, 2])]

	expect(weekSessionDemand([phase(4)], segments, 4)).toBeNull()
	expect(weekSessionDemand([phase(4)], segments, -1)).toBeNull()
})

test('a strength segment that authors no frequency leaves its weeks uncheckable', () => {
	// Unlike a gap, a segment with no **Strength Frequency** is a week the check has
	// no second number for. Declining beats counting it as zero, which would read as
	// "no lifting" for a week the athlete did author lifting in.
	expect(
		weekSessionDemand(
			[phase(4)],
			[endurance(0, [4, 2]), strength(0, 4, null)],
			1,
		),
	).toBeNull()
})

test('every track’s segment for the week counts, because a session is a session', () => {
	// A plan carries one track per Discipline (ADR 0043 §1), so a triathlete's week
	// is the sum of its tracks' sessions. Days against days can only be asked of the
	// whole week — a per-track figure answers a question nobody has.
	const demand = weekSessionDemand(
		[phase(4)],
		[endurance(0, [4, 2]), endurance(0, [5, 1]), strength(0, 4, 2)],
		0,
	)

	expect(demand).toEqual({ qualitySessions: 3, strengthSessions: 2 })
})

test('two strength segments holding one week resolve to the later-opening one', () => {
	// The authoring service refuses an overlap; this is only here so the reading can
	// never depend on row order, matching `strengthWeekTarget`'s own tie-break.
	const demand = weekSessionDemand(
		[phase(6)],
		[strength(2, 4, 4), strength(0, 4, 2)],
		3,
	)

	expect(demand).toEqual({ qualitySessions: 0, strengthSessions: 4 })
})

test('a week asking for more sessions than there are trainable weekdays warns', () => {
	const warnings = availabilityFitWarnings(
		[phase(2)],
		[endurance(0, [4, 2]), strength(0, 2, 3)],
		4,
	)

	expect(warnings).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 1,
			qualitySessions: 2,
			strengthSessions: 3,
			trainableWeekdays: 4,
		},
	])
})

test('a week that fills every trainable weekday exactly is silent', () => {
	// Equality is a plan, not a mistake — the same posture `mixAvailabilityWarnings`
	// holds, kept so the two checks cannot disagree about the boundary.
	expect(
		availabilityFitWarnings(
			[phase(2)],
			[endurance(0, [4, 2]), strength(0, 2, 2)],
			4,
		),
	).toEqual([])
})

test('an athlete who never set their Training Availability gets no warnings at all', () => {
	expect(
		availabilityFitWarnings(
			[phase(4)],
			[endurance(0, [4, 4]), strength(0, 4, 4)],
			null,
		),
	).toEqual([])
})

test('an endurance-only plan still gets the check, with no lifting in it', () => {
	const warnings = availabilityFitWarnings(
		[phase(3)],
		[endurance(0, [4, 5])],
		3,
	)

	expect(warnings).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 2,
			qualitySessions: 5,
			strengthSessions: 0,
			trainableWeekdays: 3,
		},
	])
})

test('consecutive weeks asking the same thing collapse into one span', () => {
	// A strength segment floats free of the phases, so the check can only be
	// per-week — and a per-week list would say the same sentence eight times. The
	// span is the reading; the surface names the weeks it covers.
	const warnings = availabilityFitWarnings(
		[phase(8)],
		[endurance(0, [4, 3]), strength(0, 8, 3)],
		5,
	)

	expect(warnings).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 7,
			qualitySessions: 3,
			strengthSessions: 3,
			trainableWeekdays: 5,
		},
	])
})

test('a change in what the weeks ask opens a new span', () => {
	const warnings = availabilityFitWarnings(
		[phase(2), phase(2)],
		[endurance(0, [4, 4]), endurance(1, [4, 5]), strength(0, 4, 1)],
		4,
	)

	expect(warnings).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 1,
			qualitySessions: 4,
			strengthSessions: 1,
			trainableWeekdays: 4,
		},
		{
			fromWeekIndex: 2,
			toWeekIndex: 3,
			qualitySessions: 5,
			strengthSessions: 1,
			trainableWeekdays: 4,
		},
	])
})

test('weeks that fit break the span, so two stretches never read as one', () => {
	const warnings = availabilityFitWarnings(
		[phase(5)],
		[endurance(0, [4, 3]), strength(0, 1, 3), strength(4, 1, 3)],
		4,
	)

	expect(warnings.map((w) => [w.fromWeekIndex, w.toWeekIndex])).toEqual([
		[0, 0],
		[4, 4],
	])
})

test('an uncheckable week breaks the span rather than being spanned over', () => {
	const warnings = availabilityFitWarnings(
		[phase(3)],
		[
			endurance(0, [4, 5]),
			strength(0, 1, 1),
			strength(1, 1, null),
			strength(2, 1, 1),
		],
		4,
	)

	expect(warnings.map((w) => [w.fromWeekIndex, w.toWeekIndex])).toEqual([
		[0, 0],
		[2, 2],
	])
})

test('the fit warning carries the counts, the span and no wording', () => {
	const [warning] = availabilityFitWarnings(
		[phase(1)],
		[endurance(0, [3, 4]), strength(0, 1, 2)],
		2,
	)

	expect(Object.keys(warning!).sort()).toEqual([
		'fromWeekIndex',
		'qualitySessions',
		'strengthSessions',
		'toWeekIndex',
		'trainableWeekdays',
	])
})

test('the check never blocks: an impossible week is still only a warning', () => {
	// Nothing here returns a validation error and no write path may consult it
	// (ADR 0042 §9, ADR 0045 §8). The whole reading is advisory.
	expect(() =>
		availabilityFitWarnings([phase(1)], [strength(0, 1, 14)], 0),
	).not.toThrow()
	expect(availabilityFitWarnings([phase(1)], [strength(0, 1, 14)], 0)).toEqual([
		{
			fromWeekIndex: 0,
			toWeekIndex: 0,
			qualitySessions: 0,
			strengthSessions: 14,
			trainableWeekdays: 0,
		},
	])
})
