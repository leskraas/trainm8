import { readFileSync } from 'node:fs'
import {
	downsampleStream,
	serializeStream,
} from '#app/utils/activity-stream.ts'
import { prisma } from '#app/utils/db.server.ts'
import { deriveMetricTarget } from '#app/utils/intensity-target.ts'
import { recomputeLoadFrom } from '#app/utils/load/snapshot.server.ts'
import { MOCK_CODE_GITHUB } from '#app/utils/providers/constants.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/resolve.ts'
import { createPassword, createUser, getUserImages } from '#tests/db-utils.ts'
import { insertGitHubUser } from '#tests/mocks/github.ts'
import { seedWeekReplanDemoAthletes } from '#tests/week-replan-demo-seed.ts'

// ---------------------------------------------------------------------------
// kody's training data. The PAST is real: his actual Strava history, snapshotted
// once into `seed-data/kody-strava-history.json` and replayed here so
// `db:reset-local` reproduces a real athlete offline — no live Strava sync (see
// `replayRealHistory`). The FUTURE is synthetic scaffolding the real data can't
// provide: a workout library + an upcoming planned schedule + a demo overlay
// session + a target Event, so the planning and plan-vs-actual surfaces stay
// demoable.
//
// Cardio step `intensity` is usually a plain zone label (easy/endurance/tempo/
// threshold/max) that maps to training zones 1–5 for the session profile bars.
// A couple of key sessions instead carry a genuinely-produced metric Intensity
// Target (#131): a tempo run and a threshold ride run their recipe zone label
// through `deriveMetricTarget` against kody's thresholds, so the home surface
// resolves and displays a concrete pace / %FTP target — no hand-placed numbers.
// ---------------------------------------------------------------------------

// kody's Discipline Profile thresholds + zone systems (ADR 0005/0006), the single
// source for both the persisted profile and the metric-target derivation below.
const KODY_DISCIPLINE_PROFILES: Array<
	DisciplineProfileForResolver & { discipline: string }
> = [
	{
		discipline: 'run',
		maxHr: 190,
		lthr: 168,
		ftp: null,
		thresholdPaceSecPerKm: 240,
		cssSecPer100m: null,
		zoneSystem: 'daniels-pace-5',
		zoneOverrides: null,
	},
	{
		discipline: 'bike',
		maxHr: 188,
		lthr: 165,
		ftp: 250,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
		zoneSystem: 'coggan-power-7',
		zoneOverrides: null,
	},
	{
		discipline: 'swim',
		maxHr: null,
		lthr: null,
		ftp: null,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: 95,
		zoneSystem: 'css-3',
		zoneOverrides: null,
	},
	{
		discipline: 'strength',
		maxHr: null,
		lthr: null,
		ftp: null,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
		zoneSystem: null,
		zoneOverrides: null,
	},
]

function resolverFor(discipline: string): DisciplineProfileForResolver {
	return KODY_DISCIPLINE_PROFILES.find((p) => p.discipline === discipline)!
}

/**
 * Bake a concrete metric Intensity Target (#131) from a recipe zone label +
 * kody's thresholds, serialized the same way authoring/Plan Generation persist
 * it. The home surface renders the resolved pace / %FTP / HR via the #130
 * formatter; an unresolvable label degrades to the Training Zone (never a
 * fabricated number — ADR 0008).
 */
function metricIntensity(discipline: string, zoneLabel: string): string {
	return JSON.stringify(
		deriveMetricTarget(
			{ kind: 'zoneLabel', label: zoneLabel },
			discipline,
			resolverFor(discipline),
		),
	)
}

type CardioStepSpec = {
	i?: string // intensity label (cardio)
	d?: number // durationSec
	n?: string // notes
	rest?: boolean
}
type SegmentSpec = { name: string; r?: number; s: CardioStepSpec[] }

function cardioBlocks(discipline: string, segments: SegmentSpec[]) {
	return segments.map((seg, blockIndex) => ({
		name: seg.name,
		orderIndex: blockIndex,
		repeatCount: seg.r ?? 1,
		steps: {
			create: seg.s.map((step, stepIndex) =>
				step.rest
					? {
							kind: 'rest',
							orderIndex: stepIndex,
							durationSec: step.d,
							notes: step.n,
						}
					: {
							kind: 'cardio',
							orderIndex: stepIndex,
							discipline,
							intensity: step.i,
							durationSec: step.d,
							notes: step.n,
						},
			),
		},
	}))
}

function strengthCircuitBlocks() {
	// durationSec on the work steps gives the planned session a realistic length
	// (sumBlockDurationMin only counts step durations); the profile bars still
	// derive from the timed sets below.
	return [
		{
			name: 'Circuit',
			orderIndex: 0,
			repeatCount: 5,
			steps: {
				create: [
					{
						kind: 'strength',
						exerciseId: 'ex_bb_back_squat',
						restBetweenSetsSec: 60,
						durationSec: 240,
						orderIndex: 0,
						sets: {
							create: [{ kind: 'timed', orderIndex: 0, durationSec: 45 }],
						},
					},
					{
						kind: 'strength',
						exerciseId: 'ex_bw_pushup',
						restBetweenSetsSec: 60,
						durationSec: 180,
						orderIndex: 1,
						sets: {
							create: [{ kind: 'timed', orderIndex: 0, durationSec: 45 }],
						},
					},
					{
						kind: 'rest',
						notes: 'Rest between rounds',
						orderIndex: 2,
						durationSec: 120,
					},
				],
			},
		},
	]
}

type Template = {
	key: string
	title: string
	discipline: string
	intent: string
	description: string
	minutes: number
	rpe: number
	blocks: ReturnType<typeof cardioBlocks>
}

const TEMPLATES: Template[] = [
	{
		key: 'easyRun',
		title: 'Easy Aerobic Run',
		discipline: 'run',
		intent: 'endurance',
		description: 'Conversational aerobic run to bank easy volume.',
		minutes: 45,
		rpe: 3,
		blocks: cardioBlocks('run', [
			{ name: 'Warm-up', s: [{ i: 'easy', d: 600, n: 'Easy jog' }] },
			{ name: 'Main', s: [{ i: 'endurance', d: 1980, n: 'Steady zone 2' }] },
			{ name: 'Cool-down', s: [{ i: 'easy', d: 300, n: 'Easy jog' }] },
		]),
	},
	{
		key: 'tempoRun',
		title: 'Tuesday Tempo Run',
		discipline: 'run',
		intent: 'tempo',
		description: 'Structured tempo session with warm-up and cool-down.',
		minutes: 55,
		rpe: 7,
		blocks: cardioBlocks('run', [
			{ name: 'Warm-up', s: [{ i: 'easy', d: 600, n: 'Easy jog' }] },
			{
				name: 'Main Set',
				s: [
					// Metric Intensity Target (#131): the Daniels "T" (threshold) zone
					// derived against kody's 4:00/km threshold pace → a concrete pace
					// the home resolves and displays.
					{ i: metricIntensity('run', 'T'), d: 1200, n: '20 min at tempo' },
					{ rest: true, d: 120, n: 'Walk recovery' },
					{ i: 'threshold', d: 600, n: '10 min at tempo' },
				],
			},
			{ name: 'Cool-down', s: [{ i: 'easy', d: 480, n: 'Easy jog' }] },
		]),
	},
	{
		key: 'longRun',
		title: 'Weekend Long Run',
		discipline: 'run',
		intent: 'endurance',
		description: 'Long aerobic run with a tempo surge in the middle.',
		minutes: 105,
		rpe: 6,
		blocks: cardioBlocks('run', [
			{ name: 'Warm-up', s: [{ i: 'easy', d: 600 }] },
			{
				name: 'Main',
				s: [
					{ i: 'endurance', d: 3600, n: 'Steady aerobic' },
					{ i: 'tempo', d: 600, n: 'Tempo surge' },
					{ i: 'endurance', d: 1200, n: 'Settle back to aerobic' },
				],
			},
			{ name: 'Cool-down', s: [{ i: 'easy', d: 600 }] },
		]),
	},
	{
		key: 'vo2Run',
		title: 'VO₂max Intervals',
		discipline: 'run',
		intent: 'vo2max',
		description: '5 × 3 min hard with equal recovery.',
		minutes: 50,
		rpe: 9,
		blocks: cardioBlocks('run', [
			{ name: 'Warm-up', s: [{ i: 'easy', d: 720 }] },
			{
				name: 'Intervals',
				r: 5,
				s: [
					{ i: 'max', d: 180, n: '3 min hard' },
					{ i: 'easy', d: 120, n: 'Jog recovery' },
				],
			},
			{ name: 'Cool-down', s: [{ i: 'easy', d: 480 }] },
		]),
	},
	{
		key: 'enduranceRide',
		title: 'Endurance Ride',
		discipline: 'bike',
		intent: 'endurance',
		description: 'Steady zone 2 ride.',
		minutes: 90,
		rpe: 4,
		blocks: cardioBlocks('bike', [
			{ name: 'Warm-up', s: [{ i: 'easy', d: 600 }] },
			{ name: 'Main', s: [{ i: 'endurance', d: 4200, n: 'Steady zone 2' }] },
			{ name: 'Cool-down', s: [{ i: 'easy', d: 600 }] },
		]),
	},
	{
		key: 'thresholdRide',
		title: 'Threshold Ride',
		discipline: 'bike',
		intent: 'threshold',
		description: '3 × 12 min at threshold.',
		minutes: 70,
		rpe: 8,
		blocks: cardioBlocks('bike', [
			{ name: 'Warm-up', s: [{ i: 'easy', d: 720 }] },
			{
				name: 'Intervals',
				r: 3,
				s: [
					// Metric Intensity Target (#131): the Coggan "Z4" (threshold) zone
					// derived against kody's 250 W FTP → a %FTP target resolving to
					// ~228–263 W on the home surface.
					{
						i: metricIntensity('bike', 'Z4'),
						d: 720,
						n: '12 min at threshold',
					},
					{ i: 'easy', d: 240, n: 'Easy spin' },
				],
			},
			{ name: 'Cool-down', s: [{ i: 'easy', d: 600 }] },
		]),
	},
	{
		key: 'swimIntervals',
		title: 'Swim Intervals',
		discipline: 'swim',
		intent: 'vo2max',
		description: 'Pool session with repeat 100m sprints.',
		minutes: 45,
		rpe: 6,
		blocks: cardioBlocks('swim', [
			{ name: 'Warm-up', s: [{ i: 'easy', d: 300, n: 'Easy 200m' }] },
			{
				name: 'Main Set',
				r: 6,
				s: [
					{ i: 'max', d: 120, n: '100m sprint' },
					{ rest: true, d: 30, n: 'Rest' },
				],
			},
			{ name: 'Cool-down', s: [{ i: 'easy', d: 300, n: 'Easy 200m' }] },
		]),
	},
	{
		key: 'swimEndurance',
		title: 'Endurance Swim',
		discipline: 'swim',
		intent: 'endurance',
		description: 'Continuous aerobic swim.',
		minutes: 45,
		rpe: 4,
		blocks: cardioBlocks('swim', [
			{ name: 'Warm-up', s: [{ i: 'easy', d: 300 }] },
			{ name: 'Main', s: [{ i: 'endurance', d: 2100, n: 'Steady aerobic' }] },
			{ name: 'Cool-down', s: [{ i: 'easy', d: 300 }] },
		]),
	},
	{
		key: 'recoveryRun',
		title: 'Recovery Jog',
		discipline: 'run',
		intent: 'recovery',
		description: 'Short, very easy shake-out.',
		minutes: 30,
		rpe: 2,
		blocks: cardioBlocks('run', [
			{ name: 'Recovery', s: [{ i: 'recovery', d: 1800, n: 'Very easy' }] },
		]),
	},
	{
		key: 'strength',
		title: 'Strength Circuit',
		discipline: 'strength',
		intent: 'strength-max',
		description: 'Full-body strength circuit.',
		minutes: 45,
		rpe: 5,
		blocks: strengthCircuitBlocks() as unknown as ReturnType<
			typeof cardioBlocks
		>,
	},
]

const DAY_MS = 24 * 60 * 60 * 1000
const HORIZON_DAYS = 14

/** Pick a template key for the upcoming plan on a given weekday, or null for a
 *  rest day. Alternates an A/B week so the plan shows variety across the horizon. */
function planFor(dayOfWeek: number, offset: number): string | null {
	const evenWeek = Math.floor(offset / 7) % 2 === 0
	switch (dayOfWeek) {
		case 1:
			return null // Monday rest
		case 2:
			return evenWeek ? 'tempoRun' : 'vo2Run'
		case 3:
			return evenWeek ? 'enduranceRide' : 'thresholdRide'
		case 4:
			return evenWeek ? 'swimIntervals' : 'swimEndurance'
		case 5:
			return 'strength'
		case 6:
			return 'longRun'
		case 0:
			return evenWeek ? 'easyRun' : null
		default:
			return null
	}
}

// --- Real Strava history replay ------------------------------------------
// The shape of `seed-data/kody-strava-history.json`: a snapshot of kody's real
// Strava imports + downsampled Activity Streams, regenerated by
// `scripts/refresh-strava-fixture.ts`. Mirrors the persisted `ActivityImport` /
// `ActivityStream` columns so the seed can replay them with plain inserts.

type FixtureActivity = {
	externalId: string
	startedAt: string
	endedAt: string
	durationSec: number
	distanceM: number | null
	discipline: string
	hrAvg: number | null
	hrMax: number | null
	powerAvg: number | null
	powerMax: number | null
	powerWeightedAvg: number | null
	cadenceAvg: number | null
	paceAvgSecPerKm: number | null
	speedMaxMps: number | null
	elevationGainM: number | null
	kilojoules: number | null
	polyline: string | null
	phaseBarsJson: string | null
	rawJson: string
	stream: {
		resolutionSec: number
		sampleCount: number
		timeSec: string
		power: string | null
		heartrate: string | null
		pace: string | null
	} | null
}

type HistoryFixture = {
	capturedAt: string
	latestActivityAt: string
	count: number
	activities: FixtureActivity[]
}

function startOfUTCDay(d: Date): number {
	const x = new Date(d)
	x.setUTCHours(0, 0, 0, 0)
	return x.getTime()
}

/**
 * Shift the `start_date` / `start_date_local` in a raw Strava payload by the
 * same whole-day delta as the import, so the lossless archive stays consistent
 * with the shifted import dates. Tolerant of an unparseable payload.
 */
function shiftRawDates(rawJson: string, shiftMs: number): string {
	try {
		const obj = JSON.parse(rawJson) as Record<string, unknown>
		for (const key of ['start_date', 'start_date_local']) {
			const v = obj[key]
			if (typeof v === 'string') {
				obj[key] = new Date(Date.parse(v) + shiftMs).toISOString()
			}
		}
		return JSON.stringify(obj)
	} catch {
		return rawJson
	}
}

/**
 * Replay kody's real Strava history from the committed fixture. Every activity
 * is shifted by `(seedNow − capturedAt)` at whole-day granularity, so the real
 * training shape — gaps, frequency, recency — stays anchored to "today" however
 * far in the future the seed runs (and the recent CTL window is always
 * populated). Modeled disciplines become recording-only completed Workout
 * Sessions exactly as the Backfill Window auto-promotes them; `'other'`
 * activities (ADR 0015) stay in the inbox, unpromoted. Returns the completed-day
 * strings for the post-seed Training Load recompute.
 */
async function replayRealHistory(
	athleteId: string,
	now: Date,
): Promise<string[]> {
	const raw = readFileSync(
		new URL('./seed-data/kody-strava-history.json', import.meta.url),
		'utf8',
	)
	const fixture = JSON.parse(raw) as HistoryFixture
	const shiftMs =
		startOfUTCDay(now) - startOfUTCDay(new Date(fixture.capturedAt))
	const completedDateStrs: string[] = []

	for (const a of fixture.activities) {
		const startedAt = new Date(Date.parse(a.startedAt) + shiftMs)
		const endedAt = new Date(Date.parse(a.endedAt) + shiftMs)

		const created = await prisma.activityImport.create({
			select: { id: true },
			data: {
				athleteId,
				externalProvider: 'strava',
				externalId: a.externalId,
				startedAt,
				endedAt,
				durationSec: a.durationSec,
				distanceM: a.distanceM,
				discipline: a.discipline,
				hrAvg: a.hrAvg,
				hrMax: a.hrMax,
				powerAvg: a.powerAvg,
				powerMax: a.powerMax,
				powerWeightedAvg: a.powerWeightedAvg,
				cadenceAvg: a.cadenceAvg,
				paceAvgSecPerKm: a.paceAvgSecPerKm,
				speedMaxMps: a.speedMaxMps,
				elevationGainM: a.elevationGainM,
				kilojoules: a.kilojoules,
				polyline: a.polyline,
				phaseBarsJson: a.phaseBarsJson,
				rawJson: shiftRawDates(a.rawJson, shiftMs),
				stream: a.stream
					? {
							create: {
								resolutionSec: a.stream.resolutionSec,
								sampleCount: a.stream.sampleCount,
								timeSec: a.stream.timeSec,
								power: a.stream.power,
								heartrate: a.stream.heartrate,
								pace: a.stream.pace,
							},
						}
					: undefined,
			},
		})

		// 'other' is import-only (ADR 0015): leave it in the inbox, unpromoted.
		if (a.discipline === 'other') continue

		// A modeled recording with no matching planned session becomes a
		// recording-only completed Workout Session — backfill's promotion, inlined
		// so the load pipeline runs once at the end instead of per import.
		const session = await prisma.workoutSession.create({
			select: { id: true },
			data: {
				userId: athleteId,
				workoutId: null,
				scheduledAt: startedAt,
				status: 'completed',
				recordingId: created.id,
			},
		})
		await prisma.activityImport.update({
			where: { id: created.id },
			data: { promotedSessionId: session.id },
		})
		completedDateStrs.push(startedAt.toISOString().slice(0, 10))
	}

	return completedDateStrs
}

/**
 * A deterministic synthetic power + heart-rate stream for the demo overlay
 * session: a threshold ride that holds the early reps, fades on the last, and
 * pauses mid-rep. Dev/demo seed only — ADR 0008 forbids fabricated telemetry in
 * production. Shaped at ≈1 Hz so the real `downsampleStream` does the bounding,
 * and so every part of the overlay has something to draw (power/HR lines, the
 * planned target bands, a paused-gap, and the Workout Shape rail).
 */
function buildDemoRideStream(): {
	time: number[]
	power: Array<number | null>
	heartrate: Array<number | null>
} {
	const segments: Array<{
		sec: number
		watts: (frac: number) => number
		pauseAt?: number
		pauseLen?: number
	}> = [
		{ sec: 600, watts: (f) => 130 + 60 * f }, // warm-up ramp
		{ sec: 480, watts: () => 252 }, // rep 1 — on target
		{ sec: 180, watts: () => 135 }, // recovery
		{ sec: 480, watts: () => 248, pauseAt: 220, pauseLen: 75 }, // rep 2 — paused mid-rep
		{ sec: 180, watts: () => 135 },
		{ sec: 480, watts: () => 240 }, // rep 3 — slipping
		{ sec: 180, watts: () => 135 },
		{ sec: 480, watts: () => 232 }, // rep 4 — faded under target
		{ sec: 300, watts: (f) => 145 - 25 * f }, // cool-down
	]
	const time: number[] = []
	const power: Array<number | null> = []
	const heartrate: Array<number | null> = []
	let t = 0
	let hr = 108
	for (const seg of segments) {
		for (let s = 0; s < seg.sec; s++) {
			const paused =
				seg.pauseAt != null &&
				s >= seg.pauseAt &&
				s < seg.pauseAt + (seg.pauseLen ?? 0)
			time.push(t)
			if (paused) {
				power.push(null) // a recorded pause — null breaks the line
				hr = Math.max(96, hr - 0.45)
			} else {
				const base = seg.watts(s / seg.sec)
				power.push(Math.max(0, Math.round(base + Math.sin(t / 13) * 5)))
				const targetHr = 108 + (base - 130) * 0.3
				hr += (targetHr - hr) * 0.04 // first-order drift toward effort
			}
			heartrate.push(Math.round(hr))
			t++
		}
	}
	return { time, power, heartrate }
}

async function seed() {
	console.log('🌱 Seeding...')
	console.time(`🌱 Database has been seeded`)

	const totalUsers = 5
	console.time(`👤 Created ${totalUsers} users...`)
	const userImages = await getUserImages()

	for (let index = 0; index < totalUsers; index++) {
		const userData = createUser()
		const user = await prisma.user.create({
			select: { id: true },
			data: {
				...userData,
				password: { create: createPassword(userData.username) },
				roles: { connect: { name: 'user' } },
			},
		})

		const userImage = userImages[index % userImages.length]
		if (userImage) {
			await prisma.userImage.create({
				data: {
					userId: user.id,
					objectKey: userImage.objectKey,
				},
			})
		}
	}
	console.timeEnd(`👤 Created ${totalUsers} users...`)

	console.time(`🐨 Created admin user "kody"`)

	const githubUser = await insertGitHubUser(MOCK_CODE_GITHUB)

	const kody = await prisma.user.create({
		select: { id: true },
		data: {
			email: 'kody@kcd.dev',
			username: 'kody',
			name: 'Kody',
			password: { create: createPassword('kodylovesyou') },
			connections: {
				create: {
					providerName: 'github',
					providerId: String(githubUser.profile.id),
				},
			},
			roles: { connect: [{ name: 'admin' }, { name: 'user' }] },
		},
	})

	await prisma.userImage.create({
		data: {
			userId: kody.id,
			objectKey: 'user/kody.png',
		},
	})

	console.timeEnd(`🐨 Created admin user "kody"`)

	console.time(`🏋️ Created training data for kody`)

	// Athlete profile + per-discipline thresholds — required for the load
	// pipeline to run, and enables richer TSS formulas for future HR/power data.
	await prisma.athleteProfile.create({
		data: {
			userId: kody.id,
			timezone: 'UTC',
			preferredUnits: 'metric',
			weekStartsOn: 1,
			sex: 'male',
			weightKg: 74,
			heightCm: 182,
			disciplineProfiles: {
				create: KODY_DISCIPLINE_PROFILES.map(
					({
						discipline,
						maxHr,
						lthr,
						ftp,
						thresholdPaceSecPerKm,
						cssSecPer100m,
						zoneSystem,
					}) => ({
						discipline,
						maxHr,
						lthr,
						ftp,
						thresholdPaceSecPerKm,
						cssSecPer100m,
						zoneSystem,
					}),
				),
			},
		},
	})

	// One Workout per template, reused across many scheduled sessions.
	const workoutIds: Record<string, string> = {}
	for (const t of TEMPLATES) {
		const workout = await prisma.workout.create({
			select: { id: true },
			data: {
				title: t.title,
				description: t.description,
				discipline: t.discipline,
				intent: t.intent,
				ownerId: kody.id,
				blocks: { create: t.blocks },
			},
		})
		workoutIds[t.key] = workout.id
	}

	const now = new Date()

	// The PAST: kody's real Strava history, replayed from the committed fixture
	// (recording-only completed sessions + telemetry, shifted to "today").
	const completedDateStrs = await replayRealHistory(kody.id, now)

	// The FUTURE: the upcoming planned schedule the real history can't provide —
	// today out to the horizon, drawn from the workout library above.
	for (let offset = 0; offset <= HORIZON_DAYS; offset++) {
		const day = new Date(now.getTime() + offset * DAY_MS)
		const key = planFor(day.getUTCDay(), offset)
		if (!key) continue

		const scheduledAt = new Date(day)
		scheduledAt.setUTCHours(18, 0, 0, 0)
		await prisma.workoutSession.create({
			data: {
				userId: kody.id,
				workoutId: workoutIds[key],
				scheduledAt,
				status: 'scheduled',
			},
		})
	}

	// Demo overlay session (ADR 0020): one completed threshold ride whose
	// Recording carries a real downsampled Activity Stream, so the Workout Detail
	// View renders the telemetry overlay out of the box. The workout authors typed
	// power Intensity Targets (resolved against kody's FTP) so the planned bands
	// have a range to draw; the stream is synthetic dev/demo data, never shipped to
	// production.
	{
		const FTP = 250
		const powerStep = (
			orderIndex: number,
			durationSec: number,
			minPct: number,
			maxPct: number,
			notes: string,
		) => ({
			kind: 'cardio',
			discipline: 'bike',
			orderIndex,
			durationSec,
			notes,
			intensity: JSON.stringify({ kind: 'powerPct', minPct, maxPct }),
			intensityPowerMin: Math.round((minPct / 100) * FTP),
			intensityPowerMax: Math.round((maxPct / 100) * FTP),
		})
		const demoWorkout = await prisma.workout.create({
			select: { id: true },
			data: {
				title: 'Threshold 4×8 (demo)',
				description: '4 × 8 min at threshold with a mid-session pause.',
				discipline: 'bike',
				intent: 'threshold',
				ownerId: kody.id,
				blocks: {
					create: [
						{
							name: 'Warm-up',
							orderIndex: 0,
							repeatCount: 1,
							steps: {
								create: [powerStep(0, 600, 50, 60, 'Easy spin to open up')],
							},
						},
						{
							name: 'Intervals',
							orderIndex: 1,
							repeatCount: 4,
							steps: {
								create: [
									powerStep(0, 480, 95, 105, '8 min at threshold'),
									powerStep(1, 180, 50, 55, 'Easy spin recovery'),
								],
							},
						},
						{
							name: 'Cool-down',
							orderIndex: 2,
							repeatCount: 1,
							steps: { create: [powerStep(0, 300, 45, 55, 'Spin down')] },
						},
					],
				},
			},
		})

		const rawStream = buildDemoRideStream()
		const down = downsampleStream(rawStream)!
		const nums = (xs: Array<number | null>) =>
			xs.filter((v): v is number => v != null)
		const powerNums = nums(rawStream.power)
		const hrNums = nums(rawStream.heartrate)
		const powerAvg = Math.round(
			powerNums.reduce((a, b) => a + b, 0) / powerNums.length,
		)
		const hrAvg = Math.round(hrNums.reduce((a, b) => a + b, 0) / hrNums.length)
		const elapsedSec = rawStream.time.length
		const movingSec = powerNums.length

		const demoDay = new Date(now.getTime() - 4 * DAY_MS)
		demoDay.setUTCHours(6, 30, 0, 0)

		const demoRecording = await prisma.activityImport.create({
			select: { id: true },
			data: {
				athleteId: kody.id,
				externalProvider: 'strava',
				externalId: `seed-demo-stream`,
				startedAt: demoDay,
				endedAt: new Date(demoDay.getTime() + elapsedSec * 1000),
				durationSec: movingSec,
				distanceM: 31200,
				discipline: 'bike',
				hrAvg,
				hrMax: Math.max(...hrNums),
				powerAvg,
				powerMax: Math.max(...powerNums),
				powerWeightedAvg: powerAvg + 9,
				cadenceAvg: 88,
				elevationGainM: 240,
				kilojoules: Math.round((powerAvg * movingSec) / 1000),
				rawJson: '{}',
				stream: {
					create: {
						resolutionSec: down.resolutionSec,
						...serializeStream(down),
					},
				},
			},
		})

		await prisma.workoutSession.create({
			data: {
				userId: kody.id,
				workoutId: demoWorkout.id,
				scheduledAt: demoDay,
				status: 'completed',
				plannedTssValue: 85,
				plannedTssConfidence: 'full',
				recordingId: demoRecording.id,
				sessionLog: {
					create: {
						rpe: 8,
						content:
							'Threshold 4×8 (demo) — held the early reps, faded on the last, paused once mid-rep for traffic.',
					},
				},
			},
		})
		completedDateStrs.push(demoDay.toISOString().slice(0, 10))
	}

	// Build LoadSnapshots (CTL/ATL/TSB) + per-session tssValue through the real
	// pipeline, starting from the earliest completed day.
	completedDateStrs.sort()
	if (completedDateStrs[0]) {
		await recomputeLoadFrom(kody.id, completedDateStrs[0])
	}

	// A Target Event carrying a Plan Outline so the home "road to race" surface
	// is populated (ADR 0018: an active plan is the nearest upcoming Target Event
	// with a Plan Outline). A 10-week half-marathon build finishing HORIZON_DAYS
	// out: its plan start (raceDate − 10 weeks) lands well inside kody's replayed
	// real history, so "today" sits in the Peak phase, week 9 of 10.
	const raceDate = new Date(now.getTime() + HORIZON_DAYS * DAY_MS)
	raceDate.setUTCHours(9, 0, 0, 0)
	const planOutline = {
		phases: [
			{
				name: 'Base',
				weeks: 4,
				focus: 'Aerobic base and durability',
				weeklyLoadHours: 7,
			},
			{
				name: 'Build',
				weeks: 3,
				focus: 'Threshold and race-pace strength',
				weeklyLoadHours: 8,
			},
			{
				name: 'Peak',
				weeks: 2,
				focus: 'VO2 sharpening and race simulation',
				weeklyLoadHours: 7,
			},
			{
				name: 'Taper',
				weeks: 1,
				focus: 'Freshen up for race day',
				weeklyLoadHours: 4,
			},
		],
	}
	await prisma.event.create({
		data: {
			athleteId: kody.id,
			name: 'Spring Half Marathon',
			kind: 'race',
			priority: 'A',
			startDate: raceDate,
			disciplines: JSON.stringify(['run']),
			target: JSON.stringify({ kind: 'time', seconds: 5400 }),
			status: 'planned',
			planOutline: JSON.stringify(planOutline),
		},
	})

	console.timeEnd(`🏋️ Created training data for kody`)

	// The Week Replan demo athletes (#198, PRD #194 story 23): runa's closed
	// week overshot while her Form dived, so her current week is visibly
	// softened with Replan Notes; nils trained with no planned load and sees the
	// explicit "no adjustment — not enough data" decline. Both decisions are
	// stored by the real recompute-path applier inside the seeder.
	console.time(`⚖️ Created the Week Replan demo athletes`)
	await seedWeekReplanDemoAthletes(now)
	console.timeEnd(`⚖️ Created the Week Replan demo athletes`)

	console.timeEnd(`🌱 Database has been seeded`)
}

seed()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})

// we're ok to import from the test directory in this file
/*
eslint
	no-restricted-imports: "off",
*/
