import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './imports.share-target.tsx'

const FIT_FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'fit')

async function setupAthlete() {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
		},
	})
	const session = await prisma.session.create({
		select: { id: true },
		data: { userId: user.id, expirationDate: getSessionExpirationDate() },
	})
	const cookieHeader = await getSessionCookieHeader(session)
	return { userId: user.id, cookieHeader }
}

function fitFile(name: string) {
	const bytes = fs.readFileSync(path.join(FIT_FIXTURES, name))
	return new File([new Uint8Array(bytes)], name, {
		type: 'application/octet-stream',
	})
}

function gpxFile(name = 'shared-run.gpx') {
	const content = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
	<trk>
		<type>running</type>
		<trkseg>
			<trkpt lat="59.9100" lon="10.7400"><time>2026-06-02T07:30:00Z</time></trkpt>
			<trkpt lat="59.9200" lon="10.7400"><time>2026-06-02T07:45:00Z</time></trkpt>
			<trkpt lat="59.9300" lon="10.7400"><time>2026-06-02T08:00:00Z</time></trkpt>
		</trkseg>
	</trk>
</gpx>`
	return new File([content], name, { type: 'application/gpx+xml' })
}

async function shareFiles(cookieHeader: string, files: File[]) {
	const formData = new FormData()
	for (const file of files) formData.append('file', file)
	const request = new Request(`${BASE_URL}/imports/share-target`, {
		method: 'POST',
		headers: { cookie: cookieHeader },
		body: formData,
	})
	return action({ request, params: {}, context: {} } as any)
}

function expectRedirect(result: unknown, location: string) {
	if (!(result instanceof Response)) {
		throw new Error('Expected a redirect Response')
	}
	expect(result.status).toBe(303)
	expect(result.headers.get('location')).toBe(location)
}

test('a shared GPX file lands in the Activity Inbox via the shared ingest path', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	const result = await shareFiles(cookieHeader, [gpxFile()])
	expectRedirect(result, '/imports')

	const imports = await prisma.activityImport.findMany({
		where: { athleteId: userId },
	})
	expect(imports).toHaveLength(1)
	expect(imports[0]!.externalProvider).toBe('manual')
	expect(imports[0]!.discipline).toBe('run')
})

test('a shared FIT file imports with device metrics', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	const result = await shareFiles(cookieHeader, [fitFile('run-with-hr.fit')])
	expectRedirect(result, '/imports')

	const imports = await prisma.activityImport.findMany({
		where: { athleteId: userId },
	})
	expect(imports).toHaveLength(1)
	expect(imports[0]!.discipline).toBe('run')
	expect(imports[0]!.hrAvg).not.toBeNull()
})

test('sharing the same file twice dedupes by content hash', async () => {
	const { userId, cookieHeader } = await setupAthlete()

	await shareFiles(cookieHeader, [fitFile('run-with-hr.fit')])
	const result = await shareFiles(cookieHeader, [fitFile('run-with-hr.fit')])
	expectRedirect(result, '/imports')

	const count = await prisma.activityImport.count({
		where: { athleteId: userId },
	})
	expect(count).toBe(1)
})

test('sharing no files redirects to the upload page instead of erroring', async () => {
	const { cookieHeader } = await setupAthlete()

	const result = await shareFiles(cookieHeader, [])
	expectRedirect(result, '/imports/upload')
})

test("a shared near-midnight activity files to the athlete's local day (#173)", async () => {
	const { userId, cookieHeader } = await setupAthlete()
	await prisma.athleteProfile.create({
		data: {
			userId,
			timezone: 'Europe/Oslo',
			disciplineProfiles: { create: { discipline: 'run', lthr: 160 } },
		},
	})

	// A planned run on the athlete's 2 June for the near-midnight activity to
	// auto-match onto (only promoted imports feed Load Snapshots).
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Easy run',
			discipline: 'run',
			intent: 'endurance',
			ownerId: userId,
		},
	})
	await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: new Date('2026-06-02T06:00:00Z'),
			status: 'planned',
		},
	})

	// 30 min of HR samples starting 22:30 UTC on 1 June — 00:30 on 2 June in
	// Europe/Oslo. The HR channel plus the run LTHR earns an hrTSS, so the
	// activity must land in the 2 June Load Snapshot (the athlete's day).
	const points = Array.from({ length: 31 }, (_, i) => {
		const time = new Date(
			Date.parse('2026-06-01T22:30:00Z') + i * 60_000,
		).toISOString()
		return `<trkpt lat="${(59.91 + i * 0.001).toFixed(4)}" lon="10.7400"><time>${time}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>150</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`
	}).join('\n\t\t\t')
	const content = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
	<trk>
		<type>running</type>
		<trkseg>
			${points}
		</trkseg>
	</trk>
</gpx>`
	const file = new File([content], 'midnight-run.gpx', {
		type: 'application/gpx+xml',
	})

	const result = await shareFiles(cookieHeader, [file])
	expectRedirect(result, '/imports')

	const june2 = await prisma.loadSnapshot.findFirst({
		where: { athleteId: userId, date: '2026-06-02' },
	})
	expect(june2).not.toBeNull()
	expect(june2!.tssTotal).toBeGreaterThan(0)
	const june1 = await prisma.loadSnapshot.findFirst({
		where: { athleteId: userId, date: '2026-06-01' },
	})
	expect(june1?.tssTotal ?? 0).toBe(0)
})
