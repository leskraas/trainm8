/**
 * @vitest-environment jsdom
 *
 * The telemetry card's planned bands: what it draws for a target with no top,
 * and that a plan with thousands of reps draws a bounded number of marks.
 */
import { render } from '@testing-library/react'
import { type ComponentProps } from 'react'
import { expect, test } from 'vitest'
import { type ActivityStream } from '#app/utils/activity-stream.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import TelemetryOverlay from './__workout-detail-telemetry.tsx'

type Workout = NonNullable<ComponentProps<typeof TelemetryOverlay>['workout']>

const thresholds: DisciplineThresholdMap = {
	run: {
		lthr: 172,
		maxHr: 195,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: 240,
		cssSecPer100m: null,
		zoneSystem: 'friel-hr-5-run',
		zoneOverrides: null,
	},
}

const zone = (label: string) => JSON.stringify({ kind: 'zoneLabel', label })

function workout(
	blocks: Array<{
		repeatCount: number
		seriesRepeatCount?: number
		steps: Array<{ kind: string; durationSec: number; intensity?: string }>
	}>,
): Workout {
	return {
		discipline: 'run',
		intent: null,
		blocks: blocks.map((b, bi) => ({
			id: `b${bi}`,
			orderIndex: bi,
			repeatCount: b.repeatCount,
			seriesRepeatCount: b.seriesRepeatCount ?? null,
			steps: b.steps.map((s, si) => ({
				id: `b${bi}s${si}`,
				orderIndex: si,
				discipline: null,
				distanceM: null,
				intensity: null,
				...s,
			})),
		})),
	} as unknown as Workout
}

function hrStream(totalSec: number): ActivityStream {
	const timeSec = Array.from({ length: 61 }, (_, i) => (i * totalSec) / 60)
	return {
		resolutionSec: totalSec / 60,
		timeSec,
		heartrate: timeSec.map((_, i) => 150 + (i % 30)),
	}
}

const bandRects = () =>
	Array.from(document.querySelectorAll('rect[data-planned-band]'))

test('an open-ended zone draws an "above" band to the top of the chart and says so', () => {
	// friel-hr-5-run Z5 is LTHR and up: a floor, no ceiling.
	render(
		<TelemetryOverlay
			stream={hrStream(600)}
			workout={workout([
				{
					repeatCount: 1,
					steps: [{ kind: 'cardio', durationSec: 600, intensity: zone('Z5') }],
				},
			])}
			thresholds={thresholds}
		/>,
	)

	const [band, ...rest] = bandRects()
	expect(rest).toHaveLength(0)
	expect(Number(band!.getAttribute('height'))).toBeGreaterThan(0)
	// The chart's top padding: the band reaches the top of the plot.
	expect(Number(band!.getAttribute('y'))).toBe(14)
	const card = document.querySelector('[data-telemetry-card]')!
	expect(card.textContent).not.toContain('172–172')
	expect(card.textContent).toContain('Planlagt puls: over 172 slag/min.')
})

test('an open-ended band fades out toward the top, so it reads as open above', () => {
	render(
		<TelemetryOverlay
			stream={hrStream(600)}
			workout={workout([
				{
					repeatCount: 1,
					steps: [{ kind: 'cardio', durationSec: 600, intensity: zone('Z5') }],
				},
			])}
			thresholds={thresholds}
		/>,
	)

	const [band] = bandRects()
	const fill = band!.getAttribute('fill') ?? ''
	const id = /^url\(#(.+)\)$/.exec(fill)?.[1]
	expect(id).toBeTruthy()
	const gradient = document.getElementById(id!)!
	expect(gradient.tagName.toLowerCase()).toBe('lineargradient')
	// Bottom to top: as strong as a bounded band's fill at the floor, gone at
	// the top, in the primary token so it follows the theme.
	expect(gradient.getAttribute('y1')).toBe('1')
	expect(gradient.getAttribute('y2')).toBe('0')
	const stops = Array.from(gradient.querySelectorAll('stop'))
	expect(stops.map((s) => s.getAttribute('stop-opacity'))).toEqual([
		'0.15',
		'0',
	])
	for (const stop of stops) {
		expect(stop.style.stopColor).toBe('var(--primary)')
	}
})

test('a hundred series of a hundred reps draw a bounded number of bands', () => {
	// `100x100x10 s` at Z4: one target the whole block, so one band.
	render(
		<TelemetryOverlay
			stream={hrStream(100_000)}
			workout={workout([
				{
					repeatCount: 100,
					seriesRepeatCount: 100,
					steps: [{ kind: 'cardio', durationSec: 10, intensity: zone('Z4') }],
				},
			])}
			thresholds={thresholds}
		/>,
	)
	expect(bandRects()).toHaveLength(1)
})

test('ten thousand reps alternating work and rest stay bounded, and the rests stay unpainted', () => {
	render(
		<TelemetryOverlay
			stream={hrStream(200_000)}
			workout={workout([
				{
					repeatCount: 100,
					seriesRepeatCount: 100,
					steps: [
						{ kind: 'cardio', durationSec: 10, intensity: zone('Z5') },
						{ kind: 'rest', durationSec: 10 },
					],
				},
			])}
			thresholds={thresholds}
		/>,
	)
	// Thinned to the reps that fit, as the Workout Shape thins them: a band per
	// drawn work rep, and the rest between them left bare, never one band
	// across the block in the work target.
	const bands = bandRects()
	expect(bands.length).toBeGreaterThan(1)
	expect(bands.length).toBeLessThanOrEqual(400)
	const covered = bands.reduce(
		(sum, b) => sum + Number(b.getAttribute('width')),
		0,
	)
	const plot = bands.at(-1)!
	const plotRight =
		Number(plot.getAttribute('x')) + Number(plot.getAttribute('width'))
	const plotLeft = Number(bands[0]!.getAttribute('x'))
	expect(covered / (plotRight - plotLeft)).toBeCloseTo(0.5, 1)
})

test("a dense block's recoveries are drawn in their own target, not the work's", () => {
	render(
		<TelemetryOverlay
			stream={hrStream(200_000)}
			workout={workout([
				{
					repeatCount: 100,
					seriesRepeatCount: 100,
					steps: [
						{ kind: 'cardio', durationSec: 10, intensity: zone('Z4') },
						{ kind: 'cardio', durationSec: 10, intensity: zone('Z2') },
					],
				},
			])}
			thresholds={thresholds}
		/>,
	)
	const tops = new Set(bandRects().map((b) => b.getAttribute('y')))
	expect(tops.size).toBe(2)
	const card = document.querySelector('[data-telemetry-card]')!
	expect(card.textContent).toMatch(/Planlagt puls: .*, .*slag\/min\./)
})

test('a few reps still draw a band per rep, with the rests between them', () => {
	render(
		<TelemetryOverlay
			stream={hrStream(1200)}
			workout={workout([
				{
					repeatCount: 4,
					steps: [
						{ kind: 'cardio', durationSec: 180, intensity: zone('Z4') },
						{ kind: 'rest', durationSec: 120 },
					],
				},
			])}
			thresholds={thresholds}
		/>,
	)
	expect(bandRects()).toHaveLength(4)
})
