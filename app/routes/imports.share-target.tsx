import { parseFormData } from '@mjackson/form-data-parser'
import { redirect } from 'react-router'
import {
	ingestUploadedFiles,
	type BatchImportSummary,
	type UploadedArtifact,
} from '#app/utils/activity-file-ingest.server.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { UPLOAD_LABELS, uploadFailureLabel } from '#app/utils/labels.ts'
import { redirectWithToast, type ToastInput } from '#app/utils/toast.server.ts'
import { type Route } from './+types/imports.share-target.ts'

/**
 * PWA share-target receiver: the OS share sheet POSTs the shared file(s) here
 * (see `share_target` in `public/site.webmanifest`). It adds no ingest logic —
 * everything funnels through the same `ingestUploadedFiles` batch path as a
 * normal upload, so auto-save, content-hash dedupe, telemetry enrichment, and
 * the Live Imports Stream behave identically. The browser then navigates to the
 * redirect target — home, where the shared activity is already on The Tape
 * (ADR 0049) — with a toast that says what came of the share.
 */

const L = UPLOAD_LABELS
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
	// upload route.
	const timezone = await getAthleteTimezone(userId)
	const summary = await ingestUploadedFiles(userId, artifacts, { timezone })

	// The share sheet has no page of its own, so I dag says what came of it in
	// a toast — what landed, what was there already, and what could not be
	// read and why (round-2 audit: a bad file used to vanish without a word).
	return redirectWithToast('/', shareToast(summary), { status: 303 })
}

/** The share's outcome in one toast, in Norwegian (ADR 0081). */
function shareToast(summary: BatchImportSummary): ToastInput {
	const failed = summary.failed.length
	const lines = [
		summary.duplicates > 0 ? L.shareDuplicates(summary.duplicates) : null,
		failed > 0
			? L.shareFailed(
					failed,
					summary.failed
						.map((f) => `${f.fileName} (${uploadFailureLabel(f.reason)})`)
						.join(', '),
				)
			: null,
	].filter(Boolean)
	return {
		title:
			summary.imported > 0 ? L.shareImported(summary.imported) : L.shareNothing,
		description: lines.join(' '),
		type: failed > 0 ? 'error' : summary.imported > 0 ? 'success' : 'message',
	}
}

// A GET (e.g. someone opening the share-target URL directly) has nothing to
// receive — send them home.
export async function loader() {
	return redirect('/')
}
