import { prisma } from '#app/utils/db.server.ts'
import { recomputeLoadFrom } from '#app/utils/load/snapshot.server.ts'
import { MOCK_CODE_GITHUB } from '#app/utils/providers/constants.ts'
import { createPassword, createUser, getUserImages } from '#tests/db-utils.ts'
import { insertGitHubUser } from '#tests/mocks/github.ts'

// ---------------------------------------------------------------------------
// Workout library + schedule generation for kody's training data.
// Cardio step `intensity` uses plain zone labels (easy/endurance/tempo/
// threshold/max) which map to training zones 1–5 for the session profile bars.
// ---------------------------------------------------------------------------

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
					{ i: 'threshold', d: 1200, n: '20 min at tempo' },
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
					{ i: 'threshold', d: 720, n: '12 min at threshold' },
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
const HISTORY_DAYS = 56
const HORIZON_DAYS = 14
const MISSED_OFFSETS = new Set([-23, -38])

/** Pick a template key for a given weekday / day offset, or null for a rest day. */
function planFor(dayOfWeek: number, offset: number): string | null {
	// Recent recovery block → lighter load so Form trends fresh.
	if (offset >= -10 && offset < 0) {
		switch (dayOfWeek) {
			case 2:
				return 'recoveryRun'
			case 5:
				return 'easyRun'
			default:
				return null
		}
	}
	const evenWeek = Math.floor((offset + HISTORY_DAYS) / 7) % 2 === 0
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

function jitterRpe(base: number, offset: number): number {
	const delta = (((offset % 3) + 3) % 3) - 1 // -1, 0, +1
	return Math.max(1, Math.min(10, base + delta))
}

function logContentFor(t: Template, rpe: number): string {
	if (rpe >= 8) return `${t.title} — really had to dig in on the hard sets.`
	if (rpe >= 6) return `${t.title} — solid session, stayed on target.`
	if (rpe <= 3) return `${t.title} — kept it genuinely easy, felt fresh.`
	return `${t.title} — comfortable, controlled effort throughout.`
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
				create: [
					{
						discipline: 'run',
						maxHr: 190,
						lthr: 168,
						thresholdPaceSecPerKm: 240,
					},
					{ discipline: 'bike', maxHr: 188, lthr: 165, ftp: 250 },
					{ discipline: 'swim', cssSecPer100m: 95 },
					{ discipline: 'strength' },
				],
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
	const templatesByKey = Object.fromEntries(TEMPLATES.map((t) => [t.key, t]))

	const now = new Date()
	let recordingSeq = 0
	const completedDateStrs: string[] = []

	for (let offset = -HISTORY_DAYS; offset <= HORIZON_DAYS; offset++) {
		const day = new Date(now.getTime() + offset * DAY_MS)
		const key = planFor(day.getUTCDay(), offset)
		if (!key) continue
		const template = templatesByKey[key]!

		const isPlanned = offset >= 0
		const scheduledAt = new Date(day)
		scheduledAt.setUTCHours(isPlanned ? 18 : 12, 0, 0, 0)

		if (isPlanned) {
			await prisma.workoutSession.create({
				data: {
					userId: kody.id,
					workoutId: workoutIds[key],
					scheduledAt,
					status: 'scheduled',
				},
			})
			continue
		}

		if (MISSED_OFFSETS.has(offset)) {
			await prisma.workoutSession.create({
				data: {
					userId: kody.id,
					workoutId: workoutIds[key],
					scheduledAt,
					status: 'missed',
				},
			})
			continue
		}

		// Completed: attach a recording (duration) + a log (RPE) so the load
		// pipeline can compute sRPE TSS for this day.
		const durationSec = template.minutes * 60
		const recording = await prisma.activityImport.create({
			select: { id: true },
			data: {
				athleteId: kody.id,
				externalProvider: 'manual',
				externalId: `seed-rec-${recordingSeq++}`,
				startedAt: scheduledAt,
				endedAt: new Date(scheduledAt.getTime() + durationSec * 1000),
				durationSec,
				discipline: template.discipline,
				rawJson: '{}',
			},
		})
		const rpe = jitterRpe(template.rpe, offset)
		await prisma.workoutSession.create({
			data: {
				userId: kody.id,
				workoutId: workoutIds[key],
				scheduledAt,
				status: 'completed',
				recordingId: recording.id,
				sessionLog: { create: { rpe, content: logContentFor(template, rpe) } },
			},
		})
		completedDateStrs.push(scheduledAt.toISOString().slice(0, 10))
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
	// out: its plan start (raceDate − 10 weeks) lands on the seeded HISTORY_DAYS
	// of training, so "today" sits in the Peak phase, week 9 of 10.
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
