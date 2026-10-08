// What a plan preview is made of, shared by the philosophy switch
// (`philosophy.ts`) and the Sesong edits (`season-edit.ts`): every week as the
// derivation reads it, a fingerprint of what was shown, and the one read of the
// stored rows both recompute from.
//
// Pure apart from the select, which is a plain object a server module hands to
// Prisma.

import { type Prisma } from '@prisma/client'
import { type Discipline } from '../workout-schema.ts'
import {
	phaseIndexForWeek,
	weekRole,
	type VolumeCurrency,
	type WeekRole,
} from './derive.ts'
import { phaseSpecs, resolvedTracks, type OutlineRows } from './from-rows.ts'

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
