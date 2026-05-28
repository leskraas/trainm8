import { Form, Link, useNavigation } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogPopup,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { isStravaOAuthConfigured } from '#app/integrations/strava/oauth.server.ts'
import { STRAVA_PROVIDER } from '#app/integrations/strava/types.ts'
import {
	disconnectAccountConnection,
	getAccountConnection,
} from '#app/utils/account-connection.server.ts'
import {
	getInboxImports,
	unlinkImport,
	type InboxImport,
} from '#app/utils/activity-import.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import {
	formatDuration,
	formatDistance,
} from '#app/utils/workout-formatting.ts'
import { type Route } from './+types/imports._index.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Activity Inbox | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const [imports, stravaConnection] = await Promise.all([
		getInboxImports(userId),
		getAccountConnection(userId, STRAVA_PROVIDER),
	])
	return {
		imports,
		strava: {
			configured: isStravaOAuthConfigured(),
			connected: stravaConnection?.status === 'active',
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

	if (intent === 'disconnect-strava') {
		await disconnectAccountConnection({
			athleteId: userId,
			provider: STRAVA_PROVIDER,
		})
		return redirectWithToast('/imports', {
			title: 'Disconnected from Strava',
			description:
				'Promoted activities stay in your training history; inbox items were removed.',
			type: 'success',
		})
	}

	return null
}

export default function ImportsIndexRoute({
	loaderData,
}: Route.ComponentProps) {
	const { imports, strava } = loaderData

	return (
		<main className="container py-10">
			<div className="mb-6 flex items-center justify-between gap-3">
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

			{strava.configured ? (
				<Card className="mb-6">
					<CardHeader className="flex flex-row items-center justify-between gap-3">
						<div className="space-y-0.5">
							<CardTitle className="text-base">Strava</CardTitle>
							<CardDescription>
								{strava.connected
									? 'Connected to Strava'
									: 'Connect your Strava account to import activities automatically.'}
							</CardDescription>
						</div>
						{strava.connected ? (
							<div className="flex items-center gap-2">
								<Badge variant="default">Connected</Badge>
								<Form method="post" action="/integrations/strava/sync">
									<Button type="submit" variant="outline" size="sm">
										Sync now
									</Button>
								</Form>
								<DisconnectStravaDialog />
							</div>
						) : (
							<Form method="post" action="/integrations/strava/connect">
								<Button type="submit">Connect Strava</Button>
							</Form>
						)}
					</CardHeader>
				</Card>
			) : null}

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

function DisconnectStravaDialog() {
	const navigation = useNavigation()
	const isDisconnecting =
		navigation.state !== 'idle' &&
		navigation.formData?.get('intent') === 'disconnect-strava'

	return (
		<AlertDialog>
			<AlertDialogTrigger
				render={
					<Button variant="outline" size="sm">
						Disconnect
					</Button>
				}
			/>
			<AlertDialogPopup>
				<AlertDialogHeader>
					<AlertDialogTitle>Disconnect Strava?</AlertDialogTitle>
					<AlertDialogDescription>
						Your Strava activities that have become part of your training
						history will stay. Items still waiting in your import inbox will be
						removed. You can reconnect Strava at any time.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Form method="post">
					<input type="hidden" name="intent" value="disconnect-strava" />
					<AlertDialogFooter>
						<AlertDialogCancel type="button">Keep connected</AlertDialogCancel>
						<AlertDialogAction
							type="submit"
							variant="destructive"
							disabled={isDisconnecting}
						>
							Disconnect Strava
						</AlertDialogAction>
					</AlertDialogFooter>
				</Form>
			</AlertDialogPopup>
		</AlertDialog>
	)
}

function ImportRow({ item }: { item: InboxImport }) {
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
								{startedAt.toLocaleDateString(undefined, {
									weekday: 'short',
									month: 'short',
									day: 'numeric',
								})}
							</time>
						</CardTitle>
						<CardDescription>
							{startedAt.toLocaleTimeString(undefined, {
								hour: 'numeric',
								minute: '2-digit',
							})}
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
