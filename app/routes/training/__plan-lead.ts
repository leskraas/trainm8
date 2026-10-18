/**
 * What _Plan_ leads with, read off the season the page already holds (ADR 0101
 * §2): the plain name and the next easy week. Pure, so the loader and the page
 * cannot disagree about which week is easy.
 */
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { PLAN_LEAD_LABELS } from '#app/utils/labels.ts'
import { type WeekRole } from '#app/utils/plan-outline/derive.ts'
import { type PresetFamily } from '#app/utils/plan-outline/presets.ts'

export type NextEasyWeek = {
	/** The week's Monday in the Athlete Timezone. */
	weekKey: string
	/** The ISO week the athlete counts in (`uke 45`). */
	weekNumber: number
	/** The athlete is in it now: the lead says so instead of naming a date. */
	isThisWeek: boolean
}

/**
 * The first **recovery** week from this week on — the easy week the phase's
 * rhythm prescribes (ADR 0044 §4). A taper is not an easy week: it is the run
 * into the race, and the curve already shows it. Null when the plan as laid
 * holds no easy week ahead (an open-ended plan's next round is not laid yet).
 */
export function nextEasyWeek(
	weeks: ReadonlyArray<{ weekKey: string; role: WeekRole }>,
	thisWeekKey: string,
): NextEasyWeek | null {
	const week = weeks.find(
		(entry) => entry.weekKey >= thisWeekKey && entry.role === 'recovery',
	)
	if (!week) return null
	return {
		weekKey: week.weekKey,
		weekNumber: isoWeekNumber(week.weekKey),
		isThisWeek: week.weekKey === thisWeekKey,
	}
}

/** The plan's plain name: the Start Option's own, or _Din egen plan_. */
export function planPlainName(family: PresetFamily | null): string {
	return family ? PLAN_LEAD_LABELS.plainName[family] : PLAN_LEAD_LABELS.ownPlan
}
