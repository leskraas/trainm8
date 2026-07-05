import { expect, test } from 'vitest'
import { normalizedPower } from './normalized-power.ts'

// ── Normalized Power ────────────────────────────────────────────────────────
// NP = ( mean( rolling30sAvg(power)^4 ) )^(1/4)
// Reference: Coggan, A. "Training and Racing with a Power Meter", 2nd ed.
// The stream is the stored Activity Stream power channel (ADR 0020): evenly
// spaced samples every `resolutionSec`, `null` marking paused gaps.

test('constant power: NP equals average power', () => {
	// Any 30s rolling average of a constant is the constant; mean of fourth
	// powers of a constant is the constant^4; fourth root recovers it exactly.
	const power = Array.from({ length: 120 }, () => 200)
	expect(normalizedPower(power, 5)).toBeCloseTo(200, 6)
})

test('alternating power: NP exceeds average power', () => {
	// 30s blocks at 100W / 300W with 30s samples (window = 1 sample, since each
	// downsampled bucket already spans a full window). Average power = 200W.
	const power = [100, 300, 100, 300, 100, 300, 100, 300]
	const np = normalizedPower(power, 30)!
	expect(np).toBeGreaterThan(200)
	// Hand-computed: rolling values are the samples themselves.
	// mean of 4th powers = (100^4 + 300^4) / 2 = (1e8 + 81e8) / 2 = 41e8
	// NP = (41e8)^(1/4) = 100 * 41^(1/4) = 100 * sqrt(sqrt(41))
	//    = 100 * sqrt(6.4031242...) = 253.0439...
	expect(np).toBeCloseTo(253.0439, 3)
})

test('fixture cross-checked by hand: 30s@100W then 30s@300W at 5s resolution', () => {
	// 12 samples at 5s: [100 ×6, 300 ×6]. Window = ceil(30/5) = 6 samples.
	// The 7 full windows end at samples 6..12; a window holding k samples of
	// 300W (k = 0..6) averages 100 + 200k/6:
	//   100, 400/3, 500/3, 200, 700/3, 800/3, 300
	// Fourth powers (×1e8): 1, 256/81, 625/81, 16, 2401/81, 4096/81, 81
	//   sum = 1e8 × (98 + 7378/81) = 1e8 × 15316/81
	//   mean = 1e8 × 15316/(81×7) = 1e8 × 15316/567 = 2.701234...e9
	// NP = (1e8 × 15316/567)^(1/4) = 227.9764... W  (average power is 200W)
	const power = [100, 100, 100, 100, 100, 100, 300, 300, 300, 300, 300, 300]
	const expected = Math.pow((15316 / 567) * 1e8, 1 / 4)
	expect(normalizedPower(power, 5)).toBeCloseTo(expected, 6)
	expect(normalizedPower(power, 5)).toBeCloseTo(227.9764, 3)
})

test('null gaps (pauses) are skipped, not read as zero watts', () => {
	// Constant 200W with a paused stretch in the middle: gaps must not drag the
	// rolling averages down, so NP still equals the average of the real samples.
	const power = [
		...Array.from({ length: 12 }, () => 200),
		...Array.from({ length: 6 }, () => null),
		...Array.from({ length: 12 }, () => 200),
	]
	expect(normalizedPower(power, 5)).toBeCloseTo(200, 6)
})

test('returns null when the stream is empty or all gaps', () => {
	expect(normalizedPower([], 5)).toBeNull()
	expect(
		normalizedPower([null, null, null, null, null, null, null], 5),
	).toBeNull()
})

test('returns null when real samples cover less than one 30s window', () => {
	// 5 real samples at 5s resolution = 25s of data — not one full window.
	expect(normalizedPower([250, 250, 250, 250, 250], 5)).toBeNull()
	// One real sample at 30s resolution spans a full window — usable.
	expect(normalizedPower([250], 30)).toBeCloseTo(250, 6)
})

test('returns null for a non-positive resolution', () => {
	expect(normalizedPower([200, 200, 200, 200, 200, 200, 200], 0)).toBeNull()
	expect(normalizedPower([200, 200, 200, 200, 200, 200, 200], -5)).toBeNull()
})

test('coarser-than-30s buckets use a single-sample window', () => {
	// A downsampled bucket spanning 60s already smooths past the 30s window, so
	// the rolling pass degrades to identity — NP is the 4-norm of the buckets.
	const power = [150, 250]
	// mean of 4ths = (150^4 + 250^4)/2 = (5.0625e8 + 39.0625e8)/2 = 22.0625e8
	// NP = (22.0625e8)^(1/4) = 216.7273...
	expect(normalizedPower(power, 60)).toBeCloseTo(Math.pow(22.0625e8, 1 / 4), 6)
})
