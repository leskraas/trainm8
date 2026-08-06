import { parseFormData } from '@mjackson/form-data-parser'
import { redirect } from 'react-router'
import {
	ingestUploadedFiles,
	type UploadedArtifact,
} from '#app/utils/activity-file-ingest.server.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { type Route } from './+types/imports.share-target.ts'

/**
 * PWA share-target receiver: the OS share sheet POSTs the shared file(s) here
 * (see `share_target` in `public/site.webmanifest`). It adds no ingest logic —
 * everything funnels through the same `ingestUploadedFiles` batch path as a
 * normal upload, so auto-save, content-hash dedupe, telemetry enrichment, and
 * the Live Imports Stream behave identically. The browser then navigates to the
 * redirect target — home, where the shared activity is already on The Tape
 * (ADR 0049).
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)

	const artifacts: UploadedArtifact[] = []
	await parseFormData(request, async (field) => {
		if (field.fieldName === 'file') {
			artifacts.push({
				fileName: field.name ?? 'shared-file',
				bytes: await field.bytes(),
			})
		}
	})

	if (artifacts.length === 0) {
		// Nothing usable came through the share sheet; the upload page is the
		// best place to recover.
		return redirect('/imports/upload', { status: 303 })
	}

	// Day attribution happens in the Athlete Timezone (#173), matching the
	// upload route. Batch failures/duplicates are absorbed silently — the share
	// sheet offers no UI to report them, and The Tape shows what landed.
	const timezone = await getAthleteTimezone(userId)
	await ingestUploadedFiles(userId, artifacts, { timezone })

	return redirect('/', { status: 303 })
}

// A GET (e.g. someone opening the share-target URL directly) has nothing to
// receive — send them home.
export async function loader() {
	return redirect('/')
}
