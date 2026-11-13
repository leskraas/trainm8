/**
 * **An Event's result** (ADR 0117): the pure rule that says whether a completed
 * run Event, its result session and that session's Recording make a
 * **Performance Result**, and, when they don't, why. The reconcile that keeps
 * the stored row true (`event-result.server.ts`) and the Event page's "why
 * there is none" states both read this one function, so the page can never
 * say something the writer did not do.
 *
 * Also the **Event Distance** helpers the form and the Event page share: an
 * Event's distance as typed (`10`, `21,1`), snapped to a **Race Anchor** when it
 * is one, so an athlete who types `10` instead of tapping the pill keeps their
 * `racePace` targets.
 */
import { localDate } from './athlete-calendar.ts'
import { parseEventDisciplines } from './event-schema.ts'
import { EVENTS_LABELS } from './labels.ts'
import { RACE_ANCHOR_DISTANCE_M, RACE_ANCHORS } from './workout-schema.ts'

/** How far a watch's distance may sit from the Event Distance, as a fraction
 * of the Event Distance: a GPS track of a 10k reads 10.1–10.3 km. */
export const EVENT_RESULT_TOLERANCE = 0.05

/** The bounds of an Event Distance typed in km. */
export const EVENT_DISTANCE_MIN_KM = 1
export const EVENT_DISTANCE_MAX_KM = 500

/** A typed km within this many metres of a Race Anchor is that anchor: `21,1`
 * is a half marathon (21 097 m), `42,2` a marathon. */
const ANCHOR_SNAP_M = 10

export type EventResultSource = 'race' | 'timeTrial'

export type EventForResult = {
	kind: string
	status: string
	/** The stored JSON `Discipline[]`, or the parsed list. */
	disciplines: string | readonly string[]
	distanceM: number | null
	resultSessionId: string | null
}

export type SessionForResult = { scheduledAt: Date }

export type RecordingForResult = {
	id: string
	discipline: string
	distanceM: number | null
	startedAt: Date
	endedAt: Date
}

export type EventResultData = {
	discipline: 'run'
	distanceM: number
	timeSec: number
	/** The result session's day in the athlete's timezone, `YYYY-MM-DD`. */
	day: string
	source: EventResultSource
	verified: true
	activityImportId: string
}

/** Why a linked, eligible Event makes no result, in the athlete's terms. */
export type EventResultMissing =
	| { reason: 'no-distance' }
	| { reason: 'no-recording' }
	| { reason: 'other-discipline'; discipline: string }
	| { reason: 'no-recording-distance'; eventDistanceM: number }
	| {
			reason: 'distance-mismatch'
			measuredM: number
			eventDistanceM: number
	  }

export type EventResultVerdict =
	| { kind: 'ineligible' }
	| { kind: 'result'; result: EventResultData }
	| ({ kind: 'missing' } & EventResultMissing)

/**
 * Whether an Event can carry an **Event Distance** at all: a race or a time
 * trial whose disciplines are exactly run. A fitness goal, a triathlon and a
 * bike race offer none, and saving one clears it.
 */
export function eventTakesDistance(
	kind: string,
	disciplines: string | readonly string[],
): boolean {
	const list =
		typeof disciplines === 'string'
			? parseEventDisciplines(disciplines)
			: disciplines
	return (
		(kind === 'race' || kind === 'time-trial') &&
		list.length === 1 &&
		list[0] === 'run'
	)
}

/**
 * The rule (ADR 0117 §2). An Event that is a run-only race or time trial, with
 * a result session, makes a result when it has an Event Distance and the
 * session's Recording is a run whose distance is within ±5 % of it. The
 * result's distance is the Event Distance (rung 1 matches to the metre); its
 * time is the Recording's elapsed time, `endedAt − startedAt`, pauses
 * included, as a race clock runs. **Load Confidence is not read.**
 */
export function eventResultFrom(
	event: EventForResult,
	session: SessionForResult | null,
	recording: RecordingForResult | null,
	timezone: string,
): EventResultVerdict {
	if (event.status === 'cancelled') return { kind: 'ineligible' }
	if (!eventTakesDistance(event.kind, event.disciplines)) {
		return { kind: 'ineligible' }
	}
	if (!event.resultSessionId || !session) return { kind: 'ineligible' }
	const eventDistanceM = event.distanceM
	if (eventDistanceM == null || eventDistanceM <= 0) {
		return { kind: 'missing', reason: 'no-distance' }
	}
	if (!recording) return { kind: 'missing', reason: 'no-recording' }
	if (recording.discipline !== 'run') {
		return {
			kind: 'missing',
			reason: 'other-discipline',
			discipline: recording.discipline,
		}
	}
	if (recording.distanceM == null || recording.distanceM <= 0) {
		return { kind: 'missing', reason: 'no-recording-distance', eventDistanceM }
	}
	if (
		Math.abs(recording.distanceM - eventDistanceM) >
		eventDistanceM * EVENT_RESULT_TOLERANCE
	) {
		return {
			kind: 'missing',
			reason: 'distance-mismatch',
			measuredM: recording.distanceM,
			eventDistanceM,
		}
	}
	const timeSec = Math.round(
		(recording.endedAt.getTime() - recording.startedAt.getTime()) / 1000,
	)
	// A Recording with no elapsed time has nothing to say about the race yet.
	if (timeSec <= 0) return { kind: 'missing', reason: 'no-recording' }
	return {
		kind: 'result',
		result: {
			discipline: 'run',
			distanceM: eventDistanceM,
			timeSec,
			day: localDate(session.scheduledAt, timezone),
			source: event.kind === 'time-trial' ? 'timeTrial' : 'race',
			verified: true,
			activityImportId: recording.id,
		},
	}
}

/**
 * An Event Distance typed in km (`7,5`, `10`, `21.1`), as exact metres: the
 * anchor's metres when it is a Race Anchor, else the km rounded to the metre.
 * Null when it is not a number between {@link EVENT_DISTANCE_MIN_KM} and
 * {@link EVENT_DISTANCE_MAX_KM} km.
 */
export function eventDistanceFromKm(text: string): number | null {
	const trimmed = text
		.trim()
		.replace(/\s*km$/i, '')
		.replace(',', '.')
	if (!/^\d+(\.\d+)?$/.test(trimmed)) return null
	const km = Number(trimmed)
	if (
		!Number.isFinite(km) ||
		km < EVENT_DISTANCE_MIN_KM ||
		km > EVENT_DISTANCE_MAX_KM
	) {
		return null
	}
	return snapToAnchor(Math.round(km * 1000))
}

/** Exact metres, as the Race Anchor they are within a few metres of. */
export function snapToAnchor(distanceM: number): number {
	for (const anchor of RACE_ANCHORS) {
		const anchorM = RACE_ANCHOR_DISTANCE_M[anchor]
		if (Math.abs(distanceM - anchorM) <= ANCHOR_SNAP_M) return anchorM
	}
	return distanceM
}

/** Metres as km the Norwegian way: `7,5`, `10`, `21,097`. */
export function nbKm(distanceM: number): string {
	const km = distanceM / 1000
	const text = Number.isInteger(km)
		? String(km)
		: km.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
	return text.replace('.', ',')
}

/** A measured distance as km to one decimal, `11,4`: a watch's reading, not a
 * course length, so it is never read to the metre. */
export function nbMeasuredKm(distanceM: number): string {
	return (Math.round(distanceM / 100) / 10).toFixed(1).replace('.', ',')
}

/** The Event Distance choices the pills offer: the six Race Anchors, then
 * _Annen_ with a km field. */
export const EVENT_DISTANCE_CHOICES = [...RACE_ANCHORS, 'other'] as const
export type EventDistanceChoice = (typeof EVENT_DISTANCE_CHOICES)[number]

/** A stored Event Distance as the choice the pills show, and the km field's
 * text when it is _Annen_. */
export function eventDistanceChoiceOf(distanceM: number | null | undefined): {
	choice: EventDistanceChoice | ''
	km: string
} {
	if (distanceM == null) return { choice: '', km: '' }
	const anchor = RACE_ANCHORS.find(
		(candidate) => RACE_ANCHOR_DISTANCE_M[candidate] === distanceM,
	)
	return anchor
		? { choice: anchor, km: '' }
		: { choice: 'other', km: nbKm(distanceM) }
}

/**
 * What the pills and the km field post, read as an Event Distance in exact
 * metres: an anchor's metres, the km snapped to an anchor when it is one, or
 * null for no distance. `ok: false` when _Annen_ holds no readable km.
 */
export function eventDistanceFromChoice(
	choice: string | null | undefined,
	km: string | null | undefined,
): { ok: true; distanceM: number | null } | { ok: false } {
	if (!choice) return { ok: true, distanceM: null }
	if (choice === 'other') {
		const distanceM = eventDistanceFromKm(km ?? '')
		return distanceM == null ? { ok: false } : { ok: true, distanceM }
	}
	const anchor = RACE_ANCHORS.find((candidate) => candidate === choice)
	return anchor
		? { ok: true, distanceM: RACE_ANCHOR_DISTANCE_M[anchor] }
		: { ok: false }
}

/** An Event Distance as its name: the pill's word for an anchor
 * (`Halvmaraton`), else km with a comma (`7,5 km`). */
export function eventDistanceName(distanceM: number): string {
	const { choice } = eventDistanceChoiceOf(distanceM)
	return choice && choice !== 'other'
		? EVENTS_LABELS.distanceNames[choice]
		: `${nbKm(distanceM)} km`
}

/** An Event Distance inside a sentence, where a length reads better than a
 * name: `10 km`, `21,1 km`, `1500 m`. */
export function eventDistanceInText(distanceM: number): string {
	if (distanceM === RACE_ANCHOR_DISTANCE_M['1500m']) return '1500 m'
	if (distanceM === RACE_ANCHOR_DISTANCE_M.hm) return '21,1 km'
	if (distanceM === RACE_ANCHOR_DISTANCE_M.marathon) return '42,2 km'
	return `${nbKm(distanceM)} km`
}
