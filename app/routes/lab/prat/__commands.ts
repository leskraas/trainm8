/**
 * The command line's fixed vocabulary. No language model: a word at the start
 * picks the command, and a day after it («flytt torsdag») picks the session.
 */
import { type FlowKind } from './__flows.tsx'
import {
	WEEKDAY_KEYS,
	WEEKDAY_LONG,
	addDays,
	mondayOf,
	weekdayOf,
} from './__fmt.ts'
import { type Ref } from './__types.ts'

export type Command =
	| { kind: 'flow'; flow: FlowKind; ref?: Ref | null; said: string }
	| { kind: 'go'; to: string; said: string; reply: string }
	| { kind: 'unknown'; said: string }

type Word = {
	words: string[]
	hint: string
	make: (rest: string, ctx: Ctx) => Command
}

type Ctx = { today: string; open: Ref[] }

/** A day named in the rest of a command: `i dag`, `i morgen`, `torsdag`, `torsdagens`. */
function dayIn(rest: string, today: string): string | null {
	const r = rest.toLowerCase()
	if (/\bi morgen\b|morgendagens/.test(r)) return addDays(today, 1)
	if (/\bi dag\b|dagens/.test(r)) return today
	for (const key of WEEKDAY_KEYS) {
		const name = WEEKDAY_LONG[key]
		if (r.includes(name)) {
			for (let i = 0; i < 7; i++) {
				const d = addDays(today, i)
				if (weekdayOf(d) === key) return d
			}
		}
	}
	return null
}

function refFor(rest: string, ctx: Ctx) {
	const d = dayIn(rest, ctx.today)
	if (!d) return null
	return ctx.open.find((s) => s.date === d) ?? null
}

const flow =
	(f: FlowKind, withRef = false) =>
	(rest: string, ctx: Ctx): Command => ({
		kind: 'flow',
		flow: f,
		ref: withRef ? refFor(rest, ctx) : null,
		said: '',
	})

const go =
	(to: (ctx: Ctx) => string, reply: string) =>
	(_rest: string, ctx: Ctx): Command => ({
		kind: 'go',
		to: to(ctx),
		said: '',
		reply,
	})

export const VOCAB: Word[] = [
	{
		words: ['flytt'],
		hint: 'flytt en økt til en annen dag',
		make: flow('flytt', true),
	},
	{ words: ['bytt'], hint: 'bytt dag på to økter', make: flow('bytt', true) },
	{
		words: ['hopp over', 'dropp'],
		hint: 'hopp over en økt',
		make: flow('hopp', true),
	},
	{
		words: ['kortere', 'dårlig tid'],
		hint: 'dagens økt blir 30 min',
		make: flow('kortere'),
	},
	{
		words: ['lettere uke'],
		hint: 'hele uka 15 % lettere',
		make: flow('lettere-uke'),
	},
	{
		words: ['lettere', 'sliten'],
		hint: 'dagens økt blir rolig',
		make: flow('lettere'),
	},
	{
		words: ['senere', 'tar den senere'],
		hint: 'flytt dagens økt til neste ledige dag',
		make: flow('senere'),
	},
	{
		words: ['gjort', 'ferdig'],
		hint: 'si at dagens økt er gjort',
		make: flow('gjort'),
	},
	{
		words: ['kjentes', 'tung', 'notat'],
		hint: 'hvor tung, og et notat',
		make: flow('kjent'),
	},
	{
		words: ['legg til', 'ekstra'],
		hint: 'en økt du gjorde eller vil gjøre',
		make: flow('legg-til'),
	},
	{ words: ['i dag'], hint: 'dagens økt', make: flow('i-dag') },
	{
		words: ['form', 'hvordan går det', 'fremgang'],
		hint: 'form, mengde og veien til løpet',
		make: flow('form'),
	},
	{ words: ['angre'], hint: 'angre siste endring', make: flow('angre') },
	{
		words: ['hent', 'synk'],
		hint: 'hent nye økter fra klokka',
		make: flow('synk'),
	},
	{
		words: ['plan', 'oppslag', 'sesong'],
		hint: 'hele planen samlet',
		make: go(() => '/lab/prat/oppslag/plan', 'Her er planen samlet.'),
	},
	{
		words: ['uke', 'uka'],
		hint: 'denne uka dag for dag',
		make: go(
			(c) => `/lab/prat/oppslag/uke/${mondayOf(c.today)}`,
			'Her er uka.',
		),
	},
	{
		words: ['økter', 'historikk'],
		hint: 'alle øktene, planlagt mot gjort',
		make: go(() => '/lab/prat/oppslag/okter', 'Her er øktene dine.'),
	},
	{
		words: ['soner', 'terskel', 'puls'],
		hint: 'terskler og soner',
		make: go(
			() => '/lab/prat/innstillinger/soner',
			'Her er tersklene og sonene dine.',
		),
	},
	{
		words: ['tilgjengelighet', 'dager', 'tid'],
		hint: 'dager og timer du har',
		make: go(
			() => '/lab/prat/innstillinger/tilgjengelighet',
			'Her er dagene og tida di.',
		),
	},
	{
		words: ['mål', 'løp'],
		hint: 'målet du trener mot',
		make: go(() => '/lab/prat/innstillinger/mal', 'Her er målet ditt.'),
	},
	{
		words: ['koblinger', 'klokke', 'last opp'],
		hint: 'klokka og filer',
		make: go(
			() => '/lab/prat/innstillinger/koblinger',
			'Her er koblingene dine.',
		),
	},
	{
		words: ['konto', 'navn', 'eksport'],
		hint: 'navn, eksport og sletting',
		make: go(() => '/lab/prat/innstillinger/konto', 'Her er kontoen din.'),
	},
	{
		words: ['slett'],
		hint: 'slett alle dataene dine',
		make: go(() => '/lab/prat/innstillinger/slett', 'Her kan du slette alt.'),
	},
]

function norm(s: string) {
	return s
		.toLowerCase()
		.replace(/[?!.,]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
}

export function parse(input: string, ctx: Ctx): Command {
	const text = norm(input)
	if (!text) return { kind: 'unknown', said: input }
	// Longest match first, so «lettere uke» wins over «lettere».
	const all = VOCAB.flatMap((w) => w.words.map((word) => ({ w, word }))).sort(
		(a, b) => b.word.length - a.word.length,
	)
	for (const { w, word } of all) {
		if (
			text === word ||
			text.startsWith(`${word} `) ||
			(word.length > 4 && text.includes(word))
		) {
			const cmd = w.make(text.slice(word.length), ctx)
			return { ...cmd, said: input.trim() } as Command
		}
	}
	return { kind: 'unknown', said: input.trim() }
}

export type Suggestion = { text: string; hint: string }

/** What the athlete may mean, from what they have typed so far. */
export function suggest(input: string, ctx: Ctx): Suggestion[] {
	const text = norm(input)
	if (!text) return []
	const out: Suggestion[] = []
	for (const w of VOCAB) {
		for (const word of w.words) {
			if (word.startsWith(text) || text.startsWith(word)) {
				if (['flytt', 'bytt', 'hopp over'].includes(word)) {
					for (const s of ctx.open.slice(0, 3)) {
						const day =
							s.date === ctx.today
								? 'dagens'
								: s.date === addDays(ctx.today, 1)
									? 'morgendagens'
									: `${WEEKDAY_LONG[weekdayOf(s.date)]}s`
						out.push({ text: `${word} ${day} økt`, hint: s.title })
					}
				}
				out.push({ text: word, hint: w.hint })
				break
			}
		}
	}
	const seen = new Set<string>()
	return out
		.filter((s) => (seen.has(s.text) ? false : (seen.add(s.text), true)))
		.slice(0, 5)
}
