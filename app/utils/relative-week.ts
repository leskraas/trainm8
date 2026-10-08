import { addDays, isoWeekNumber } from './athlete-calendar.ts'
import { RELATIVE_WEEK_LABELS, weekNumberLabel } from './labels.ts'

/**
 * A Training Week by its relative name (#505 S9): `Forrige uke`, `Denne uka`,
 * `Neste uke`, otherwise `Uke 41`. Shared by I dag's week headers and the
 * writing line's week sum and toast.
 */
export function relativeWeekName(monday: string, nowMonday: string): string {
	if (monday === nowMonday) return RELATIVE_WEEK_LABELS.current
	if (monday === addDays(nowMonday, -7)) return RELATIVE_WEEK_LABELS.previous
	if (monday === addDays(nowMonday, 7)) return RELATIVE_WEEK_LABELS.next
	return weekNumberLabel(isoWeekNumber(monday))
}
