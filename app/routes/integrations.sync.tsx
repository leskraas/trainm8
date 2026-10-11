import { redirect } from 'react-router'
import { syncIntervalsIcuActivities } from '#app/integrations/intervalsicu/sync.server.ts'
import { INTERVALSICU_PROVIDER } from '#app/integrations/intervalsicu/types.ts'
import { syncStravaActivities } from '#app/integrations/strava/sync.server.ts'
import { STRAVA_PROVIDER } from '#app/integrations/strava/types.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	INTEGRATION_TOAST_LABELS,
	INTEGRATIONS_LABELS,
} from '#app/utils/labels.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/integrations.sync.ts'

/**
 * The Integration Hub's "Sync now" (#205, PRD O1): one action syncs ALL active
 * Account Connections, not just Strava. Each provider's own sync function does
 * the work — this route only fans out over whichever connections are active
 * and folds their results into one honest toast. A provider that fails (e.g.
 * revoked mid-sync) is reported alongside the ones that succeeded.
 */

const T = INTEGRATION_TOAST_LABELS

const PROVIDER_SYNCS: Array<{
	provider: string
	label: string
	run: (athleteId: string) => Promise<{ ok: boolean; created?: number }>
}> = [
	{
		provider: STRAVA_PROVIDER,
		label: INTEGRATIONS_LABELS.strava.name,
		run: syncStravaActivities,
	},
	{
		provider: INTERVALSICU_PROVIDER,
		label: INTEGRATIONS_LABELS.intervalsicu.name,
		run: syncIntervalsIcuActivities,
	},
]

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)

	const active = await prisma.accountConnection.findMany({
		where: { athleteId: userId, status: 'active' },
		select: { provider: true },
	})
	const activeProviders = new Set(active.map((c) => c.provider))
	const syncs = PROVIDER_SYNCS.filter((s) => activeProviders.has(s.provider))

	if (syncs.length === 0) {
		return redirectWithToast('/settings/integrations', {
			title: T.syncFailed,
			description: T.connectFirst,
			type: 'error',
		})
	}

	let created = 0
	const failed: string[] = []
	for (const sync of syncs) {
		const result = await sync.run(userId)
		if (result.ok) {
			created += result.created ?? 0
		} else {
			failed.push(sync.label)
		}
	}

	if (failed.length === syncs.length) {
		return redirectWithToast('/settings/integrations', {
			title: T.syncFailed,
			description: T.couldNotSync(T.and(failed)),
			type: 'error',
		})
	}

	// Auto-save (ADR 0049) already filed each one as a Workout Session, so the
	// toast says where they went rather than pointing at a queue to work through.
	const importedLine = created === 0 ? T.nothingNew : T.saved(created)
	return redirectWithToast('/settings/integrations', {
		title: T.synced,
		description:
			failed.length > 0
				? `${importedLine} ${T.couldNotSync(T.and(failed))}`
				: importedLine,
		type: failed.length > 0 ? 'error' : 'success',
	})
}

/** A bare GET just bounces back to the Integration Hub. */
export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return redirect('/settings/integrations')
}
