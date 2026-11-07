import { expect, test } from 'vitest'
import { type VolumeSession } from '../plan-outline/week-volumes.ts'
import { previewWeekVolumes } from './planned-volume.ts'
import { type GeneratedSeason } from './season.ts'

/** A one-week, run-only season: all `previewWeekVolumes` reads of it. */
const season = {
	startWeekKey: '2026-01-05',
	tracks: [{ discipline: 'run', currency: 'km' }],
	weeks: [
		{
			weekIndex: 0,
			weekKey: '2026-01-05',
			targets: [{ discipline: 'run', currency: 'km', value: 30 }],
		},
	],
} as unknown as GeneratedSeason

function session(overrides: Partial<VolumeSession>): VolumeSession {
	return {
		dayKey: '2026-01-07',
		status: 'planned',
		discipline: 'run',
		easy: true,
		prescribed: { km: 10, hours: 1, tss: null, sets: null },
		recorded: null,
		plannedZones: [],
		doneZones: [],
		countsInNoTrack: false,
		...overrides,
	}
}

test('the “already in this week” count holds only the sessions a planned figure counts (#472)', () => {
	const [week] = previewWeekVolumes({
		season,
		todayKey: '2026-01-01',
		placed: [session({})],
		existing: [
			// Counted in the run track's planned figure.
			session({ dayKey: '2026-01-08' }),
			// No track for strength in this season: in Annet, not in any planned figure.
			session({
				discipline: 'strength',
				prescribed: { km: null, hours: null, tss: null, sets: 12 },
			}),
			// Put in Annet by the athlete.
			session({ countsInNoTrack: true }),
			// A recording-only extra: no prescription, nothing planned.
			session({ prescribed: null, status: 'completed' }),
		],
	})

	expect(week!.volumes.tracks[0]!.planned).toBe(20)
	expect(week!.existingSessions).toBe(1)
	// The ≠ gate still reads the whole week, as Sesong's does.
	expect(week!.hasSessions).toBe(true)
})
