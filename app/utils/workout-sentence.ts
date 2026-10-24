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
	type Discipline,
	type IntensityTarget,
	isCardioDiscipline,
	type LoadTarget,
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
	// A lift's name the exercise database does not hold (ADR 0089). Its
	// suggestions are the nearest names it does hold.
	'unknown-exercise',
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
	// A lift's problems (ADR 0089): named with no sets, sets with no name, an
	// `@` or a `kg` with no load after it, and two loads on one set.
	'no-sets',
	'no-exercise',
	'dangling-load',
	'two-loads',
] as const
export type SentenceProblem = (typeof SENTENCE_PROBLEMS)[number]

export type ParsedSentence = {
	/** The session, or null while anything in the sentence is unsure. */
	structure: WorkoutStructure | null
	/** The Workout Intent the hardest step's zone reads as. */
	intent: WorkoutIntent | null
	/** `strength` when the sentence names lifts (ADR 0089), else a cardio sport. */
	discipline: Discipline | null
	/** The sentence named its discipline itself (`sykkel`, or a lift), over the chip. */
	disciplineFromText: boolean
	unknown: UnknownWord[]
	problems: SentenceProblem[]
	/**
	 * What the session adds up to, by the week model's own rule: the distance
	 * when every work step states one (a timed rest adds none), and the time
	 * when every step states one. Null otherwise — never a partial sum.
	 */
	totals: { distanceM: number | null; durationSec: number | null }
	/**
	 * The lifts the reader settled on, one per strength step, in order: the
	 * exercise, its name as the database gives it, and the words the athlete
	 * typed for it (ADR 0089). Empty for a run, a ride or a swim.
	 */
	lifts: SentenceLift[]
	/** `exerciseId → name` for the lifts above — what the echo names them by. */
	exerciseNames: Record<string, string>
	/**
	 * The sentence names a lift but no exercise database was handed in, so no
	 * name could be read yet. Nothing is reported unknown on that account: the
	 * line waits for the database rather than flashing every lift as a typo.
	 */
	exercisesNeeded: boolean
}

/**
 * One exercise the reader may name: the database's row, and the other names
 * it answers to — the Norwegian aliases the exercise database carries
 * (owner decision 9). `getExerciseCatalog` is the source on the server.
 */
export type SentenceExercise = {
	id: string
	name: string
	aliases?: readonly string[]
}

export type SentenceLift = { exerciseId: string; name: string; typed: string }

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

/**
 * The words of a lift's sets (ADR 0089): `3 sett à 8 reps`, `@ kroppsvekt`.
 * `sett` counts the sets the way `×` does; the rest say nothing the structure
 * stores, or name the one load that has no number.
 */
const SET_WORDS = new Set(['sett'])
const LIFT_GLUE_WORDS = new Set([
	'à',
	'a',
	'med',
	'av',
	'reps',
	'rep',
	'repetisjoner',
	'repetisjon',
])
const BODYWEIGHT_WORDS = new Set([
	'kroppsvekt',
	'egenvekt',
	'kv',
	'bodyweight',
	'bw',
])
const LIFT_KNOWN_WORDS = [
	'kg',
	'sett',
	'reps',
	'repetisjoner',
	'kroppsvekt',
	'egenvekt',
	...REST_WORDS,
	'min',
	'sek',
]

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
	/(\d{1,2}:[0-5]\d:[0-5]\d)|(\d{1,3}:[0-5]\d)|(\d+(?:[.,]\d+)?)|([zi][1-5](?![\p{L}\d]))|(\p{L}+)|([×*+,→@/–\-·%])/iuy

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

/**
 * A `+`, `,`, `→`, `·` or `så`: where one part of the sentence ends.
 *
 * `·` is the one that can also mean something else. Between two lifts it is a
 * join (`Benkpress 5×5 · Roing 3×8`), and between two rep counts it is the
 * owner's separator for sets of one lift (`82,5 kg × 5 · 5 · 5 · 4`, round 2).
 * It separates reps when a number stands on both sides of it and the number
 * after it is not itself the start of a set count or a quantity (`· 3×8`,
 * `· 10 km`), which would make it a new part.
 */
function isJoin(tokens: Token[], at: number): boolean {
	const token = tokens[at]!
	if (token.kind === 'symbol') {
		if (token.text === '·') return !isRepSeparator(tokens, at)
		return /^[+,→]$/.test(token.text)
	}
	return token.kind === 'word' && JOIN_WORDS.has(token.lower)
}

function isRepSeparator(tokens: Token[], at: number): boolean {
	const before = tokens[at - 1]
	const after = tokens[at + 1]
	if (before?.kind !== 'number' || after?.kind !== 'number') return false
	const following = tokens[at + 2]
	return !(
		isCountMark(following) ||
		unitOf(following) != null ||
		isLoadUnit(following)
	)
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

/** `×`, `*`, `x` or `ganger` after a number: a repeat, or a lift's set count. */
function isCountMark(token: Token | undefined): boolean {
	return (
		token?.text === '×' ||
		token?.text === '*' ||
		isWord(token, REPEAT_WORDS) ||
		isWord(token, SET_WORDS)
	)
}

/** `kg` or `%` after a number: a lift's load. */
function isLoadUnit(token: Token | undefined): boolean {
	return (
		(token?.kind === 'word' && token.lower === 'kg') ||
		(token?.kind === 'symbol' && token.text === '%')
	)
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

// ——— Lifts (ADR 0089) ——————————————————————————————————————————————————

/** Sanity bounds for a lift: past these a number is a typo, not a set. */
const MAX_SETS = 20
const MAX_REPS = 100
const MAX_KG = 500
const MAX_LIFTS = 20
/** Past this a typed name is not a misspelling of any lift; only containment is tried. */
const MAX_SUGGESTED_NAME = 40

/**
 * The reader's own words for the lifts Norwegian athletes write most, each
 * onto the exercise database's name for it. Content, not chrome (ADR 0027 A3
 * as amended): `knebøy` is what the athlete types, and it is not a translation
 * of "Back Squat" so much as the word for it. The database's own aliases
 * (owner decision 9) are read beside these through {@link SentenceExercise};
 * a word here whose lift the database does not hold names nothing.
 */
const LIFT_WORDS: Record<string, string> = {
	knebøy: 'Back Squat',
	frontknebøy: 'Front Squat',
	'front knebøy': 'Front Squat',
	gobletknebøy: 'Goblet Squat',
	markløft: 'Deadlift',
	'rumensk markløft': 'Romanian Deadlift',
	benkpress: 'Bench Press',
	benk: 'Bench Press',
	'skrå benkpress': 'Incline Bench Press',
	skråbenk: 'Incline Bench Press',
	militærpress: 'Overhead Press',
	skulderpress: 'Overhead Press',
	roing: 'Barbell Row',
	stangroing: 'Barbell Row',
	hantelroing: 'Dumbbell Row',
	kabelroing: 'Seated Cable Row',
	'sittende roing': 'Seated Cable Row',
	chins: 'Chin-up',
	armhevinger: 'Push-up',
	armheving: 'Push-up',
	dips: 'Dip',
	planke: 'Plank',
	beinpress: 'Leg Press',
	benpress: 'Leg Press',
	nedtrekk: 'Lat Pulldown',
	hoftehev: 'Hip Thrust',
	frivending: 'Power Clean',
	sidehev: 'Lateral Raise',
	bicepscurl: 'Bicep Curl',
}

/** A name with case, spaces and punctuation set aside: `Pull-ups` → `pullups`. */
function nameKey(name: string): string {
	return name
		.normalize('NFC')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '')
}

const LIFT_WORD_KEYS = new Set(Object.keys(LIFT_WORDS).map(nameKey))

/** One name an exercise answers to, as typed and as keyed. */
type NameLabel = { key: string; text: string; exercise: SentenceExercise }
type ExerciseIndex = {
	byKey: Map<string, SentenceExercise>
	labels: NameLabel[]
}

const indexCache = new WeakMap<readonly SentenceExercise[], ExerciseIndex>()

/**
 * Every name the database's exercises answer to, keyed. Built once per list:
 * the line reads on every keystroke and the list is the same each time. Where
 * two rows answer to one key the first wins, so the caller's order decides.
 */
function exerciseIndex(exercises: readonly SentenceExercise[]): ExerciseIndex {
	const cached = indexCache.get(exercises)
	if (cached) return cached
	const byKey = new Map<string, SentenceExercise>()
	const labels: NameLabel[] = []
	const add = (text: string, exercise: SentenceExercise) => {
		const key = nameKey(text)
		if (!key) return
		if (!byKey.has(key)) byKey.set(key, exercise)
		labels.push({ key, text, exercise })
	}
	for (const exercise of exercises) {
		add(exercise.name, exercise)
		for (const alias of exercise.aliases ?? []) add(alias, exercise)
	}
	const byName = new Map<string, SentenceExercise>()
	for (const exercise of exercises) {
		const key = nameKey(exercise.name)
		if (!byName.has(key)) byName.set(key, exercise)
	}
	for (const [word, name] of Object.entries(LIFT_WORDS)) {
		const exercise = byName.get(nameKey(name))
		if (exercise) add(capitalizeWord(word), exercise)
	}
	const index = { byKey, labels }
	indexCache.set(exercises, index)
	return index
}

function capitalizeWord(word: string): string {
	return word ? word[0]!.toUpperCase() + word.slice(1) : word
}

/** The exercise a typed name is, or null. `Pull-ups` finds `Pull-up`. */
function resolveExercise(
	name: string,
	index: ExerciseIndex,
): SentenceExercise | null {
	const key = nameKey(name)
	if (!key) return null
	const exact = index.byKey.get(key)
	if (exact) return exact
	// A plural `s` (`pullups`, `dips`) and nothing cleverer: a near name is a
	// suggestion to tap, never a guess saved.
	return key.endsWith('s') ? (index.byKey.get(key.slice(0, -1)) ?? null) : null
}

/**
 * The nearest names to one the database does not hold — at most three, one
 * per exercise: names that begin with what was typed (`Bench` → `Bench
 * Press`), then names that contain it, then names within a few edits
 * (`Knebøj` → `Knebøy`), then a known name inside a long one. A name with no
 * near neighbour gets none rather than a wild one.
 */
function suggestExercises(name: string, index: ExerciseIndex): string[] {
	const key = nameKey(name)
	if (key.length < 2) return []
	const begins: NameLabel[] = []
	const contains: NameLabel[] = []
	const near: Array<NameLabel & { distance: number }> = []
	const inside: NameLabel[] = []
	const reach = key.length <= 4 ? 1 : key.length <= 8 ? 2 : 3
	for (const label of index.labels) {
		if (key.length >= 3 && label.key.startsWith(key)) begins.push(label)
		else if (key.length >= 4 && label.key.includes(key)) contains.push(label)
		else if (
			key.length <= MAX_SUGGESTED_NAME &&
			Math.abs(label.key.length - key.length) <= reach
		) {
			const distance = editDistance(key, label.key)
			if (distance <= reach) near.push({ ...label, distance })
		} else if (label.key.length >= 5 && key.includes(label.key)) {
			inside.push(label)
		}
	}
	const byLength = (a: NameLabel, b: NameLabel) => a.key.length - b.key.length
	const ranked = [
		...begins.sort(byLength),
		...contains.sort(byLength),
		...near.sort((a, b) => a.distance - b.distance || byLength(a, b)),
		...inside.sort((a, b) => b.key.length - a.key.length),
	]
	const seen = new Set<string>()
	const out: string[] = []
	for (const label of ranked) {
		if (seen.has(label.exercise.id)) continue
		seen.add(label.exercise.id)
		out.push(label.text)
		if (out.length === 3) break
	}
	return out
}

/** A word of the running grammar, so a part beginning with one is not a lift's name. */
function isCardioWord(token: Token): boolean {
	if (token.kind !== 'word') return false
	const word = token.lower
	return (
		/^[zi][1-5]$/.test(word) ||
		word in ZONE_WORDS ||
		word in DISCIPLINE_WORDS ||
		word in UNIT_WORDS ||
		REST_WORDS.has(word) ||
		REPEAT_WORDS.has(word) ||
		GLUE_WORDS.has(word) ||
		JOIN_WORDS.has(word)
	)
}

/** The tokens before a part's first number or `@`: a lift's name, if it is one. */
function leadingName(tokens: Token[]): Token[] {
	const end = tokens.findIndex(
		(token) =>
			token.kind === 'number' ||
			token.kind === 'clock' ||
			token.kind === 'clock3' ||
			token.text === '@',
	)
	return end === -1 ? tokens : tokens.slice(0, end)
}

/**
 * Whether a part says something only a lift says: a load (`80 kg`, `80 %`,
 * `kroppsvekt`), a set count (`3 sett`), or sets × reps with no unit after the
 * reps — `5×5`, where `3x10 min` is a run's repeat.
 */
function hasLiftMark(tokens: Token[]): boolean {
	return tokens.some((token, i) => {
		if (isLoadUnit(token) || isWord(token, BODYWEIGHT_WORDS)) return true
		if (isWord(token, SET_WORDS)) return true
		if (
			token.kind === 'number' &&
			isCountMark(tokens[i + 1]) &&
			tokens[i + 2]?.kind === 'number'
		) {
			return unitOf(tokens[i + 3]) == null
		}
		return false
	})
}

type LiftSet =
	| { kind: 'reps'; reps: number }
	| { kind: 'timed'; durationSec: number }
type SetGroup = { sets: LiftSet[]; load: LoadTarget | null }

type LiftPart = {
	kind: 'lift'
	/** The name as typed, by its place; null carries on the lift before it. */
	name: SentenceWord | null
	groups: SetGroup[]
	restSec: number | null
}

type NumberToken = Token & { kind: 'number' }

/**
 * One lift: its name, then its sets in any of the forms a coach writes them —
 * `5×5 @ 80 kg`, `5x5 80kg`, `3 sett à 8`, `5/5/5/4 @ 80 kg`,
 * `82,5 kg × 5 · 5 · 5 · 4`, `5 @ 80 kg / 3 @ 90 kg` — and an optional rest
 * between sets (`p 3 min`, `3 min pause`). Every token is read by a rule or
 * reported, exactly as in a running part.
 */
function readLiftPart(
	tokens: Token[],
	nameTokens: Token[],
	text: string,
	context: PartContext,
): LiftPart {
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

	let name: SentenceWord | null = null
	if (nameTokens.length > 0) {
		const start = nameTokens[0]!.start
		const end = nameTokens.at(-1)!.end
		name = { start, end, text: text.slice(start, end) }
	}

	const groups: SetGroup[] = []
	let restSec: number | null = null
	let restWordAt: number | null = null
	/** A load read before any sets (`80 kg 5×5`), waiting for them. */
	let pendingLoad: LoadTarget | null = null

	const giveLoad = (load: LoadTarget) => {
		const last = groups.at(-1)
		if (last && last.load == null) last.load = load
		else if (last || pendingLoad) context.problems.add('two-loads')
		else pendingLoad = load
	}
	const addGroup = (sets: LiftSet[], load: LoadTarget | null = null) => {
		groups.push({ sets, load: load ?? pendingLoad })
		pendingLoad = null
	}
	const count = (token: NumberToken, max: number): number | null => {
		if (
			!Number.isInteger(token.value) ||
			token.value < 1 ||
			token.value > max
		) {
			context.problems.add('out-of-range')
			return null
		}
		return token.value
	}
	/** `80 kg` or `80 %` with the number at `at`: the load, or null past any bound. */
	const loadAt = (at: number): LoadTarget | null => {
		const number = tokens[at] as NumberToken
		const percent = tokens[at + 1]!.text === '%'
		if (number.value <= 0 || number.value > (percent ? 200 : MAX_KG)) {
			context.problems.add('out-of-range')
			return null
		}
		return percent
			? { kind: 'pct1RM', minPct: number.value }
			: { kind: 'absolute', kg: number.value }
	}
	/** Rep counts from `at`, joined by `/` or `·`: the sets, and where they end. */
	const repList = (at: number): { sets: LiftSet[]; next: number } => {
		const sets: LiftSet[] = []
		let i = at
		while (tokens[i]?.kind === 'number') {
			const reps = count(tokens[i] as NumberToken, MAX_REPS)
			if (reps != null) sets.push({ kind: 'reps', reps })
			i++
			while (isWord(tokens[i], LIFT_GLUE_WORDS)) i++
			const joined =
				(tokens[i]?.text === '/' || tokens[i]?.text === '·') &&
				tokens[i + 1]?.kind === 'number' &&
				!isLoadUnit(tokens[i + 2])
			if (!joined) break
			i++
		}
		return { sets, next: i }
	}
	/** A time in seconds from a number and its unit, or null past a rest's bound. */
	const timeOf = (number: NumberToken, unit: Unit): number | null => {
		const value = toQuantity(number.value, unit)
		if (
			!value ||
			!('durationSec' in value) ||
			value.durationSec > MAX_REST_SEC
		) {
			context.problems.add('out-of-range')
			return null
		}
		return value.durationSec
	}
	const isTime = (unit: Unit | null): unit is Unit =>
		unit != null && TIME_RANK[unit] != null

	for (let i = nameTokens.length; i < tokens.length; i++) {
		const token = tokens[i]!
		const next = tokens[i + 1]

		if (token.kind === 'stray') {
			unread(token, 'stray')
			continue
		}

		if (token.kind === 'clock' || token.kind === 'clock3') {
			unread(
				token,
				'ambiguous-time',
				token.kind === 'clock' ? clockReadings(token.first, token.second) : [],
			)
			continue
		}

		if (token.kind === 'number') {
			if (/^\d+[.,]\d{3}$/.test(token.text)) {
				unread(token, 'ambiguous-number', numberReadings(token.text))
				if (isLoadUnit(next) || unitOf(next)) i++
				continue
			}
			const unit = unitOf(next)
			// `p 3 min` and `3 min pause`: the rest between sets.
			if (
				isTime(unit) &&
				(restWordAt != null || isWord(tokens[i + 2], REST_WORDS))
			) {
				const seconds = timeOf(token, unit)
				if (seconds != null) {
					if (restSec != null) context.problems.add('two-quantities')
					else restSec = seconds
				}
				i += restWordAt != null ? 1 : 2
				restWordAt = null
				continue
			}
			if (isCountMark(next)) {
				// `5×5`, `3 sett à 8`, `3×45 s`: sets × reps, or sets × a time.
				const sets = count(token, MAX_SETS)
				let at = i + 2
				while (isWord(tokens[at], LIFT_GLUE_WORDS)) at++
				const each = tokens[at]
				if (each?.kind !== 'number' || isLoadUnit(tokens[at + 1])) {
					context.problems.add('no-sets')
					i = at - 1
					continue
				}
				const eachUnit = unitOf(tokens[at + 1])
				if (isTime(eachUnit)) {
					const seconds = timeOf(each, eachUnit)
					if (sets != null && seconds != null) {
						addGroup(
							Array.from({ length: sets }, () => ({
								kind: 'timed' as const,
								durationSec: seconds,
							})),
						)
					}
					i = at + 1
					continue
				}
				if (eachUnit) {
					// `3×5 km` is a run's repeat, not a lift's sets.
					unread(tokens[at + 1]!, 'unknown-word')
					i = at + 1
					continue
				}
				const reps = count(each, MAX_REPS)
				if (sets != null && reps != null) {
					addGroup(
						Array.from({ length: sets }, () => ({
							kind: 'reps' as const,
							reps,
						})),
					)
				}
				i = at
				while (isWord(tokens[i + 1], LIFT_GLUE_WORDS)) i++
				continue
			}
			if (isLoadUnit(next)) {
				const load = loadAt(i)
				i++
				if (isCountMark(tokens[i + 1])) {
					// `82,5 kg × 5 · 5 · 5 · 4`: the load, then a set per rep count.
					const { sets, next: after } = repList(i + 2)
					if (sets.length === 0) context.problems.add('no-sets')
					else if (load) addGroup(sets, load)
					i = after - 1
					continue
				}
				if (load) giveLoad(load)
				continue
			}
			if (unit) {
				// A distance or a lone time among a lift's sets.
				unread(next!, 'unknown-word')
				i++
				continue
			}
			// `5/5/5/4`, or the `5` of `5 @ 80 kg / 3 @ 90 kg`.
			const { sets, next: after } = repList(i)
			if (sets.length > 0) addGroup(sets)
			i = after - 1
			continue
		}

		if (token.kind === 'symbol') {
			if (token.text === '@') {
				// Read with what follows it: a number in kg or %, or kroppsvekt.
				if (next?.kind === 'number' && isLoadUnit(tokens[i + 2])) continue
				if (isWord(next, BODYWEIGHT_WORDS)) continue
				if (next?.kind === 'number' && unitOf(tokens[i + 2]) == null) {
					unread(next, 'no-unit', [`${next.text} kg`, `${next.text} %`])
					i++
					continue
				}
				context.problems.add('dangling-load')
				continue
			}
			// `/` between two sets: `5 @ 80 kg / 3 @ 90 kg`.
			if (token.text === '/' && groups.length > 0 && next?.kind === 'number')
				continue
			unread(token, 'stray')
			continue
		}

		const word = token.lower
		if (word === 'kg') {
			// A `kg` with no number before it.
			context.problems.add('dangling-load')
			continue
		}
		if (BODYWEIGHT_WORDS.has(word)) {
			giveLoad({ kind: 'bodyweight' })
			continue
		}
		if (REST_WORDS.has(word)) {
			if (restWordAt != null || restSec != null) unread(token, 'unknown-word')
			else restWordAt = i
			continue
		}
		if (LIFT_GLUE_WORDS.has(word) || SET_WORDS.has(word)) continue
		unread(token, 'unknown-word', suggestLiftWords(word))
	}

	if (restWordAt != null) context.problems.add('dangling-rest')
	// A part that is only a rest carries on the lift before it with no sets.
	const restOnly = name == null && restSec != null
	if (pendingLoad || (groups.length === 0 && !restOnly))
		context.problems.add('no-sets')
	return { kind: 'lift', name, groups, restSec }
}

/** Lift vocabulary near a word the reader did not know among a lift's sets. */
function suggestLiftWords(word: string): string[] {
	const lower = word.toLowerCase()
	if (lower.length < 3 || lower.length > MAX_SUGGESTED_WORD) return []
	const reach = lower.length <= 4 ? 1 : 2
	return LIFT_KNOWN_WORDS.filter((known) => {
		const distance = editDistance(lower, known)
		return distance > 0 && distance <= reach
	}).slice(0, 3)
}

/**
 * The reps that name a lift session's purpose, the way the hardest zone names
 * a run's: the heaviest work (fewest reps) decides — 5s beside 10s is a
 * strength day. Timed sets alone are endurance work.
 */
function liftIntent(sets: LiftSet[]): WorkoutIntent {
	const reps = sets.flatMap((set) => (set.kind === 'reps' ? [set.reps] : []))
	if (reps.length === 0) return 'strength-endurance'
	const fewest = Math.min(...reps)
	if (fewest <= 5) return 'strength-max'
	if (fewest <= 12) return 'strength-hypertrophy'
	return 'strength-endurance'
}

type ReadLift = {
	exercise: SentenceExercise
	typed: string
	sets: LiftSet[]
	loads: Array<LoadTarget | null>
	restSec: number | null
}

/**
 * The lift parts in order, a nameless part folded into the lift before it, and
 * each name resolved — or reported with its nearest names. Null where a lift
 * cannot be written yet.
 */
function readLifts(
	parts: LiftPart[],
	index: ExerciseIndex | null,
	context: PartContext,
): { lifts: ReadLift[]; needed: boolean } {
	const lifts: ReadLift[] = []
	let needed = false
	let current: ReadLift | null = null
	let unresolved = false
	for (const part of parts) {
		const sets = part.groups.flatMap((group) => group.sets)
		const loads = part.groups.flatMap((group) =>
			group.sets.map(() => group.load),
		)
		if (part.name == null) {
			if (current == null && !unresolved) {
				context.problems.add('no-exercise')
				continue
			}
			if (current) {
				current.sets.push(...sets)
				current.loads.push(...loads)
				if (part.restSec != null) {
					if (current.restSec != null) context.problems.add('two-quantities')
					else current.restSec = part.restSec
				}
			}
			continue
		}
		current = null
		unresolved = true
		if (!index) {
			needed = true
			continue
		}
		const exercise = resolveExercise(part.name.text, index)
		if (!exercise) {
			context.unknown.push({
				...part.name,
				reason: 'unknown-exercise',
				suggestions: suggestExercises(part.name.text, index),
			})
			continue
		}
		unresolved = false
		current = {
			exercise,
			typed: part.name.text,
			sets,
			loads,
			restSec: part.restSec,
		}
		lifts.push(current)
	}
	if (lifts.length > MAX_LIFTS) context.problems.add('out-of-range')
	if (lifts.some((lift) => lift.sets.length > MAX_SETS))
		context.problems.add('out-of-range')
	return { lifts, needed }
}

/** The lifts as the strength editor writes them: one block, a step per lift. */
function liftBlocks(lifts: ReadLift[]): Block[] {
	return [
		{
			repeatCount: 1,
			steps: lifts.map(
				(lift): Step => ({
					kind: 'strength',
					exerciseId: lift.exercise.id,
					sets: lift.sets.map((set, orderIndex) => {
						const load = lift.loads[orderIndex]
						return {
							...set,
							orderIndex,
							...(load ? { load } : {}),
						}
					}),
					...(lift.restSec != null ? { restBetweenSetsSec: lift.restSec } : {}),
				}),
			),
		},
	]
}

// ——— Structure ——————————————————————————————————————————————————————————

type Block = WorkoutStructure['blocks'][number]
type Step = Block['steps'][number]

/** The intent a session's hardest Training Zone names. */
export const INTENT_BY_ZONE: Record<number, WorkoutIntent> = {
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
 * discipline word in the sentence itself (`sykkel`) wins over it, and so does
 * a lift (ADR 0089): `Knebøy 5×5 @ 80 kg` is a strength session whatever the
 * chip says.
 *
 * `exercises` is the exercise database the lifts are named against — the
 * athlete's catalogue, aliases included. Omitted, no lift is read
 * (`exercisesNeeded`), and a running sentence reads exactly as it always did.
 */
export function parseWorkoutSentence(
	text: string,
	{
		discipline,
		exercises,
	}: {
		discipline: Discipline | null
		exercises?: readonly SentenceExercise[]
	},
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
		lifts: [],
		exerciseNames: {},
		exercisesNeeded: false,
	})
	if (text.trim() === '') return nothing('empty')
	if (text.length > MAX_SENTENCE_LENGTH) return nothing('too-long')

	const tokens = tokenize(text)
	const groups: Token[][] = [[]]
	tokens.forEach((token, at) => {
		if (isJoin(tokens, at)) groups.push([])
		else groups.at(-1)!.push(token)
	})
	// `5 km + + 5 km` and a trailing `+`: a join with nothing on one side.
	if (groups.some((group) => group.length === 0)) {
		context.problems.add('empty-part')
	}

	const index = exercises ? exerciseIndex(exercises) : null
	const parts: Part[] = []
	const liftParts: LiftPart[] = []
	for (const group of groups) {
		if (group.length === 0) continue
		const lift = liftReading(group, {
			index,
			chipIsStrength: discipline === 'strength',
			afterLift: liftParts.length > 0,
		})
		if (lift) {
			liftParts.push(readLiftPart(group, lift.nameTokens, text, context))
			continue
		}
		const part = readPart(group, context)
		if (part) parts.push(part)
	}

	if (liftParts.length > 0)
		return liftSentence(liftParts, parts, index, context)

	if (!parts.some((part) => part.kind === 'work')) {
		context.problems.add('no-quantity')
	}

	const named = context.discipline.value
	// The Styrke chip names no sport a run can be: a running sentence under it
	// says which sport it is, or it has none.
	const chip = discipline && isCardioDiscipline(discipline) ? discipline : null
	const resolved = named ?? chip
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
		discipline: resolved ?? discipline,
		disciplineFromText: named != null,
		unknown: context.unknown,
		problems,
		totals: totalsOf(blocks),
		lifts: [],
		exerciseNames: {},
		exercisesNeeded: false,
	}
}

/** A sentence with a lift in it: a strength session, or nothing (ADR 0089). */
function liftSentence(
	liftParts: LiftPart[],
	runningParts: Part[],
	index: ExerciseIndex | null,
	context: PartContext,
): ParsedSentence {
	// A sentence is one session of one sport: lifts and a run are two.
	if (runningParts.length > 0 || context.discipline.value != null) {
		context.problems.add('two-disciplines')
	}
	const { lifts, needed } = readLifts(liftParts, index, context)
	const problems = SENTENCE_PROBLEMS.filter((p) => context.problems.has(p))
	const sure =
		!needed &&
		lifts.length > 0 &&
		context.unknown.length === 0 &&
		problems.length === 0
	const candidate = sure
		? { discipline: 'strength' as const, blocks: liftBlocks(lifts) }
		: null
	// The same last word as a run's: the shared schema.
	const structure =
		candidate && WorkoutStructureSchema.safeParse(candidate).success
			? candidate
			: null
	return {
		structure,
		intent: structure ? liftIntent(lifts.flatMap((lift) => lift.sets)) : null,
		discipline: 'strength',
		disciplineFromText: true,
		unknown: context.unknown,
		problems,
		totals: { distanceM: null, durationSec: null },
		lifts: lifts.map((lift) => ({
			exerciseId: lift.exercise.id,
			name: lift.exercise.name,
			typed: lift.typed,
		})),
		exerciseNames: Object.fromEntries(
			lifts.map((lift) => [lift.exercise.id, lift.exercise.name]),
		),
		exercisesNeeded: needed,
	}
}

/**
 * Whether a part is a lift, and which of its tokens name it (ADR 0089). A part
 * is a lift when it begins with a name the running grammar does not know and
 * says something only a lift says (`5×5`, `80 kg`, `3 sett`), when its name is
 * a lift the reader knows, or under the Styrke chip. A part with no name is a
 * lift's further sets after a lift (`Knebøy 3×5 @ 80 kg + 2×3 @ 90 kg`), or a
 * lift that forgot its name when it states a load.
 *
 * Everything else reads as a run, so `10 km roilg` still suggests `rolig`.
 */
function liftReading(
	group: Token[],
	{
		index,
		chipIsStrength,
		afterLift,
	}: {
		index: ExerciseIndex | null
		chipIsStrength: boolean
		afterLift: boolean
	},
): { nameTokens: Token[] } | null {
	// `Knebøy 5×5, p 3 min`: a rest on its own after a lift is that lift's
	// rest between sets, as a rest part after a repeat joins the repeat.
	const restOnly =
		isWord(group[0], REST_WORDS) ||
		(group[0]?.kind === 'number' && group.some((t) => isWord(t, REST_WORDS)))
	if (afterLift && restOnly && !hasLiftMark(group)) return { nameTokens: [] }
	const nameTokens = leadingName(group)
	const marked = hasLiftMark(group)
	if (nameTokens.length === 0) {
		if (!marked) return null
		const loaded = group.some(
			(token) => isLoadUnit(token) || isWord(token, BODYWEIGHT_WORDS),
		)
		return afterLift || chipIsStrength || loaded ? { nameTokens } : null
	}
	const first = nameTokens[0]!
	if (first.kind !== 'word' || isCardioWord(first)) return null
	const name = nameTokens.map((token) => token.text).join(' ')
	const known =
		LIFT_WORD_KEYS.has(nameKey(name)) ||
		(index != null && resolveExercise(name, index) != null)
	return marked || known || chipIsStrength ? { nameTokens } : null
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

/**
 * The text with one word swapped for a suggestion, keeping the capital the
 * athlete typed: `Knebøj` becomes `Knebøy` even though the alias is `knebøy`.
 */
export function replaceWord(
	text: string,
	word: SentenceWord,
	replacement: string,
): string {
	const typed = text.slice(word.start, word.end)
	const first = typed.charAt(0)
	const capitalised =
		first !== first.toLocaleLowerCase('nb') &&
		replacement.charAt(0) === replacement.charAt(0).toLocaleLowerCase('nb')
			? replacement.charAt(0).toLocaleUpperCase('nb') + replacement.slice(1)
			: replacement
	return `${text.slice(0, word.start)}${capitalised}${text.slice(word.end)}`
}

/**
 * What the reader understood, in the notation's own input shape — so the line
 * shows the session as the **Token Sentence** the row will render once it is
 * saved, rendered from structure by `deriveWorkoutNotation`, and never the
 * typed words echoed back.
 */
export function sentenceNotationInput(
	structure: WorkoutStructure,
	/** The lifts' names (`ParsedSentence.exerciseNames`), for a lift session. */
	{ exerciseNames = {} }: { exerciseNames?: Record<string, string> } = {},
): NotationInput {
	return {
		blocks: structure.blocks.map((block) => ({
			repeatCount: block.repeatCount,
			steps: block.steps.flatMap((step): NotationStep[] => {
				if (step.kind === 'rest') {
					return [{ kind: 'rest', durationSec: step.durationSec ?? null }]
				}
				if (step.kind === 'cardio') {
					return [
						{
							kind: 'cardio',
							discipline: step.discipline,
							intensity: step.intensity ?? null,
							durationSec: step.durationSec ?? null,
							distanceM: step.distanceM ?? null,
						},
					]
				}
				return [
					{
						kind: 'strength',
						exerciseId: step.exerciseId,
						exerciseName: exerciseNames[step.exerciseId] ?? null,
						sets: step.sets.map((set) => ({
							kind: set.kind,
							reps: 'reps' in set ? set.reps : null,
							durationSec: 'durationSec' in set ? set.durationSec : null,
							load: set.load ?? null,
						})),
						restBetweenSetsSec: step.restBetweenSetsSec ?? null,
					},
				]
			}),
		})),
	}
}
