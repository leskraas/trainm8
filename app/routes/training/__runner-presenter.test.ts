import { expect, test } from 'vitest'
import { type PlateInventory } from '#app/utils/strength/plates.ts'
import { type LiftOutcome } from '#app/utils/strength/program-engine.ts'
import { type StrengthRecord } from '#app/utils/strength/records.ts'
import {
	type LogExercise,
	type LogRow,
} from '#app/utils/strength-log.server.ts'
import {
	buildLiftScheme,
	buildLiftSubline,
	buildLoggedCounter,
	buildOutcomePanel,
	buildPlateLine,
	buildRecordBanner,
	buildResolutionDetail,
	buildRunnerLog,
	buildSetCircles,
	buildTargetText,
	buildWarmupChips,
	buildWorkingLoad,
	countLoggedWorkingSets,
	nextSetReps,
} from './__runner-presenter.ts'

function row(overrides: Partial<LogRow> = {}): LogRow {
	return {
		orderIndex: 0,
		exerciseSetId: 'set-1',
		prescribedReps: 5,
		prescribedDurationSec: null,
		prescribedLoad: { kind: 'absolute', kg: 100 },
		resolvedLoad: null,
		warmupRung: null,
		logged: null,
		ghost: null,
		...overrides,
	}
}

const gym: PlateInventory = {
	bars: [{ label: 'Olympic', weightKg: 20 }],
	plates: [
		{ weightKg: 20, count: 2 },
		{ weightKg: 10, count: 2 },
		{ weightKg: 5, count: 1 },
		{ weightKg: 2.5, count: 1 },
	],
	fixedDumbbellsKg: null,
}

// ——— The row's target ————————————————————————————————————————————————————

test('an absolute load reads as itself, and is not resolved twice', () => {
	expect(
		buildTargetText(
			row({
				resolvedLoad: {
					kind: 'resolved',
					kg: 100,
					kgMax: null,
					basis: {
						construct: 'authored',
						protocol: null,
						confidence: null,
						anchorValueKg: null,
						anchorReps: null,
						effectiveAtISO: null,
						text: 'as prescribed',
					},
				},
			}),
		),
	).toBe('5 reps · 100 kg')
})

test('an unresolved percentage renders the authored form plus its stated absence, never a number', () => {
	const text = buildTargetText(
		row({
			prescribedLoad: { kind: 'pct1RM', minPct: 85 },
			resolvedLoad: {
				kind: 'unavailable',
				reason: 'no-anchor',
				authored: { kind: 'pct1RM', minPct: 85 },
				text: 'no 1RM on file for this lift',
				fix: 'Record a 1RM for this lift.',
			},
		}),
	)

	expect(text).toContain('85% 1RM')
	expect(text).toContain('no 1RM on file')
	// The failure this rule exists to prevent: any kilo at all beside an anchor
	// nobody has.
	expect(text).not.toMatch(/\d+(\.\d+)?\s*kg/)
})

test('a resolved percentage carries the athlete’s own kilos after the authored form', () => {
	expect(
		buildTargetText(
			row({
				prescribedLoad: { kind: 'pct1RM', minPct: 85 },
				resolvedLoad: {
					kind: 'resolved',
					kg: 119,
					kgMax: null,
					basis: {
						construct: 'oneRm',
						protocol: 'tested',
						confidence: null,
						anchorValueKg: 140,
						anchorReps: null,
						effectiveAtISO: '2026-06-01T00:00:00.000Z',
						text: '85 % of your tested 140 kg 1RM',
					},
				},
			}),
		),
	).toBe('5 reps · 85% 1RM · 119 kg')
})

test('a rung of a bodyweight-derived ramp names its base rather than falling silent', () => {
	// The base rungs of a dip ramp are the athlete alone: `targetKg` is 0, because 0
	// is what goes on the belt. That zero used to be suppressed — a `0 kg` target
	// reads as a prescription to load nothing — which left the two empty-bar rungs
	// saying only "5 reps". `effectiveKg` above `targetKg` is what says this ramp
	// resolves against the athlete, so the rung is described the way every other
	// bodyweight-plus load on this surface is.
	expect(
		buildTargetText(
			row({
				prescribedLoad: { kind: 'absolute', kg: 0 },
				warmupRung: { targetKg: 0, effectiveKg: 74, plateLine: 'empty bar' },
			}),
		),
	).toBe('5 reps · bodyweight')

	expect(
		buildTargetText(
			row({
				prescribedLoad: { kind: 'absolute', kg: 15 },
				warmupRung: { targetKg: 15, effectiveKg: 89, plateLine: '7.5' },
			}),
		),
	).toBe('5 reps · bodyweight + 15 kg')
})

test('a rung of a barbell ramp states the bar and never the athlete, because the two kilos are the same one', () => {
	// `effectiveKg === targetKg` is the whole of "this load is external", so a
	// barbell rung takes the ordinary path and reads as the weight on the bar. The
	// bodyweight-inclusive total is deliberately not what is printed here — quoting
	// it is the substitution that rendered a dip ramp as `84 / 84 / 99` above a work
	// set of 30.
	expect(
		buildTargetText(
			row({
				prescribedLoad: { kind: 'absolute', kg: 20 },
				warmupRung: { targetKg: 20, effectiveKg: 20, plateLine: 'empty bar' },
			}),
		),
	).toBe('5 reps · 20 kg')
})

test('the provenance of an absence is the fix, so the detail has somewhere to send you', () => {
	expect(
		buildResolutionDetail({
			kind: 'unavailable',
			reason: 'no-anchor',
			authored: { kind: 'repMax', reps: 8 },
			text: 'no 8RM on file for this lift',
			fix: 'Record the heaviest load you can lift for exactly 8 reps.',
		}),
	).toEqual({
		text: 'no 8RM on file for this lift',
		fix: 'Record the heaviest load you can lift for exactly 8 reps.',
	})
})

// ——— The plate line ——————————————————————————————————————————————————————

test('the plate line is what goes on one side, heaviest first', () => {
	expect(
		buildPlateLine({ loadNumber: '100', inventory: gym, options: {} }),
	).toMatchObject({ kind: 'plates', text: '20 · 20' })
})

test('an empty input has nothing to solve, and is not a zero', () => {
	expect(
		buildPlateLine({ loadNumber: '', inventory: gym, options: {} }),
	).toBeNull()
	expect(
		buildPlateLine({ loadNumber: 'abc', inventory: gym, options: {} }),
	).toBeNull()
})

test('a gym nobody has described gets no plate line rather than an invented rack', () => {
	expect(
		buildPlateLine({ loadNumber: '100', inventory: null, options: {} }),
	).toBeNull()
})

test('a rack that cannot make the number says which number it can make', () => {
	const line = buildPlateLine({
		loadNumber: '101',
		inventory: gym,
		options: {},
	})

	expect(line?.kind).toBe('nearest')
	expect(line && 'note' in line ? line.note : '').toMatch(/Your gym makes/)
})

test('the gap sentence quotes the quantity the athlete typed', () => {
	// **`achievedKg`, not `totalWeight`.** `totalWeight` is bodyweight-inclusive for
	// three of the eight kinds, and the sentence sits under the box the athlete just
	// typed in — so a dip belt typed as `+31` on a 74 kg athlete read *"Your gym
	// makes 105.25 kg, not 31 kg"* when the gym had in fact made 31.25 kg of belt,
	// and 11 kg of assist read *"62.75 kg, not 11 kg"*.
	const athlete = { bodyweightKg: 74 }
	// The rack the two live sentences were observed on: a 1.25 kg pair is what puts
	// the gap at a quarter kilo rather than a whole one.
	const beltGym: PlateInventory = {
		...gym,
		plates: [
			{ weightKg: 20, count: 2 },
			{ weightKg: 10, count: 2 },
			{ weightKg: 5, count: 2 },
			{ weightKg: 2.5, count: 2 },
			{ weightKg: 1.25, count: 2 },
		],
	}

	const belt = buildPlateLine({
		loadNumber: '31',
		inventory: beltGym,
		options: { kind: 'bodyweightPlus', ...athlete },
	})
	expect(belt).toMatchObject({
		kind: 'nearest',
		note: 'Your gym makes 31.25 kg, not 31 kg.',
	})

	const assist = buildPlateLine({
		loadNumber: '11',
		inventory: beltGym,
		options: { kind: 'assisted', ...athlete },
	})
	expect(assist).toMatchObject({
		kind: 'nearest',
		note: 'Your gym makes 11.25 kg, not 11 kg.',
	})

	// A per-hand bell states the bell in the hand, never the pair.
	const perHand = buildPlateLine({
		loadNumber: '22',
		inventory: { ...gym, fixedDumbbellsKg: [10, 15, 20, 25] },
		options: { kind: 'perSide' },
	})
	expect(perHand).toMatchObject({
		kind: 'nearest',
		note: 'Your gym makes 20 kg, not 22 kg.',
	})

	// And a barbell, where the two quantities coincide, is unchanged.
	expect(
		buildPlateLine({ loadNumber: '101', inventory: gym, options: {} }),
	).toMatchObject({ note: 'Your gym makes 100 kg, not 101 kg.' })
})

test('a machine level has no plates and no honest kilo, so it is given neither', () => {
	const line = buildPlateLine({
		loadNumber: '7',
		inventory: gym,
		options: { kind: 'stackLevel' },
	})

	expect(line).toEqual({
		kind: 'unavailable',
		note: 'A stack level has no kilos — this progresses against itself only.',
	})
})

test('a band and an unloaded hold refuse the same way', () => {
	expect(
		buildPlateLine({
			loadNumber: '1',
			inventory: gym,
			options: { kind: 'band' },
		}),
	).toMatchObject({ kind: 'unavailable' })
	expect(
		buildPlateLine({
			loadNumber: '1',
			inventory: gym,
			options: { kind: 'unloaded' },
		}),
	).toMatchObject({ kind: 'unavailable' })
})

// ——— What you lift next time —————————————————————————————————————————————

const names = { 'ex-squat': 'Back squat' }

test('an increment says which two numbers moved', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: 'barbell',
			kind: 'incremented',
			standsAtKg: 102.5,
			fromKg: 100,
			toKg: 102.5,
			reason: 'You made all 25 prescribed reps.',
			appliedAtISO: '2026-08-14T09:00:00.000Z',
		},
	]

	expect(buildOutcomePanel(outcomes, names)[0]).toMatchObject({
		headline: 'Back squat 100 kg → 102.5 kg',
		isNotice: false,
	})
})

test('a repeat states the Stall Count, and only where it is non-zero', () => {
	const repeat = (stallCount: number): LiftOutcome => ({
		exerciseId: 'ex-squat',
		equipment: null,
		kind: 'repeated',
		standsAtKg: 100,
		weightKg: 100,
		stallCount,
		reason: 'You came up short, so the weight repeats.',
		appliedAtISO: '2026-08-14T09:00:00.000Z',
	})

	expect(buildOutcomePanel([repeat(1)], names)[0]?.label).toBe('Stall Count 1')
	expect(buildOutcomePanel([repeat(0)], names)[0]?.label).toBeNull()
})

test('a lighter-than-prescribed session is a notice that names both weights, and neither credits nor blames', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'liftedLighter',
			standsAtKg: 62.5,
			prescribedKg: 62.5,
			loggedKg: 20,
			stallCount: 1,
			reason:
				'This session was logged at 20 kg, not the 62.5 kg 5×5 it prescribed.',
			appliedAtISO: '2026-08-14T09:00:00.000Z',
		},
	]

	const item = buildOutcomePanel(outcomes, names)[0]!
	expect(item.headline).toBe(
		'Back squat stays at 62.5 kg — logged at 20 kg, prescribed 62.5 kg',
	)
	// A notice, like a Stall Cut: it tells, and it offers nothing.
	expect(item.isNotice).toBe(true)
	expect(item.label).toBe('Lighter than prescribed')
})

test('a session with no kilos logged against a kilo prescription is a notice that claims neither', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'unverifiable',
			standsAtKg: 90,
			prescribedKg: 90,
			weightKg: 90,
			unreadableSetCount: 5,
			gradedSetCount: 5,
			loggedLoadKind: null,
			unreadableReason: 'noKiloLogged',
			stallCount: 0,
			reason:
				'All 5 sets record no kilos, and this lift was prescribed 90 kg for 5×5.',
			appliedAtISO: '2026-08-18T09:00:00.000Z',
		},
	]

	const item = buildOutcomePanel(outcomes, names)[0]!
	expect(item.headline).toBe(
		'Back squat stays at 90 kg — no kilos were logged, so the 90 kg prescribed could not be checked',
	)
	// A notice: it tells the athlete the session could not be read, and it offers
	// nothing — least of all a weight it cannot stand behind.
	expect(item.isNotice).toBe(true)
	expect(item.label).toBe('Could not be read')
})

test('a contradicted kilo is not headlined as a weight on the bar', () => {
	// The set really was logged as `external` — a weight on the bar — and its stored
	// kilo does not follow from that load. So the true kind is exactly what makes the
	// old headline a false claim: it named the kind, which reads as *"the number is
	// there, we just could not use it"*, about a number this engine refused to
	// believe. The engine's own `reason` has said the right thing all along.
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: 'barbell',
			kind: 'unverifiable',
			standsAtKg: 90,
			prescribedKg: 90,
			weightKg: 90,
			unreadableSetCount: 5,
			gradedSetCount: 5,
			loggedLoadKind: 'external',
			unreadableReason: 'kiloContradictsLoad',
			stallCount: 0,
			reason:
				'All 5 sets record a kilo that does not follow from the load recorded beside it — the two disagree, so the number cannot be believed.',
			appliedAtISO: '2026-08-19T09:00:00.000Z',
		},
	]

	const item = buildOutcomePanel(outcomes, names)[0]!
	expect(item.headline).toBe(
		'Back squat stays at 90 kg — every set recorded a kilo that does not follow from the load beside it, so the 90 kg prescribed could not be checked',
	)
	// The phrasing this family of bugs keeps producing: the true kind, carrying a
	// claim that is false.
	expect(item.headline).not.toContain('logged as a weight on the bar')
	expect(item.isNotice).toBe(true)
	expect(item.label).toBe('Could not be read')
})

test('some sets contradicting their load is counted rather than generalized', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: 'barbell',
			kind: 'unverifiable',
			standsAtKg: 90,
			prescribedKg: 90,
			weightKg: 90,
			unreadableSetCount: 2,
			gradedSetCount: 5,
			loggedLoadKind: 'external',
			unreadableReason: 'kiloContradictsLoad',
			stallCount: 0,
			reason: '2 of the 5 sets logged record a kilo that does not follow.',
			appliedAtISO: '2026-08-19T09:00:00.000Z',
		},
	]

	expect(buildOutcomePanel(outcomes, names)[0]!.headline).toBe(
		'Back squat stays at 90 kg — 2 of the 5 sets recorded a kilo that does not follow from the load beside it, so the 90 kg prescribed could not be checked',
	)
})

test('one weight is rendered the same way everywhere, and a 1.25 kg jump is never shown as 1.3', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'incremented',
			standsAtKg: 21.25,
			fromKg: 20,
			toKg: 21.25,
			reason: 'Every rep of every set at 20 kg.',
			appliedAtISO: '2026-08-14T09:00:00.000Z',
		},
	]

	expect(buildOutcomePanel(outcomes, names)[0]?.headline).toBe(
		'Back squat 20 kg → 21.25 kg',
	)
})

test('a Stall Cut is a notice with a reason, and it is labelled Stall Cut and never a deload', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'stalled',
			response: 'stallCut',
			moved: 'workingWeight',
			standsAtKg: 90,
			fromKg: 100,
			toKg: 90,
			reason: 'You missed this lift three sessions in a row.',
			appliedAtISO: '2026-08-14T09:00:00.000Z',
		},
	]

	const item = buildOutcomePanel(outcomes, names)[0]!
	expect(item.isNotice).toBe(true)
	expect(item.label).toBe('Stall Cut')
	expect(item.reason).toBe('You missed this lift three sessions in a row.')
	expect(item.headline).toBe('Back squat 100 kg → 90 kg')
	expect(JSON.stringify(item).toLowerCase()).not.toContain('deload')
})

test('a Stall Response that moved a training max says so, because a training max is not the squat', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'stalled',
			response: 'weightRollback',
			moved: 'trainingMax',
			// The working weight was untouched by a training-max response.
			standsAtKg: 100,
			fromKg: 130,
			toKg: 117,
			reason: 'Two cycles missed, so the training max comes back 10 %.',
			appliedAtISO: '2026-08-14T09:00:00.000Z',
		},
	]

	expect(buildOutcomePanel(outcomes, names)[0]?.headline).toBe(
		'Back squat training max 130 kg → 117 kg',
	)
})

test('a lift nobody logged is skipped, and is not reported as a failure', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'skipped',
			standsAtKg: 100,
			weightKg: 100,
			reason: 'No sets logged for this lift.',
			appliedAtISO: '2026-08-14T09:00:00.000Z',
		},
	]

	expect(buildOutcomePanel(outcomes, names)[0]).toMatchObject({
		headline: 'Back squat unchanged at 100 kg',
		isNotice: false,
	})
})

test('a sentence about where the lift now stands reads the lift state, never the stamp', () => {
	// Every member of the union, against one deliberately hostile fold: the lift
	// **stands at 77.5 kg** because the athlete saved that by hand, while the
	// session was stamped at 60 kg, logged at 50 kg and prescribed 60 kg. Any
	// headline saying "stays at"/"unchanged at" must name 77.5; no headline may
	// name 60 or 50 as the place the lift now is.
	const STANDS = 77.5
	const base = {
		exerciseId: 'ex-squat',
		equipment: null,
		standsAtKg: STANDS,
		reason: 'why',
		appliedAtISO: '2026-08-18T09:00:00.000Z',
	} as const
	const everyOutcome: LiftOutcome[] = [
		// Moves the weight: where it stands *is* the new number.
		{ ...base, standsAtKg: 62.5, kind: 'incremented', fromKg: 60, toKg: 62.5 },
		// Moves nothing.
		{ ...base, kind: 'repeated', weightKg: 60, stallCount: 1 },
		// Moves the working weight.
		{
			...base,
			standsAtKg: 54,
			kind: 'stalled',
			response: 'stallCut',
			moved: 'workingWeight',
			fromKg: 60,
			toKg: 54,
		},
		// Moves the **training max**, so the working weight is untouched.
		{
			...base,
			kind: 'stalled',
			response: 'anchorReEstimate',
			moved: 'trainingMax',
			fromKg: 130,
			toKg: 117,
		},
		{
			...base,
			kind: 'stallResponseUnavailable',
			response: 'weightRollback',
			weightKg: 60,
			stallCount: 3,
		},
		{
			...base,
			kind: 'unverifiable',
			prescribedKg: 60,
			weightKg: STANDS,
			unreadableSetCount: 5,
			gradedSetCount: 5,
			loggedLoadKind: null,
			unreadableReason: 'noKiloLogged',
			stallCount: 0,
		},
		{
			...base,
			kind: 'liftedLighter',
			prescribedKg: 60,
			loggedKg: 50,
			stallCount: 0,
		},
		{ ...base, kind: 'skipped', weightKg: STANDS },
	]
	// The union has seven members and every one of them is covered here — plus both
	// of `stalled`'s two `moved` axes, because they stand in different places. The
	// two that were reported were not the only two reading the wrong number.
	const kinds = new Set(everyOutcome.map((outcome) => outcome.kind))
	expect(kinds.size).toBe(7)

	const items = buildOutcomePanel(everyOutcome, names)
	for (const [index, item] of items.entries()) {
		const outcome = everyOutcome[index]!
		if (/stays at|unchanged at/.test(item.headline)) {
			// The one number allowed after those words.
			expect(item.headline).toMatch(
				new RegExp(`(stays|unchanged) at ${outcome.standsAtKg} kg`),
			)
		}
	}

	const headlines = items.map((item) => item.headline)
	// `repeated` used to print the stamp here and `liftedLighter` the
	// prescription — both under "stays at", about a lift standing somewhere else.
	expect(headlines[1]).toBe('Back squat stays at 77.5 kg')
	expect(headlines[4]).toBe('Back squat stays at 77.5 kg')
	expect(headlines[5]).toContain('Back squat stays at 77.5 kg')
	expect(headlines[6]).toBe(
		'Back squat stays at 77.5 kg — logged at 50 kg, prescribed 60 kg',
	)
	expect(headlines[7]).toBe('Back squat unchanged at 77.5 kg')
	// And the two that move say the number they moved to, which is the same thing
	// read from the same place.
	expect(headlines[0]).toBe('Back squat 60 kg → 62.5 kg')
	expect(headlines[2]).toBe('Back squat 60 kg → 54 kg')
	// A training max is not the squat, so this one says which number moved and
	// never claims the lift now stands there.
	expect(headlines[3]).toBe('Back squat training max 130 kg → 117 kg')
})

test('a session that logged kilos on some sets and none on others says how many, not that none were logged', () => {
	// Two sets at exactly 90 kg and three logged as a machine stack level, against
	// a 90 kg prescription. The verdict is right and the body was right — "3 of the
	// 5 sets logged record no kilos" — while the headline said "no kilos were
	// logged", which is false about the two that were.
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'unverifiable',
			standsAtKg: 90,
			prescribedKg: 90,
			weightKg: 90,
			unreadableSetCount: 3,
			gradedSetCount: 5,
			loggedLoadKind: null,
			unreadableReason: 'noKiloLogged',
			stallCount: 0,
			reason: '3 of the 5 sets logged record no kilos.',
			appliedAtISO: '2026-08-18T09:00:00.000Z',
		},
	]

	expect(buildOutcomePanel(outcomes, names)[0]?.headline).toBe(
		'Back squat stays at 90 kg — 3 of the 5 sets logged no kilos, so the 90 kg prescribed could not be checked',
	)
})

test('a session logged as a bodyweight load is not reported as no kilos, because a kilo was logged — of something else', () => {
	// The fourth disguise, on the panel. Five bodyweight sets against a 25 kg
	// barbell prescription: "no kilos were logged" would be false — 74 kg was
	// logged — and "74 kg → 77.5 kg" is what the app actually published. The
	// headline names the kind, and it reads the verdict's own `unreadableReason`
	// rather than deciding a second time in prose.
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'unverifiable',
			standsAtKg: 25,
			prescribedKg: 25,
			weightKg: 25,
			unreadableSetCount: 5,
			gradedSetCount: 5,
			loggedLoadKind: 'bodyweight',
			unreadableReason: 'bodyweightDerived',
			stallCount: 0,
			reason: 'All 5 sets were logged as a bodyweight load.',
			appliedAtISO: '2026-08-18T09:00:00.000Z',
		},
	]

	const item = buildOutcomePanel(outcomes, names)[0]!
	expect(item.headline).toBe(
		'Back squat stays at 25 kg — every set was logged as a bodyweight load, so the 25 kg prescribed could not be checked',
	)
	expect(item.headline).not.toContain('no kilos')
	// And it is a notice claiming nothing, with the weight it could not check
	// named and nothing offered.
	expect(item.isNotice).toBe(true)
	expect(item.label).toBe('Could not be read')
})

test('an assisted session says which kind was logged and how many sets it was', () => {
	const outcomes: LiftOutcome[] = [
		{
			exerciseId: 'ex-squat',
			equipment: null,
			kind: 'unverifiable',
			standsAtKg: 64,
			prescribedKg: 64,
			weightKg: 64,
			unreadableSetCount: 3,
			gradedSetCount: 5,
			loggedLoadKind: 'assisted',
			unreadableReason: 'assistInverted',
			stallCount: 0,
			reason: '3 of the 5 sets were logged as an assisted load.',
			appliedAtISO: '2026-08-18T09:00:00.000Z',
		},
	]

	expect(buildOutcomePanel(outcomes, names)[0]?.headline).toBe(
		'Back squat stays at 64 kg — 3 of the 5 sets were logged as an assisted load, so the 64 kg prescribed could not be checked',
	)
})

// ——— The record you just set —————————————————————————————————————————————

function strengthRecord(
	overrides: Partial<StrengthRecord> & Pick<StrengthRecord, 'kind'>,
): StrengthRecord {
	return {
		exerciseId: 'squat',
		equipment: 'barbell',
		loadBasis: 'bar',
		reps: null,
		value: 120,
		unit: 'kg',
		sessionId: 'session-1',
		achievedAt: new Date('2026-08-14T17:00:00Z'),
		previousValue: 110,
		delta: 10,
		crossExerciseComparable: true,
		unavailableNote: null,
		debut: false,
		estimator: null,
		...overrides,
	}
}

test('a set that took nothing has no banner, which is the ordinary answer', () => {
	expect(buildRecordBanner([])).toBeNull()
})

test('each reading the set took gets its own line, with the gain on the number', () => {
	const banner = buildRecordBanner([
		strengthRecord({ kind: 'heaviestLoad' }),
		strengthRecord({ kind: 'repMax', reps: 5 }),
	])

	expect(banner).toEqual({
		lines: [
			'Heaviest ever: 120 kg — up 10 kg',
			'Best 5-rep set: 120 kg — up 10 kg',
		],
		debut: false,
	})
})

test('the banner never announces a bodyweight-derived kilo as a heaviest ever', () => {
	// The observed line was "Heaviest ever: 104 kg — up 74 kg" fired by one
	// dip-belt row on a bench press whose heaviest bar was 30 kg. The banner is one
	// sentence long, so the basis has to be inside it.
	const banner = buildRecordBanner([
		strengthRecord({
			kind: 'heaviestLoad',
			loadBasis: 'bodyweightDerived',
			value: 104,
			previousValue: 94,
			delta: 10,
			crossExerciseComparable: false,
			unavailableNote:
				'Includes your bodyweight — this progresses against other bodyweight sets only.',
		}),
	])

	expect(banner?.lines[0]).toBe(
		'Heaviest bodyweight set: 104 kg — up 10 kg · Includes your bodyweight — this progresses against other bodyweight sets only.',
	)
	expect(banner?.lines[0]).not.toContain('Heaviest ever')
})

test('an estimated 1RM names the equation, because an estimate is a model and not a lift', () => {
	const banner = buildRecordBanner([
		strengthRecord({ kind: 'e1RM', estimator: 'epley' }),
	])

	expect(banner?.lines[0]).toContain('epley')
})

test('a debut says one thing and says first time, so day one does not fire four records', () => {
	const banner = buildRecordBanner([
		strengthRecord({
			kind: 'heaviestLoad',
			debut: true,
			previousValue: null,
			delta: null,
		}),
		strengthRecord({
			kind: 'repMax',
			reps: 5,
			debut: true,
			previousValue: null,
			delta: null,
		}),
		strengthRecord({
			kind: 'e1RM',
			debut: true,
			previousValue: null,
			delta: null,
		}),
	])

	expect(banner?.debut).toBe(true)
	expect(banner?.lines).toEqual(['Heaviest ever: 120 kg — first time!'])
})

test('a stack level reads in levels and says in one phrase that it cannot be compared', () => {
	const banner = buildRecordBanner([
		strengthRecord({
			kind: 'stackLevel',
			value: 7,
			unit: 'level',
			previousValue: 6,
			delta: 1,
			crossExerciseComparable: false,
			unavailableNote: 'No kilos — this progresses against itself only.',
		}),
	])

	expect(banner?.lines).toEqual([
		'Best level: 7 — up 1 level · No kilos — this progresses against itself only.',
	])
	expect(banner?.lines[0]).not.toMatch(/kg/)
})

// ——— The tap-to-log grid ——————————————————————————————————————————————————

function exercise(overrides: Partial<LogExercise> = {}): LogExercise {
	return {
		stepId: 'step-1',
		exerciseId: 'ex-1',
		name: 'Squat',
		restBetweenSetsSec: 180,
		unilateral: null,
		loadSemanticsKind: null,
		rows: [
			row({ orderIndex: 0 }),
			row({ orderIndex: 1 }),
			row({ orderIndex: 2 }),
			row({ orderIndex: 3 }),
			row({ orderIndex: 4 }),
		],
		warmupRows: [],
		warmupUnavailable: null,
		plateContext: null,
		...overrides,
	}
}

const resolvedTo = (kg: number): LogRow['resolvedLoad'] => ({
	kind: 'resolved',
	kg,
	kgMax: null,
	basis: {
		construct: 'authored',
		protocol: null,
		confidence: null,
		anchorValueKg: null,
		anchorReps: null,
		effectiveAtISO: null,
		text: 'as prescribed',
	},
})

function circles(
	overrides: Partial<LogExercise> = {},
	logged: Record<string, number> = {},
) {
	const lift = exercise(overrides)
	return buildSetCircles({
		liftName: lift.name,
		stepId: lift.stepId,
		rows: lift.rows,
		logged,
	})
}

test('an untouched circle shows the target reps and asks to be tapped', () => {
	const [first] = circles()

	expect(first?.state).toBe('untouched')
	expect(first?.display).toBe('5')
	expect(first?.ariaLabel).toBe('Log set 1 of Squat')
})

test('a set logged at its target reads as made, and says so to a screen reader', () => {
	const [, second] = circles({}, { step_unused: 0, 'step-1_1': 5 })

	expect(second?.state).toBe('made')
	expect(second?.display).toBe('5')
	expect(second?.ariaLabel).toBe('Logged set 2 of Squat')
})

test('a set under its target is short, and shows the count achieved rather than the target', () => {
	const [, , third] = circles({}, { 'step-1_2': 3 })

	expect(third?.state).toBe('short')
	expect(third?.display).toBe('3')
	expect(third?.ariaLabel).toBe('Logged set 3 of Squat')
})

test('zero reps is a short set and not an untouched one, because a tap happened', () => {
	const [first] = circles({}, { 'step-1_0': 0 })

	expect(first?.state).toBe('short')
	expect(first?.display).toBe('0')
	expect(first?.ariaLabel).toBe('Logged set 1 of Squat')
})

test('a set with no prescribed count shows no number, because a zero there is a target nobody set', () => {
	const [first] = circles({
		rows: [row({ orderIndex: 0, prescribedReps: null })],
	})

	expect(first?.display).toBe('—')
	expect(first?.target).toBeNull()
	expect(first?.tappable).toBe(false)
})

test('a timed hold counts in seconds and does not count down, because thirty taps is not a control', () => {
	const [first] = circles({
		rows: [
			row({ orderIndex: 0, prescribedReps: null, prescribedDurationSec: 45 }),
		],
	})

	expect(first?.quantity).toBe('durationSec')
	expect(first?.countsDown).toBe(false)
	expect(first?.display).toBe('45')
})

test('re-tapping a set logged as a warm-up keeps it a warm-up, and never restates what kind of set it was', () => {
	const [first] = circles({
		rows: [
			row({
				orderIndex: 0,
				logged: {
					id: 'log-1',
					role: 'warmup',
					outcome: 'completed',
					toFailure: false,
					load: { kind: 'external', kg: 60 },
					effectiveKg: 60,
					reps: 5,
					repsLeft: null,
					durationSec: null,
					rir: null,
					restTakenSec: null,
				},
			}),
		],
	})

	expect(first?.role).toBe('warmup')
})

// ——— The tap cycle ———————————————————————————————————————————————————————

test('the first tap logs the full target, because the common case must cost one action', () => {
	expect(nextSetReps(null, 5)).toBe(5)
})

test('each further tap counts the reps down to zero, and the tap past zero clears the set', () => {
	expect(nextSetReps(5, 5)).toBe(4)
	expect(nextSetReps(4, 5)).toBe(3)
	expect(nextSetReps(3, 5)).toBe(2)
	expect(nextSetReps(2, 5)).toBe(1)
	expect(nextSetReps(1, 5)).toBe(0)
	expect(nextSetReps(0, 5)).toBe('cleared')
})

test('the cycle comes back round: a cleared set opens on its target again', () => {
	const cycle: (number | 'cleared')[] = []
	let current: number | null = null
	for (let tap = 0; tap < 7; tap++) {
		const next = nextSetReps(current, 3)
		cycle.push(next)
		current = next === 'cleared' ? null : next
	}

	expect(cycle).toEqual([3, 2, 1, 0, 'cleared', 3, 2])
})

test('a count above the target steps down from the target, so the cycle cannot strand a thumb', () => {
	// A set logged at 12 against a target of 5 — an AMRAP, or a target that moved
	// under a set already logged. Twelve taps to clear it is not a control.
	expect(nextSetReps(12, 5)).toBe(4)
})

// ——— The counter ——————————————————————————————————————————————————————————

test('the counter reflects the working sets logged', () => {
	expect(buildLoggedCounter(circles())).toBe('0 of 5 logged')
	expect(
		buildLoggedCounter(circles({}, { 'step-1_0': 5, 'step-1_1': 4 })),
	).toBe('2 of 5 logged')
})

test('the counter counts a short set as logged, because it is a set that happened', () => {
	expect(buildLoggedCounter(circles({}, { 'step-1_0': 0 }))).toBe(
		'1 of 5 logged',
	)
})

test('warm-up rungs are not working sets and cannot inflate the count', () => {
	const lift = exercise({
		warmupRows: [
			row({ orderIndex: 1000, prescribedReps: 5 }),
			row({ orderIndex: 1001, prescribedReps: 5 }),
		],
	})

	expect(
		countLoggedWorkingSets([lift], {
			'step-1_1000': 5,
			'step-1_1001': 5,
			'step-1_0': 5,
		}),
	).toBe(1)
})

// ——— What a tap posts ————————————————————————————————————————————————————

test('the weight a tap posts is the one the program resolved, in the load’s own semantics', () => {
	const load = buildWorkingLoad(
		exercise({
			rows: [row({ prescribedLoad: null, resolvedLoad: resolvedTo(82.5) })],
		}),
	)

	expect(load).toMatchObject({
		kind: 'resolved',
		loadKind: 'external',
		loadNumber: '82.5',
		text: '82.5 kg',
	})
})

test('a percentage-derived kilo posts as a number the athlete could have typed', () => {
	// `0.85 × 140` is not 119 in binary, and seventeen digits is not a weight.
	const load = buildWorkingLoad(
		exercise({
			rows: [
				row({
					prescribedLoad: { kind: 'pct1RM', minPct: 85 },
					resolvedLoad: resolvedTo(0.85 * 140),
				}),
			],
		}),
	)

	expect(load).toMatchObject({ loadNumber: '119' })
})

test('an unresolved percentage is an absence with its fix, never a number and never a zero', () => {
	const load = buildWorkingLoad(
		exercise({
			rows: [
				row({
					prescribedLoad: { kind: 'pct1RM', minPct: 85 },
					resolvedLoad: {
						kind: 'unavailable',
						reason: 'no-anchor',
						authored: { kind: 'pct1RM', minPct: 85 },
						text: 'no 1RM on file for this lift',
						fix: 'Record a 1RM for this lift.',
					},
				}),
			],
		}),
	)

	expect(load).toEqual({
		kind: 'absent',
		text: 'no 1RM on file for this lift',
		fix: 'Record a 1RM for this lift.',
	})
	expect(
		buildLiftSubline(
			exercise({
				rows: [
					row({
						prescribedLoad: { kind: 'pct1RM', minPct: 85 },
						resolvedLoad: {
							kind: 'unavailable',
							reason: 'no-anchor',
							authored: { kind: 'pct1RM', minPct: 85 },
							text: 'no 1RM on file for this lift',
							fix: 'Record a 1RM for this lift.',
						},
					}),
				],
			}),
		),
	).toBe('1×5 · no 1RM on file for this lift')
})

test('a bodyweight lift posts bodyweight, and one with a belt posts what goes on the belt', () => {
	expect(
		buildWorkingLoad(
			exercise({ rows: [row({ prescribedLoad: { kind: 'bodyweight' } })] }),
		),
	).toMatchObject({
		loadKind: 'bodyweight',
		loadNumber: '',
		text: 'bodyweight',
	})

	expect(
		buildWorkingLoad(
			exercise({
				rows: [row({ prescribedLoad: { kind: 'bodyweight', addedKg: 15 } })],
			}),
		),
	).toMatchObject({
		loadKind: 'bodyweightPlus',
		loadNumber: '15',
		text: 'bodyweight + 15 kg',
	})
})

test('a lift whose load is a machine level cannot be tapped, and the card says so in the program’s own words', () => {
	const load = buildWorkingLoad(
		exercise({
			loadSemanticsKind: 'stackLevel',
			rows: [row({ prescribedLoad: { kind: 'absolute', kg: 7 } })],
		}),
	)

	expect(load).toEqual({
		kind: 'absent',
		text: 'a machine stack level cannot be logged by tapping',
		fix: null,
	})
})

test('a lift with no load prescribed at all says so, rather than tapping a kilo into existence', () => {
	expect(
		buildWorkingLoad(
			exercise({ rows: [row({ prescribedLoad: null, resolvedLoad: null })] }),
		),
	).toEqual({
		kind: 'absent',
		text: 'no load is prescribed for this lift, and a tap cannot invent one',
		fix: null,
	})
})

test('a lift the corpus states is unloaded is loggable, because its kind carries no number', () => {
	expect(
		buildWorkingLoad(
			exercise({
				loadSemanticsKind: 'unloaded',
				rows: [row({ prescribedLoad: null, resolvedLoad: null })],
			}),
		),
	).toMatchObject({ loadKind: 'unloaded', loadNumber: '', text: 'no load' })
})

// ——— The sub-line ————————————————————————————————————————————————————————

test('the sub-line is the scheme and the resolved weight, in that order', () => {
	expect(
		buildLiftSubline(
			exercise({
				rows: [0, 1, 2, 3, 4].map((orderIndex) =>
					row({
						orderIndex,
						prescribedLoad: null,
						resolvedLoad: resolvedTo(82.5),
					}),
				),
			}),
		),
	).toBe('5×5 · 82.5 kg')
})

test('sets that ask for different counts read as a count of sets, never as a scheme that is not one', () => {
	expect(
		buildLiftScheme([
			row({ orderIndex: 0, prescribedReps: 5 }),
			row({ orderIndex: 1, prescribedReps: 3 }),
		]),
	).toBe('2 sets')
})

test('a timed hold’s scheme counts in seconds', () => {
	expect(
		buildLiftScheme([
			row({ orderIndex: 0, prescribedReps: null, prescribedDurationSec: 45 }),
			row({ orderIndex: 1, prescribedReps: null, prescribedDurationSec: 45 }),
		]),
	).toBe('2×45 s')
})

// ——— The logged map ———————————————————————————————————————————————————————

test('a reopened session comes back with its circles filled from what was logged', () => {
	const lift = exercise({
		rows: [
			row({
				orderIndex: 0,
				logged: {
					id: 'log-1',
					role: 'working',
					outcome: 'completed',
					toFailure: false,
					load: { kind: 'external', kg: 82.5 },
					effectiveKg: 82.5,
					reps: 4,
					repsLeft: null,
					durationSec: null,
					rir: null,
					restTakenSec: null,
				},
			}),
			row({ orderIndex: 1 }),
		],
	})

	expect(buildRunnerLog([lift])).toEqual({ 'step-1_0': 4 })
})

test('an abandoned set comes back as a short set, because the grid has no third colour for a racked one', () => {
	const lift = exercise({
		rows: [
			row({
				orderIndex: 0,
				logged: {
					id: 'log-1',
					role: 'working',
					outcome: 'abandoned',
					toFailure: false,
					load: { kind: 'external', kg: 82.5 },
					effectiveKg: 82.5,
					reps: null,
					repsLeft: null,
					durationSec: null,
					rir: null,
					restTakenSec: null,
				},
			}),
		],
	})

	expect(buildRunnerLog([lift])).toEqual({ 'step-1_0': 0 })
})

// ——— The warm-up chips ————————————————————————————————————————————————————

test('a rung is one chip, labelled with its weight and its reps', () => {
	const chips = buildWarmupChips({
		liftName: 'Squat',
		stepId: 'step-1',
		rows: [
			row({
				orderIndex: 1000,
				prescribedReps: 5,
				warmupRung: { targetKg: 20, effectiveKg: 20, plateLine: 'empty bar' },
			}),
			row({
				orderIndex: 1001,
				prescribedReps: 3,
				warmupRung: { targetKg: 60, effectiveKg: 60, plateLine: '20' },
			}),
		],
		logged: { 'step-1_1000': 5 },
	})

	expect(chips[0]).toMatchObject({
		label: '20 × 5',
		on: true,
		isLast: false,
		loadKind: 'external',
		loadNumber: '20',
		ariaLabel: 'Logged warm-up 1 of Squat, 20 × 5',
	})
	expect(chips[1]).toMatchObject({
		label: '60 × 3',
		on: false,
		isLast: true,
		ariaLabel: 'Log warm-up 2 of Squat, 60 × 3',
	})
})

test('a rung of a bodyweight-derived ramp names its base and never the athlete’s own kilos', () => {
	const [base, belt] = buildWarmupChips({
		liftName: 'Dip',
		stepId: 'step-1',
		rows: [
			row({
				orderIndex: 1000,
				prescribedReps: 5,
				warmupRung: { targetKg: 0, effectiveKg: 84, plateLine: '' },
			}),
			row({
				orderIndex: 1001,
				prescribedReps: 3,
				warmupRung: { targetKg: 15, effectiveKg: 99, plateLine: '' },
			}),
		],
		logged: {},
	})

	expect(base).toMatchObject({
		label: 'bw × 5',
		loadKind: 'bodyweight',
		loadNumber: '',
	})
	expect(belt).toMatchObject({
		label: 'bw + 15 × 3',
		loadKind: 'bodyweightPlus',
		loadNumber: '15',
	})
})
