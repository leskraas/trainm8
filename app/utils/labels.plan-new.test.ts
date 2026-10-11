import { expect, test } from 'vitest'
import {
	nbAuthoringMessage,
	nbConventionCitation,
	PLAN_SHAPE_STEP_LABELS,
} from './labels.ts'
import {
	MAX_PLAN_WEEKS,
	PlanOutlineCreateSchema,
	WeekKeySchema,
} from './plan-outline/authoring-schema.ts'
import {
	EASY_PACE_RATIO_CITATION,
	MINUTES_IN_ZONE_CITATION,
} from './plan-outline/volume-conversion.ts'

test('every convention citation the season chart can show has Norwegian words, and the source stays English', () => {
	const citations = [
		...Object.values(EASY_PACE_RATIO_CITATION),
		MINUTES_IN_ZONE_CITATION,
	]
	for (const citation of citations) {
		const shown = nbConventionCitation(citation)
		expect(shown).not.toBe(citation)
		// The figures survive the translation, with the Norwegian decimal comma.
		expect(shown).not.toMatch(/\d\.\d/)
	}
	expect(EASY_PACE_RATIO_CITATION.run).toMatch(/^Daniels' published VDOT/)
	expect(nbConventionCitation(EASY_PACE_RATIO_CITATION.run)).toMatch(
		/^Daniels’ publiserte VDOT-tabell/,
	)
	// One the lookup does not know passes through rather than vanishing.
	expect(nbConventionCitation('Somebody 2031')).toBe('Somebody 2031')
})

test('the authoring schema’s messages reach the creation flow in Norwegian', () => {
	const monday = WeekKeySchema.safeParse('2030-01-08')
	expect(monday.success).toBe(false)
	expect(nbAuthoringMessage(monday.error!.issues[0]!.message)).toBe(
		'En treningsuke starter på en mandag',
	)

	const tooLong = PlanOutlineCreateSchema.safeParse({
		startWeekKey: '2030-01-07',
		structure: { phases: [{ name: '', weeks: MAX_PLAN_WEEKS + 1 }] },
		tracks: [
			{ discipline: 'run', currency: 'km', anchorValue: 0 },
			{ discipline: 'run', currency: 'sets', anchorValue: 10 },
		],
	})
	expect(tooLong.success).toBe(false)
	for (const issue of tooLong.error!.issues) {
		// Zod's own generic messages are not the schema's; every one the schema
		// writes itself has its Norwegian words.
		if (/^(Number|String) must/.test(issue.message)) continue
		expect(nbAuthoringMessage(issue.message)).not.toBe(issue.message)
	}
})

test('the shape step says where a shape lands, and what fitting it would cost, in Norwegian', () => {
	const L = PLAN_SHAPE_STEP_LABELS
	expect(L.runsPast(1)).toBe('går 1 uke forbi løpet')
	expect(L.endsBefore(3)).toBe('slutter 3 uker før løpet')
	expect(
		L.fitWould(false, [
			L.fitChange('Grunntrening', 7),
			L.fitChange('Oppbygging', 2),
		]),
	).toBe(
		'å tilpasse den korter ned Grunntrening med 7 uker og Oppbygging med 2 uker',
	)
	expect(L.fitWould(true, [L.fitChange('Grunntrening', 1)])).toBe(
		'å tilpasse den forlenger Grunntrening med 1 uke',
	)
	expect(L.multiTrack(['svømming', 'sykling', 'løping'])).toMatch(
		/^Løpet ditt har svømming, sykling og løping,/,
	)
	expect(L.weekOption(2, '7. jan 2030', true)).toBe(
		'Uke 2 · 7. jan 2030 · denne uka',
	)
})
