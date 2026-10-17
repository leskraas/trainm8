// _Planen er klar_ (#558 stories 46–51, #570): the plan _Velg denne_ made,
// read back from what was written — never from the answers — so the screen
// shows the plan that exists, and a reload shows it again and makes nothing.
//
// - **The curve** is the plan's own derivation (`resolvedTracks`) over its
//   stored rows: the round as laid, then the rounds the Week Change would
//   append if every week were done to plan (`withProjectedRounds`, at the
//   factor such a round earns, ADR 0079 as built in #505 S6), to twelve weeks.
// - **Under panseret** is read through Sesong's reader (`getSeasonForOutline`):
//   the family, open-ended or the race, the rhythm, each Training Track with
//   its Season Anchor, the Week Pattern, and the athlete's Training Level.

import { isoWeekNumber } from '../athlete-calendar.ts'
import { prisma } from '../db.server.ts'
import {
	formatNbDate,
	formatNbVolumeTotal,
	formatNbWeeklyVolume,
} from '../format.ts'
import {
	NB_VOLUME_UNITS,
	NB_WEEKDAY_LABELS,
	nbLongDay,
	nbTrackName,
	PHILOSOPHY_LABELS,
	PLAN_READY_LABELS,
	SIMPLE_START_LABELS,
	START_OPTION_LABELS,
} from '../labels.ts'
import { ROUND_STEP_UP } from '../load/propose-next-round.ts'
import { weekRole } from '../plan-outline/derive.ts'
import { phaseSpecs, resolvedTracks } from '../plan-outline/from-rows.ts'
import { roundBoundaryStep } from '../plan-outline/open-ended.server.ts'
import { withProjectedRounds } from '../plan-outline/round-projection.ts'
import { weekKeyAt } from '../plan-outline/week-keys.ts'
import { PATTERN_WEEKDAYS } from '../plan-outline/week-pattern.ts'
import { findActiveOutline, getSeasonForOutline } from '../training.server.ts'
import { TRAINING_LEVELS } from './start-draft.ts'

/** The weeks the curve draws (story 47). */
export const PLAN_READY_WEEKS = 12

const L = PLAN_READY_LABELS

/** One week of the curve, in the shape the Season Pane's curve reads. */
export type PlanReadyPoint = {
	key: string
	weekNumber: number
	/** The week's hours across the plan's tracks in hours. */
	target: number | null
	done: null
	phaseTone: null
	inPhase: true
	isNow: false
}

export type PlanReady = {
	overline: string
	/** The plain name (`Bygg grunnform først`), or the family's own. */
	name: string
	/** `Fagnavn: Stor base`, small; null where the name is the family's. */
	familyName: string | null
	startsOn: string
	curve: {
		title: string
		ariaLabel: string
		caption: string
		trackName: string
		unit: string
		discipline: null
		points: PlanReadyPoint[]
		max: number
		todayAt: null
		horizonAt: null
		eventAt: null
		/** The first week the plan has not laid; null for a plan toward a race. */
		projectedFrom: number | null
		projectedLabel: string
		/** What the dashed weeks are, or null with none. */
		note: string | null
	}
	sunday: string
	hood: {
		title: string
		intro: string
		facts: Array<{ term: string; details: string[] }>
		patternTitle: string
		pattern: Array<{ weekday: string; sessions: string[] }>
		free: string
		weeksTitle: string
		/** The weeks as laid: what was written, never the projection. */
		weeks: Array<{ key: string; week: string; hours: string; easy: boolean }>
		easy: string
	}
	toToday: string
}

/**
 * The athlete's plan as _Planen er klar_ shows it, or null when they have
 * none (the start is then where they belong).
 */
export async function readPlanReady(
	userId: string,
	now: Date = new Date(),
): Promise<PlanReady | null> {
	const found = await findActiveOutline(userId, now)
	if (!found) return null
	const { outline } = found
	const [season, profile] = await Promise.all([
		getSeasonForOutline(userId, outline.id, now),
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: { trainingLevel: true },
		}),
	])
	if (!season) return null

	// The round as laid, then — for an open-ended plan — the rounds a round
	// done to plan earns, to twelve weeks: two more rounds of four.
	const laidWeeks = season.weeks.length
	const lastPhase = season.phases.at(-1)
	const roundWeeks = lastPhase?.weeks ?? 0
	const rounds =
		season.eventId == null && roundWeeks > 0 && laidWeeks < PLAN_READY_WEEKS
			? Math.ceil((PLAN_READY_WEEKS - laidWeeks) / roundWeeks)
			: 0
	const rows = withProjectedRounds(outline, {
		rounds,
		boundaryStep: roundBoundaryStep(ROUND_STEP_UP),
	})
	const tracks = resolvedTracks(rows).filter(
		(track) => track.currency === 'hours',
	)
	const phases = phaseSpecs(rows)
	const weeks = Math.min(
		PLAN_READY_WEEKS,
		phases.reduce((sum, phase) => sum + phase.weeks, 0),
	)
	const points: PlanReadyPoint[] = Array.from({ length: weeks }, (_, index) => {
		const key = weekKeyAt(rows.startWeekKey, index)
		const values = tracks.map((track) => track.targets[index]?.value ?? null)
		return {
			key,
			weekNumber: isoWeekNumber(key),
			target: values.some((value) => value != null)
				? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
				: null,
			done: null,
			phaseTone: null,
			inPhase: true,
			isNow: false,
		}
	})
	const projectedFrom = rounds > 0 ? laidWeeks : null
	const percent = Math.round((ROUND_STEP_UP - 1) * 100)

	const family = season.family
	const plain =
		family && family !== 'masters' ? START_OPTION_LABELS.plain[family] : null
	const familyLabel = family ? PHILOSOPHY_LABELS[family] : null
	const level = TRAINING_LEVELS.find((one) => one === profile?.trainingLevel)
	const trackName = (trackId: string) => {
		const track = season.tracks.find((one) => one.trackId === trackId)
		return track ? nbTrackName(track.discipline) : ''
	}

	const facts: PlanReady['hood']['facts'] = []
	if (familyLabel) facts.push({ term: L.hood.family, details: [familyLabel] })
	facts.push({
		term: L.hood.length,
		details: [
			season.eventName && season.eventDate
				? L.hood.race(
						season.eventName,
						formatNbDate(season.eventDate, season.timezone),
					)
				: L.hood.openEnded,
		],
	})
	const rhythms = [...new Set(season.phases.map((phase) => phase.rhythm))]
	facts.push({
		term: L.hood.rhythm,
		details: rhythms.map((rhythm) => L.hood.rhythms[rhythm]),
	})
	facts.push({
		term: L.hood.tracks,
		details: season.tracks.map((track) => {
			const anchor = track.anchors.find(
				(one) => one.fromWeekKey === season.startWeekKey,
			)
			return L.hood.track(
				nbTrackName(track.discipline),
				anchor ? formatNbWeeklyVolume(anchor.value, track.currency) : null,
			)
		}),
	})
	if (level) {
		facts.push({
			term: L.hood.level,
			details: [SIMPLE_START_LABELS.levels[level].name],
		})
	}

	const pattern = season.patterns[0]
	return {
		overline: L.overline,
		name: plain?.name ?? familyLabel ?? L.overline,
		familyName:
			plain && familyLabel ? START_OPTION_LABELS.familyName(familyLabel) : null,
		startsOn: L.startsOn(nbLongDay(season.startWeekKey)),
		curve: {
			title: L.curveTitle,
			ariaLabel: L.curveName(
				Math.min(laidWeeks, weeks),
				projectedFrom == null ? 0 : weeks - projectedFrom,
			),
			caption: L.curveCaption,
			trackName: L.track,
			unit: NB_VOLUME_UNITS.hours,
			discipline: null,
			points,
			max: Math.max(0, ...points.map((point) => point.target ?? 0)),
			todayAt: null,
			horizonAt: null,
			eventAt: null,
			projectedFrom,
			projectedLabel: L.ifAsPlanned,
			note: projectedFrom == null ? null : L.note(percent),
		},
		sunday: L.sunday,
		hood: {
			title: L.hood.title,
			intro: L.hood.intro,
			facts,
			patternTitle: L.hood.pattern,
			pattern: PATTERN_WEEKDAYS.map((weekday) => ({
				weekday: NB_WEEKDAY_LABELS[weekday],
				sessions: (pattern?.days ?? [])
					.filter((day) => day.weekday === weekday)
					.sort((a, b) => a.orderInDay - b.orderInDay)
					.map((day) =>
						day.kind === 'share'
							? L.hood.shareDay(trackName(day.trackId), day.weight)
							: L.hood.fixedDay(
									trackName(day.trackId),
									day.workout?.title ?? '',
								),
					),
			})),
			free: L.hood.free,
			weeksTitle: L.hood.weeks,
			weeks: points
				.slice(0, projectedFrom ?? points.length)
				.map((point, index) => ({
					key: point.key,
					week: L.hood.week(point.weekNumber),
					hours:
						point.target == null
							? '–'
							: formatNbVolumeTotal(point.target, 'hours'),
					easy: weekRole(phases, index) === 'recovery',
				})),
			easy: L.hood.easy,
		},
		toToday: '/',
	}
}
