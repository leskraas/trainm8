import { default as defaultConfig } from '@epic-web/config/eslint'

// `no-restricted-syntax` restrictions, named so a block can list several.
// ESLint's flat config replaces a rule's options per matching block rather than
// merging them (ADR 0114 §5): a block that lists one restriction silently drops
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
const NATIVE_SELECT_RESTRICTION = {
	selector: "JSXOpeningElement[name.name='select']",
	message:
		'Native <select> is a mobile-first UI violation (docs/design/ui-conventions.md §2.4). Use SelectField (Conform-bound) or the shared Base UI <Select> primitive so the trigger renders labels.ts values at a 44px touch target with 16px phone fonts.',
}

// One deletion path for a `User` (#468, ADR 0114 §4): `Workout.ownerId` is
// `SetNull`, so any other delete leaves the athlete's Workouts behind as
// Orphaned Workouts. Several selectors, one per shape that reaches the delete:
// - `.user.delete` / `.user.deleteMany` read off any object, called or not (a
//   call, an optional call, one inside a batch `$transaction([...])`, `.bind`),
//   dotted or computed (`prisma['user']['delete']`);
// - the `user` delegate taken off a client into a variable or a destructuring
//   (`const u = tx.user`, `const { user } = prisma`), which would let a later
//   `u.delete` through; the client names the repo uses are listed;
// - a raw `DELETE FROM "User"` in any string or template.
// Not `userImage`, a bare `user.delete()`, or a `prisma.user.findMany` chain.
const USER_DELETE_MESSAGE =
	'Delete a User only through deleteAccount (app/utils/account-deletion.server.ts). Workout.ownerId is SetNull, so a bare user.delete/deleteMany leaves the athlete’s Workouts behind as Orphaned Workouts (ADR 0114).'
const DELETE_KEY = '/^(delete|deleteMany)$/'
const PRISMA_CLIENT = '/^(prisma|tx|db|client)$/'
const RAW_USER_DELETE = '/DELETE\\s+FROM\\s+\\W?User\\W?(\\s|;|$)/i'
const USER_DELETE_RESTRICTIONS = [
	{
		selector: `MemberExpression:matches([property.name=${DELETE_KEY}], [property.value=${DELETE_KEY}]):matches([object.property.name='user'], [object.property.value='user'])`,
		message: USER_DELETE_MESSAGE,
	},
	{
		selector: `VariableDeclarator[init.object.name=${PRISMA_CLIENT}]:matches([init.property.name='user'], [init.property.value='user'])`,
		message: USER_DELETE_MESSAGE,
	},
	{
		selector: `VariableDeclarator[init.name=${PRISMA_CLIENT}] > ObjectPattern > Property:matches([key.name='user'], [key.value='user'])`,
		message: USER_DELETE_MESSAGE,
	},
	{
		selector: `:matches(TemplateElement[value.raw=${RAW_USER_DELETE}], Literal[value=${RAW_USER_DELETE}])`,
		message: USER_DELETE_MESSAGE,
	},
]

const NATIVE_SELECT_FILES = ['app/routes/**/*.tsx']
const NATIVE_SELECT_IGNORES = [
	'app/routes/admin/**',
	'app/routes/_marketing/**',
	'app/routes/_seo/**',
]
const USER_DELETE_FILES = ['app/**/*.{ts,tsx}', 'server/**/*.ts']
// Account Erasure itself, and test files, which set up and tear down users
// directly. Fixtures under `tests/` sit outside `USER_DELETE_FILES`; one inside
// `app/` is linted like any module (ADR 0114 §4).
const USER_DELETE_IGNORES = [
	'app/utils/account-deletion.server.ts',
	'**/*.test.{ts,tsx}',
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
			'no-restricted-syntax': ['error', ...USER_DELETE_RESTRICTIONS],
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
				...USER_DELETE_RESTRICTIONS,
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
