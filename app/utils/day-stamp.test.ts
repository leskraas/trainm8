import { expect, test } from 'vitest'
import {
	buildDayStamp,
	isStampableDiscipline,
	STAMP_DURATION_SEC,
	STAMP_SENTENCE,
	STAMP_ZONE_LABEL,
} from './day-stamp.ts'
import { WorkoutAuthoringSchema } from './workout-schema.ts'

const AT = new Date('2026-08-23T05:00:00.000Z')

test('the stamp is a real prescription, not a title with nothing under it', () => {
	// The whole reason for stamping rather than typing a name: one step, a
	// duration and an intensity, so the session has a shape, expandable steps and
	// a Planned TSS from the first tap (ADR 0065 §5).
	const stamp = buildDayStamp({ discipline: 'bike', scheduledAt: AT })

	expect(stamp.blocks).toHaveLength(1)
	expect(stamp.blocks[0]!.steps).toEqual([
		{
			kind: 'cardio',
			discipline: 'bike',
			durationSec: STAMP_DURATION_SEC,
			intensity: { kind: 'zoneLabel', label: STAMP_ZONE_LABEL },
		},
	])
})

test('it validates as the very same authoring input the full route posts', () => {
	// Which is what makes a session authored from a cell indistinguishable from
	// one authored on the full route: same shape, same schema, same create.
	for (const discipline of ['run', 'bike', 'swim'] as const) {
		const parsed = WorkoutAuthoringSchema.safeParse(
			buildDayStamp({ discipline, scheduledAt: AT }),
		)
		expect(parsed.success).toBe(true)
	}
})

test('the title is derived from the structure, never typed and never invented', () => {
	expect(buildDayStamp({ discipline: 'run', scheduledAt: AT }).title).toBe(
		STAMP_SENTENCE,
	)
})

test('strength is not stampable — a lifting session has to name a lift', () => {
	// So the cell hands strength to the full route (the More escape) rather than
	// writing a half-made session the schema would refuse anyway.
	expect(isStampableDiscipline('run')).toBe(true)
	expect(isStampableDiscipline('bike')).toBe(true)
	expect(isStampableDiscipline('swim')).toBe(true)
	expect(isStampableDiscipline('strength')).toBe(false)
})
