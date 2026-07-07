import { data, redirect } from 'react-router'
import { INTERVALSICU_BACKFILL_JOB_KIND } from '#app/integrations/intervalsicu/backfill.server.ts'
import { IntervalsIcuKeyRejectedError } from '#app/integrations/intervalsicu/client.server.ts'
import { connectIntervalsIcuAccount } from '#app/integrations/intervalsicu/connect.server.ts'
import { INTERVALSICU_PROVIDER } from '#app/integrations/intervalsicu/types.ts'
import { connectAccountConnection } from '#app/utils/account-connection.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { enqueueJob } from '#app/utils/jobs/queue.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/integrations.intervalsicu.connect.ts'

/**
 * Intervals.icu connect: the athlete pastes their personal API key (from
 * Intervals.icu → Settings → Developer Settings), the server validates it
 * against the athlete-self endpoint, and the Account Connection is stored
 * with the key as its credential (ADR 0026 #3). A bad key fails the form
 * inline; nothing is stored. Errors are returned as `{ error }` for the hub
 * card's fetcher form to render next to the key field.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const apiKey = String(formData.get('apiKey') ?? '').trim()

	if (!apiKey) {
		return data(
			{ error: 'Paste your Intervals.icu API key to connect.' },
			{ status: 400 },
		)
	}

	let connection
	try {
		connection = await connectIntervalsIcuAccount(apiKey)
	} catch (err) {
		if (err instanceof IntervalsIcuKeyRejectedError) {
			return data(
				{
					error:
						'Intervals.icu rejected this API key. Note that generating a new key invalidates old ones — copy the current key from Intervals.icu → Settings → Developer Settings.',
				},
				{ status: 400 },
			)
		}
		return data(
			{
				error:
					'Could not reach Intervals.icu to verify the key. Please try again in a moment.',
			},
			{ status: 502 },
		)
	}

	await connectAccountConnection({
		athleteId: userId,
		provider: INTERVALSICU_PROVIDER,
		...connection,
	})

	// Kick off the count-based Backfill Window out of band (ADR 0013 #151).
	// The handler is a stub until the backfill slice lands; enqueueing here
	// keeps connect semantics final.
	await enqueueJob({
		kind: INTERVALSICU_BACKFILL_JOB_KIND,
		payload: { athleteId: userId },
	})

	return redirectWithToast('/settings/integrations', {
		title: 'Connected to Intervals.icu',
		description: 'Your Intervals.icu account is now linked to Trainm8.',
		type: 'success',
	})
}

/** A bare GET just bounces back to the Integration Hub. */
export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return redirect('/settings/integrations')
}
