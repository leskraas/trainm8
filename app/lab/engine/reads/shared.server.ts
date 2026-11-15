/**
 * What every read shares: the bridge from a capability's context to the
 * domain's typed actions (always the athlete's own screen, `web`), the one
 * way a Reading becomes a {@link Num}, and the session row every list, day and
 * week is built from.
 */
import { type Prisma } from '@prisma/client'
import { type ActionCtx, type RunCtx } from '#app/actions/define.ts'
import { type Reading } from '#app/actions/reading.ts'
import { toSessionSummaries } from '#app/actions/session-summary.server.ts'
import { type UnavailableReason } from '#app/actions/vocabulary.ts'
import {
	localDate,
	localTimeOfDay,
	weekdayIndex,
} from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	NB_ADHERENCE_LABELS,
	NB_INTENT_LABELS,
	nbDisciplineLabel,
	READING_UNAVAILABLE_LABELS,
	WORKOUT_DETAIL_LABELS,
} from '#app/utils/labels.ts'
import {
	type AdherenceTone,
	sessionAdherence,
} from '#app/utils/load/adherence.ts'
import { type TrackWeekVolume } from '#app/utils/plan-outline/week-volumes.ts'
import { ledgerSessionSelect } from '#app/utils/training.server.ts'
import { type CapabilityCtx } from '../define.ts'
import {
	type Band,
	type Num,
	type SessionCard,
	type Sport,
	type SportVolume,
	type Verdict,
	type VolumeUnit,
	type Weekday,
} from '../reads.types.ts'

// ── context ──────────────────────────────────────────────────────────────────

/** A Lab App is the athlete's own screen: the domain's `web` caller. */
export function actionCtxOf(ctx: CapabilityCtx): ActionCtx {
	return {
		userId: ctx.userId,
		now: ctx.now,
		timezone: ctx.timezone,
		caller: 'web',
		origin: ctx.origin,
	}
}

/** The context the domain's own readers run with, for the shared builders. */
export function runCtxOf(ctx: CapabilityCtx): RunCtx {
	return {
		...actionCtxOf(ctx),
		// A screen owes no credits beyond what the app shows itself.
		credit: () => {},
		link: (path: string) => new URL(path, ctx.origin).toString(),
	}
}

/** The value of an action that ran, or null when it did not. */
export function done<T>(result: { outcome: string; value?: T }): T | null {
	return result.outcome === 'done' ? (result.value ?? null) : null
}

// ── numbers ──────────────────────────────────────────────────────────────────

/**
 * Why a number is missing, in Norwegian. The domain's words, except where
 * they name a place in another app: an app's own screens say where to fix it.
 */
const WHY_OVERRIDES: Partial<Record<UnavailableReason, string>> = {
	'no-home-place': 'Ikke satt: du har ikke valgt et hjemsted.',
}

export function whyOf(reason: UnavailableReason): string {
	return WHY_OVERRIDES[reason] ?? READING_UNAVAILABLE_LABELS[reason]
}

export function known(value: number): Num {
	return { value, why: null }
}

export function unknown(why: string): Num {
	return { value: null, why }
}

/** A number that may be missing, with the reason to give when it is. */
export function maybe(value: number | null | undefined, why: string): Num {
	return value == null || !Number.isFinite(value) ? unknown(why) : known(value)
}

/** A domain Reading as a Num. */
export function num(r: Reading<number> | null | undefined): Num {
	if (!r) return unknown(whyOf('not-resolved'))
	return r.status === 'available' ? known(r.value) : unknown(whyOf(r.reason))
}

/** A domain Reading of anything, as its value or null. */
export function valueOf<T>(r: Reading<T> | null | undefined): T | null {
	return r && r.status === 'available' ? r.value : null
}

/** Text the athlete wrote, or trainm8's own words. */
export function plainText(
	t: string | { text: string } | null | undefined,
): string | null {
	if (t == null) return null
	return typeof t === 'string' ? t : t.text
}

// ── words ────────────────────────────────────────────────────────────────────

export const WEEKDAYS: Weekday[] = [
	'mon',
	'tue',
	'wed',
	'thu',
	'fri',
	'sat',
	'sun',
]

export function weekdayOf(day: string): Weekday {
	return WEEKDAYS[weekdayIndex(day)]!
}

const SPORTS: Sport[] = ['run', 'bike', 'swim', 'strength', 'other']

export function sportOf(discipline: string | null | undefined): Sport {
	return (SPORTS as string[]).includes(discipline ?? '')
		? (discipline as Sport)
		: 'other'
}

export function sportName(discipline: string): string {
	return discipline === 'other'
		? 'Annen aktivitet'
		: nbDisciplineLabel(discipline)
}

export function purposeOf(intent: string | null | undefined): string | null {
	if (!intent) return null
	return (NB_INTENT_LABELS as Record<string, string>)[intent] ?? null
}

// ── verdicts ─────────────────────────────────────────────────────────────────

export function verdictOf(band: Band | null, why: string | null): Verdict {
	if (!band) {
		return {
			call: null,
			label: null,
			sentence: null,
			why: why ?? whyOf('not-resolved'),
		}
	}
	const label = NB_ADHERENCE_LABELS[band]
	return {
		call: band,
		label,
		sentence: `${label} – ${WORKOUT_DETAIL_LABELS.adherenceNote[band as AdherenceTone]}`,
		why: null,
	}
}

/** The verdict of planned against actual load, the domain's own band. */
export function loadVerdict(planned: Num, actual: Num): Verdict {
	const adherence = sessionAdherence(actual.value, planned.value)
	if (adherence) return verdictOf(adherence.band.tone, null)
	return verdictOf(null, planned.why ?? actual.why)
}

// ── week volumes ─────────────────────────────────────────────────────────────

/** One sport's week from the domain's week model. */
export function sportVolumeOf(track: TrackWeekVolume): SportVolume {
	return {
		sport: sportOf(track.discipline),
		sportName: sportName(track.discipline),
		unit: track.currency as VolumeUnit,
		target: maybe(
			track.target,
			whyOf(
				track.targetAbsence === 'outside-plan'
					? 'outside-plan'
					: track.targetAbsence === 'no-anchor'
						? 'no-season-anchor'
						: 'not-resolved',
			),
		),
		// `0` is a true zero here: nothing planned, nothing done.
		planned: maybe(track.planned, whyOf('not-resolved')),
		actual: maybe(track.actual, whyOf('not-resolved')),
	}
}

// ── session cards ────────────────────────────────────────────────────────────

export const sessionCardSelect = {
	...ledgerSessionSelect,
	markedDoneAt: true,
} satisfies Prisma.WorkoutSessionSelect

export type SessionCardRow = Prisma.WorkoutSessionGetPayload<{
	select: typeof sessionCardSelect
}>

/** Ledger rows as cards, through the domain's own session summary. */
export async function toSessionCards(
	ctx: CapabilityCtx,
	rows: readonly SessionCardRow[],
): Promise<SessionCard[]> {
	const summaries = await toSessionSummaries(rows, runCtxOf(ctx))
	return rows.map((row, i) => {
		const s = summaries[i]!
		const noPlan = unknown('Ingen plan for økta: den ble bare registrert.')
		const planned =
			s.status === 'recording-only'
				? { durationS: noPlan, distanceM: noPlan, load: noPlan }
				: {
						durationS: num(s.planned.durationS),
						distanceM: num(s.planned.distanceM),
						load: num(s.planned.tss),
					}
		const actual = {
			durationS: num(s.actual.durationS),
			distanceM: num(s.actual.distanceM),
			load: num(s.actual.tss),
		}
		const isStrength = s.discipline === 'strength'
		return {
			id: s.id,
			date: s.date,
			time: localTimeOfDay(row.scheduledAt, ctx.timezone),
			sport: sportOf(s.discipline),
			sportName: sportName(s.discipline),
			title: plainText(s.title) ?? sportName(s.discipline),
			purpose: purposeOf(row.workout?.intent),
			status: s.status,
			whose: s.owner === 'athlete' ? 'athlete' : 'plan',
			planned,
			actual,
			verdict:
				s.status === 'planned'
					? verdictOf(null, 'Ikke gjort ennå.')
					: s.status === 'recording-only'
						? verdictOf(null, 'Ingen plan å holde økta opp mot.')
						: loadVerdict(planned.load, actual.load),
			rpe: row.sessionLog?.rpe ?? null,
			hasRecording: row.recording != null,
			markedDone: row.markedDoneAt != null,
			strengthSetsLogged: isStrength ? row.setLogs.length : null,
			adjustedBecause: row.replanReason ?? null,
			outsideWeeklyCount: row.countsInNoTrack,
		}
	})
}

/** The athlete's sessions matching `where`, oldest first, as cards. */
export async function readSessionCards(
	ctx: CapabilityCtx,
	where: Prisma.WorkoutSessionWhereInput,
	{ take }: { take?: number } = {},
): Promise<{ rows: SessionCardRow[]; cards: SessionCard[] }> {
	const rows = await prisma.workoutSession.findMany({
		where: { ...where, userId: ctx.userId },
		orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
		select: sessionCardSelect,
		...(take ? { take } : {}),
	})
	return { rows, cards: await toSessionCards(ctx, rows) }
}

export function todayOf(ctx: CapabilityCtx): string {
	return localDate(ctx.now, ctx.timezone)
}
