import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'

// `20261107121546_a_notice_may_carry_no_ctl_pair` (#463, ADR 0113) run for
// real against the table it replaced: every row survives with its dates, the
// strength pairs and the swim pairs that moved keep their figures, and only the
// swim placeholder pairs (equal on both sides) go absent.

const MIGRATIONS = path.join(process.cwd(), 'prisma/migrations')

/** A migration file's statements, comments stripped, one per call. */
function statements(name: string): string[] {
	const sql = fs.readFileSync(
		path.join(MIGRATIONS, name, 'migration.sql'),
		'utf8',
	)
	return sql
		.split(/;\s*$/m)
		.map((statement) =>
			statement
				.split('\n')
				.filter((line) => !line.trimStart().startsWith('--'))
				.join('\n')
				.trim(),
		)
		.filter(Boolean)
}

/**
 * Run DDL on one connection. Prisma pools SQLite connections, and a rebuild
 * spread across them can see a stale schema: the RENAME then finds the table
 * the DROP just removed ("there is already another table … with this name").
 */
async function onOneConnection(sql: string[]) {
	await prisma.$transaction(async (tx) => {
		for (const statement of sql) await tx.$executeRawUnsafe(statement)
	})
}

async function run(name: string) {
	await onOneConnection(statements(name))
}

/** Put the table back the way the first migration made it: both NOT NULL. */
async function restoreOldTable() {
	await onOneConnection([
		'DROP TABLE "LoadRecomputeNotice"',
		...statements('20260731070614_add_load_recompute_notice'),
	])
}

async function createAthlete() {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
}

type OldRow = {
	id: string
	athleteId: string
	kind: string
	ctlBefore: number
	ctlAfter: number
	createdAt: Date
	dismissedAt: Date | null
}

async function insertOld(row: OldRow) {
	await prisma.$executeRaw`
		INSERT INTO "LoadRecomputeNotice"
			("id", "athleteId", "kind", "ctlBefore", "ctlAfter", "createdAt", "dismissedAt")
		VALUES
			(${row.id}, ${row.athleteId}, ${row.kind}, ${row.ctlBefore}, ${row.ctlAfter}, ${row.createdAt}, ${row.dismissedAt})`
}

test('the migration keeps every row and makes only the swim placeholders absent', async () => {
	await restoreOldTable()
	const a = await createAthlete()
	const b = await createAthlete()
	const c = await createAthlete()
	const at = (day: string) => new Date(`${day}T06:00:00.000Z`)

	const old: OldRow[] = [
		// A strength drop, read and dismissed.
		{
			id: 'strength-a',
			athleteId: a.id,
			kind: 'strength-left-the-triad',
			ctlBefore: 62.4,
			ctlAfter: 47.8,
			createdAt: at('2026-08-01'),
			dismissedAt: at('2026-08-03'),
		},
		// A swim rise: a real movement, kept.
		{
			id: 'swim-a',
			athleteId: a.id,
			kind: 'swim-rest-left-the-pace',
			ctlBefore: 21.3,
			ctlAfter: 23.8,
			createdAt: at('2026-10-20'),
			dismissedAt: null,
		},
		// The placeholder: today's CTL on both sides.
		{
			id: 'swim-b',
			athleteId: b.id,
			kind: 'swim-rest-left-the-pace',
			ctlBefore: 34.7,
			ctlAfter: 34.7,
			createdAt: at('2026-10-20'),
			dismissedAt: at('2026-10-21'),
		},
		// The placeholder for a swimmer with no Load Snapshots: 0 on both sides.
		{
			id: 'swim-c',
			athleteId: c.id,
			kind: 'swim-rest-left-the-pace',
			ctlBefore: 0,
			ctlAfter: 0,
			createdAt: at('2026-10-20'),
			dismissedAt: null,
		},
		// An equal strength pair is never touched: only swim placeholders are.
		{
			id: 'strength-c',
			athleteId: c.id,
			kind: 'strength-left-the-triad',
			ctlBefore: 5,
			ctlAfter: 5,
			createdAt: at('2026-08-01'),
			dismissedAt: null,
		},
	]
	for (const row of old) await insertOld(row)

	await run('20261107121546_a_notice_may_carry_no_ctl_pair')

	const rows = await prisma.loadRecomputeNotice.findMany({
		orderBy: { id: 'asc' },
	})
	const absent = { ctlBefore: null, ctlAfter: null }
	const expected = old
		.map((row) =>
			row.id === 'swim-b' || row.id === 'swim-c' ? { ...row, ...absent } : row,
		)
		.sort((x, y) => x.id.localeCompare(y.id))
	expect(rows).toEqual(expected)

	// The rebuilt table kept its constraints: a half pair is refused, a second
	// notice of one kind is refused.
	await expect(
		prisma.loadRecomputeNotice.create({
			data: { athleteId: b.id, kind: 'strength-left-the-triad', ctlBefore: 1 },
		}),
	).rejects.toThrow()
	await expect(
		prisma.loadRecomputeNotice.create({
			data: { athleteId: b.id, kind: 'swim-rest-left-the-pace' },
		}),
	).rejects.toThrow()
})
