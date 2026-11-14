import path from 'node:path'
import { ESLint } from 'eslint'
import { beforeAll, expect, test } from 'vitest'

/**
 * The `no-restricted-syntax` restrictions in `eslint.config.js` share one rule,
 * and flat config replaces a rule's options per block instead of merging them
 * (ADR 0119 §5). These lint a snippet at each kind of path through the real
 * config, so no restriction can silently shadow another again.
 */
const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, '../..') })

// Real files: the typed parser only parses a path its project service knows.
// The snippet replaces the file's text; nothing is read from or written to it.
const UTILS_FILE = 'app/utils/db.server.ts'
const SERVER_FILE = 'server/index.ts'
const ROUTE_FILE = 'app/routes/settings/profile/index.tsx'
const TEST_FILE = 'app/utils/catalogue.server.test.ts'
const ROUTE_TEST_FILE = 'app/routes/me.test.tsx'
// Fixtures under `tests/` sit outside the rule's files (ADR 0119 §4).
const FIXTURE_FILE = 'tests/playwright-utils.ts'

const USER_DELETE = `
import { prisma } from '#app/utils/db.server.ts'
export async function gone(id: string) {
	await prisma.user.delete({ where: { id } })
	await prisma.$transaction(async (tx) => tx.user.deleteMany({ where: { id } }))
	await prisma.$transaction([prisma.user.delete({ where: { id } })])
	await prisma.userImage.delete({ where: { userId: id } })
	await prisma.session.deleteMany({ where: { userId: id } })
}
`

const NATIVE_SELECT = `
export function Picker() {
	return <select name="sport" />
}
`

// The first lint builds the typed parser's program for the whole repo, which
// can outlast the default test timeout on a loaded machine; pay it once here.
beforeAll(async () => {
	await eslint.lintText('export {}\n', { filePath: UTILS_FILE })
}, 180_000)

async function restrictions(code: string, filePath: string) {
	const [result] = await eslint.lintText(code, { filePath })
	return (result?.messages ?? [])
		.filter((m) => m.ruleId === 'no-restricted-syntax')
		.map((m) => m.message)
}

const deleteAccountMessage = expect.stringContaining('deleteAccount')
const selectMessage = expect.stringContaining('Native <select>')

test('a direct user delete outside Account Erasure fails lint, naming deleteAccount', async () => {
	const messages = await restrictions(USER_DELETE, UTILS_FILE)
	// The direct call, the one in an interactive transaction and the one in a
	// batch; not `userImage` or `session`.
	expect(messages).toEqual([
		deleteAccountMessage,
		deleteAccountMessage,
		deleteAccountMessage,
	])
	expect(messages[0]).toContain('Orphaned Workouts')
	expect(await restrictions(USER_DELETE, SERVER_FILE)).toHaveLength(3)
})

// Every other shape that reaches a `User` delete, one per line, and the
// near-misses that must stay quiet.
const USER_DELETE_SHAPES = `
import { prisma } from '#app/utils/db.server.ts'
export async function gone(id: string, tx: typeof prisma) {
	await prisma['user'].delete({ where: { id } })
	await prisma.user['deleteMany']({ where: { id } })
	await prisma?.user?.delete({ where: { id } })
	const remove = prisma.user.delete.bind(prisma.user)
	const users = tx.user
	const { user } = prisma
	await prisma.$executeRaw\`DELETE FROM "User" WHERE id = \${id}\`
	await prisma.$executeRawUnsafe('delete from User where id = ?', id)
	return [remove, users, user]
}
`
const NEAR_MISSES = `
import { prisma } from '#app/utils/db.server.ts'
export async function kept(id: string, session: { user: unknown }) {
	await prisma.user.findMany({ where: { id } })
	await prisma.userImage.delete({ where: { userId: id } })
	await prisma.$executeRaw\`DELETE FROM "UserImage" WHERE "userId" = \${id}\`
	const { user } = session
	const viewer = session.user
	return [user, viewer]
}
`

test('a user delete by any other shape fails lint too', async () => {
	expect(await restrictions(USER_DELETE_SHAPES, UTILS_FILE)).toEqual(
		Array(8).fill(deleteAccountMessage),
	)
	expect(await restrictions(NEAR_MISSES, UTILS_FILE)).toEqual([])
})

test('a route file is held to both restrictions at once', async () => {
	const messages = await restrictions(
		`${USER_DELETE}\n${NATIVE_SELECT}`,
		ROUTE_FILE,
	)
	expect(messages).toEqual(expect.arrayContaining([selectMessage]))
	expect(messages.filter((m) => m.includes('deleteAccount'))).toHaveLength(3)
})

test('Account Erasure itself and tests may delete a user; route tests keep the <select> guard', async () => {
	expect(
		await restrictions(USER_DELETE, 'app/utils/account-deletion.server.ts'),
	).toEqual([])
	expect(await restrictions(USER_DELETE, TEST_FILE)).toEqual([])
	expect(await restrictions(USER_DELETE_SHAPES, FIXTURE_FILE)).toEqual([])
	expect(
		await restrictions(`${USER_DELETE}\n${NATIVE_SELECT}`, ROUTE_TEST_FILE),
	).toEqual([selectMessage])
})
