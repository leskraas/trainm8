/**
 * The intensity draft codec: complete drafts serialize to the canonical
 * IntensityTarget JSON the server accepts; incomplete drafts serialize to a
 * kind-tagged draft JSON that fails the target schema (so validation catches
 * it) but round-trips the raw input strings; legacy plain zone labels parse.
 */
import { describe, expect, test } from 'vitest'
import { parseAuthoredIntensity } from '#app/utils/intensity-target.ts'
import { IntensityTargetSchema } from '#app/utils/workout-schema.ts'
import {
	draftTarget,
	emptyIntensityDraft,
	parseIntensityDraft,
	serializeIntensityDraft,
	type IntensityDraft,
} from './__intensity-editor.tsx'

function draft(fields: Partial<IntensityDraft>): IntensityDraft {
	return { ...emptyIntensityDraft, ...fields }
}

describe('complete drafts serialize as canonical IntensityTarget JSON', () => {
	test.each<[Partial<IntensityDraft>, unknown]>([
		[
			{ kind: 'zoneLabel', zoneLabel: 'Z2' },
			{ kind: 'zoneLabel', label: 'Z2' },
		],
		[{ kind: 'rpe', rpeMin: '6' }, { kind: 'rpe', min: 6 }],
		[
			{ kind: 'rpe', rpeMin: '6', rpeMax: '7.5' },
			{ kind: 'rpe', min: 6, max: 7.5 },
		],
		[
			{ kind: 'hrBpm', hrBpmMin: '150', hrBpmMax: '160' },
			{ kind: 'hrBpm', min: 150, max: 160 },
		],
		[
			{ kind: 'hrPct', hrPctRef: 'max', hrPctMin: '80', hrPctMax: '90' },
			{ kind: 'hrPct', ref: 'max', minPct: 80, maxPct: 90 },
		],
		[
			{ kind: 'power', powerMin: '220', powerMax: '250' },
			{ kind: 'power', minW: 220, maxW: 250 },
		],
		[
			{ kind: 'powerPct', powerPctMin: '95', powerPctMax: '105' },
			{ kind: 'powerPct', minPct: 95, maxPct: 105 },
		],
		[
			{ kind: 'pace', paceMin: '4:40', paceMax: '4:50' },
			{ kind: 'pace', minSecPerKm: 280, maxSecPerKm: 290 },
		],
	])('serializes %o', (fields, expected) => {
		const serialized = serializeIntensityDraft(draft(fields))
		const parsed = JSON.parse(serialized)
		expect(parsed).toEqual(expected)
		// …and it is exactly what the server-side schema accepts.
		expect(IntensityTargetSchema.safeParse(parsed).success).toBe(true)
		// …and parsing the value back restores an equivalent draft.
		expect(draftTarget(parseIntensityDraft(serialized))).toEqual(expected)
	})
})

test('no kind serializes as the empty string (no intensity)', () => {
	expect(serializeIntensityDraft(draft({}))).toBe('')
})

describe('incomplete drafts are never a valid target', () => {
	test.each<Partial<IntensityDraft>>([
		{ kind: 'pace' }, // kind picked, no value yet
		{ kind: 'pace', paceMin: '4:4' }, // half-typed clock
		{ kind: 'rpe', rpeMin: '15' }, // out of the schema's 1–10 range
		{ kind: 'hrBpm', hrBpmMin: '150', hrBpmMax: 'abc' }, // bad optional max
		{ kind: 'zoneLabel' }, // no zone picked
	])('%o serializes to draft JSON that fails validation', (fields) => {
		const serialized = serializeIntensityDraft(draft(fields))
		expect(serialized).not.toBe('')
		// The authored-intensity parser rejects it → the form schema errors
		// instead of silently dropping it, and the notation renders a
		// placeholder token, never a fabricated value.
		expect(parseAuthoredIntensity(serialized)).toBeNull()
	})

	test('raw input strings round-trip through the draft JSON', () => {
		const before = draft({ kind: 'pace', paceMin: '4:4' })
		const restored = parseIntensityDraft(serializeIntensityDraft(before))
		expect(restored.kind).toBe('pace')
		expect(restored.paceMin).toBe('4:4')
	})

	test('the hrPct reference survives an incomplete round-trip', () => {
		const before = draft({ kind: 'hrPct', hrPctRef: 'max' })
		const restored = parseIntensityDraft(serializeIntensityDraft(before))
		expect(restored.hrPctRef).toBe('max')
	})
})

describe('parseIntensityDraft', () => {
	test('reads canonical target JSON, formatting pace as m:ss', () => {
		const restored = parseIntensityDraft(
			'{"kind":"pace","minSecPerKm":280,"maxSecPerKm":290}',
		)
		expect(restored.kind).toBe('pace')
		expect(restored.paceMin).toBe('4:40')
		expect(restored.paceMax).toBe('4:50')
	})

	test('reads a legacy plain zone-label string', () => {
		expect(parseIntensityDraft('endurance')).toEqual(
			draft({ kind: 'zoneLabel', zoneLabel: 'endurance' }),
		)
	})

	test('is the empty draft for blank or unrecognizable values', () => {
		expect(parseIntensityDraft('')).toEqual(emptyIntensityDraft)
		expect(parseIntensityDraft(undefined)).toEqual(emptyIntensityDraft)
		expect(parseIntensityDraft('{"kind":"nope"}')).toEqual(emptyIntensityDraft)
		expect(parseIntensityDraft('[1,2]')).toEqual(emptyIntensityDraft)
	})
})
