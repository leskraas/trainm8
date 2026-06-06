import { expect, test } from 'vitest'
import { type DisciplineProfileForResolver } from '#app/utils/zones/resolve.ts'
import { buildPlanPreview } from './preview.ts'
import { type ScheduledSession } from './schedule.ts'
import { type GeneratedPlan } from './schema.ts'

const outline: GeneratedPlan['outline'] = {
	phases: [{ name: 'Base', weeks: 4, focus: 'Aerobic base', weeklyLoadHours: 6 }],
}

function scheduled(intensityLabel?: string): ScheduledSession {
	return {
		weekIndex: 0,
		orderInWeek: 0,
		title: 'Run',
		discipline: 'run',
		intent: 'endurance',
		scheduledAt: new Date('2026-06-01T18:00:00.000Z'),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'run',
						...(intensityLabel
							? { intensity: { kind: 'zoneLabel' as const, label: intensityLabel } }
							: {}),
						durationSec: 2700,
					},
				],
			},
		],
	}
}

const runProfileWithThreshold: DisciplineProfileForResolver = {
	lthr: 162,
	maxHr: 185,
	ftp: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: 'friel-hr-5-run',
	zoneOverrides: null,
}

const emptyProfile: DisciplineProfileForResolver = {
	lthr: null,
	maxHr: null,
	ftp: null,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
	zoneSystem: null,
	zoneOverrides: null,
}

test('zone-label intensity resolves to concrete ranges when thresholds exist', () => {
	const preview = buildPlanPreview(outline, [scheduled('Z4')], { run: runProfileWithThreshold })
	const step = preview.sessions[0]!.blocks[0]!.steps[0]!

	expect(step.kind).toBe('cardio')
	if (step.kind === 'cardio') {
		// friel-hr-5-run Z4 = 0.95..0.99 of LTHR 162 → 154..160.
		expect(step.resolvedIntensity).toEqual({ hrMin: 154, hrMax: 160 })
	}
})

test('zone-label stays unresolved (unavailable) without thresholds', () => {
	const preview = buildPlanPreview(outline, [scheduled('Z4')], { run: emptyProfile })
	const step = preview.sessions[0]!.blocks[0]!.steps[0]!

	if (step.kind === 'cardio') {
		expect(step.resolvedIntensity?.unavailable).toBeTruthy()
		expect(step.resolvedIntensity?.hrMin).toBeUndefined()
	}
})

test('the zone label survives onto the preview step', () => {
	const preview = buildPlanPreview(outline, [scheduled('Z2')], { run: runProfileWithThreshold })
	const step = preview.sessions[0]!.blocks[0]!.steps[0]!

	if (step.kind === 'cardio') {
		expect(step.intensity).toEqual({ kind: 'zoneLabel', label: 'Z2' })
	}
})

test('cardio step without intensity has no resolved ranges', () => {
	const preview = buildPlanPreview(outline, [scheduled()], { run: runProfileWithThreshold })
	const step = preview.sessions[0]!.blocks[0]!.steps[0]!

	if (step.kind === 'cardio') {
		expect(step.resolvedIntensity).toBeUndefined()
	}
})

test('the outline passes through unchanged', () => {
	const preview = buildPlanPreview(outline, [scheduled('Z2')], { run: runProfileWithThreshold })
	expect(preview.outline).toEqual(outline)
})
