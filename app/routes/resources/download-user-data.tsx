import { requireUserId } from '#app/utils/auth.server.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { exportUserData } from '#app/utils/user-data-export.server.ts'
import { type Route } from './+types/download-user-data.ts'

/**
 * "Last ned dataene dine": the athlete's whole record as one JSON file
 * (GDPR Art. 15 and 20). What it holds, and what it leaves out, lives in
 * `user-data-export.server.ts`.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const data = await exportUserData({
		userId,
		domain: getDomainUrl(request),
	})
	// Health data: no shared or browser cache may keep a copy.
	return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
