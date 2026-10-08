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
 * text echoed back.
 *
 * **The guarantee: what is saved is exactly what was typed, or nothing is.**
 * Every character of the sentence is accounted for by a rule, or the sentence
 * produces no structure. An unknown word, a stray character, a number with no
 * unit, a clock that could be two durations (`1:30`), a lap time that could be
 * a pace (`400 m @ 1:30`), `10.000` (ten, or ten thousand?), a second repeat,
 * two intensities or two sports, a rest with nothing after it, a number out of
 * any sane range: each is reported where it stands, with a replacement to tap
 * where one can be offered. Nothing is guessed and nothing is dropped.
 *
 * The grammar is deliberately small. A sentence is at most
 * {@link MAX_SENTENCE_LENGTH} characters of parts joined by `+`, `,`, `→` or
 * `så`; a part is an optional repeat (`3x`, `4 ×`), one quantity (`10 km`,
 * `400 m`, `45 min`, `1,5 t`, `1 t 30 min`, `1:30:00`), an optional intensity
 * (a word on the Training Zone ladder, `Z1`–`Z5`, `I1`–`I5`, or a pace
 * `4:30/km`, `@ 4:30` on a time or a distance of a km or more, `4:50-5:10/km`)
 * and an optional timed rest (`p 1 min`, `1 min pause`). A part that is only a
 * rest joins the repeat before it. Free-text commands (`syk til onsdag`) are a
 * later step, not this reader.
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

/** The longest sentence the line takes — the input's `maxLength` and the
 * action's schema both read it. A session is a short sentence. */
export const MAX_SENTENCE_LENGTH = 200

/** Sanity bounds: anything past these is a typo, not a session. */
const MAX_DISTANCE_M = 300_000
const MAX_DURATION_SEC = 24 * 3600
const MAX_REST_SEC = 3600
const MAX_REPEAT = 50
/** Past this a word is not a misspelling of anything; no suggestion is sought. */
const MAX_SUGGESTED_WORD = 20

/** A word in the typed text, by its place in it. */
export type SentenceWord = { start: number; end: number; text: string }

/** Why a piece of the sentence was not read. */
export const UNREAD_REASONS = [
	'unknown-word',
	'no-unit',
	'ambiguous-time',
	'ambiguous-number',
	'stray',
] as const
export type UnreadReason = (typeof UNREAD_REASONS)[number]

/** A piece the reader does not know, and what it might have been. */
export type UnknownWord = SentenceWord & {
	reason: UnreadReason
	/** Whole replacements for the piece, best first. Tapping one swaps it in. */
	suggestions: string[]
}

/** Why a sentence with every piece read still says no session. */
export const SENTENCE_PROBLEMS = [
	'empty',
	'too-long',
	'empty-part',
	'no-quantity',
	'two-quantities',
	'two-repeats',
	'two-intensities',
	'two-disciplines',
	'dangling-rest',
	'distance-rest',
	'out-of-range',
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
	 * What the session adds up to, by the week model's own rule: the distance
	 * when every work step states one (a timed rest adds none), and the time
	 * when every step states one. Null otherwise — never a partial sum.
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
/** Time units, largest first: `1 t 30 min` adds up only in this order. */
const TIME_RANK: Partial<Record<Unit, number>> = { h: 3, min: 2, s: 1 }

const REST_WORDS = new Set(['p', 'pause', 'pauser', 'hvile'])
const REPEAT_WORDS = new Set(['x', 'ganger'])
/** Words between the numbers that say nothing the structure stores. */
const GLUE_WORDS = new Set(['i', 'på', 'med', 'og', 'à', 'a', 'fart', 'drag'])
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

type Token = SentenceWord &
	(
		| { kind: 'number'; value: number }
		| { kind: 'clock'; first: number; second: number }
		| { kind: 'clock3'; seconds: number }
		| { kind: 'word'; lower: string }
		| { kind: 'symbol' }
		| { kind: 'stray' }
	)

/** One token at the cursor: the alternatives in priority order. */
const TOKEN =
	/(\d{1,2}:[0-5]\d:[0-5]\d)|(\d{1,3}:[0-5]\d)|(\d+(?:[.,]\d+)?)|([zi][1-5](?![\p{L}\d]))|(\p{L}+)|([×*+,→@/–-])/iuy

/**
 * Every character becomes a token — whitespace aside — so nothing the athlete
 * typed can fall between two rules unread. A character no rule knows is a
 * `stray` token, and a stray token is never consumed.
 */
function tokenize(text: string): Token[] {
	const tokens: Token[] = []
	let at = 0
	while (at < text.length) {
		const space = /\s+/y
		space.lastIndex = at
		if (space.exec(text)) {
			at = space.lastIndex
			continue
		}
		TOKEN.lastIndex = at
		const match = TOKEN.exec(text)
		if (!match) {
			const char = String.fromCodePoint(text.codePointAt(at)!)
			tokens.push({
				start: at,
				end: at + char.length,
				text: char,
				kind: 'stray',
			})
			at += char.length
			continue
		}
		const raw = match[0]
		const base = { start: at, end: at + raw.length, text: raw }
		at += raw.length
		if (match[1]) {
			const [h, m, s] = raw.split(':').map(Number)
			tokens.push({
				...base,
				kind: 'clock3',
				seconds: h! * 3600 + m! * 60 + s!,
			})
		} else if (match[2]) {
			const [first, second] = raw.split(':').map(Number)
			tokens.push({ ...base, kind: 'clock', first: first!, second: second! })
		} else if (match[3]) {
			tokens.push({
				...base,
				kind: 'number',
				value: Number(raw.replace(',', '.')),
			})
		} else if (match[4] || match[5]) {
			tokens.push({ ...base, kind: 'word', lower: raw.toLowerCase() })
		} else {
			tokens.push({ ...base, kind: 'symbol' })
		}
	}
	return tokens
}

/** A `+`, `,`, `→` or `så`: where one part of the sentence ends. */
function isJoin(token: Token): boolean {
	if (token.kind === 'symbol') return /^[+,→]$/.test(token.text)
	return token.kind === 'word' && JOIN_WORDS.has(token.lower)
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

type PartContext = {
	unknown: UnknownWord[]
	problems: Set<SentenceProblem>
	discipline: { value: CardioDiscipline | null }
}

const isWord = (token: Token | undefined, words: Set<string>) =>
	token?.kind === 'word' && words.has(token.lower)

function unitOf(token: Token | undefined): Unit | null {
	return token?.kind === 'word' ? (UNIT_WORDS[token.lower] ?? null) : null
}

/** `1:30` written out both ways it can be read. */
function clockReadings(first: number, second: number): string[] {
	const pair = (big: string, small: string) =>
		[
			first > 0 ? `${first} ${big}` : null,
			second > 0 ? `${second} ${small}` : null,
		]
			.filter(Boolean)
			.join(' ')
	return [pair('t', 'min'), pair('min', 's')].filter((s) => s.length > 0)
}

/** `10.000` read both ways: ten thousand, or (with a comma) the decimal. */
function numberReadings(text: string): string[] {
	const whole = text.replace(/[.,]/, '')
	const decimal = text.replace('.', ',').replace(/0+$/, '').replace(/,$/, '')
	return [...new Set([whole, ...(text.includes(',') ? [decimal] : [])])]
}

function readPart(tokens: Token[], context: PartContext): Part | null {
	let repeat: number | null = null
	let quantity: (Quantity & { rank: number; end: number }) | null = null
	let intensity: IntensityTarget | null = null
	let restSec: number | null = null
	/** The `p` waiting for its time, by token index. */
	let restWordAt: number | null = null
	/** `@ 1:30`: a pace or a lap time, decided once the quantity is known. */
	let atPace: {
		token: Token
		minSecPerKm: number
		maxSecPerKm?: number
	} | null = null

	const unread = (
		token: Token,
		reason: UnreadReason,
		suggestions: string[] = [],
	) =>
		context.unknown.push({
			start: token.start,
			end: token.end,
			text: token.text,
			reason,
			suggestions,
		})
	const setIntensity = (next: IntensityTarget) => {
		if (intensity && JSON.stringify(intensity) !== JSON.stringify(next)) {
			context.problems.add('two-intensities')
		}
		intensity = next
	}
	/** A clock range ending in `/km` or `min/km`, from `at`: tokens used, or 0. */
	const perKmAt = (at: number): number => {
		if (tokens[at]?.text === '/' && unitOf(tokens[at + 1]) === 'km') return 2
		if (
			unitOf(tokens[at]) === 'min' &&
			tokens[at + 1]?.text === '/' &&
			unitOf(tokens[at + 2]) === 'km'
		)
			return 3
		return 0
	}
	const isDash = (token: Token | undefined) =>
		token?.text === '-' || token?.text === '–'

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!
		const next = tokens[i + 1]

		if (token.kind === 'stray') {
			unread(token, 'stray')
			continue
		}

		if (token.kind === 'number') {
			const isRepeatMark =
				next?.text === '×' || next?.text === '*' || isWord(next, REPEAT_WORDS)
			if (isRepeatMark) {
				if (repeat != null) context.problems.add('two-repeats')
				else if (
					!Number.isInteger(token.value) ||
					token.value < 1 ||
					token.value > MAX_REPEAT
				) {
					context.problems.add('out-of-range')
				} else repeat = token.value
				i++
				continue
			}
			const unit = unitOf(next)
			if (/^\d+[.,]\d{3}$/.test(token.text)) {
				// `10.000 m` is ten thousand to one reader and ten to another.
				unread(token, 'ambiguous-number', numberReadings(token.text))
				if (unit) i++
				continue
			}
			if (!unit) {
				unread(token, 'no-unit', [`${token.text} km`, `${token.text} min`])
				continue
			}
			i++
			const rank = TIME_RANK[unit] ?? 0
			const value = toQuantity(token.value, unit)
			if (!value) {
				context.problems.add('out-of-range')
				continue
			}
			if (restWordAt != null) {
				// `p 1 min`: the rest's time.
				if ('distanceM' in value) context.problems.add('distance-rest')
				else if (value.durationSec > MAX_REST_SEC)
					context.problems.add('out-of-range')
				else restSec = value.durationSec
				restWordAt = null
				continue
			}
			if (quantity && isWord(tokens[i + 1], REST_WORDS)) {
				// `… 1 min pause`: a rest after the work.
				if ('distanceM' in value) context.problems.add('distance-rest')
				else if (restSec != null) context.problems.add('two-quantities')
				else if (value.durationSec > MAX_REST_SEC)
					context.problems.add('out-of-range')
				else restSec = value.durationSec
				i++
				continue
			}
			if (quantity) {
				// `1 t 30 min`: a smaller time unit straight after a larger one.
				const adds =
					'durationSec' in quantity &&
					'durationSec' in value &&
					rank > 0 &&
					rank < quantity.rank &&
					quantity.end === i - 2
				if (!adds) {
					context.problems.add('two-quantities')
					continue
				}
				const durationSec: number =
					(quantity as { durationSec: number }).durationSec + value.durationSec
				if (durationSec > MAX_DURATION_SEC) context.problems.add('out-of-range')
				quantity = { durationSec, rank, end: i }
				continue
			}
			quantity = { ...value, rank, end: i }
			continue
		}

		if (token.kind === 'clock3') {
			// `1:30:00` is h:mm:ss and nothing else.
			if (restWordAt != null) {
				if (token.seconds <= 0 || token.seconds > MAX_REST_SEC)
					context.problems.add('out-of-range')
				else restSec = token.seconds
				restWordAt = null
			} else if (quantity) context.problems.add('two-quantities')
			else if (token.seconds <= 0 || token.seconds > MAX_DURATION_SEC)
				context.problems.add('out-of-range')
			else quantity = { durationSec: token.seconds, rank: 1, end: i }
			continue
		}

		if (token.kind === 'clock') {
			const pace = token.first * 60 + token.second
			const rangeEnd =
				isDash(next) && tokens[i + 2]?.kind === 'clock'
					? (tokens[i + 2] as Extract<Token, { kind: 'clock' }>)
					: null
			const other = rangeEnd ? rangeEnd.first * 60 + rangeEnd.second : null
			const after = i + (rangeEnd ? 3 : 1)
			const perKm = perKmAt(after)
			const target =
				other == null
					? { minSecPerKm: pace }
					: {
							minSecPerKm: Math.min(pace, other),
							maxSecPerKm: Math.max(pace, other),
						}
			if (pace <= 0 || (other != null && other <= 0)) {
				context.problems.add('out-of-range')
				i = after - 1 + perKm
				continue
			}
			if (perKm > 0) {
				// `4:30/km`: a pace, said as one.
				setIntensity({ kind: 'pace', ...target })
				i = after - 1 + perKm
				continue
			}
			if (tokens[i - 1]?.text === '@') {
				atPace = { token, ...target }
				i = after - 1
				continue
			}
			// `1:30` alone: an hour and a half, or a minute and a half.
			unread(token, 'ambiguous-time', clockReadings(token.first, token.second))
			continue
		}

		if (token.kind === 'symbol') {
			// `@` is read with the clock after it; anything else here is stray.
			if (token.text === '@' && next?.kind === 'clock') continue
			unread(token, 'stray')
			continue
		}

		const word = token.lower
		if (GLUE_WORDS.has(word)) continue
		if (REST_WORDS.has(word)) {
			if (restWordAt != null || restSec != null) unread(token, 'unknown-word')
			else restWordAt = i
			continue
		}
		const zone = /^[zi]([1-5])$/.exec(word)?.[1] ?? ZONE_WORDS[word]
		if (zone != null) {
			setIntensity({ kind: 'zoneLabel', label: `Z${zone}` })
			continue
		}
		const discipline = DISCIPLINE_WORDS[word]
		if (discipline) {
			const named = context.discipline.value
			if (named && named !== discipline) context.problems.add('two-disciplines')
			context.discipline.value = discipline
			continue
		}
		unread(token, 'unknown-word', suggestWords(word))
	}

	if (atPace) {
		// `@ 1:30` on 400 m is a lap time as much as a pace; on a time or on a
		// km or more it can only be a pace.
		const lap =
			quantity != null && 'distanceM' in quantity && quantity.distanceM < 1000
		if (lap || quantity == null) {
			unread(atPace.token, 'ambiguous-time', [`${atPace.token.text}/km`])
		} else {
			const { token: _token, ...target } = atPace
			setIntensity({ kind: 'pace', ...target })
		}
	}

	// `1 min pause` on its own: a rest, which joins the repeat before it.
	if (
		restWordAt != null &&
		quantity != null &&
		'durationSec' in quantity &&
		restWordAt === quantity.end + 1 &&
		restWordAt === tokens.length - 1 &&
		repeat == null &&
		intensity == null &&
		restSec == null
	) {
		if (quantity.durationSec > MAX_REST_SEC)
			context.problems.add('out-of-range')
		return { kind: 'rest', durationSec: quantity.durationSec }
	}
	if (restWordAt != null) context.problems.add('dangling-rest')
	if (quantity == null) {
		context.problems.add('no-quantity')
		return null
	}
	const { rank: _rank, end: _end, ...plain } = quantity
	return {
		kind: 'work',
		repeat: repeat ?? 1,
		quantity: plain,
		intensity,
		restSec,
	}
}

/** A typed number in its unit, or null when it is zero or past any sane bound. */
function toQuantity(value: number, unit: Unit): Quantity | null {
	const metres = unit === 'km' ? value * 1000 : unit === 'm' ? value : null
	if (metres != null) {
		const distanceM = Math.round(metres)
		return distanceM > 0 && distanceM <= MAX_DISTANCE_M ? { distanceM } : null
	}
	const seconds =
		unit === 'h' ? value * 3600 : unit === 'min' ? value * 60 : value
	const durationSec = Math.round(seconds)
	return durationSec > 0 && durationSec <= MAX_DURATION_SEC
		? { durationSec }
		: null
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

/** The week model's rule (`fixedDayVolume`), so the line and the header agree. */
function totalsOf(blocks: Block[]): ParsedSentence['totals'] {
	let distanceM = 0
	let durationSec = 0
	let distanceKnown = blocks.length > 0
	let durationKnown = blocks.length > 0
	for (const block of blocks) {
		const times = blockRepeatTotal(block)
		for (const step of block.steps) {
			if (step.kind === 'strength') {
				distanceKnown = durationKnown = false
				continue
			}
			const distance = step.kind === 'cardio' ? step.distanceM : undefined
			if (distance != null) distanceM += distance * times
			// A timed rest adds no km, and does not make the km unknown.
			else if (step.kind !== 'rest') distanceKnown = false
			if (step.durationSec != null) durationSec += step.durationSec * times
			else durationKnown = false
		}
	}
	return {
		distanceM: distanceKnown ? distanceM : null,
		durationSec: durationKnown ? durationSec : null,
	}
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
	const nothing = (problem: SentenceProblem): ParsedSentence => ({
		structure: null,
		intent: null,
		discipline,
		disciplineFromText: false,
		unknown: [],
		problems: [problem],
		totals: { distanceM: null, durationSec: null },
	})
	if (text.trim() === '') return nothing('empty')
	if (text.length > MAX_SENTENCE_LENGTH) return nothing('too-long')

	const groups: Token[][] = [[]]
	for (const token of tokenize(text)) {
		if (isJoin(token)) groups.push([])
		else groups.at(-1)!.push(token)
	}
	// `5 km + + 5 km` and a trailing `+`: a join with nothing on one side.
	if (groups.some((group) => group.length === 0)) {
		context.problems.add('empty-part')
	}
	const parts = groups
		.filter((group) => group.length > 0)
		.map((group) => readPart(group, context))
		.filter((part): part is Part => part != null)
	if (!parts.some((part) => part.kind === 'work')) {
		context.problems.add('no-quantity')
	}

	const named = context.discipline.value
	const resolved = named ?? discipline
	if (resolved == null) context.problems.add('no-discipline')

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
 * Known words close to one the reader did not know — at most three, of the
 * nearest distance found, and only within one edit for a short word and two
 * for a longer one, so a word that is simply not training vocabulary gets no
 * suggestion rather than a wild one. A word longer than any known word by
 * more than that reach cannot be within it, and is not measured at all.
 */
export function suggestWords(word: string): string[] {
	const lower = word.toLowerCase()
	// One or two letters are a step away from any short word: no signal.
	if (lower.length < 3 || lower.length > MAX_SUGGESTED_WORD) return []
	const reach = lower.length <= 4 ? 1 : 2
	const near = KNOWN_WORDS.filter(
		(known) => Math.abs(known.length - lower.length) <= reach,
	)
		.map((known) => ({ known, distance: editDistance(lower, known) }))
		.filter(({ distance }) => distance > 0 && distance <= reach)
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
					? [{ kind: 'rest', durationSec: step.durationSec ?? null }]
					: step.kind === 'cardio'
						? [
								{
									kind: 'cardio',
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
