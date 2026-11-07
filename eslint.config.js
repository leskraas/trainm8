import { default as defaultConfig } from '@epic-web/config/eslint'

// `no-restricted-syntax` restrictions, named so a block can list several.
// ESLint's flat config replaces a rule's options per matching block rather than
// merging them (ADR 0112 §5): a block that lists one restriction silently drops
// every other on the files it shares, so a block covering route files lists
// them all. `eslint-restrictions.test.ts` lints a snippet at each path to keep
// it that way.

// Mobile-first UI regression guard (map #277, decided in #296): native
// `<select>` is a §2.4 violation — every enum field uses the shared Base UI
// `Select` (via `SelectField`) so the trigger renders `labels.ts` values at a
// 44px touch target with 16px phone fonts. Scoped to in-scope route files;
// admin/marketing/seo are out of this effort's scope (see #277's Out of
// scope). An AST selector (not text match) so it ignores `<Select>` and
// mentions of `<select>` in comments.
export const NATIVE_SELECT_RESTRICTION = {
	selector: "JSXOpeningElement[name.name='select']",
	message:
		'Native <select> is a mobile-first UI violation (docs/design/ui-conventions.md §2.4). Use SelectField (Conform-bound) or the shared Base UI <Select> primitive so the trigger renders labels.ts values at a 44px touch target with 16px phone fonts.',
}

// One deletion path for a `User` (#468, ADR 0112 §4): `Workout.ownerId` is
// `SetNull`, so any other delete leaves the athlete's Workouts behind as
// Orphaned Workouts. Catches `prisma.user.delete`, `tx.user.deleteMany` and one
// inside a batch `$transaction([...])`; not `userImage` or a bare `user.delete()`.
export const USER_DELETE_RESTRICTION = {
	selector:
		"CallExpression[callee.type='MemberExpression'][callee.property.name=/^(delete|deleteMany)$/][callee.object.type='MemberExpression'][callee.object.property.name='user']",
	message:
		'Delete a User only through deleteAccount (app/utils/account-deletion.server.ts). Workout.ownerId is SetNull, so a bare user.delete/deleteMany leaves the athlete’s Workouts behind as Orphaned Workouts (ADR 0112).',
}

const NATIVE_SELECT_FILES = ['app/routes/**/*.tsx']
const NATIVE_SELECT_IGNORES = [
	'app/routes/admin/**',
	'app/routes/_marketing/**',
	'app/routes/_seo/**',
]
const USER_DELETE_FILES = ['app/**/*.{ts,tsx}', 'server/**/*.ts']
// Account Erasure itself, and tests and their fixtures, which set up and tear
// down users directly.
const USER_DELETE_IGNORES = [
	'app/utils/account-deletion.server.ts',
	'**/*.test.{ts,tsx}',
	'**/fixtures/**',
	'**/*-fixtures.ts',
]

/** @type {import("eslint").Linter.Config} */
export default [
	...defaultConfig,
	// add custom config objects here:
	{
		files: ['**/tests/**/*.ts'],
		rules: { 'react-hooks/rules-of-hooks': 'off' },
	},
	{
		files: USER_DELETE_FILES,
		ignores: USER_DELETE_IGNORES,
		rules: {
			'no-restricted-syntax': ['error', USER_DELETE_RESTRICTION],
		},
	},
	// Route files under both restrictions: listed together, since this block
	// replaces the one above on the files they share.
	{
		files: NATIVE_SELECT_FILES,
		ignores: [...NATIVE_SELECT_IGNORES, ...USER_DELETE_IGNORES],
		rules: {
			'no-restricted-syntax': [
				'error',
				NATIVE_SELECT_RESTRICTION,
				USER_DELETE_RESTRICTION,
			],
		},
	},
	// Route test files keep the `<select>` guard; the user-delete one exempts them.
	{
		files: NATIVE_SELECT_FILES.map((glob) =>
			glob.replace(/\.tsx$/, '.test.tsx'),
		),
		ignores: NATIVE_SELECT_IGNORES,
		rules: {
			'no-restricted-syntax': ['error', NATIVE_SELECT_RESTRICTION],
		},
	},
	{
		ignores: ['.react-router/*'],
	},
]
