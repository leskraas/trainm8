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
			activityType: 'run',
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
									description: '10 min easy jog',
									activity: 'run',
									intensity: 'easy',
									orderIndex: 0,
									durationSec: 600,
								},
								{
									description: '4 × 100m strides',
									activity: 'run',
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
									description: '20 min at tempo pace (zone 4)',
									activity: 'run',
									intensity: 'threshold',
									orderIndex: 0,
									durationSec: 1200,
								},
								{
									description: '2 min walk recovery',
									activity: 'rest',
									intensity: 'easy',
									orderIndex: 1,
									durationSec: 120,
								},
								{
									description: '10 min at tempo pace (zone 4)',
									activity: 'run',
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
									description: '10 min easy jog',
									activity: 'run',
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
			activityType: 'swim',
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
									description: 'Easy 200m',
									activity: 'swim',
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
									description: '100m sprint',
									activity: 'swim',
									intensity: 'max',
									orderIndex: 0,
									distanceM: 100,
								},
								{
									description: '30s rest',
									activity: 'rest',
									intensity: 'easy',
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
			activityType: 'strength',
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
									description: 'Squats',
									activity: 'strength',
									intensity: 'threshold',
									orderIndex: 0,
									durationSec: 45,
								},
								{
									description: 'Push-ups',
									activity: 'strength',
									intensity: 'threshold',
									orderIndex: 1,
									durationSec: 45,
								},
								{
									description: 'Rest between exercises',
									activity: 'rest',
									intensity: 'easy',
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

	const completedSession1 = await prisma.scheduledSession.create({
		data: {
			userId: kody.id,
			workoutId: tempoRun.id,
			scheduledAt: daysAgo(3),
			status: 'completed',
		},
	})

	const completedSession2 = await prisma.scheduledSession.create({
		data: {
			userId: kody.id,
			workoutId: tempoRun.id,
			scheduledAt: daysAgo(5),
			status: 'completed',
		},
	})

	const completedSession3 = await prisma.scheduledSession.create({
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
