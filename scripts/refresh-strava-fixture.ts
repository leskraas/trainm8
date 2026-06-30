import 'dotenv/config'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runStravaBackfill } from '#app/integrations/strava/backfill.server.ts'
import { prisma } from '#app/utils/db.server.ts'

/**
 * Refresh `prisma/seed-data/kody-strava-history.json` — the committed snapshot of
 * kody's real Strava history that `prisma/seed.ts` replays offline (so
 * `db:reset-local` reproduces a real athlete without a live sync).
 *
 * Prerequisite: a live Strava Account Connection for kody must exist in the local
 * DB (connect once via the in-app OAuth flow, then run this). The script re-runs
 * the Backfill Window (count-based, reaching up to a year — #151) to pull the full
 * history, then snapshots every real Strava ActivityImport plus its downsampled
 * ActivityStream into the fixture. Re-running is idempotent.
 *
 *   npx tsx scripts/refresh-strava-fixture.ts
 */
async function main() {
	const kody = await prisma.user.findFirstOrThrow({
		where: { username: 'kody' },
		select: { id: true },
	})

	console.log('Running Strava backfill for kody…')
	const result = await runStravaBackfill(kody.id)
	console.log('Backfill:', JSON.stringify(result))
	if (!result.ok) {
		throw new Error(
			`Backfill failed (${result.reason}). Connect kody to Strava in-app first.`,
		)
	}

	const imports = await prisma.activityImport.findMany({
		where: {
			athleteId: kody.id,
			externalProvider: 'strava',
			externalId: { not: { startsWith: 'seed-' } },
		},
		orderBy: { startedAt: 'asc' },
		select: {
			externalId: true,
			startedAt: true,
			endedAt: true,
			durationSec: true,
			distanceM: true,
			discipline: true,
			hrAvg: true,
			hrMax: true,
			powerAvg: true,
			powerMax: true,
			powerWeightedAvg: true,
			cadenceAvg: true,
			paceAvgSecPerKm: true,
			speedMaxMps: true,
			elevationGainM: true,
			kilojoules: true,
			polyline: true,
			phaseBarsJson: true,
			rawJson: true,
			stream: {
				select: {
					resolutionSec: true,
					sampleCount: true,
					timeSec: true,
					power: true,
					heartrate: true,
					pace: true,
				},
			},
		},
	})
	if (imports.length === 0) throw new Error('No real Strava imports found')

	const latest = imports.reduce(
		(max, i) => (i.startedAt > max ? i.startedAt : max),
		imports[0]!.startedAt,
	)

	const fixture = {
		// Everything is anchored to this instant at seed time: the seed shifts every
		// activity by (seedNow − capturedAt) so the real history's shape stays put
		// relative to "today" however far in the future the seed is run.
		capturedAt: new Date().toISOString(),
		latestActivityAt: latest.toISOString(),
		count: imports.length,
		activities: imports.map((i) => ({
			...i,
			startedAt: i.startedAt.toISOString(),
			endedAt: i.endedAt.toISOString(),
		})),
	}

	const outDir = path.join(process.cwd(), 'prisma', 'seed-data')
	await mkdir(outDir, { recursive: true })
	const outPath = path.join(outDir, 'kody-strava-history.json')
	await writeFile(outPath, JSON.stringify(fixture, null, '\t') + '\n')

	const byDisc: Record<string, number> = {}
	for (const i of imports) byDisc[i.discipline] = (byDisc[i.discipline] ?? 0) + 1
	console.log(`Wrote ${imports.length} activities → ${path.relative(process.cwd(), outPath)}`)
	console.log('By discipline:', byDisc)
	console.log('With streams:', imports.filter((i) => i.stream).length)
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())

// scripts may import from the app server modules
/*
eslint
	no-restricted-imports: "off",
*/
