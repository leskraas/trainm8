// What a plan preview is made of, shared by the philosophy switch
// (`philosophy.ts`) and the Sesong edits (`season-edit.ts`): every week as the
// derivation reads it, a fingerprint of what was shown, and the one read of the
// stored rows both recompute from.
//
// Pure apart from the select, which is a plain object a server module hands to
// Prisma.

import { type Prisma } from '@prisma/client'
import { isoWeekNumber } from '../athlete-calendar.ts'
import { type Discipline } from '../workout-schema.ts'
import {
	phaseIndexForWeek,
	weekRole,
	type VolumeCurrency,
	type WeekRole,
} from './derive.ts'
import { phaseSpecs, resolvedTracks, type OutlineRows } from './from-rows.ts'
import { weekRiseWarnings } from './ramp-guard.ts'
import { weekKeyAt } from './week-keys.ts'

/** One track's target in one week. */
export type TargetView = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	/** In the track's own currency; null is an Unavailable week. */
	value: number | null
}

/** One week as the plan reads it on one side of an edit. */
export type WeekView = {
	phaseName: string
	role: WeekRole
	targets: TargetView[]
}

/** Every week of the plan as the derivation reads it. */
export function weekViews(rows: OutlineRows): WeekView[] {
	const specs = phaseSpecs(rows)
	const ordered = [...rows.phases].sort((a, b) => a.orderIndex - b.orderIndex)
	const tracks = resolvedTracks(rows)
	const total = specs.reduce((sum, phase) => sum + phase.weeks, 0)
	return Array.from({ length: total }, (_, week) => ({
		phaseName: ordered[phaseIndexForWeek(specs, week) ?? 0]?.name ?? '',
		role: weekRole(specs, week),
		targets: tracks.map((track) => ({
			trackId: track.trackId,
			discipline: track.discipline,
			currency: track.currency,
			value: track.targets[week]?.value ?? null,
		})),
	}))
}

/** A loading week a preview would raise more than 10 % over the one before. */
export type RiseWarning = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	weekKey: string
	weekNumber: number
	fromWeekKey: string
	from: number
	to: number
	rise: number
}

/**
 * The rise warnings (`weekRiseWarnings`, ADR 0084 §3) over the week targets
 * `rows` derive — `views` is `weekViews(rows)` — for each track, kept where
 * `include` says the pair of weeks is the preview's business. Shared by the
 * Sesong edits and the philosophy switch (story 76), so both warn by one rule.
 */
export function riseWarnings(
	rows: OutlineRows,
	views: WeekView[],
	include: (weekKey: string, fromWeekKey: string) => boolean,
): RiseWarning[] {
	const warnings: RiseWarning[] = []
	const resolved = resolvedTracks(rows)
	for (const [trackIndex, track] of rows.tracks.entries()) {
		// A strength track rests on its own block's deload, not on the phase's
		// rhythm (ADR 0047 §6): its deload is its easy week, and a gap between
		// blocks is never compared, like a taper.
		const strengthRoles = resolved[trackIndex]?.strengthRoles ?? null
		const series = views.map((view, week) => ({
			role:
				strengthRoles == null
					? view.role
					: strengthRoles[week] === 'loading'
						? ('loading' as const)
						: strengthRoles[week] === 'deload'
							? ('recovery' as const)
							: ('taper' as const),
			value: view.targets[trackIndex]?.value ?? null,
		}))
		for (const rise of weekRiseWarnings(series)) {
			const weekKey = weekKeyAt(rows.startWeekKey, rise.weekIndex)
			const fromWeekKey = weekKeyAt(rows.startWeekKey, rise.fromWeekIndex)
			if (!include(weekKey, fromWeekKey)) continue
			warnings.push({
				trackId: track.id,
				discipline: track.discipline as Discipline,
				currency: track.currency as VolumeCurrency,
				weekKey,
				weekNumber: isoWeekNumber(weekKey),
				fromWeekKey,
				from: rise.from,
				to: rise.to,
				rise: rise.rise,
			})
		}
	}
	return warnings
}

/**
 * A short fingerprint of what a preview showed and the edit behind it. The
 * confirm posts it back, and the apply refuses when the edit it would make now
 * has a different one — a plan edited, or a week begun, since the athlete
 * looked (`preview-stale`).
 */
export function digestOf(value: unknown): string {
	// FNV-1a over the JSON: stable across server and tests, and only ever
	// compared with itself.
	let hash = 0x811c9dc5
	for (const char of JSON.stringify(value)) {
		hash ^= char.codePointAt(0)!
		hash = Math.imul(hash, 0x01000193) >>> 0
	}
	return hash.toString(16).padStart(8, '0')
}

/**
 * A Plan Outline's rows as `from-rows.ts` reads them, plus its philosophy and
 * its Event — the read every preview recomputes from, inside the apply's own
 * transaction.
 */
export const outlinePreviewSelect = {
	id: true,
	startWeekKey: true,
	family: true,
	event: { select: { startDate: true } },
	phases: {
		select: {
			id: true,
			orderIndex: true,
			name: true,
			weeks: true,
			rhythm: true,
			tapers: true,
			recoveryWeekIndex: true,
		},
	},
	tracks: {
		select: {
			id: true,
			discipline: true,
			currency: true,
			anchors: { select: { fromWeekKey: true, value: true } },
			segments: {
				select: {
					id: true,
					kind: true,
					phaseId: true,
					ramp: true,
					boundaryStep: true,
					recoveryCut: true,
					taperCut: true,
					startWeekKey: true,
					weeks: true,
					goal: true,
					sessionsPerWeek: true,
					deloadCut: true,
					deloadWeeks: true,
					mix: { select: { zone: true, sessionsPerWeek: true } },
				},
			},
			overrides: { select: { weekKey: true, value: true } },
		},
	},
} satisfies Prisma.PlanOutlineSelect
