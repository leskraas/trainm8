/**
 * Generates the committed `.fit` fixtures in this folder. Normal files use
 * Garmin's official FIT SDK encoder, so tests exercise real spec-conformant
 * binary FIT files (header + record stream + CRC), not hand-rolled bytes; the
 * compressed-timestamp file is written byte by byte because no official
 * encoder emits that header (see `fit-builder.ts`).
 *
 * Rerun with: npx tsx tests/fixtures/fit/generate-fixtures.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import {
	type ActivitySpec,
	encodeActivity,
	encodeCompressedTimestampRun,
} from './fit-builder.ts'

const OUT_DIR = path.dirname(new URL(import.meta.url).pathname)

const fixtures: Array<{ fileName: string; spec: ActivitySpec }> = [
	{
		fileName: 'run-with-hr.fit',
		spec: {
			sessions: [
				{
					sport: 'running',
					startTime: new Date('2026-06-01T07:30:00Z'),
					durationSec: 2400, // 40 min
					distanceM: 8000,
					hr: { avg: 152, max: 176 },
					cadenceAvg: 86,
					totalAscentM: 120,
					maxSpeedMps: 4.5,
					kcal: 520,
				},
			],
		},
	},
	{
		fileName: 'ride-with-power.fit',
		spec: {
			sessions: [
				{
					sport: 'cycling',
					startTime: new Date('2026-06-02T16:00:00Z'),
					durationSec: 3600, // 60 min
					distanceM: 30000,
					hr: { avg: 141, max: 168 },
					power: { avg: 210, max: 450, normalized: 225 },
					cadenceAvg: 88,
					totalAscentM: 350,
					maxSpeedMps: 14.2,
					kcal: 760,
				},
			],
		},
	},
	{
		fileName: 'hike.fit',
		spec: {
			sessions: [
				{
					sport: 'hiking',
					startTime: new Date('2026-06-03T10:00:00Z'),
					durationSec: 5400, // 90 min
					distanceM: 6000,
					hr: { avg: 110, max: 130 },
				},
			],
		},
	},
	{
		// A Forerunner 965 interval run with per-rep laps: 10' warm-up, 3 × 3'
		// on / 2' off, then the rest easy.
		fileName: 'run-with-laps.fit',
		spec: {
			fileId: {
				manufacturer: 'garmin',
				product: 4315,
				serialNumber: 3412345678,
				timeCreated: new Date('2026-06-04T06:00:00Z'),
			},
			creator: {
				manufacturer: 'garmin',
				product: 4315,
				productName: 'Forerunner 965',
			},
			sessions: [
				{
					sport: 'running',
					startTime: new Date('2026-06-04T06:00:00Z'),
					durationSec: 2400,
					distanceM: 8400,
					hr: { avg: 150, max: 182 },
					laps: [
						{ offsetSec: 0, durationSec: 600 },
						{ offsetSec: 600, durationSec: 180 },
						{ offsetSec: 780, durationSec: 120 },
						{ offsetSec: 900, durationSec: 180 },
						{ offsetSec: 1080, durationSec: 120 },
						{ offsetSec: 1200, durationSec: 180 },
						{ offsetSec: 1380, durationSec: 1020 },
					],
				},
			],
		},
	},
	{
		// One multisport file: swim, T1, bike, T2, run.
		fileName: 'triathlon.fit',
		spec: {
			fileId: {
				manufacturer: 'garmin',
				product: 3906,
				serialNumber: 3300112233,
				timeCreated: new Date('2026-06-07T07:00:00Z'),
			},
			creator: {
				manufacturer: 'garmin',
				product: 3906,
				productName: 'fēnix 7',
			},
			sessions: [
				{
					sport: 'swimming',
					subSport: 'openWater',
					startTime: new Date('2026-06-07T07:00:00Z'),
					durationSec: 1800,
					distanceM: 1500,
					hr: { avg: 140, max: 160 },
				},
				{
					sport: 'transition',
					startTime: new Date('2026-06-07T07:30:00Z'),
					durationSec: 180,
					distanceM: 300,
				},
				{
					sport: 'cycling',
					startTime: new Date('2026-06-07T07:33:00Z'),
					durationSec: 4200,
					distanceM: 40000,
					hr: { avg: 148, max: 170 },
					power: { avg: 200, max: 480, normalized: 215 },
					laps: [
						{ offsetSec: 0, durationSec: 2100 },
						{ offsetSec: 2100, durationSec: 2100 },
					],
				},
				{
					sport: 'transition',
					startTime: new Date('2026-06-07T08:43:00Z'),
					durationSec: 120,
					distanceM: 200,
				},
				{
					sport: 'running',
					startTime: new Date('2026-06-07T08:45:00Z'),
					durationSec: 2700,
					distanceM: 10000,
					hr: { avg: 158, max: 178 },
				},
			],
		},
	},
	{
		// A SuuntoPlus Guide run: the guide's owner (our client id) and the
		// external id we gave the guide come back as session developer fields.
		fileName: 'suunto-guide-run.fit',
		spec: {
			fileId: {
				manufacturer: 'suunto',
				product: 31,
				serialNumber: 2100445566,
				timeCreated: new Date('2026-06-06T05:30:00Z'),
			},
			sessions: [
				{
					sport: 'running',
					startTime: new Date('2026-06-06T05:30:00Z'),
					durationSec: 1800,
					distanceM: 6000,
					hr: { avg: 148, max: 171 },
					suuntoPlus: {
						ownerIds: ['zztrainm8'],
						externalIds: ['trainm8-session-ckx1'],
					},
				},
			],
		},
	},
]

for (const { fileName, spec } of fixtures) {
	const bytes = encodeActivity(spec)
	fs.writeFileSync(path.join(OUT_DIR, fileName), bytes)
	console.log(`wrote ${fileName} (${bytes.length} bytes)`)
}

const compressed = encodeCompressedTimestampRun({
	startTime: new Date('2026-06-05T17:00:00Z'),
	durationSec: 1800,
	distanceM: 5000,
	hr: { avg: 145, max: 170 },
	serialNumber: 5550001,
})
fs.writeFileSync(path.join(OUT_DIR, 'compressed-timestamps.fit'), compressed)
console.log(`wrote compressed-timestamps.fit (${compressed.length} bytes)`)
