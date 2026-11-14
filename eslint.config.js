import { default as defaultConfig } from '@epic-web/config/eslint'
import trainm8 from './eslint-rules/luma-steps.js'

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
	// Luma steps guard (ADR 0119 §2): page code uses the luma radius steps and
	// the type scale (ADR 0085, docs/design/design-system.md). A local rule of
	// its own, so its scope never shadows the `no-restricted-syntax` guards.
	// Generated primitives, admin, marketing, SEO, auth (the Epic marketing
	// scale), throwaway prototypes and tests sit outside it.
	{
		files: ['app/**/*.{ts,tsx}'],
		ignores: [
			'app/components/ui/**',
			'app/routes/admin/**',
			'app/routes/_marketing/**',
			'app/routes/_seo/**',
			'app/routes/_auth/**',
			'app/components/auth-layout.tsx',
			'app/**/__prototype-*',
			'app/components/prototype-switcher.tsx',
			'app/routes/training/plan.prototype.tsx',
			'**/*.test.{ts,tsx}',
		],
		plugins: { trainm8 },
		rules: { 'trainm8/luma-steps': 'error' },
	},
	{
		ignores: ['.react-router/*'],
	},
]
