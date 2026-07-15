import { expect, test } from 'vitest'
import { type ActivityStream } from '../activity-stream.ts'
import { type WorkoutStructure } from '../workout-schema.ts'
import { type DisciplineProfileForResolver } from '../zones/resolve.ts'
import { analyze } from './analyze.ts'
import { type DetectionDiscipline, type Lap } from './types.ts'

// ── Structure Detection engine (analyze) ─────────────────────────────────────
// The pure #327/#330 pipeline over the corpus archetypes (#330 verdict):
// interval, steady, sustained-block, in-zone/short-rep, missing-threshold. Every
// failure mode degrades to `null` ("no confident detection"), never fabricates.

const RES = 5

type Phase = {
	durationSec: number
	pace?: number
	power?: number
	hr?: number
	pause?: boolean
}

/** Build an index-aligned Activity Stream from constant-intensity phases. */
function buildStream(phases: Phase[], res = RES): ActivityStream {
	const timeSec: number[] = []
	const power: Array<number | null> = []
	const pace: Array<number | null> = []
	const heartrate: Array<number | null> = []
	let hasPower = false
	let hasPace = false
	let hasHr = false
	let t = 0
	for (const phase of phases) {
		const count = Math.max(1, Math.round(phase.durationSec / res))
		for (let i = 0; i < count; i++) {
			timeSec.push(t)
			t += res
			if (phase.pause) {
				power.push(null)
				pace.push(null)
				heartrate.push(null)
				continue
			}
			power.push(phase.power ?? null)
			pace.push(phase.pace ?? null)
			heartrate.push(phase.hr ?? null)
			if (phase.power != null) hasPower = true
			if (phase.pace != null) hasPace = true
			if (phase.hr != null) hasHr = true
		}
	}
	return {
		resolutionSec: res,
		timeSec,
		...(hasPower ? { power } : {}),
		...(hasPace ? { pace } : {}),
		...(hasHr ? { heartrate } : {}),
	}
}

/** Contiguous laps covering the phases, on the stream's elapsed-second axis. */
function lapsFor(phases: Phase[]): Lap[] {
	const laps: Lap[] = []
	let t = 0
	for (const phase of phases) {
		laps.push({ startSec: t, endSec: t + phase.durationSec })
		t += phase.durationSec
	}
	return laps
}

const RUN_PROFILE: DisciplineProfileForResolver = {
	lthr: 160,
	maxHr: 190,
	ftp: null,
	thresholdPaceSecPerKm: 240, // 4:00/km
	cssSecPer100m: null,
	zoneSystem: 'daniels-pace-5',
	zoneOverrides: null,
}

const BIKE_PROFILE: DisciplineProfileForResolver = {
	lthr: 155,
	maxHr: 188,
	ftp: 250,
	thresholdPaceSecPerKm: null,
	cssSecPer100m: null,
	zoneSystem: 'coggan-power-7',
	zoneOverrides: null,
}

function run(
	phases: Phase[],
	profile = RUN_PROFILE,
	discipline: DetectionDiscipline = 'run',
	laps?: Lap[],
) {
	return analyze({ stream: buildStream(phases), discipline, profile, laps })
}

/** Every step's intensity kind across the detected structure. */
function intensityKinds(structure: WorkoutStructure): string[] {
	return structure.blocks.flatMap((b) =>
		b.steps.map((s) =>
			'intensity' in s ? (s.intensity?.kind ?? 'none') : 'none',
		),
	)
}

test('clean zone-crossing interval session detects its rep structure at high/medium', () => {
	// warm-up (E) → 6 × (3:50 @ I + 2:00 E recovery) → cool-down. Work at 230 s/km
	// is Daniels I against a 240 s/km T-pace; recoveries at 360 s/km are E — a
	// clear zone crossing (the #330 target archetype, scored 0.95 there).
	const phases: Phase[] = [{ durationSec: 300, pace: 360 }]
	for (let i = 0; i < 6; i++) {
		phases.push({ durationSec: 230, pace: 230 })
		phases.push({ durationSec: 120, pace: 360 })
	}
	phases.push({ durationSec: 180, pace: 360 })

	const result = run(phases)
	expect(result).not.toBeNull()
	expect(['high', 'medium']).toContain(result!.confidence)

	const workBlock = result!.structure.blocks.find((b) => b.repeatCount >= 4)
	expect(workBlock).toBeDefined()
	const workStep = workBlock!.steps.find((s) => s.kind === 'cardio')
	expect(workStep?.intensity?.kind).toBe('pace')
})

test('an easy/steady run returns null — the band-separation gate refuses phantom structure', () => {
	// All within Daniels E (309–417 s/km): GPS-like wobble that clears no value
	// margin and crosses no zone boundary. #330: ~40 such runs → "steady".
	const result = run([
		{ durationSec: 600, pace: 355 },
		{ durationSec: 600, pace: 365 },
		{ durationSec: 600, pace: 350 },
		{ durationSec: 600, pace: 360 },
	])
	expect(result).toBeNull()
})

test('a single sustained threshold block (no repeats) clears the gate', () => {
	// warm-up (E) → 20 min @ T (250 s/km, ratio 1.04) → cool-down. One elevated
	// block, no reps — must still clear the honesty gate (ADR 0033).
	const result = run([
		{ durationSec: 300, pace: 360 },
		{ durationSec: 1200, pace: 250 },
		{ durationSec: 300, pace: 360 },
	])
	expect(result).not.toBeNull()
	const workBlock = result!.structure.blocks.find((b) =>
		b.steps.some((s) => s.kind === 'cardio' && (s.durationSec ?? 0) >= 600),
	)
	expect(workBlock).toBeDefined()
})

test('an HR-classified detection caps confidence at medium', () => {
	// Pace channel sets the edges (present), but the athlete never set a threshold
	// pace — classification falls to HR (LTHR 160). A clean HR interval that would
	// otherwise grade high is capped at medium (ADR 0024/0033).
	const noThresholdPace: DisciplineProfileForResolver = {
		...RUN_PROFILE,
		thresholdPaceSecPerKm: null,
	}
	const phases: Phase[] = [{ durationSec: 300, pace: 360, hr: 120 }]
	for (let i = 0; i < 6; i++) {
		phases.push({ durationSec: 230, pace: 230, hr: 170 }) // ≥ LTHR → Z5
		phases.push({ durationSec: 120, pace: 360, hr: 125 }) // < 0.84·LTHR → Z1
	}
	phases.push({ durationSec: 180, pace: 360, hr: 120 })

	const result = analyze({
		stream: buildStream(phases),
		discipline: 'run',
		profile: noThresholdPace,
		laps: undefined,
	})
	expect(result).not.toBeNull()
	expect(result!.confidence).toBe('medium')
	// Intensity is stored as the measured HR (hrBpm), never a zone label.
	expect(intensityKinds(result!.structure)).toContain('hrBpm')
})

test('a missing anchor threshold with no HR fallback returns null', () => {
	// Pace present but no threshold pace, no LTHR/maxHR, no HR channel → nothing
	// honest to classify against. Never a guessed or population-default zone.
	const noThresholds: DisciplineProfileForResolver = {
		lthr: null,
		maxHr: null,
		ftp: null,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
		zoneSystem: 'daniels-pace-5',
		zoneOverrides: null,
	}
	const phases: Phase[] = [{ durationSec: 300, pace: 360 }]
	for (let i = 0; i < 6; i++) {
		phases.push({ durationSec: 230, pace: 230 })
		phases.push({ durationSec: 120, pace: 360 })
	}
	expect(run(phases, noThresholds)).toBeNull()
})

test('detected steps carry concrete measured Intensity Targets, never zone labels', () => {
	const phases: Phase[] = [{ durationSec: 300, pace: 360 }]
	for (let i = 0; i < 6; i++) {
		phases.push({ durationSec: 230, pace: 230 })
		phases.push({ durationSec: 120, pace: 360 })
	}
	const result = run(phases)
	expect(result).not.toBeNull()
	const kinds = intensityKinds(result!.structure)
	expect(kinds.length).toBeGreaterThan(0)
	expect(kinds).not.toContain('zoneLabel')
	expect(kinds.every((k) => k === 'pace')).toBe(true)
})

test('in-zone reps (below one zone of separation) are honestly not detected', () => {
	// 5 × 6 min "efforts" run at E pace (320 s/km) with easier E recoveries (400):
	// both sit inside Daniels E, so no zone boundary is crossed. #330's honest
	// under-detection — better "no structure" than a fabricated set (ADR 0008).
	const phases: Phase[] = [{ durationSec: 300, pace: 380 }]
	for (let i = 0; i < 5; i++) {
		phases.push({ durationSec: 360, pace: 320 })
		phases.push({ durationSec: 120, pace: 400 })
	}
	expect(run(phases)).toBeNull()
})

test('provider laps rescue the rep structure the stream is blind to', () => {
	// 8 × (40 s work @ I + 10 s recovery). At 5 s resolution a 10 s recovery is two
	// samples — the rolling-median window erases it, so a stream-only detector
	// collapses the set into one block and never sees the reps (#330). Provider
	// laps mark each effort, recovering the k×(work+recovery) motif. Laps enable
	// detection but never cap the grade (ADR 0033).
	const phases: Phase[] = [{ durationSec: 300, pace: 360 }]
	for (let i = 0; i < 8; i++) {
		phases.push({ durationSec: 40, pace: 225 })
		phases.push({ durationSec: 10, pace: 360 })
	}

	// Stream-only: the reps are invisible — no repeated block is found.
	const streamOnly = run(phases)
	const streamReps = streamOnly?.structure.blocks.some(
		(b) => b.repeatCount >= 2,
	)
	expect(streamReps ?? false).toBe(false)

	// With laps: the repeated structure is recovered.
	const withLaps = run(phases, RUN_PROFILE, 'run', lapsFor(phases))
	expect(withLaps).not.toBeNull()
	const workBlock = withLaps!.structure.blocks.find((b) => b.repeatCount >= 4)
	expect(workBlock).toBeDefined()
})

test('bike power interval detects at high with concrete power targets', () => {
	// warm-up (Z2) → 5 × (4 min @ Z5 280 W + 2 min Z2) → cool-down, against FTP 250.
	const phases: Phase[] = [{ durationSec: 300, power: 150 }]
	for (let i = 0; i < 5; i++) {
		phases.push({ durationSec: 240, power: 280 })
		phases.push({ durationSec: 120, power: 150 })
	}
	phases.push({ durationSec: 180, power: 150 })

	const result = analyze({
		stream: buildStream(phases),
		discipline: 'bike',
		profile: BIKE_PROFILE,
		laps: undefined,
	})
	expect(result).not.toBeNull()
	expect(['high', 'medium']).toContain(result!.confidence)
	expect(intensityKinds(result!.structure).every((k) => k === 'power')).toBe(
		true,
	)
})

test('a pause is never interpolated across (ADR 0020)', () => {
	// A steady effort split by a 3-minute stopped pause stays one steady activity,
	// not two "reps" straddling the gap.
	const result = run([
		{ durationSec: 900, pace: 355 },
		{ durationSec: 180, pause: true },
		{ durationSec: 900, pace: 360 },
	])
	expect(result).toBeNull()
})

test('analyze is a pure function of its input (no shared state between calls)', () => {
	const phases: Phase[] = [{ durationSec: 300, pace: 360 }]
	for (let i = 0; i < 6; i++) {
		phases.push({ durationSec: 230, pace: 230 })
		phases.push({ durationSec: 120, pace: 360 })
	}
	const a = run(phases)
	const b = run(phases)
	expect(a).toEqual(b)
})
