/**
 * **The Catalogue** — and, since #452, the first screen in this app that reads
 * rows it does not own (ADR 0052).
 *
 * Three tiers land on one list, and the whole design question is how a reader
 * tells them apart without reading carefully. The answer is that **provenance is
 * asymmetric and looks it**: a **Stock Workout** shows a **Citation** — an author,
 * a work, a year — and a **Shared Workout** shows an **Attribution** and an
 * explicit non-vouch in the same slot, in deliberately different words. A
 * community row is structurally incapable of carrying a citation, and this surface
 * is where that structure becomes something an athlete can see.
 *
 * What is *not* here, on purpose: no save count, no adoption badge, no author
 * profile to tap through to. `GOAL.md`'s permanent no is on the vanity layer, and
 * "847 saves 🔥" is that layer arriving through the back door (ADR 0051 §6).
 */
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { listCatalogue } from '#app/utils/catalogue.server.ts'
import {
	catalogueTier,
	formatCitation,
	readCitation,
	type CatalogueTier,
	type SessionArchetype,
} from '#app/utils/catalogue.ts'
import {
	attributionsFor,
	listOwnPublishableWorkouts,
	resolveSharedProvenance,
	type SharedProvenance,
} from '#app/utils/community.server.ts'
import {
	COMMUNITY_NON_VOUCH,
	formatAttribution,
	readAttribution,
	readPublishState,
	type PublishState,
} from '#app/utils/community.ts'
import { formatDate } from '#app/utils/format.ts'
import { SESSION_ARCHETYPE_LABELS } from '#app/utils/labels.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { type Route } from './+types/catalogue.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'The Catalogue | Trainm8' },
]

const TIER_LABELS: Record<CatalogueTier, string> = {
	stock: 'trainm8',
	community: 'Community',
	mine: 'Yours',
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)

	const entries = await listCatalogue({ viewerId: userId })

	// The community rows are the ones that owe an Attribution and a walk. Both are
	// batched over exactly those rows rather than the whole page.
	const community = entries.filter(
		(entry) => catalogueTier(entry.workout, userId) === 'community',
	)
	const attributions = await attributionsFor(
		community.map((entry) => entry.workout.id),
	)
	const provenance = new Map<string, SharedProvenance>(
		await Promise.all(
			community.map(
				async (entry) =>
					[
						entry.workout.id,
						await resolveSharedProvenance(entry.workout.id),
					] as const,
			),
		),
	)

	const rows = entries.map((entry) => {
		const tier = catalogueTier(entry.workout, userId)
		return {
			workoutId: entry.workout.id,
			title: entry.workout.title,
			description: entry.workout.description,
			discipline: entry.workout.discipline,
			archetype: entry.archetype,
			level: entry.level,
			tier,
			citation: readCitation(entry),
			attribution: readAttribution(attributions.get(entry.workout.id)),
			provenance: provenance.get(entry.workout.id) ?? null,
		}
	})

	const own = await listOwnPublishableWorkouts(userId)

	return {
		rows,
		own: own.map((workout) => ({
			id: workout.id,
			title: workout.title,
			discipline: workout.discipline,
			state: readPublishState(workout, workout.attribution),
		})),
	}
}

function TierBadge({ tier }: { tier: CatalogueTier }) {
	return (
		<Badge
			variant={tier === 'stock' ? 'default' : 'secondary'}
			data-tier={tier}
			className="shrink-0"
		>
			{TIER_LABELS[tier]}
		</Badge>
	)
}

/**
 * The provenance slot. One position, three mutually exclusive contents — and the
 * community one is the only one that says trainm8 is not standing behind it.
 */
function ProvenanceSlot({ row }: { row: CatalogueRow }) {
	const timeZone = useAthleteTimezone()

	if (row.tier === 'stock') {
		const citation = row.citation
		if (!citation) return null
		return (
			<p className="text-body-xs text-muted-foreground mt-2">
				<span className="font-medium">Source:</span> {formatCitation(citation)}
			</p>
		)
	}

	if (row.tier !== 'community') return null
	const attribution = row.attribution
	if (!attribution) return null

	return (
		<div className="text-body-xs text-muted-foreground mt-2 space-y-1">
			<p>
				<span className="font-medium">{formatAttribution(attribution)}</span> ·{' '}
				{formatDate(attribution.publishedAt, timeZone)}
			</p>
			{/* The non-vouch, in the slot a Citation would occupy. It is trainm8's
			    statement about itself, identical on every community row, which is why
			    it is a constant and not a column. */}
			<p data-non-vouch>{COMMUNITY_NON_VOUCH}</p>
			{row.provenance?.adaptedFrom ? (
				<p>
					Adapted from {formatCitation(row.provenance.adaptedFrom)} — that
					source belongs to the session this was forked from, not to this one.
				</p>
			) : null}
		</div>
	)
}

type CatalogueRow = Awaited<ReturnType<typeof loader>>['rows'][number]

function EntryCard({ row }: { row: CatalogueRow }) {
	return (
		<Card>
			<CardHeader className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0 space-y-1">
					<CardTitle className="text-base font-bold tracking-tight">
						{row.title}
					</CardTitle>
					<p className="text-body-xs text-muted-foreground flex flex-wrap items-baseline gap-x-1.5">
						<span className="font-medium">
							{getDisciplineLabel(row.discipline)}
						</span>
						<span aria-hidden>·</span>
						<span className="font-medium">
							{SESSION_ARCHETYPE_LABELS[row.archetype as SessionArchetype] ?? row.archetype}
						</span>
						{row.level ? (
							<>
								<span aria-hidden>·</span>
								<span className="font-medium">{row.level} and up</span>
							</>
						) : null}
					</p>
				</div>
				<TierBadge tier={row.tier} />
			</CardHeader>
			<CardContent>
				{row.description ? (
					<p className="text-body-sm text-muted-foreground">
						{row.description}
					</p>
				) : null}
				<ProvenanceSlot row={row} />
				{row.tier === 'community' ? (
					<div className="mt-3">
						<Link
							to={`/training/catalogue/report/${row.workoutId}`}
							className={buttonVariants({ variant: 'outline', size: 'sm' })}
						>
							Report this session
						</Link>
					</div>
				) : null}
			</CardContent>
		</Card>
	)
}

function OwnRow({
	workout,
}: {
	workout: {
		id: string
		title: string
		discipline: string
		state: PublishState
	}
}) {
	const state = workout.state
	const status =
		state.kind === 'published'
			? 'In the Catalogue'
			: state.kind === 'withdrawn'
				? 'Withdrawn by you'
				: state.kind === 'taken-down'
					? 'Removed by a moderator'
					: 'Not published'

	return (
		<li className="flex flex-wrap items-center justify-between gap-2 border-b py-3 last:border-b-0">
			<div className="min-w-0">
				<p className="text-body-sm font-medium">{workout.title}</p>
				<p className="text-body-xs text-muted-foreground">
					{getDisciplineLabel(workout.discipline)} · {status}
				</p>
			</div>
			<Link
				to={`/training/catalogue/publish/${workout.id}`}
				className={buttonVariants({ variant: 'outline', size: 'sm' })}
			>
				{state.kind === 'published' ? 'Manage' : 'Publish'}
			</Link>
		</li>
	)
}

export default function CatalogueRoute({ loaderData }: Route.ComponentProps) {
	const { rows, own } = loaderData

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="The Catalogue"
				back={{ to: '/', label: 'Home' }}
				className="mb-2"
			/>
			<p className="text-muted-foreground mb-6 text-sm">
				Sessions to retrieve from — the ones trainm8 ships, the ones athletes
				have published, and your own.
			</p>

			<section aria-labelledby="corpus" className="mb-8 space-y-3">
				<h2 id="corpus" className="text-h6">
					Sessions
				</h2>
				{rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Nothing in the Catalogue yet.
					</p>
				) : (
					rows.map((row) => <EntryCard key={row.workoutId} row={row} />)
				)}
			</section>

			<section aria-labelledby="your-sessions" className="space-y-2">
				<h2 id="your-sessions" className="text-h6">
					Your sessions
				</h2>
				<p className="text-muted-foreground text-sm">
					Publishing a session offers it to every athlete, under a name you
					choose. trainm8 does not review or endorse what you publish.
				</p>
				{own.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						You have not written a session yet.
					</p>
				) : (
					<ul className="mt-2">
						{own.map((workout) => (
							<OwnRow key={workout.id} workout={workout} />
						))}
					</ul>
				)}
			</section>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
