import { expect, test } from 'vitest'
import { type ActivityStream } from '../activity-stream.ts'
import { type DisciplineProfileForResolver } from '../zones/resolve.ts'
import { type Classifier, resolveClassifier } from './classify.ts'
import { mineStructure } from './mine.ts'
import { type Segment, type Segmentation } from './segments.ts'

// ── Repeat mining + honesty gate (the hard half of the pipeline) ─────────────
// Exercised directly on hand-built segments so the gate, the scoring, and the
// HR sibling-pooling are covered without threading a whole synthetic stream.

const streamWith = (channels: Partial<ActivityStream>): ActivityStream => ({
	resolutionSec: 5,
	timeSec: [0, 5, 10],
	...channels,
})

const BIKE_PROFILE: DisciplineProfileForResolver = {
	lthr: 155,
	maxHr: 188,
	ftp: 250,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
	zoneSystem: 'coggan-power-7',
	zoneOverrides: null,
}

const RUN_HR_PROFILE: DisciplineProfileForResolver = {
	lthr: 160,
	maxHr: 190,
	ftp: null,
	thresholdPaceSecPerKm: null, // forces the HR ladder
	cssSecPer100m: null,
	zoneSystem: 'daniels-pace-5',
	zoneOverrides: null,
}

const powerClassifier = () =>
	resolveClassifier('bike', BIKE_PROFILE, streamWith({ power: [1] }))!

const hrClassifier = () =>
	resolveClassifier('run', RUN_HR_PROFILE, streamWith({ pace: [1], heartrate: [1] }))!

/** Build a labelled segment; `interior` defaults to a single sample of `value`. */
function seg(
	startSec: number,
	durationSec: number,
	value: number,
	classifier: Classifier,
	interior?: number[],
): Segment {
	return {
		start: 0,
		end: 0,
		startSec,
		endSec: startSec + durationSec,
		durationSec,
		value,
		band: classifier.bandIndex(value),
		interior: interior ?? [value],
	}
}

function segmentation(segments: Segment[]): Segmentation {
	return {
		segments,
		movingSec: segments.reduce((a, s) => a + s.durationSec, 0),
		edgeSource: 'stream',
	}
}

test('a clean 4× power motif is mined and scored high', () => {
	const c = powerClassifier()
	const segs: Segment[] = [seg(0, 300, 150, c)] // warm-up (Z2)
	let t = 300
	for (let i = 0; i < 4; i++) {
		segs.push(seg(t, 240, 285, c)) // work (Z5)
		t += 240
		segs.push(seg(t, 120, 150, c)) // recovery (Z2)
		t += 120
	}
	segs.push(seg(t, 180, 150, c)) // cool-down

	const hyp = mineStructure(segmentation(segs), c)
	expect(hyp).not.toBeNull()
	expect(hyp!.kind).toBe('motif')
	const workBlock = hyp!.blocks.find((b) => b.repeat === 4)
	expect(workBlock).toBeDefined()
	expect(hyp!.score).toBeGreaterThanOrEqual(0.7)
})

test('the recovery-sanity gate rejects two spikes separated by a huge easy gap', () => {
	// 2 × 30 s efforts 33 minutes apart — a recovery dwarfing the work is not an
	// interval set (ADR 0033). No sustained block either (works are 30 s).
	const c = powerClassifier()
	const segs = [
		seg(0, 30, 300, c),
		seg(30, 2000, 150, c),
		seg(2030, 30, 300, c),
	]
	expect(mineStructure(segmentation(segs), c)).toBeNull()
})

test('a single sustained elevated block is mined as a sustained hypothesis', () => {
	const c = powerClassifier()
	const segs = [
		seg(0, 300, 150, c),
		seg(300, 1200, 265, c), // 20 min @ Z4
		seg(1500, 300, 150, c),
	]
	const hyp = mineStructure(segmentation(segs), c)
	expect(hyp).not.toBeNull()
	expect(hyp!.kind).toBe('sustained')
	const work = hyp!.blocks.flatMap((b) => b.steps).find((s) => s.role === 'work')
	expect(work?.durationSec).toBe(1200)
})

test('steady / single-level activity returns null (band-separation gate)', () => {
	const c = powerClassifier()
	const segs = [
		seg(0, 600, 150, c),
		seg(600, 600, 158, c),
		seg(1200, 600, 152, c),
	]
	expect(mineStructure(segmentation(segs), c)).toBeNull()
})

test('HR-classified work value is the pooled median of sibling interiors, not one short rep', () => {
	// Four short HR reps whose individual interiors are noisy/short; pooled they
	// settle to a steady state (ADR 0035 sibling pooling). One rep reads high
	// (176) on its own, but the pooled median lands at the cluster's true 168.
	const c = hrClassifier()
	expect(c.channel).toBe('heartrate')
	const interiors = [
		[166, 168],
		[168, 170],
		[176], // a single, unreliable short-rep reading
		[168, 166],
	]
	const segs: Segment[] = [seg(0, 300, 120, c, [120])] // warm-up (Z1)
	let t = 300
	interiors.forEach((interior, i) => {
		const value = interior.reduce((a, b) => a + b, 0) / interior.length
		segs.push(seg(t, 40, value, c, interior)) // work rep
		t += 40
		if (i < interiors.length - 1) {
			segs.push(seg(t, 20, 125, c, [125])) // short recovery (Z1)
			t += 20
		}
	})

	const hyp = mineStructure(segmentation(segs), c)
	expect(hyp).not.toBeNull()
	const work = hyp!.blocks.flatMap((b) => b.steps).find((s) => s.role === 'work')!
	const target = c.measuredTarget(work.value)
	// Pooled samples [166,168,168,170,176,168,166] → median 168.
	expect(target).toEqual({ kind: 'hrBpm', min: 168 })
})
