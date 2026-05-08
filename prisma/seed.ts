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

	const kodyImages = {
		kodyUser: { objectKey: 'user/kody.png' },
	}

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
			objectKey: kodyImages.kodyUser.objectKey,
		},
	})

	console.timeEnd(`🐨 Created admin user "kody"`)

	console.time(`🏋️ Created training data for kody`)

	const now = new Date()
	const inDays = (n: number) =>
		new Date(now.getTime() + n * 24 * 60 * 60 * 1000)

	await prisma.workout.create({
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
						steps: {
							create: [
								{
									description: '10 min easy jog',
									activity: 'run',
									intensity: 'easy',
									orderIndex: 0,
								},
								{
									description: '4 × 100m strides',
									activity: 'run',
									intensity: 'threshold',
									orderIndex: 1,
								},
							],
						},
					},
					{
						name: 'Main Set',
						orderIndex: 1,
						steps: {
							create: [
								{
									description: '20 min at tempo pace (zone 4)',
									activity: 'run',
									intensity: 'threshold',
									orderIndex: 0,
								},
								{
									description: '2 min walk recovery',
									activity: 'rest',
									intensity: 'easy',
									orderIndex: 1,
								},
								{
									description: '10 min at tempo pace (zone 4)',
									activity: 'run',
									intensity: 'threshold',
									orderIndex: 2,
								},
							],
						},
					},
					{
						name: 'Cool-down',
						orderIndex: 2,
						steps: {
							create: [
								{
									description: '10 min easy jog',
									activity: 'run',
									intensity: 'easy',
									orderIndex: 0,
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
