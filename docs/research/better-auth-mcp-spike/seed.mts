// PROTOTYPE, wipe me (#552). One athlete with a Better Auth password, and one
// user created the Epic way (cuid id, name null, no Better Auth account row).
import { auth, prisma } from './auth.mts'

const password = process.env.SPIKE_PASSWORD ?? 'spike-password-1'
if (!(await prisma.user.findUnique({ where: { username: 'athlete' } }))) {
	await auth.api.signUpEmail({
		body: {
			email: 'athlete@example.com',
			password,
			name: 'Athlete',
			username: 'athlete',
		},
	})
}
await prisma.user.upsert({
	where: { username: 'epiconly' },
	create: { email: 'epiconly@example.com', username: 'epiconly', name: null },
	update: {},
})
console.log(
	await prisma.user.findMany({
		select: { id: true, email: true, username: true, name: true },
	}),
)
await prisma.$disconnect()
