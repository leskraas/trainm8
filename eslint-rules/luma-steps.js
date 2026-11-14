// `trainm8/luma-steps` (ADR 0119 §2): page code stays on the luma radius steps
// and the type scale (ADR 0085, docs/design/design-system.md). It reads every
// string literal and template chunk, splits it into classes, drops variant
// prefixes (`md:`, `data-[open]:`, `!`) and reports an off-scale corner
// (bare `rounded`, `rounded-*-xs/sm/md/lg/xl`) or a raw text size (`text-xs`
// … `text-9xl`), naming the step to use by role. A local rule of its own, so its scope never
// shadows the `no-restricted-syntax` guards beside it.

const DOC = 'docs/design/design-system.md'

// Bare `rounded` (4px) and `rounded-xs` (2px) are sharper than the steps too.
const RADIUS =
	/^rounded(?:-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?(?:-(?:xs|sm|md|lg|xl))?$/
const TEXT = /^text-(?:xs|sm|base|lg|xl|[2-9]xl)(?:\/[\w.[\]-]+)?$/

/** Strips variant prefixes: everything up to the last `:` outside brackets,
 * then a leading or trailing `!`. */
function baseClass(token) {
	let depth = 0
	let cut = 0
	for (let i = 0; i < token.length; i++) {
		const c = token[i]
		if (c === '[') depth++
		else if (c === ']') depth--
		else if (c === ':' && depth === 0) cut = i + 1
	}
	return token.slice(cut).replace(/^!/, '').replace(/!$/, '')
}

/** The off-scale class in `cls`, with the step to use, or null. */
function offScale(cls) {
	if (RADIUS.test(cls)) {
		return `\`${cls}\` is off the luma radius steps: cards and sheets take \`rounded-4xl\`, fields, popovers and toggles \`rounded-3xl\`, items inside them \`rounded-2xl\`, pills, tabs and chips \`rounded-full\`, data marks \`rounded-[3px]\` (${DOC}, Radius).`
	}
	if (TEXT.test(cls)) {
		return `\`${cls}\` is a raw text size: use the type scale by role. The page title takes \`text-title\`, section and card titles \`text-heading\`, row titles and labels over a figure \`text-callout\`, row facts and field errors \`text-footnote\`, labels and units \`text-caption\`, inputs and running text \`text-body\` (${DOC}, Type).`
	}
	return null
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Page code uses the luma radius steps and the type scale, not raw Tailwind sizes.',
		},
		schema: [],
	},
	create(context) {
		function check(node, text) {
			if (typeof text !== 'string' || text.length === 0) return
			const seen = new Set()
			for (const token of text.split(/\s+/)) {
				if (!token) continue
				const cls = baseClass(token)
				if (seen.has(cls)) continue
				const message = offScale(cls)
				if (message) {
					seen.add(cls)
					context.report({ node, message })
				}
			}
		}
		return {
			Literal(node) {
				check(node, node.value)
			},
			TemplateElement(node) {
				check(node, node.value.cooked ?? node.value.raw)
			},
		}
	},
}

export default {
	meta: { name: 'trainm8' },
	rules: { 'luma-steps': rule },
}
