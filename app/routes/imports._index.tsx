import { Form, Link, useNavigation } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { INTERVALSICU_PROVIDER } from '#app/integrations/intervalsicu/types.ts'
import { isStravaOAuthConfigured } from '#app/integrations/strava/oauth.server.ts'
import { STRAVA_PROVIDER } from '#app/integrations/strava/types.ts'
import {
	getAccountConnection,
	isBackfillInProgress,
} from '#app/utils/account-connection.server.ts'
import {
	getInboxImports,
	unlinkImport,
	type InboxImport,
} from '#app/utils/activity-import.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	formatDayDate,
	formatDuration,
	formatDistance,
	formatTime,
} from '#app/utils/format.ts'
import { useRevalidateOnImportEvent } from '#app/utils/imports-events.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { type Route } from './+types/imports._index.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Activity Inbox | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const [imports, stravaConnection, intervalsIcuConnection] = await Promise.all(
		[
			getInboxImports(userId),
			getAccountConnection(userId, STRAVA_PROVIDER),
			getAccountConnection(userId, INTERVALSICU_PROVIDER),
		],
	)
	return {
		imports,
		strava: {
			configured: isStravaOAuthConfigured(),
			connected: stravaConnection?.status === 'active',
			backfillInProgress: isBackfillInProgress(stravaConnection),
		},
		intervalsicu: {
			connected: intervalsIcuConnection?.status === 'active',
			backfillInProgress: isBackfillInProgress(intervalsIcuConnection),
		},
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	const importId = formData.get('importId')

	if (intent === 'unlink' && typeof importId === 'string') {
		await unlinkImport(userId, importId)
		return null
	}

	return null
}

export default function ImportsIndexRoute({
	loaderData,
}: Route.ComponentProps) {
	const { imports, strava, intervalsicu } = loaderData

	// Refresh the inbox live as new imports land (manual sync, backfill, or a
	// future webhook) without a page reload (#75).
	useRevalidateOnImportEvent()

	return (
		<main className="container py-10">
			<div className="mb-6">
				<Link
					to="/"
					className="text-muted-foreground hover:text-foreground text-sm"
				>
					<Icon name="arrow-left">Home</Icon>
				</Link>
			</div>
			<div className="mb-4 flex items-center justify-between gap-3">
				<div>
					<h1 className="text-h3">Activity Inbox</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						Imported activities waiting to be linked to a planned session.
					</p>
				</div>
				<Link
					to="/imports/upload"
					className={buttonVariants({ variant: 'default' })}
				>
					Upload activity
				</Link>
			</div>

			<SourceSummaryLine strava={strava} intervalsicu={intervalsicu} />

			{imports.length === 0 ? (
				<Card>
					<CardContent className="py-12 text-center">
						<p className="text-muted-foreground">
							No activities in the inbox.{' '}
							<Link to="/imports/upload" className="underline">
								Upload a GPX or FIT file
							</Link>{' '}
							to get started.
						</p>
					</CardContent>
				</Card>
			) : (
				<ul className="space-y-3">
					{imports.map((item) => (
						<ImportRow key={item.id} item={item} />
					))}
				</ul>
			)}
		</main>
	)
}

/**
 * The slim source-summary line (ADR 0026): connection management moved to the
 * Integration Hub, so the inbox only states where activities come from, links
 * to the hub, and keeps the quiet "Sync now" safety valve (#136).
 */
function SourceSummaryLine({
	strava,
	intervalsicu,
}: {
	strava: Route.ComponentProps['loaderData']['strava']
	intervalsicu: Route.ComponentProps['loaderData']['intervalsicu']
}) {
	const showStrava = strava.configured
	const connectedSources = [
		...(showStrava && strava.connected ? ['Strava'] : []),
		...(intervalsicu.connected ? ['Intervals.icu'] : []),
	]
	const backfilling =
		strava.backfillInProgress || intervalsicu.backfillInProgress
	return (
		<div className="text-muted-foreground mb-6 flex min-h-8 flex-wrap items-center justify-between gap-2 text-sm">
			<p>
				{connectedSources.length > 0
					? backfilling
						? `${connectedSources.join(' and ')} connected — importing history in the background…`
						: `${connectedSources.join(' and ')} connected — new activities import automatically.`
					: showStrava
						? 'Strava is not connected.'
						: 'Activities arrive from file uploads.'}{' '}
				<Link to="/settings/integrations" className="underline">
					Manage sources
				</Link>
			</p>
			{connectedSources.length > 0 && !backfilling ? <SyncNow /> : null}
		</div>
	)
}

/**
 * Manual "Sync now" — the demoted, secondary affordance (#136). It POSTs to
 * `/integrations/sync`, which syncs ALL active connections in one action
 * (#205, PRD O1) — not just Strava.
 */
function SyncNow() {
	const navigation = useNavigation()
	const isSyncing =
		navigation.state !== 'idle' &&
		navigation.formAction === '/integrations/sync'

	return (
		<Form method="post" action="/integrations/sync">
			<Button type="submit" variant="ghost" size="sm" disabled={isSyncing}>
				{isSyncing ? 'Syncing…' : 'Sync now'}
			</Button>
		</Form>
	)
}

function ImportRow({ item }: { item: InboxImport }) {
	const timeZone = useAthleteTimezone()
	const startedAt = new Date(item.startedAt)
	const disciplineLabel = getDisciplineLabel(item.discipline)

	return (
		<li>
			<Card>
				<CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
					<div className="space-y-0.5">
						<CardTitle className="text-base">
							{disciplineLabel} —{' '}
							<time dateTime={startedAt.toISOString()}>
								{formatDayDate(startedAt, timeZone)}
							</time>
						</CardTitle>
						<CardDescription>
							{formatTime(startedAt, timeZone)}
							{' · '}
							{formatDuration(item.durationSec)}
							{item.distanceM != null
								? ` · ${formatDistance(item.distanceM)}`
								: null}
						</CardDescription>
					</div>
					<Badge variant="secondary" className="capitalize">
						{item.externalProvider}
					</Badge>
				</CardHeader>
				<CardContent>
					<div className="flex gap-2">
						<Link
							to={`/imports/${item.id}/promote`}
							className={buttonVariants({ variant: 'default', size: 'sm' })}
						>
							Promote
						</Link>
					</div>
				</CardContent>
			</Card>
		</li>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
