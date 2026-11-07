import path from 'node:path'
import { ESLint } from 'eslint'
import { beforeAll, describe, expect, test } from 'vitest'

// The luma-steps guard (ADR 0113 §2), tested through the real eslint.config.js:
// what it rejects, where it applies, and that the native-<select> guard beside
// it still fires.
const root = path.resolve(import.meta.dirname, '../..')
const eslint = new ESLint({ cwd: root })

const offScale = `export function A() {
	return <div className="rounded-xl p-4 text-sm md:text-lg">x</div>
}
`
const onSteps = `export function A() {
	return <div className="text-callout rounded-4xl p-4 md:rounded-3xl">x</div>
}
`
const nativeSelect = `export function A() {
	return <select className="rounded-3xl" />
}
`

async function luma(code: string, file: string) {
	const [result] = await eslint.lintText(code, {
		filePath: path.join(root, file),
	})
	return result!.messages.filter((m) => m.ruleId === 'trainm8/luma-steps')
}

describe('trainm8/luma-steps', () => {
	beforeAll(async () => {
		// The typed parser builds its program on the first lint; pay it here.
		await luma('export {}\n', 'app/routes/training/plan.tsx')
	}, 120_000)

	test.each([
		'app/routes/training/__sets-popover.tsx',
		'app/components/page-header.tsx',
	])(
		'an off-scale corner and raw sizes fail in %s, naming the step',
		async (file) => {
			const messages = await luma(offScale, file)
			expect(messages.map((m) => m.message)).toEqual([
				expect.stringMatching(/`rounded-xl`.*`rounded-4xl`.*design-system\.md/),
				expect.stringMatching(/`text-sm`.*`text-callout`.*design-system\.md/),
				expect.stringMatching(/`text-lg` is a raw text size/),
			])
		},
	)

	test('a template literal and a cn() argument are read too', async () => {
		const code = `import { cn } from '#app/utils/misc.tsx'
export const a = cn('rounded-md', \`p-2 data-[open]:!text-xs\`)
`
		const messages = await luma(code, 'app/components/page-header.tsx')
		expect(messages.map((m) => m.message)).toEqual([
			expect.stringMatching(/^`rounded-md`/),
			expect.stringMatching(/^`text-xs`/),
		])
	})

	test('the luma steps pass', async () => {
		expect(await luma(onSteps, 'app/routes/training/plan.tsx')).toEqual([])
	})

	test.each([
		'app/components/ui/button.tsx',
		'app/routes/_auth/login.tsx',
		'app/routes/admin/moderation.tsx',
		'app/routes/training/plan.test.tsx',
	])('%s sits outside the guard', async (file) => {
		expect(await luma(offScale, file)).toEqual([])
	})

	test('the native-<select> guard still fires on a route', async () => {
		const [result] = await eslint.lintText(nativeSelect, {
			filePath: path.join(root, 'app/routes/training/plan.tsx'),
		})
		expect(
			result!.messages.some(
				(m) =>
					m.ruleId === 'no-restricted-syntax' &&
					/Native <select>/.test(m.message),
			),
		).toBe(true)
	})
})
