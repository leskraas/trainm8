import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useState } from 'react'
import { Form, Link, useFetcher, useNavigation } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Alert, AlertDescription } from '#app/components/ui/alert.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Card, CardHeader } from '#app/components/ui/card.tsx'
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
	connectionHubStatus,
	disconnectAccountConnection,
	getAccountConnection,
} from '#app/utils/account-connection.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatNbDayDateTime } from '#app/utils/format.ts'
import { APP_TAB_LABELS, INTEGRATIONS_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { type Route } from './+types/integrations.ts'

export const handle: SEOHandle = { getSitemapEntries: () => null }

const L = INTEGRATIONS_LABELS

export const meta: Route.MetaFunction = () => [
	{ title: `${L.title} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const connection = await getAccountConnection(userId, STRAVA_PROVIDER)

	const status = connectionHubStatus(connection)

	const intervalsIcuConnection = await getAccountConnection(
		userId,
		INTERVALSICU_PROVIDER,
	)
	const intervalsIcuStatus = connectionHubStatus(intervalsIcuConnection)

	return {
		strava: {
			configured: isStravaOAuthConfigured(),
			status,
			// Strava's own sync stamps wall-clock time into `lastSyncedAt`; a
			// check recorded since round 2 wins.
			lastCheckedAt:
				(
					connection?.lastCheckedAt ?? connection?.lastSyncedAt
				)?.toISOString() ?? null,
		},
		intervalsicu: {
			status: intervalsIcuStatus,
			// When the app last asked intervals.icu (Sync now, the daily sweep,
			// the backfill) — not `lastSyncedAt`, the newest activity's start
			// time, which after a sync that found nothing is days old.
			lastCheckedAt:
				intervalsIcuConnection?.lastCheckedAt?.toISOString() ?? null,
		},
		// Two or more active sources (ADR 0096 §8): the same workout arriving
		// from each is kept once (an Import Alias), but the match is strong, not
		// certain, so the hub says a duplicate can still slip through. Strava and
		// intervals.icu are the only connections today.
		dualSourceActive:
			connection?.status === 'active' &&
			intervalsIcuConnection?.status === 'active',
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
			title: L.disconnected(L.strava.name),
			description: L.disconnectedBody,
			type: 'success',
		})
	}

	if (formData.get('intent') === 'disconnect-intervalsicu') {
		await disconnectAccountConnection({
			athleteId: userId,
			provider: INTERVALSICU_PROVIDER,
		})
		return redirectWithToast('/settings/integrations', {
			title: L.disconnected(L.intervalsicu.name),
			description: L.disconnectedBody,
			type: 'success',
		})
	}

	return null
}

export default function IntegrationsRoute({
	loaderData,
}: Route.ComponentProps) {
	const { strava, intervalsicu, dualSourceActive } = loaderData

	const stravaEntry = PROVIDER_DIRECTORY.find((p) => p.id === 'strava')!
	const intervalsIcuEntry = PROVIDER_DIRECTORY.find(
		(p) => p.id === 'intervalsicu',
	)!
	// Strava is never offered (#505: intervals.icu only). A connection made
	// before keeps its card, so it can still be synced or disconnected.
	const stravaConnected = strava.configured && strava.status !== 'disconnected'
	const intervalsIcuConnected = intervalsicu.status !== 'disconnected'

	// The directory is display metadata only (ADR 0014/0026): grouping and each
	// card's actions are decided here, per provider, against its own routes.
	// intervals.icu first: it is the one source to connect (#505).
	const availableEntries = PROVIDER_DIRECTORY.filter(
		(p) =>
			p.availability !== 'coming-soon' &&
			p.id !== 'strava' &&
			!(p.id === 'intervalsicu' && intervalsIcuConnected),
	).sort(
		(a, b) => Number(b.id === 'intervalsicu') - Number(a.id === 'intervalsicu'),
	)
	const comingSoonEntries = PROVIDER_DIRECTORY.filter(
		(p) => p.availability === 'coming-soon',
	)

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={L.title}
				back={{ to: '/me', label: APP_TAB_LABELS.me }}
			/>
			{/* Content sits on the page background — no full-page card wrap (§1.6);
			    the provider list items keep their cards. */}
			<p className="text-body text-muted-foreground mt-4">{L.intro}</p>

			{stravaConnected || intervalsIcuConnected ? (
				<section aria-labelledby="integrations-connected">
					<SectionLabel id="integrations-connected">{L.connected}</SectionLabel>
					{dualSourceActive ? <DualSourceNotice /> : null}
					<div className="space-y-3">
						{intervalsIcuConnected ? (
							<IntervalsIcuCard
								entry={intervalsIcuEntry}
								intervalsicu={intervalsicu}
							/>
						) : null}
						{stravaConnected ? (
							<StravaCard entry={stravaEntry} strava={strava} />
						) : null}
					</div>
				</section>
			) : null}

			<section aria-labelledby="integrations-available">
				<SectionLabel id="integrations-available">{L.available}</SectionLabel>
				<div className="space-y-3">
					{availableEntries.map((entry) =>
						entry.id === 'intervalsicu' ? (
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
			</section>

			<section aria-labelledby="integrations-coming">
				<SectionLabel id="integrations-coming">{L.comingSoon}</SectionLabel>
				<div className="space-y-3">
					{comingSoonEntries.map((entry) => (
						<ComingSoonCard key={entry.id} entry={entry} />
					))}
				</div>
			</section>
		</main>
	)
}

/**
 * Multi-source honesty (#205, ADR 0096 §8): rendered when two or more sources
 * are `active`. A workout both deliver is kept once; one the dedupe misses can
 * still arrive twice, and the athlete deletes the copy.
 */
function DualSourceNotice() {
	return (
		<Alert role="status" className="mb-3">
			<AlertDescription className="text-footnote">
				{L.dualSource}
			</AlertDescription>
		</Alert>
	)
}

function SectionLabel({
	id,
	children,
}: {
	id: string
	children: React.ReactNode
}) {
	return (
		<h2
			id={id}
			className="text-overline text-muted-foreground mt-8 mb-3 uppercase"
		>
			{children}
		</h2>
	)
}

function ProviderTile({ entry }: { entry: ProviderDirectoryEntry }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				'grid size-10 flex-none place-items-center rounded-2xl text-sm font-bold',
				entry.monogramClassName,
			)}
		>
			{entry.monogram}
		</span>
	)
}

/** The card's head: tile, name, its state as a badge, and one line under. */
function ProviderHead({
	entry,
	badge,
	children,
}: {
	entry: ProviderDirectoryEntry
	badge?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<div className="flex min-w-0 items-start gap-3">
			<ProviderTile entry={entry} />
			<div className="min-w-0 space-y-0.5">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-callout font-semibold">{entry.name}</span>
					{badge}
				</div>
				<div className="text-footnote text-muted-foreground">{children}</div>
			</div>
		</div>
	)
}

/** `Sist synkronisert lør 23. mai kl. 17.00`, or nothing before a first check. */
function LastChecked({ at }: { at: string | null }) {
	const timeZone = useAthleteTimezone()
	if (!at) return null
	return (
		<span className="block tabular-nums" data-last-checked>
			{L.lastChecked}{' '}
			<time dateTime={at}>{formatNbDayDateTime(new Date(at), timeZone)}</time>
		</span>
	)
}

function StatusBadge({
	status,
}: {
	status: 'disconnected' | 'connected' | 'backfilling' | 'revoked'
}) {
	if (status === 'revoked') {
		return <Badge variant="destructive">{L.badge.revoked}</Badge>
	}
	if (status === 'backfilling') {
		return <Badge variant="secondary">{L.badge.backfilling}</Badge>
	}
	if (status === 'connected') {
		return <Badge variant="default">{L.badge.connected}</Badge>
	}
	return null
}

/**
 * The Strava card, for a connection made before #505 took Strava out of
 * scope: sync, reconnect (re-runs OAuth to regrant scopes) and disconnect.
 * Its actions post to the provider's own routes (ADR 0014).
 */
function StravaCard({
	entry,
	strava,
}: {
	entry: ProviderDirectoryEntry
	strava: Route.ComponentProps['loaderData']['strava']
}) {
	return (
		<Card data-provider="strava">
			<CardHeader className="flex flex-col gap-4">
				<ProviderHead
					entry={entry}
					badge={<StatusBadge status={strava.status} />}
				>
					{strava.status === 'revoked' ? (
						L.strava.revoked
					) : strava.status === 'backfilling' ? (
						L.strava.backfilling
					) : (
						<>
							<LastChecked at={strava.lastCheckedAt} />
							{L.strava.connected}
						</>
					)}
				</ProviderHead>
				<div className="flex flex-wrap items-center gap-2">
					{strava.status === 'connected' ? (
						<SyncNow action="/integrations/strava/sync" />
					) : null}
					<Form method="post" action={entry.connectRoute ?? undefined}>
						<Button
							type="submit"
							variant={strava.status === 'revoked' ? 'default' : 'outline'}
						>
							{L.reconnect}
						</Button>
					</Form>
					<DisconnectDialog intent="disconnect-strava" name={L.strava.name} />
				</div>
			</CardHeader>
		</Card>
	)
}

/**
 * Manual "Synkroniser nå" — the quiet safety valve (#136, #205), posting to
 * the provider's own sync route and asking it to land the athlete back here.
 */
function SyncNow({ action }: { action: string }) {
	const navigation = useNavigation()
	const isSyncing =
		navigation.state !== 'idle' &&
		navigation.formAction?.startsWith(action) === true

	return (
		<Form method="post" action={`${action}?redirectTo=/settings/integrations`}>
			<Button type="submit" variant="secondary" disabled={isSyncing}>
				{isSyncing ? L.syncing : L.syncNow}
			</Button>
		</Form>
	)
}

function DisconnectDialog({
	intent,
	name,
}: {
	intent: 'disconnect-strava' | 'disconnect-intervalsicu'
	name: string
}) {
	const navigation = useNavigation()
	const isDisconnecting =
		navigation.state !== 'idle' && navigation.formData?.get('intent') === intent

	return (
		<AlertDialog>
			<AlertDialogTrigger
				render={<Button variant="ghost">{L.disconnect}</Button>}
			/>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{L.disconnectTitle(name)}</AlertDialogTitle>
					<AlertDialogDescription>
						{L.disconnectBody(name)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Form method="post">
					<input type="hidden" name="intent" value={intent} />
					<AlertDialogFooter>
						<AlertDialogCancel type="button">
							{L.keepConnected}
						</AlertDialogCancel>
						<AlertDialogAction
							type="submit"
							variant="destructive"
							disabled={isDisconnecting}
						>
							{L.disconnectConfirm(name)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</Form>
			</AlertDialogContent>
		</AlertDialog>
	)
}

/**
 * The intervals.icu card (ADR 0026 #3): a paste-your-API-key connect flow
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
	const [formOpen, setFormOpen] = useState(false)
	const I = L.intervalsicu

	return (
		<Card data-provider="intervalsicu">
			<CardHeader className="flex flex-col gap-4">
				<ProviderHead
					entry={entry}
					badge={<StatusBadge status={intervalsicu.status} />}
				>
					{intervalsicu.status === 'revoked' ? (
						I.revoked
					) : intervalsicu.status === 'backfilling' ? (
						I.backfilling
					) : intervalsicu.status === 'connected' ? (
						<>
							<LastChecked at={intervalsicu.lastCheckedAt} />
							{I.daily}
						</>
					) : (
						entry.tagline
					)}
				</ProviderHead>
				{formOpen && intervalsicu.status !== 'connected' ? (
					<IntervalsIcuKeyForm
						connectRoute={entry.connectRoute!}
						onCancel={() => setFormOpen(false)}
					/>
				) : (
					<div className="flex flex-wrap items-center gap-2">
						{intervalsicu.status === 'disconnected' ? (
							<Button type="button" onClick={() => setFormOpen(true)}>
								{I.connect}
							</Button>
						) : intervalsicu.status === 'revoked' ? (
							<>
								<Button type="button" onClick={() => setFormOpen(true)}>
									{L.reconnect}
								</Button>
								<DisconnectDialog
									intent="disconnect-intervalsicu"
									name={I.name}
								/>
							</>
						) : (
							<>
								{intervalsicu.status === 'connected' ? (
									<SyncNow action="/integrations/intervalsicu/sync" />
								) : null}
								<DisconnectDialog
									intent="disconnect-intervalsicu"
									name={I.name}
								/>
							</>
						)}
					</div>
				)}
			</CardHeader>
		</Card>
	)
}

/**
 * The paste-a-key form: short in-context instructions, one field, one submit.
 * A rejected key comes back as `{ error }` from the connect action and renders
 * inline at the field; a valid key redirects back here with a toast.
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
	const I = L.intervalsicu

	return (
		<fetcher.Form method="post" action={connectRoute} className="space-y-3">
			<p className="text-footnote text-muted-foreground">{I.keyHelp}</p>
			<div className="space-y-1.5">
				<Label htmlFor="intervalsicu-api-key">{I.keyLabel}</Label>
				<Input
					id="intervalsicu-api-key"
					name="apiKey"
					type="password"
					autoComplete="off"
					autoCapitalize="none"
					autoCorrect="off"
					spellCheck={false}
					enterKeyHint="go"
					required
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? 'intervalsicu-api-key-error' : undefined}
				/>
				{error ? (
					<p
						id="intervalsicu-api-key-error"
						className="text-footnote text-foreground-destructive"
					>
						{error}
					</p>
				) : null}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? I.submitting : I.submit}
				</Button>
				<Button type="button" variant="ghost" onClick={onCancel}>
					{L.cancel}
				</Button>
			</div>
		</fetcher.Form>
	)
}

function AvailableCard({ entry }: { entry: ProviderDirectoryEntry }) {
	return (
		<Card data-provider={entry.id}>
			<CardHeader className="flex flex-col gap-4">
				<ProviderHead entry={entry}>{entry.tagline}</ProviderHead>
				{entry.id === 'file-upload' ? (
					<Link
						to={entry.connectRoute!}
						className={cn(buttonVariants({ variant: 'outline' }), 'self-start')}
					>
						{L.upload}
					</Link>
				) : entry.connectRoute == null ? (
					// Listed honestly: the connect flow hasn't landed yet.
					<p className="text-footnote text-muted-foreground">{L.connectSoon}</p>
				) : null}
			</CardHeader>
		</Card>
	)
}

function ComingSoonCard({ entry }: { entry: ProviderDirectoryEntry }) {
	return (
		<Card data-provider={entry.id} className="bg-muted/50 shadow-none">
			<CardHeader>
				<ProviderHead
					entry={entry}
					badge={<Badge variant="outline">{L.badge.comingSoon}</Badge>}
				>
					{entry.tagline}
				</ProviderHead>
			</CardHeader>
		</Card>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
