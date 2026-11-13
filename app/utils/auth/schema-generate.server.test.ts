import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { expect, test } from 'vitest'

/**
 * `prisma/schema.prisma` is what Better Auth's CLI generates for the
 * configured `auth` (ADR 0094 §2): a configuration change, plugin or upgrade
 * that needs a column or table fails here until the schema and a migration
 * carry it. The CLI rewrites a copy of the schema, never the schema itself.
 */

const SCHEMA_PATH = path.join(process.cwd(), 'prisma/schema.prisma')
const CONFIG_PATH = 'app/utils/auth/better-auth.server.ts'

/**
 * The two faults the 1.7.12 CLI is known to write (ADR 0094 §2): the invalid
 * `@default([])` on a SQLite `String?` (P1012), and `@@map` to the model's own
 * name with a lower-case first letter. ADR 0094 names `@@map("user")`; the CLI
 * writes the same `@@map` on every model Better Auth owns (`AuthSession` gets
 * `@@map("authSession")`), and each is wrong on a case-sensitive database for
 * the same reason. Any other `@@map` is a real difference and stays.
 */
function normaliseCliFaults(schema: string) {
	let model: string | null = null
	return schema
		.split('\n')
		.filter((line) => {
			model = /^\s*model\s+(\w+)\s*\{/.exec(line)?.[1] ?? model
			const mapped = /^\s*@@map\("(\w+)"\)\s*$/.exec(line)?.[1]
			return !(
				model &&
				mapped &&
				mapped === model.charAt(0).toLowerCase() + model.slice(1)
			)
		})
		.map((line) =>
			line.replace(/^(\s*\w+\s+String\?.*?)\s*@default\(\[\]\)/, '$1'),
		)
		.join('\n')
}

/**
 * The CLI re-prints the whole file: it moves comments, reorders block
 * attributes and re-aligns columns. None of that changes the schema, so each
 * block is compared as a set of statements, without comments or whitespace.
 */
function canonical(schema: string) {
	const blocks = new Map<string, string[]>()
	let current: { name: string; lines: string[] } | null = null
	for (const raw of schema.split('\n')) {
		const line = raw
			.replace(/(^|\s)\/\/.*$/, '')
			.replace(/\s+/g, ' ')
			.trim()
		if (!line) continue
		const opening =
			/^(model|enum|generator|datasource|view|type) (\w+) \{$/.exec(line)
		if (opening) {
			current = { name: `${opening[1]} ${opening[2]}`, lines: [] }
		} else if (line === '}' && current) {
			blocks.set(current.name, current.lines.sort())
			current = null
		} else if (current) {
			current.lines.push(line)
		}
	}
	return Object.fromEntries([...blocks].sort(([a], [b]) => a.localeCompare(b)))
}

test('the normaliser strips exactly the two known CLI faults', () => {
	const generated = [
		'model User {',
		'  id     String  @id',
		'  scopes String? @default([])',
		'',
		'  @@map("user")',
		'}',
	].join('\n')

	expect(canonical(normaliseCliFaults(generated))).toEqual({
		'model User': ['id String @id', 'scopes String?'],
	})
	const ownName =
		'model AuthSession {\n  id String @id\n  @@map("authSession")\n}'
	expect(normaliseCliFaults(ownName)).not.toContain('@@map')
	const otherName =
		'model AuthSession {\n  id String @id\n  @@map("sessions")\n}'
	expect(normaliseCliFaults(otherName)).toContain('@@map("sessions")')
})

test('`npx auth generate` for the configured auth matches prisma/schema.prisma', async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'auth-generate-'))
	const output = path.join(dir, 'schema.prisma')
	try {
		const schema = await fs.readFile(SCHEMA_PATH, 'utf8')
		await fs.writeFile(output, schema)

		await execa(
			'npx',
			[
				'auth',
				'generate',
				'--config',
				CONFIG_PATH,
				'--output',
				output,
				'--yes',
			],
			{ cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'test' } },
		)

		const generated = normaliseCliFaults(await fs.readFile(output, 'utf8'))
		expect(canonical(generated)).toEqual(canonical(schema))
	} finally {
		await fs.rm(dir, { recursive: true, force: true })
	}
}, 120_000)
