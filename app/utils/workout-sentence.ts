/**
 * The **writing line**'s reader (#505 stories 35–38): a session typed as a short
 * sentence — `10 km rolig`, `3x10 min terskel p 1 min` — read into the same
 * Workout → Block → Step structure every other authoring path writes.
 *
 * This is the free-text parser ADR 0027 §1 left room for ("a future free-text
 * parser could target the same token model") and the #505 spec asks for. It
 * does not weaken *render, never parse*: what the parser produces is structure,
 * validated by the same `WorkoutStructureSchema`, and what the athlete sees of
 * it is the Token Sentence **rendered from** that structure — never the typed
 * text echoed back. A sentence the reader is unsure of produces no structure
 * at all: an unknown word, a number with no unit, a part with no quantity.
 * Nothing is guessed and nothing is dropped silently.
 *
 * The grammar is deliberately small. A sentence is parts joined by `+`, `,`,
 * `→` or `så`; a part is an optional repeat (`3x`, `4 ×`), one quantity
 * (`10 km`, `45 min`, `1,5 t`, `1:30`), an optional intensity (a word on the
 * Training Zone ladder, `Z1`–`Z5`, `I1`–`I5`, or a pace `@ 4:30` /
 * `4:50-5:10/km`) and an optional rest (`p 1 min`, `1 min pause`). A part that
 * is only a rest joins the repeat before it. Free-text commands (`syk til
 * onsdag`) are a later step, not this reader.
 *
 * The vocabulary is content, not chrome (ADR 0027 A3 as amended): `rolig`,
 * `terskel`, `langtur` are the words the athletes train in, so they live here,
 * beside the grammar they belong to, and not in `labels.ts`.
 */
import { type NotationInput, type NotationStep } from './workout-notation.ts'
import {
	blockRepeatTotal,
	type CardioDiscipline,
	type IntensityTarget,
	type WorkoutIntent,
	type WorkoutStructure,
	WorkoutStructureSchema,
} from './workout-schema.ts'

/** A word in the typed text, by its place in it. */
export type SentenceWord = { start: number; end: number; text: string }

/** A word the reader does not know, and what it might have been. */
export type UnknownWord = SentenceWord & {
	/** Whole replacements for the word, best first. Tapping one swaps it in. */
	suggestions: string[]
}

/** Why a sentence with no unknown words still says no session. */
export const SENTENCE_PROBLEMS = [
	'empty',
	'no-quantity',
	'two-quantities',
	'no-discipline',
] as const
export type SentenceProblem = (typeof SENTENCE_PROBLEMS)[number]

export type ParsedSentence = {
	/** The session, or null while anything in the sentence is unsure. */
	structure: WorkoutStructure | null
	/** The Workout Intent the hardest step's zone reads as. */
	intent: WorkoutIntent | null
	discipline: CardioDiscipline | null
	/** The sentence named its discipline itself (`sykkel`), over the chip. */
	disciplineFromText: boolean
	unknown: UnknownWord[]
	problems: SentenceProblem[]
	/**
	 * What the session adds up to: the distance its steps state, and the time
	 * its steps state (rests included). Null where no step states the unit.
	 */
	totals: { distanceM: number | null; durationSec: number | null }
}

// ——— Vocabulary ————————————————————————————————————————————————————————

/** Words on the Training Zone ladder, stored as the zone they name. */
const ZONE_WORDS: Record<string, 1 | 2 | 3 | 4 | 5> = {
	restitusjon: 1,
	oppvarming: 1,
	oppv: 1,
	nedjogg: 1,
	nedkjøling: 1,
	rolig: 2,
	langtur: 2,
	langkjøring: 2,
	moderat: 3,
	tempo: 3,
	terskel: 4,
	hardt: 5,
	hard: 5,
	maks: 5,
	easy: 2,
	threshold: 4,
}

const DISCIPLINE_WORDS: Record<string, CardioDiscipline> = {
	løp: 'run',
	løping: 'run',
	løpe: 'run',
	jogg: 'run',
	jogging: 'run',
	sykkel: 'bike',
	sykling: 'bike',
	sykle: 'bike',
	svøm: 'swim',
	svømming: 'swim',
	svømme: 'swim',
}

type Unit = 'km' | 'm' | 'h' | 'min' | 's'
const UNIT_WORDS: Record<string, Unit> = {
	km: 'km',
	k: 'km',
	m: 'm',
	meter: 'm',
	t: 'h',
	h: 'h',
	time: 'h',
	timer: 'h',
	min: 'min',
	minutt: 'min',
	minutter: 'min',
	s: 's',
	sek: 's',
	sekund: 's',
	sekunder: 's',
}

const REST_WORDS = new Set(['p', 'pause', 'pauser', 'hvile'])
const REPEAT_WORDS = new Set(['x', 'ganger'])
/** Words between the numbers that say nothing the structure stores. */
const GLUE_WORDS = new Set([
	'i',
	'på',
	'med',
	'og',
	'à',
	'a',
	'fart',
	'drag',
	'per',
	'km/t',
])
/** Words that end one part and start the next. */
const JOIN_WORDS = new Set(['så', 'deretter'])

/** Every word the reader knows — what a misspelling is held against. */
const KNOWN_WORDS = [
	...Object.keys(ZONE_WORDS),
	...Object.keys(DISCIPLINE_WORDS),
	...Object.keys(UNIT_WORDS).filter((w) => w.length > 2),
	...REST_WORDS,
	'ganger',
	'fart',
	'drag',
	'deretter',
]

// ——— Tokens ————————————————————————————————————————————————————————————

type Token =
	| (SentenceWord & { kind: 'number'; value: number })
	| (SentenceWord & { kind: 'clock'; first: number; second: number })
	| (SentenceWord & { kind: 'word'; lower: string })
	| (SentenceWord & { kind: 'symbol' })

const TOKEN =
	/(\d+:[0-5]\d)|(\d+(?:[.,]\d+)?)|([zi][1-5](?![\p{L}\d]))|([\p{L}]+(?:\/[\p{L}]+)?)|([x×*+,→@/()–-])/giu

function tokenize(text: string): Token[] {
	const tokens: Token[] = []
	for (const match of text.matchAll(TOKEN)) {
		const start = match.index
		const raw = match[0]
		const base = { start, end: start + raw.length, text: raw }
		if (match[1]) {
			const [first, second] = raw.split(':').map(Number)
			tokens.push({ ...base, kind: 'clock', first: first!, second: second! })
		} else if (match[2]) {
			tokens.push({
				...base,
				kind: 'number',
				value: Number(raw.replace(',', '.')),
			})
		} else if (match[3] || match[4]) {
			tokens.push({ ...base, kind: 'word', lower: raw.toLowerCase() })
		} else {
			tokens.push({ ...base, kind: 'symbol' })
		}
	}
	return tokens
}

/** A `+`, `,`, `→`, a bracket or `så`: where one part of the sentence ends. */
function isJoin(token: Token): boolean {
	if (token.kind === 'symbol') return /^[+,→()]$/.test(token.text)
	return token.kind === 'word' && JOIN_WORDS.has(token.lower)
}

function splitParts(tokens: Token[]): Token[][] {
	const parts: Token[][] = [[]]
	for (const token of tokens) {
		if (isJoin(token)) parts.push([])
		else parts.at(-1)!.push(token)
	}
	return parts.filter((part) => part.length > 0)
}

// ——— Parts ——————————————————————————————————————————————————————————————

type Quantity = { durationSec: number } | { distanceM: number }

type Part =
	| {
			kind: 'work'
			repeat: number
			quantity: Quantity
			intensity: IntensityTarget | null
			restSec: number | null
	  }
	| { kind: 'rest'; durationSec: number }

function quantityOf(value: number, unit: Unit): Quantity {
	switch (unit) {
		case 'km':
			return { distanceM: Math.round(value * 1000) }
		case 'm':
			return { distanceM: Math.round(value) }
		case 'h':
			return { durationSec: Math.round(value * 3600) }
		case 'min':
			return { durationSec: Math.round(value * 60) }
		case 's':
			return { durationSec: Math.round(value) }
	}
}

function zoneTarget(zone: number): IntensityTarget {
	return { kind: 'zoneLabel', label: `Z${zone}` }
}

/** The zone a word names: `rolig`, `Z3`, `I4`. */
function zoneOfWord(lower: string): number | null {
	const ladder = /^[zi]([1-5])$/.exec(lower)
	if (ladder) return Number(ladder[1])
	return ZONE_WORDS[lower] ?? null
}

type PartContext = {
	unknown: UnknownWord[]
	problems: Set<SentenceProblem>
	discipline: { value: CardioDiscipline | null }
}

function readPart(tokens: Token[], context: PartContext): Part | null {
	let repeat = 1
	// Asserted rather than annotated: `take` assigns these from a closure, which
	// control-flow narrowing cannot see, so a plain `= null` would read as null
	// for the rest of the function.
	let quantity = null as Quantity | null
	let intensity = null as IntensityTarget | null
	let restSec = null as number | null
	let restPending = false
	let restWord = false

	const unitAt = (index: number): Unit | null => {
		const token = tokens[index]
		return token?.kind === 'word' ? (UNIT_WORDS[token.lower] ?? null) : null
	}
	const isRestWord = (token: Token | undefined) =>
		token?.kind === 'word' && REST_WORDS.has(token.lower)
	const take = (q: Quantity, followedByRest: boolean) => {
		if (restPending || (followedByRest && quantity != null)) {
			if ('durationSec' in q) restSec = q.durationSec
			restPending = false
			return
		}
		if (quantity != null) context.problems.add('two-quantities')
		else quantity = q
	}

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!
		const next = tokens[i + 1]
		if (token.kind === 'number') {
			if (
				next &&
				(next.text === '×' ||
					next.text === '*' ||
					(next.kind === 'word' && REPEAT_WORDS.has(next.lower)))
			) {
				repeat = Math.max(1, Math.round(token.value))
				i++
				continue
			}
			const unit = unitAt(i + 1)
			if (unit) {
				take(quantityOf(token.value, unit), isRestWord(tokens[i + 2]))
				i++
				continue
			}
			context.unknown.push({
				start: token.start,
				end: token.end,
				text: token.text,
				suggestions: [`${token.text} km`, `${token.text} min`],
			})
			continue
		}
		if (token.kind === 'clock') {
			const previous = tokens[i - 1]
			const pace =
				previous?.text === '@' ||
				quantity != null ||
				(next?.text === '/' && tokens[i + 2]?.kind === 'word') ||
				(next?.kind === 'word' && next.lower === '/km') ||
				next?.text === '-' ||
				next?.text === '–'
			if (pace) {
				const minSecPerKm = token.first * 60 + token.second
				const rangeEnd =
					(next?.text === '-' || next?.text === '–') &&
					tokens[i + 2]?.kind === 'clock'
						? (tokens[i + 2] as Extract<Token, { kind: 'clock' }>)
						: null
				if (rangeEnd) {
					const other = rangeEnd.first * 60 + rangeEnd.second
					intensity = {
						kind: 'pace',
						minSecPerKm: Math.min(minSecPerKm, other),
						maxSecPerKm: Math.max(minSecPerKm, other),
					}
					i += 2
				} else {
					intensity = { kind: 'pace', minSecPerKm }
				}
				continue
			}
			take(
				{ durationSec: token.first * 3600 + token.second * 60 },
				isRestWord(next),
			)
			continue
		}
		if (token.kind === 'symbol') continue // `@`, `/`, a stray `x` or dash
		const word = token.lower
		if (word === '/km' || GLUE_WORDS.has(word)) continue
		// The unit of a pace: `4:30/km`.
		if (UNIT_WORDS[word] && tokens[i - 1]?.text === '/') continue
		if (REPEAT_WORDS.has(word)) continue
		if (REST_WORDS.has(word)) {
			restWord = true
			// `p 1 min` — the rest's time follows. `1 min pause` already took it.
			if (restSec == null) restPending = true
			continue
		}
		const zone = zoneOfWord(word)
		if (zone != null) {
			intensity = zoneTarget(zone)
			continue
		}
		const discipline = DISCIPLINE_WORDS[word]
		if (discipline) {
			context.discipline.value = discipline
			continue
		}
		context.unknown.push({
			start: token.start,
			end: token.end,
			text: token.text,
			suggestions: suggestWords(word),
		})
	}

	// `1 min pause` on its own: a rest, which joins the repeat before it.
	if (
		restWord &&
		quantity != null &&
		'durationSec' in quantity &&
		restSec == null &&
		intensity == null &&
		repeat === 1
	) {
		return { kind: 'rest', durationSec: quantity.durationSec }
	}
	if (quantity == null) {
		context.problems.add('no-quantity')
		return null
	}
	return { kind: 'work', repeat, quantity, intensity, restSec }
}

// ——— Structure ——————————————————————————————————————————————————————————

type Block = WorkoutStructure['blocks'][number]
type Step = Block['steps'][number]

const INTENT_BY_ZONE: Record<number, WorkoutIntent> = {
	1: 'recovery',
	2: 'endurance',
	3: 'tempo',
	4: 'threshold',
	5: 'vo2max',
}

function toBlocks(parts: Part[], discipline: CardioDiscipline): Block[] {
	const blocks: Block[] = []
	for (const part of parts) {
		if (part.kind === 'rest') {
			const previous = blocks.at(-1)
			const rest: Step = { kind: 'rest', durationSec: part.durationSec }
			if (
				previous &&
				previous.repeatCount > 1 &&
				!previous.steps.some((step) => step.kind === 'rest')
			) {
				previous.steps.push(rest)
			} else {
				blocks.push({ repeatCount: 1, steps: [rest] })
			}
			continue
		}
		const work: Step = {
			kind: 'cardio',
			discipline,
			...part.quantity,
			...(part.intensity ? { intensity: part.intensity } : {}),
		}
		const steps: Step[] = [work]
		if (part.restSec != null) {
			steps.push({ kind: 'rest', durationSec: part.restSec })
		}
		blocks.push({ repeatCount: part.repeat, steps })
	}
	return blocks
}

function intentOf(blocks: Block[]): WorkoutIntent {
	let hardest = 0
	for (const block of blocks) {
		for (const step of block.steps) {
			if (step.kind !== 'cardio' || step.intensity?.kind !== 'zoneLabel')
				continue
			hardest = Math.max(hardest, Number(step.intensity.label.slice(1)))
		}
	}
	// A pace with no zone word says nothing about the session's purpose, and
	// endurance is what the Day Stamp writes for the same silence.
	return INTENT_BY_ZONE[hardest] ?? 'endurance'
}

function totalsOf(blocks: Block[]): ParsedSentence['totals'] {
	let distanceM: number | null = null
	let durationSec: number | null = null
	for (const block of blocks) {
		const times = blockRepeatTotal(block)
		for (const step of block.steps) {
			if (step.kind === 'cardio' && step.distanceM != null) {
				distanceM = (distanceM ?? 0) + step.distanceM * times
			}
			if (step.kind !== 'strength' && step.durationSec != null) {
				durationSec = (durationSec ?? 0) + step.durationSec * times
			}
		}
	}
	return { distanceM, durationSec }
}

/**
 * Read a typed sentence. `discipline` is the chip the athlete has chosen; a
 * discipline word in the sentence itself (`sykkel`) wins over it.
 */
export function parseWorkoutSentence(
	text: string,
	{ discipline }: { discipline: CardioDiscipline | null },
): ParsedSentence {
	const context: PartContext = {
		unknown: [],
		problems: new Set(),
		discipline: { value: null },
	}
	const parts = splitParts(tokenize(text))
		.map((part) => readPart(part, context))
		.filter((part): part is Part => part != null)

	const named = context.discipline.value
	const resolved = named ?? discipline
	const empty = text.trim() === ''
	if (empty) context.problems.add('empty')
	else if (!parts.some((part) => part.kind === 'work')) {
		context.problems.add('no-quantity')
	}
	if (resolved == null && !empty) context.problems.add('no-discipline')

	const problems = SENTENCE_PROBLEMS.filter((p) => context.problems.has(p))
	const blocks = resolved ? toBlocks(parts, resolved) : []
	const sure = context.unknown.length === 0 && problems.length === 0
	const candidate = sure && resolved ? { discipline: resolved, blocks } : null
	// The last word is the shared schema's: the reader never writes a structure
	// the full authoring route would refuse.
	const structure =
		candidate && WorkoutStructureSchema.safeParse(candidate).success
			? candidate
			: null

	return {
		structure,
		intent: structure ? intentOf(blocks) : null,
		discipline: resolved,
		disciplineFromText: named != null,
		unknown: context.unknown,
		problems,
		totals: totalsOf(blocks),
	}
}

// ——— Suggestions ————————————————————————————————————————————————————————

/** Optimal string alignment distance: edits, with a swap of neighbours as one. */
function editDistance(a: string, b: string): number {
	const rows = a.length + 1
	const cols = b.length + 1
	const d: number[][] = Array.from({ length: rows }, (_, i) =>
		Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
	)
	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			let best = Math.min(
				d[i - 1]![j]! + 1,
				d[i]![j - 1]! + 1,
				d[i - 1]![j - 1]! + cost,
			)
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				best = Math.min(best, d[i - 2]![j - 2]! + 1)
			}
			d[i]![j] = best
		}
	}
	return d[rows - 1]![cols - 1]!
}

/**
 * Known words close to one the reader did not know, nearest first — at most
 * three, of the nearest distance found, and only within one edit for a short word and two for a longer one,
 * so a word that is simply not training vocabulary gets no suggestion rather
 * than a wild one.
 */
export function suggestWords(word: string): string[] {
	const lower = word.toLowerCase()
	const reach = lower.length <= 4 ? 1 : 2
	const near = KNOWN_WORDS.map((known) => ({
		known,
		distance: editDistance(lower, known),
	})).filter(({ distance }) => distance > 0 && distance <= reach)
	// Only the nearest tier: `pasue` is `pause`, and `pauser` one edit further
	// away is noise beside it.
	const nearest = Math.min(...near.map(({ distance }) => distance))
	return near
		.filter(({ distance }) => distance === nearest)
		.map(({ known }) => known)
		.sort((a, b) => a.localeCompare(b, 'nb'))
		.slice(0, 3)
}

/** The text with one word swapped for a suggestion. */
export function replaceWord(
	text: string,
	word: SentenceWord,
	replacement: string,
): string {
	return `${text.slice(0, word.start)}${replacement}${text.slice(word.end)}`
}

/**
 * What the reader understood, in the notation's own input shape — so the line
 * shows the session as the **Token Sentence** the row will render once it is
 * saved, rendered from structure by `deriveWorkoutNotation`, and never the
 * typed words echoed back.
 */
export function sentenceNotationInput(
	structure: WorkoutStructure,
): NotationInput {
	return {
		blocks: structure.blocks.map((block) => ({
			repeatCount: block.repeatCount,
			steps: block.steps.flatMap((step): NotationStep[] =>
				step.kind === 'rest'
					? [{ kind: 'rest' as const, durationSec: step.durationSec ?? null }]
					: step.kind === 'cardio'
						? [
								{
									kind: 'cardio' as const,
									discipline: step.discipline,
									intensity: step.intensity ?? null,
									durationSec: step.durationSec ?? null,
									distanceM: step.distanceM ?? null,
								},
							]
						: [],
			),
		})),
	}
}
