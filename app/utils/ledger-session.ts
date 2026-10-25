// The session rows the ledger reads (`getSessionLedger`, `getLedgerWeek`),
// kept apart from `training.server.ts` so a module that only names a row's
// type (`session-profile.ts`, which the client and the job worker both load)
// can import it without loading the server module and everything it imports
// (#638). Nothing here imports app code.

import { type Prisma } from '@prisma/client'

const stepSelect = {
	id: true,
	kind: true,
	notes: true,
	discipline: true,
	intensity: true,
	intensityHrMin: true,
	intensityHrMax: true,
	intensityPowerMin: true,
	intensityPowerMax: true,
	intensityPaceMin: true,
	intensityPaceMax: true,
	orderIndex: true,
	durationSec: true,
	distanceM: true,
	verticalM: true,
	gradePctMin: true,
	gradePctMax: true,
	cadenceRpmMin: true,
	cadenceRpmMax: true,
	rest: true,
	exerciseId: true,
	restBetweenSetsSec: true,
	exercise: {
		select: {
			id: true,
			name: true,
			primaryMuscle: true,
			equipment: true,
		},
	},
	sets: {
		orderBy: { orderIndex: 'asc' as const },
		select: {
			id: true,
			kind: true,
			orderIndex: true,
			load: true,
			weightKg: true,
			pct1RM: true,
			effortCap: true,
			tempo: true,
			reps: true,
			durationSec: true,
			terminationRir: true,
			velocityLossPct: true,
		},
	},
} satisfies Prisma.WorkoutStepSelect

export const upcomingSessionSelect = {
	id: true,
	scheduledAt: true,
	status: true,
	source: true,
	workout: {
		select: {
			id: true,
			title: true,
			description: true,
			discipline: true,
			intent: true,
			/// The **Session Archetype** the athlete (or the Catalogue row this was
			/// copied from) stated, or null when nobody stated one — in which case
			/// the surface reads one instead (ADR 0055).
			archetype: true,
			/// A **Simple Activity**'s Activity Kind and Effort Word (ADR 0015 §A),
			/// read by `readSimpleActivity`; null on every other Workout.
			activityKind: true,
			effortWord: true,
			blocks: {
				orderBy: { orderIndex: 'asc' as const },
				select: {
					id: true,
					name: true,
					orderIndex: true,
					repeatCount: true,
					seriesRepeatCount: true,
					betweenSeriesRestSec: true,
					sendOff: true,
					steps: {
						orderBy: { orderIndex: 'asc' as const },
						select: stepSelect,
					},
				},
			},
		},
	},
	recording: {
		select: {
			id: true,
			discipline: true,
			durationSec: true,
			distanceM: true,
			startedAt: true,
			endedAt: true,
		},
	},
} satisfies Prisma.WorkoutSessionSelect

export const ledgerSessionSelect = {
	...upcomingSessionSelect,
	// Session Adoption (#460): with `source` (already in the upcoming select) it
	// says whose a session is, which the home timeline marks on every planned
	// row (#505, `session-ownership.ts`), and Session Release hands one back.
	adoptedAt: true,
	releasedAt: true,
	// Annet (#505 story 33): the athlete put this session in no Training Track,
	// so the week's three numbers leave it out (`week-volumes.ts`).
	countsInNoTrack: true,
	tssValue: true,
	plannedTssValue: true,
	plannedTssConfidence: true,
	// The Replan Note (ADR 0025): rows that carry one get the ledger's small
	// "adjusted" adornment, so softened sessions are spottable at a glance.
	replanReason: true,
	// Carry the derived phase bars so the ledger can draw a recording's intensity
	// profile (recordings have no planned structure to derive one from).
	recording: {
		select: {
			id: true,
			discipline: true,
			durationSec: true,
			distanceM: true,
			startedAt: true,
			endedAt: true,
			phaseBarsJson: true,
			// What the athlete said about this import on I dag (#505 stories
			// 80–81): once answered, "hva var dette?" is not asked again, and an
			// Angre kobling remembers the session Koble igjen puts it back on.
			linkAnsweredAt: true,
			unlinkedFromSessionId: true,
			// Where it came from (ADR 0096), for the credit a row built on it
			// owes by its title (#557, ADR 0098 §3): the Origin Platform, the
			// device, and every alias's platform. Never the transport.
			originPlatform: true,
			deviceName: true,
			aliases: { select: { originPlatform: true } },
		},
	},
	sessionLog: {
		select: {
			id: true,
			rpe: true,
		},
	},
	/**
	 * **The strength actual** — the set rows a lifting session's row states what
	 * it lifted from (ADR 0056: logged in-app is the only route by which one can
	 * exist). Until this was here, a completed gym session could say nothing at
	 * all about its own kilos, because the ledger fetched the *prescription* and
	 * a prescription is not what happened.
	 *
	 * **One round trip, not one per row.** This is a nested `select` on a
	 * `findMany`, which Prisma resolves as a single extra `WHERE sessionId IN
	 * (…)` over the whole page — the same shape `getStrengthSummaryCount`
	 * already relies on. Reading the sets per row instead (a lazy relation, or a
	 * count per session) would be an N+1 across a 56-day window.
	 *
	 * **Filtered to the sets every strength aggregate counts** — `working` and
	 * `completed`, which is `countsTowardWork`'s gate. A warm-up rung is
	 * generated when the session opens and was never part of what was asked for,
	 * so it belongs on neither the kilos line nor the set count; an abandoned set
	 * has no rep count to state.
	 *
	 * **Ordered by when the set was made**, so the lifts read in the order they
	 * were lifted rather than in whatever order the rows come back. `orderIndex`
	 * only disambiguates within one slot logged in the same instant.
	 *
	 * `effectiveKg` is deliberately **not** selected. The kilo a row *states* is
	 * its `LoadValue`, and rendering from the baked number would put a dip belt's
	 * 104 kg on a line that reads as a bar weight (ADR 0058 §4 as amended). The
	 * load column is the half a surface may keep showing.
	 */
	setLogs: {
		where: { role: 'working', outcome: 'completed' },
		orderBy: [{ completedAt: 'asc' as const }, { orderIndex: 'asc' as const }],
		select: {
			load: true,
			reps: true,
			repsLeft: true,
			durationSec: true,
			exerciseId: true,
			exercise: { select: { name: true } },
		},
	},
} satisfies Prisma.WorkoutSessionSelect

export type LedgerSession = Prisma.WorkoutSessionGetPayload<{
	select: typeof ledgerSessionSelect
}>
