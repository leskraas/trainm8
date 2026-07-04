/**
 * Generates the committed `.fit` fixtures in this folder using Garmin's
 * official FIT SDK encoder, so tests exercise real spec-conformant binary FIT
 * files (header + record stream + CRC), not hand-rolled bytes.
 *
 * Rerun with: npx tsx tests/fixtures/fit/generate-fixtures.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { Encoder, Profile, type Mesg } from '@garmin/fitsdk'

// The SDK's .d.ts types enum fields (sport, type, …) as numbers, but its
// runtime encoder/decoder use the Profile enum *strings* ('running',
// 'activity', …) — so message literals are written untyped and cast here.
function writeMesg(
	encoder: Encoder,
	num: number,
	mesg: Record<string, unknown>,
) {
	encoder.onMesg(num, mesg as Mesg)
}

const OUT_DIR = path.dirname(new URL(import.meta.url).pathname)

function mesgNum(name: 'FILE_ID' | 'RECORD' | 'SESSION' | 'ACTIVITY'): number {
	const num = Profile.MesgNum[name]
	if (num == null) throw new Error(`Unknown mesg num: ${name}`)
	return num
}

type SessionSpec = {
	fileName: string
	sport: string
	subSport?: string
	startTime: Date
	durationSec: number
	distanceM: number
	hr?: { avg: number; max: number }
	power?: { avg: number; max: number; normalized: number }
	cadenceAvg?: number
	totalAscentM?: number
	maxSpeedMps?: number
	kcal?: number
}

function encodeActivity(spec: SessionSpec): Uint8Array {
	const encoder = new Encoder()

	writeMesg(encoder, mesgNum('FILE_ID'), {
		type: 'activity',
		manufacturer: 'garmin',
		product: 0,
		timeCreated: spec.startTime,
		serialNumber: 424242,
	})

	// A sparse record stream (1 sample/min) so the file carries real records,
	// though aggregates come from the session message per the FIT convention.
	const samples = Math.max(2, Math.floor(spec.durationSec / 60))
	for (let i = 0; i < samples; i++) {
		const t = new Date(
			spec.startTime.getTime() + (i * spec.durationSec * 1000) / samples,
		)
		const record: Record<string, unknown> = {
			timestamp: t,
			distance: (i * spec.distanceM) / samples,
		}
		if (spec.hr) record.heartRate = spec.hr.avg
		if (spec.power) record.power = spec.power.avg
		writeMesg(encoder, mesgNum('RECORD'), record)
	}

	const endTime = new Date(spec.startTime.getTime() + spec.durationSec * 1000)
	const session: Record<string, unknown> = {
		timestamp: endTime,
		startTime: spec.startTime,
		sport: spec.sport,
		...(spec.subSport ? { subSport: spec.subSport } : {}),
		totalElapsedTime: spec.durationSec,
		totalTimerTime: spec.durationSec,
		totalDistance: spec.distanceM,
		...(spec.hr
			? { avgHeartRate: spec.hr.avg, maxHeartRate: spec.hr.max }
			: {}),
		...(spec.power
			? {
					avgPower: spec.power.avg,
					maxPower: spec.power.max,
					normalizedPower: spec.power.normalized,
				}
			: {}),
		...(spec.cadenceAvg != null ? { avgCadence: spec.cadenceAvg } : {}),
		...(spec.totalAscentM != null ? { totalAscent: spec.totalAscentM } : {}),
		...(spec.maxSpeedMps != null
			? { maxSpeed: spec.maxSpeedMps, enhancedMaxSpeed: spec.maxSpeedMps }
			: {}),
		...(spec.kcal != null ? { totalCalories: spec.kcal } : {}),
	}
	writeMesg(encoder, mesgNum('SESSION'), session)
	writeMesg(encoder, mesgNum('ACTIVITY'), {
		timestamp: endTime,
		totalTimerTime: spec.durationSec,
		numSessions: 1,
		type: 'manual',
	})

	return encoder.close()
}

const fixtures: SessionSpec[] = [
	{
		fileName: 'run-with-hr.fit',
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
	{
		fileName: 'ride-with-power.fit',
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
	{
		fileName: 'hike.fit',
		sport: 'hiking',
		startTime: new Date('2026-06-03T10:00:00Z'),
		durationSec: 5400, // 90 min
		distanceM: 6000,
		hr: { avg: 110, max: 130 },
	},
]

for (const spec of fixtures) {
	const bytes = encodeActivity(spec)
	fs.writeFileSync(path.join(OUT_DIR, spec.fileName), bytes)
	console.log(`wrote ${spec.fileName} (${bytes.length} bytes)`)
}
