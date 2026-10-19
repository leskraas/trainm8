// Every Training Track's **Pinned days** on the athlete's active plan, across
// the lifting days (`lifting-days.server.ts`) and every other track's
// (`track-days.server.ts`), ADR 0104 §4:
//
// - by Discipline, what Week Replan prefers for a track's make-up when one of
//   its days is free (spec #588 story 32);
// - and the availability cascade: a day taken out of Training Availability
//   leaves every track that pinned it (story 19).

import { availablePatternDays } from '../athlete.server.ts'
import { prisma } from '../db.server.ts'
import {
	type PlannedDiscipline,
	readPlannedDiscipline,
} from '../planned-discipline.ts'
import { findActiveOutline } from '../training.server.ts'
import { readLiftingDays, setLiftingDays } from './lifting-days.server.ts'
import { relayPlanFromFirstUnbegunWeek } from './open-ended.server.ts'
import {
	parsePinnedDays,
	pinnedDaysWithin,
	strengthPinnedDays,
} from './pinned-days.ts'
import { readTrackDays, setTrackDays } from './track-days.server.ts'
import { type PatternWeekday } from './week-pattern.ts'

/**
 * The active plan's tracks that name their own days, keyed by Discipline,
 * Monday first. A strength track reads its stored `fixed` days as pinned
 * where it names none (ADR 0104 §4). Empty without a plan.
 */
export async function readPinnedDaysByDiscipline(
	userId: string,
	now: Date = new Date(),
): Promise<Map<PlannedDiscipline, PatternWeekday[]>> {
	const pinned = new Map<PlannedDiscipline, PatternWeekday[]>()
	const active = await findActiveOutline(userId, now)
	if (!active) return pinned
	const [tracks, pattern] = await Promise.all([
		prisma.trainingTrack.findMany({
			where: { outlineId: active.outline.id },
			select: { id: true, discipline: true, pinnedDays: true },
		}),
		prisma.weekPattern.findFirst({
			where: { outlineId: active.outline.id, days: { some: {} } },
			orderBy: { orderIndex: 'asc' },
			select: {
				days: { select: { trackId: true, kind: true, weekday: true } },
			},
		}),
	])
	for (const track of tracks) {
		const days =
			track.discipline === 'strength'
				? strengthPinnedDays(
						track,
						(pattern?.days ?? []).filter((day) => day.trackId === track.id),
					)
				: parsePinnedDays(track.pinnedDays)
		const discipline = readPlannedDiscipline(track.discipline)
		if (days && discipline) pinned.set(discipline, days)
	}
	return pinned
}

/** A track that lost days when Training Availability changed. */
export type DroppedPinnedDays = {
	/** The track's, or the Simple Activity's, own key: one line each. */
	key: string
	discipline: PlannedDiscipline
	activity: boolean
	/** A Simple Activity's name, where it was one. */
	title: string | null
	lost: PatternWeekday[]
	/** What it keeps; `null` where it went back to _La appen velge_. */
	kept: PatternWeekday[] | null
}

/**
 * Drop the days the athlete no longer trains on from every track of the
 * active plan that pinned them (spec #588 story 19), lay the weeks again,
 * and say which tracks lost which days. A track left with none goes back to
 * _La appen velge_. A Simple Activity keeps its other days; one left with
 * none stays where it is, and is said, since only the athlete can name its
 * new day. Call it after the new availability is stored.
 */
export async function dropUnavailablePinnedDays(
	userId: string,
	now: Date = new Date(),
): Promise<DroppedPinnedDays[]> {
	const active = await findActiveOutline(userId, now)
	if (!active) return []
	const outlineId = active.outline.id
	const dropped: DroppedPinnedDays[] = []
	// Read as stated, not as the day services read it: an emptied list is the
	// athlete taking every day out, so every pin goes; only never-set keeps them.
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { trainableWeekdays: true },
	})
	const available = availablePatternDays(profile?.trainableWeekdays)
	if (!available) return dropped

	const strength = await readLiftingDays(userId, now)
	if (strength?.pinned) {
		const { kept, lost } = pinnedDaysWithin(strength.pinned, available)
		if (lost.length > 0) {
			const written = await setLiftingDays(
				userId,
				{ choice: kept, version: strength.version },
				now,
			)
			if (written.ok) {
				dropped.push({
					key: 'strength',
					discipline: 'strength',
					activity: false,
					title: null,
					lost,
					kept,
				})
			}
		}
	}

	const state = await readTrackDays(userId, outlineId)
	if (!state) return dropped
	let changed = false
	for (const unit of state.units) {
		if (!unit.pinned) continue
		const { kept, lost } = pinnedDaysWithin(unit.pinned, available)
		if (lost.length === 0) continue
		if (unit.kind === 'activity' && !kept) {
			dropped.push({
				key: unit.key,
				discipline: unit.discipline,
				activity: true,
				title: unit.title,
				lost,
				kept,
			})
			continue
		}
		const written = await setTrackDays(
			userId,
			{ outlineId, key: unit.key, choice: kept, version: unit.version },
			now,
			{ relay: false },
		)
		if (!written.ok) continue
		changed = true
		dropped.push({
			key: unit.key,
			discipline: unit.discipline,
			activity: unit.kind === 'activity',
			title: unit.title,
			lost,
			kept,
		})
	}
	if (changed) {
		await relayPlanFromFirstUnbegunWeek(userId, outlineId, now, 'track-days')
	}
	return dropped
}
