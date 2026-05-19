import { prisma } from '#app/utils/db.server.ts'
import { MOCK_CODE_GITHUB } from '#app/utils/providers/constants.ts'
import { createPassword, createUser, getUserImages } from '#tests/db-utils.ts'
import { insertGitHubUser } from '#tests/mocks/github.ts'

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

	const now = new Date()
	const inDays = (n: number) =>
		new Date(now.getTime() + n * 24 * 60 * 60 * 1000)
	const daysAgo = (n: number) =>
		new Date(now.getTime() - n * 24 * 60 * 60 * 1000)

	const tempoRun = await prisma.workout.create({
		data: {
			title: 'Tuesday Tempo Run',
			description:
				'45-minute tempo session with structured warm-up and cool-down.',
			discipline: 'run',
			intent: 'tempo',
			ownerId: kody.id,
			blocks: {
				create: [
					{
						name: 'Warm-up',
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									kind: 'cardio',
									notes: '10 min easy jog',
									discipline: 'run',
									intensity: 'easy',
									orderIndex: 0,
									durationSec: 600,
								},
								{
									kind: 'cardio',
									notes: '4 × 100m strides',
									discipline: 'run',
									intensity: 'threshold',
									orderIndex: 1,
									distanceM: 400,
								},
							],
						},
					},
					{
						name: 'Main Set',
						orderIndex: 1,
						repeatCount: 1,
						steps: {
							create: [
								{
									kind: 'cardio',
									notes: '20 min at tempo pace (zone 4)',
									discipline: 'run',
									intensity: 'threshold',
									orderIndex: 0,
									durationSec: 1200,
								},
								{
									kind: 'rest',
									notes: '2 min walk recovery',
									orderIndex: 1,
									durationSec: 120,
								},
								{
									kind: 'cardio',
									notes: '10 min at tempo pace (zone 4)',
									discipline: 'run',
									intensity: 'threshold',
									orderIndex: 2,
									durationSec: 600,
								},
							],
						},
					},
					{
						name: 'Cool-down',
						orderIndex: 2,
						repeatCount: 1,
						steps: {
							create: [
								{
									kind: 'cardio',
									notes: '10 min easy jog',
									discipline: 'run',
									intensity: 'easy',
									orderIndex: 0,
									durationSec: 600,
								},
							],
						},
					},
				],
			},
			sessions: {
				create: [
					{ userId: kody.id, scheduledAt: inDays(2), status: 'scheduled' },
					{ userId: kody.id, scheduledAt: inDays(5), status: 'scheduled' },
					{ userId: kody.id, scheduledAt: inDays(9), status: 'scheduled' },
				],
			},
		},
	})

	await prisma.workout.create({
		data: {
			title: 'Swim Intervals',
			description: 'Pool session with repeat 100m sprints.',
			discipline: 'swim',
			intent: 'endurance',
			ownerId: kody.id,
			blocks: {
				create: [
					{
						name: 'Warm-up',
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									kind: 'cardio',
									notes: 'Easy 200m',
									discipline: 'swim',
									intensity: 'easy',
									orderIndex: 0,
									distanceM: 200,
								},
							],
						},
					},
					{
						name: 'Main Set',
						orderIndex: 1,
						repeatCount: 4,
						steps: {
							create: [
								{
									kind: 'cardio',
									notes: '100m sprint',
									discipline: 'swim',
									intensity: 'max',
									orderIndex: 0,
									distanceM: 100,
								},
								{
									kind: 'rest',
									notes: '30s rest',
									orderIndex: 1,
									durationSec: 30,
								},
							],
						},
					},
				],
			},
			sessions: {
				create: [
					{ userId: kody.id, scheduledAt: inDays(3), status: 'scheduled' },
				],
			},
		},
	})

	await prisma.workout.create({
		data: {
			title: 'Strength Circuit',
			description: 'Full-body strength session.',
			discipline: 'strength',
			intent: 'strength-max',
			ownerId: kody.id,
			blocks: {
				create: [
					{
						name: 'Circuit',
						orderIndex: 0,
						repeatCount: 3,
						steps: {
							create: [
								{
									kind: 'strength',
									exerciseId: 'ex_bb_back_squat',
									restBetweenSetsSec: 60,
									orderIndex: 0,
									sets: {
										create: [{ kind: 'timed', orderIndex: 0, durationSec: 45 }],
									},
								},
								{
									kind: 'strength',
									exerciseId: 'ex_bw_pushup',
									restBetweenSetsSec: 60,
									orderIndex: 1,
									sets: {
										create: [{ kind: 'timed', orderIndex: 0, durationSec: 45 }],
									},
								},
								{
									kind: 'rest',
									notes: 'Rest between exercises',
									orderIndex: 2,
									durationSec: 30,
								},
							],
						},
					},
				],
			},
			sessions: {
				create: [
					{ userId: kody.id, scheduledAt: inDays(4), status: 'scheduled' },
				],
			},
		},
	})

	const completedSession1 = await prisma.workoutSession.create({
		data: {
			userId: kody.id,
			workoutId: tempoRun.id,
			scheduledAt: daysAgo(3),
			status: 'completed',
		},
	})

	const completedSession2 = await prisma.workoutSession.create({
		data: {
			userId: kody.id,
			workoutId: tempoRun.id,
			scheduledAt: daysAgo(5),
			status: 'completed',
		},
	})

	const completedSession3 = await prisma.workoutSession.create({
		data: {
			userId: kody.id,
			workoutId: tempoRun.id,
			scheduledAt: daysAgo(7),
			status: 'completed',
		},
	})

	await prisma.sessionLog.createMany({
		data: [
			{
				sessionId: completedSession1.id,
				content:
					'Felt strong on the tempo intervals. Legs were fresh from the rest day.',
				rpe: 7,
			},
			{
				sessionId: completedSession2.id,
				content:
					'Tough session — headwind on the main set made it harder than usual. Had to dig deep on the second tempo block.',
				rpe: 9,
			},
			{
				sessionId: completedSession3.id,
				content: 'Easy recovery run, kept it conversational the whole time.',
			},
		],
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
