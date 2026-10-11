import { data, redirect } from 'react-router'
import {
	linkIntervalsIcu,
	type LinkIntervalsIcuRefusal,
} from '#app/integrations/intervalsicu/link.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	INTEGRATION_TOAST_LABELS,
	INTEGRATIONS_LABELS,
} from '#app/utils/labels.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/integrations.intervalsicu.connect.ts'

const T = INTEGRATION_TOAST_LABELS

/** Each refusal as the hub card says it, with the status it is answered with. */
const REFUSALS: Record<
	LinkIntervalsIcuRefusal,
	{ error: string; status: number }
> = {
	'empty-key': { error: T.emptyKey, status: 400 },
	'key-rejected': { error: T.keyRejected, status: 400 },
	unreachable: { error: T.unreachable, status: 502 },
}

/**
 * Intervals.icu connect: the athlete pastes their personal API key (from
 * Intervals.icu → Settings → Developer Settings), the server validates it
 * against the athlete-self endpoint, and the Account Connection is stored
 * with the key as its credential (ADR 0026 #3). A bad key fails the form
 * inline; nothing is stored. Errors are returned as `{ error }` for the hub
 * card's fetcher form to render next to the key field. The link itself, and
 * the Backfill Window it enqueues, are `linkIntervalsIcu`'s.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const linked = await linkIntervalsIcu(
		userId,
		String(formData.get('apiKey') ?? ''),
	)

	if (!linked.ok) {
		const refusal = REFUSALS[linked.reason]
		return data({ error: refusal.error }, { status: refusal.status })
	}

	return redirectWithToast('/settings/integrations', {
		title: T.connected(INTEGRATIONS_LABELS.intervalsicu.name),
		description: T.connectedBody(INTEGRATIONS_LABELS.intervalsicu.name),
		type: 'success',
	})
}

/** A bare GET just bounces back to the Integration Hub. */
export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return redirect('/settings/integrations')
}
