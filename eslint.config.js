import { default as defaultConfig } from '@epic-web/config/eslint'

/** @type {import("eslint").Linter.Config} */
export default [
	...defaultConfig,
	// add custom config objects here:
	{
		files: ['**/tests/**/*.ts'],
		rules: { 'react-hooks/rules-of-hooks': 'off' },
	},
	// Mobile-first UI regression guard (map #277, decided in #296): native
	// `<select>` is a §2.4 violation — every enum field uses the shared Base UI
	// `Select` (via `SelectField`) so the trigger renders `labels.ts` values at a
	// 44px touch target with 16px phone fonts. Scoped to in-scope route files;
	// admin/marketing/seo are out of this effort's scope (see #277's Out of
	// scope). An AST selector (not text match) so it ignores `<Select>` and
	// mentions of `<select>` in comments.
	{
		files: ['app/routes/**/*.tsx'],
		ignores: [
			'app/routes/admin/**',
			'app/routes/_marketing/**',
			'app/routes/_seo/**',
		],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "JSXOpeningElement[name.name='select']",
					message:
						'Native <select> is a mobile-first UI violation (docs/design/ui-conventions.md §2.4). Use SelectField (Conform-bound) or the shared Base UI <Select> primitive so the trigger renders labels.ts values at a 44px touch target with 16px phone fonts.',
				},
			],
		},
	},
	{
		ignores: ['.react-router/*'],
	},
]
