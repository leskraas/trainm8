import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useState } from 'react'
import { Form, Link, useFetcher, useNavigation } from 'react-router'
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
import { Card, CardHeader } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	PROVIDER_DIRECTORY,
	type ProviderDirectoryEntry,
} from '#app/integrations/directory.ts'
import { INTERVALSICU_PROVIDER } from '#app/integrations/intervalsicu/types.ts'
import { isStravaOAuthConfigured } from '#app/integrations/strava/oauth.server.ts'
import { STRAVA_PROVIDER } from '#app/integrations/strava/types.ts'
import {
	disconnectAccountConnection,
	getAccountConnection,
	isBackfillInProgress,
} from '#app/utils/account-connection.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatDateTime } from '#app/utils/format.ts'
import { cn } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { type Route } from './+types/integrations.ts'

export const handle: SEOHandle = { getSitemapEntries: () => null }

export const meta: Route.MetaFunction = () => [
	{ title: 'Integrations | Trainm8' },
]

/**
 * Plain-language hub state for the Strava connection (ADR 0026 #1):
 * connected / importing history (backfilling) / needs re-authorization
 * (revoked). `expired` self-heals via background token refresh and is never
 * surfaced (CONTEXT.md); `error` is shown as needing re-authorization since
 * reconnecting is the only remedy the athlete has.
 */
export type StravaHubStatus =
	| 'disconnected'
	| 'connected'
	| 'backfilling'
	| 'revoked'

/**
 * Plain-language hub state for the Intervals.icu connection. No `backfilling`
 * state yet: the backfill handler is a stub until the next slice lands, and
 * the hub must not fake progress (#203). `error` reads as needing
 * re-authorization for the same reason as Strava; `expired` never happens for
 * key providers (ADR 0026 #4).
 */
export type IntervalsIcuHubStatus = 'disconnected' | 'connected' | 'revoked'

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const connection = await getAccountConnection(userId, STRAVA_PROVIDER)

	let status: StravaHubStatus = 'disconnected'
	if (connection) {
		if (connection.status === 'revoked' || connection.status === 'error') {
			status = 'revoked'
		} else if (isBackfillInProgress(connection)) {
			status = 'backfilling'
		} else {
			status = 'connected'
		}
	}

	const intervalsIcuConnection = await getAccountConnection(
		userId,
		INTERVALSICU_PROVIDER,
	)
	let intervalsIcuStatus: IntervalsIcuHubStatus = 'disconnected'
	if (intervalsIcuConnection) {
		intervalsIcuStatus =
			intervalsIcuConnection.status === 'revoked' ||
			intervalsIcuConnection.status === 'error'
				? 'revoked'
				: 'connected'
	}

	return {
		strava: {
			configured: isStravaOAuthConfigured(),
			status,
			lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
		},
		intervalsicu: {
			status: intervalsIcuStatus,
			lastSyncedAt: intervalsIcuConnection?.lastSyncedAt?.toISOString() ?? null,
		},
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	if (formData.get('intent') === 'disconnect-strava') {
		await disconnectAccountConnection({
			athleteId: userId,
			provider: STRAVA_PROVIDER,
		})
		return redirectWithToast('/settings/integrations', {
			title: 'Disconnected from Strava',
			description:
				'Promoted activities stay in your training history; inbox items were removed.',
			type: 'success',
		})
	}

	if (formData.get('intent') === 'disconnect-intervalsicu') {
		await disconnectAccountConnection({
			athleteId: userId,
			provider: INTERVALSICU_PROVIDER,
		})
		return redirectWithToast('/settings/integrations', {
			title: 'Disconnected from Intervals.icu',
			description:
				'Promoted activities stay in your training history; inbox items were removed.',
			type: 'success',
		})
	}

	return null
}

export default function IntegrationsRoute({
	loaderData,
}: Route.ComponentProps) {
	const { strava, intervalsicu } = loaderData

	const stravaEntry = PROVIDER_DIRECTORY.find((p) => p.id === 'strava')!
	const intervalsIcuEntry = PROVIDER_DIRECTORY.find(
		(p) => p.id === 'intervalsicu',
	)!
	const stravaConnected = strava.configured && strava.status !== 'disconnected'
	const intervalsIcuConnected = intervalsicu.status !== 'disconnected'

	// The directory is display metadata only (ADR 0014/0026): grouping and each
	// card's actions are decided here, per provider, against its own routes.
	const availableEntries = PROVIDER_DIRECTORY.filter(
		(p) =>
			p.availability !== 'coming-soon' &&
			!(p.id === 'strava' && (stravaConnected || !strava.configured)) &&
			!(p.id === 'intervalsicu' && intervalsIcuConnected),
	)
	const comingSoonEntries = PROVIDER_DIRECTORY.filter(
		(p) => p.availability === 'coming-soon',
	)

	return (
		<div className="m-auto mt-16 mb-24 max-w-3xl">
			<div className="container">
				<Link className="text-muted-foreground" to="/">
					<Icon name="arrow-left" size="sm">
						Home
					</Icon>
				</Link>
			</div>
			<main className="bg-muted mx-auto mt-16 px-6 py-8 md:container md:rounded-3xl">
				<h1 className="text-h4">Integrations</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Where your activities come from. Connected sources import
					automatically.
				</p>

				{stravaConnected || intervalsIcuConnected ? (
					<>
						<SectionLabel>Connected</SectionLabel>
						<div className="space-y-3">
							{stravaConnected ? (
								<StravaCard entry={stravaEntry} strava={strava} />
							) : null}
							{intervalsIcuConnected ? (
								<IntervalsIcuCard
									entry={intervalsIcuEntry}
									intervalsicu={intervalsicu}
								/>
							) : null}
						</div>
					</>
				) : null}

				<SectionLabel>Available</SectionLabel>
				<div className="space-y-3">
					{availableEntries.map((entry) =>
						entry.id === 'strava' ? (
							<StravaCard key={entry.id} entry={entry} strava={strava} />
						) : entry.id === 'intervalsicu' ? (
							<IntervalsIcuCard
								key={entry.id}
								entry={entry}
								intervalsicu={intervalsicu}
							/>
						) : (
							<AvailableCard key={entry.id} entry={entry} />
						),
					)}
				</div>

				<SectionLabel>Coming soon</SectionLabel>
				<div className="space-y-3">
					{comingSoonEntries.map((entry) => (
						<ComingSoonCard key={entry.id} entry={entry} />
					))}
				</div>
			</main>
		</div>
	)
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-muted-foreground mt-8 mb-3 text-xs font-semibold tracking-wider uppercase">
			{children}
		</p>
	)
}

function ProviderTile({ entry }: { entry: ProviderDirectoryEntry }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'grid size-9 flex-none place-items-center rounded-md text-sm font-bold',
				entry.monogramClassName,
			)}
		>
			{entry.monogram}
		</span>
	)
}

/**
 * The Strava card, moved unchanged from the Activity Inbox (#202): its
 * actions post to the existing connect / sync routes and this route's own
 * disconnect action — no shared provider interface (ADR 0014).
 */
function StravaCard({
	entry,
	strava,
}: {
	entry: ProviderDirectoryEntry
	strava: Route.ComponentProps['loaderData']['strava']
}) {
	const timeZone = useAthleteTimezone()

	return (
		<Card data-provider="strava">
			<CardHeader className="flex flex-col gap-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<ProviderTile entry={entry} />
						<div className="space-y-0.5">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-semibold">{entry.name}</span>
								{strava.status === 'revoked' ? (
									<Badge variant="destructive">Needs re-authorization</Badge>
								) : strava.status === 'backfilling' ? (
									<Badge variant="default">Importing history</Badge>
								) : strava.status === 'connected' ? (
									<Badge variant="default">Connected</Badge>
								) : null}
							</div>
							<p className="text-muted-foreground text-sm">
								{strava.status === 'revoked' ? (
									'Strava revoked this connection — reconnect to resume automatic imports.'
								) : strava.status === 'backfilling' ? (
									'Importing 42 days of history from Strava… This runs in the background.'
								) : strava.status === 'connected' ? (
									<>
										{strava.lastSyncedAt ? (
											<>
												Last synced{' '}
												<time dateTime={strava.lastSyncedAt}>
													{formatDateTime(
														new Date(strava.lastSyncedAt),
														timeZone,
													)}
												</time>
												{' · '}
											</>
										) : null}
										new activities arrive on their own.
									</>
								) : (
									entry.tagline
								)}
							</p>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{strava.status === 'disconnected' ? (
							<Form method="post" action={entry.connectRoute ?? undefined}>
								<Button type="submit">Connect Strava</Button>
							</Form>
						) : (
							<>
								{strava.status === 'connected' ? <StravaSyncNow /> : null}
								{/* Re-runs OAuth (approval_prompt=force) to (re)grant scopes
								    without disconnecting — the recovery path for a revoked or
								    scope-narrowed authorization. */}
								<Form method="post" action={entry.connectRoute ?? undefined}>
									<Button
										type="submit"
										variant={
											strava.status === 'revoked' ? 'default' : 'outline'
										}
										size="sm"
									>
										Reconnect
									</Button>
								</Form>
								<DisconnectStravaDialog />
							</>
						)}
					</div>
				</div>
			</CardHeader>
		</Card>
	)
}

/**
 * Manual "Sync now" — the quiet safety valve (#136), posting to the unchanged
 * sync route and asking it to land the athlete back on the hub.
 */
function StravaSyncNow() {
	const action = '/integrations/strava/sync?redirectTo=/settings/integrations'
	const navigation = useNavigation()
	const isSyncing =
		navigation.state !== 'idle' &&
		navigation.formAction?.startsWith('/integrations/strava/sync')

	return (
		<Form method="post" action={action}>
			<Button type="submit" variant="ghost" size="sm" disabled={isSyncing}>
				{isSyncing ? 'Syncing…' : 'Sync now'}
			</Button>
		</Form>
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

/**
 * The Intervals.icu card (ADR 0026 #3): a paste-your-API-key connect flow
 * instead of an OAuth redirect. The form posts to the provider's own connect
 * route via a fetcher so a rejected key renders inline on the card — nothing
 * navigates away, and it stays a single column on mobile.
 */
function IntervalsIcuCard({
	entry,
	intervalsicu,
}: {
	entry: ProviderDirectoryEntry
	intervalsicu: Route.ComponentProps['loaderData']['intervalsicu']
}) {
	const timeZone = useAthleteTimezone()
	const [formOpen, setFormOpen] = useState(false)

	return (
		<Card data-provider="intervalsicu">
			<CardHeader className="flex flex-col gap-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<ProviderTile entry={entry} />
						<div className="space-y-0.5">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-semibold">{entry.name}</span>
								{intervalsicu.status === 'revoked' ? (
									<Badge variant="destructive">Needs re-authorization</Badge>
								) : intervalsicu.status === 'connected' ? (
									<Badge variant="default">Connected</Badge>
								) : null}
							</div>
							<p className="text-muted-foreground text-sm">
								{intervalsicu.status === 'revoked' ? (
									'Intervals.icu rejected the stored API key — paste a new one to resume imports.'
								) : intervalsicu.status === 'connected' ? (
									<>
										{intervalsicu.lastSyncedAt ? (
											<>
												Last synced{' '}
												<time dateTime={intervalsicu.lastSyncedAt}>
													{formatDateTime(
														new Date(intervalsicu.lastSyncedAt),
														timeZone,
													)}
												</time>
												{' · '}
											</>
										) : null}
										activity import starts with the history import, landing in
										the next update.
									</>
								) : (
									entry.tagline
								)}
							</p>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{intervalsicu.status === 'disconnected' ? (
							!formOpen ? (
								<Button type="button" onClick={() => setFormOpen(true)}>
									Connect Intervals.icu
								</Button>
							) : null
						) : intervalsicu.status === 'revoked' ? (
							<>
								{!formOpen ? (
									<Button type="button" onClick={() => setFormOpen(true)}>
										Reconnect
									</Button>
								) : null}
								<DisconnectIntervalsIcuDialog />
							</>
						) : (
							<DisconnectIntervalsIcuDialog />
						)}
					</div>
				</div>
				{formOpen && intervalsicu.status !== 'connected' ? (
					<IntervalsIcuKeyForm
						connectRoute={entry.connectRoute!}
						onCancel={() => setFormOpen(false)}
					/>
				) : null}
			</CardHeader>
		</Card>
	)
}

/**
 * The paste-a-key form: short in-context instructions, one field, one submit.
 * A rejected key comes back as `{ error }` from the connect action and renders
 * inline; a valid key redirects back to the hub with a success toast.
 */
function IntervalsIcuKeyForm({
	connectRoute,
	onCancel,
}: {
	connectRoute: string
	onCancel: () => void
}) {
	const fetcher = useFetcher<{ error: string }>()
	const error = fetcher.data?.error
	const isSubmitting = fetcher.state !== 'idle'

	return (
		<fetcher.Form method="post" action={connectRoute} className="space-y-2">
			<p className="text-muted-foreground text-sm">
				Copy your personal API key from Intervals.icu → Settings → Developer
				Settings, then paste it here. Generating a new key there invalidates old
				ones.
			</p>
			<div className="space-y-1">
				<Label htmlFor="intervalsicu-api-key">API key</Label>
				<Input
					id="intervalsicu-api-key"
					name="apiKey"
					type="password"
					autoComplete="off"
					required
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? 'intervalsicu-api-key-error' : undefined}
				/>
				{error ? (
					<p
						id="intervalsicu-api-key-error"
						className="text-destructive text-sm"
					>
						{error}
					</p>
				) : null}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? 'Connecting…' : 'Connect'}
				</Button>
				<Button type="button" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</fetcher.Form>
	)
}

function DisconnectIntervalsIcuDialog() {
	const navigation = useNavigation()
	const isDisconnecting =
		navigation.state !== 'idle' &&
		navigation.formData?.get('intent') === 'disconnect-intervalsicu'

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
					<AlertDialogTitle>Disconnect Intervals.icu?</AlertDialogTitle>
					<AlertDialogDescription>
						Your Intervals.icu activities that have become part of your training
						history will stay. Items still waiting in your import inbox will be
						removed. You can reconnect Intervals.icu at any time.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Form method="post">
					<input type="hidden" name="intent" value="disconnect-intervalsicu" />
					<AlertDialogFooter>
						<AlertDialogCancel type="button">Keep connected</AlertDialogCancel>
						<AlertDialogAction
							type="submit"
							variant="destructive"
							disabled={isDisconnecting}
						>
							Disconnect Intervals.icu
						</AlertDialogAction>
					</AlertDialogFooter>
				</Form>
			</AlertDialogPopup>
		</AlertDialog>
	)
}

function AvailableCard({ entry }: { entry: ProviderDirectoryEntry }) {
	return (
		<Card data-provider={entry.id}>
			<CardHeader className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<ProviderTile entry={entry} />
					<div className="space-y-0.5">
						<span className="font-semibold">{entry.name}</span>
						<p className="text-muted-foreground text-sm">{entry.tagline}</p>
					</div>
				</div>
				{entry.id === 'file-upload' ? (
					<Link
						to={entry.connectRoute!}
						className={buttonVariants({ variant: 'outline', size: 'sm' })}
					>
						Upload activity
					</Link>
				) : entry.connectRoute == null ? (
					// Listed honestly: the connect flow hasn't landed yet, so the
					// affordance is disabled instead of pretending to work.
					<div className="flex flex-col items-end gap-1">
						<Button type="button" size="sm" disabled>
							Connect
						</Button>
						<span className="text-muted-foreground text-xs">
							Connect flow coming soon
						</span>
					</div>
				) : null}
			</CardHeader>
		</Card>
	)
}

function ComingSoonCard({ entry }: { entry: ProviderDirectoryEntry }) {
	return (
		<Card data-provider={entry.id} className="bg-muted/50">
			<CardHeader className="flex items-start gap-3">
				<span className="opacity-60 grayscale-75">
					<ProviderTile entry={entry} />
				</span>
				<div className="space-y-0.5">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-semibold">{entry.name}</span>
						<Badge variant="outline">Coming soon</Badge>
					</div>
					<p className="text-muted-foreground text-sm">{entry.tagline}</p>
				</div>
			</CardHeader>
		</Card>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
