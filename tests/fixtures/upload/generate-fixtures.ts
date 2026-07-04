/**
 * Generates the committed bulk-upload fixtures in this folder from the real
 * encoded FIT fixtures in `../fit`:
 *
 * - `run-with-hr.fit.gz` — a gzipped FIT, as Strava/Garmin export them
 * - `strava-export.zip` — a trimmed Strava bulk-export archive: activity files
 *   (`.fit.gz`, `.fit`, `.gpx`) under a nested `activities/` folder plus
 *   non-activity noise (`activities.csv`, `media/photo.jpg`)
 *
 * Rerun with: npx tsx tests/fixtures/upload/generate-fixtures.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { zipSync } from 'fflate'

const OUT_DIR = path.dirname(new URL(import.meta.url).pathname)
const FIT_DIR = path.join(OUT_DIR, '..', 'fit')

function fit(name: string): Uint8Array {
	return new Uint8Array(fs.readFileSync(path.join(FIT_DIR, name)))
}

const runFit = fit('run-with-hr.fit')
const rideFit = fit('ride-with-power.fit')

// A minimal-but-valid GPX on its own day (2026-06-05), so the zip fans out to
// three distinct activities.
const walkGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="strava-export">
	<trk>
		<type>running</type>
		<trkseg>
			<trkpt lat="59.9100" lon="10.7400"><time>2026-06-05T06:00:00Z</time></trkpt>
			<trkpt lat="59.9150" lon="10.7400"><time>2026-06-05T06:15:00Z</time></trkpt>
			<trkpt lat="59.9200" lon="10.7400"><time>2026-06-05T06:30:00Z</time></trkpt>
		</trkseg>
	</trk>
</gpx>`

const activitiesCsv = `Activity ID,Activity Date,Activity Type,Filename
1001,"Jun 1, 2026, 7:30:00 AM",Run,activities/1001.fit.gz
1002,"Jun 2, 2026, 4:00:00 PM",Ride,activities/1002.fit
1003,"Jun 5, 2026, 6:00:00 AM",Run,activities/1003.gpx
`

fs.writeFileSync(
	path.join(OUT_DIR, 'run-with-hr.fit.gz'),
	zlib.gzipSync(runFit),
)
console.log('wrote run-with-hr.fit.gz')

const zip = zipSync({
	'activities/1001.fit.gz': [zlib.gzipSync(runFit), { level: 0 }],
	'activities/1002.fit': rideFit,
	'activities/1003.gpx': new TextEncoder().encode(walkGpx),
	'activities.csv': new TextEncoder().encode(activitiesCsv),
	// Non-activity noise the importer must skip silently.
	'media/photo.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]),
})
fs.writeFileSync(path.join(OUT_DIR, 'strava-export.zip'), zip)
console.log('wrote strava-export.zip')
