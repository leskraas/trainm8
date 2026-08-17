/**
 * **The Catalogue** — 152 cited sessions, four retrieval axes, and since #470 a
 * way to reach any of them.
 *
 * The screen is a **retrieval** surface and is laid out as one: a search box and
 * a facet panel above a list that says how many rows it is showing and offers
 * more. The facets are the four the corpus is modelled on
 * (`archetype × phase × goalEvent × level`) plus discipline, tier, and
 * **saved** — which is a facet and never a tier value, because an athlete's list
 * is overwhelmingly sessions they did not write (ADR 0051 §4).
 *
 * All of it is URL state driven by a GET form, so a filtered Catalogue is a link
 * — shareable, bookmarkable, and survivable by a back button. The search box and
 * the saved checkbox are plain form controls; the facet triggers are the shared
 * `Select` primitive, which posts through a hidden input but needs JavaScript to
 * open (ui-conventions §2.4 rules a native `<select>` out on mobile grounds).
 *
 * Three tiers land on one list, and the whole design question is how a reader
 * tells them apart without reading carefully. The answer is that **provenance is
 * asymmetric and looks it**: a **Stock Workout** shows what trainm8 can source —
 * a **Citation**, or the convention or hand-written line where there is none
 * (#474) — and a **Shared Workout** shows an **Attribution** and an explicit
 * non-vouch in the same slot, in deliberately different words.
 *
 * What is *not* here, on purpose: no save count, no adoption badge, no author
 * profile to tap through to. `GOAL.md`'s permanent no is on the vanity layer, and
 * "847 saves 🔥" is that layer arriving through the back door (ADR 0051 §6).
 */
import { Form, Link, redirect, useSearchParams } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	catalogueSavedIds,
	listCatalogue,
	removeFromCatalogueList,
	saveToCatalogueList,
} from '#app/utils/catalogue.server.ts'
import {
	CATALOGUE_GOAL_EVENTS,
	CATALOGUE_LEVELS,
	CATALOGUE_PHASES,
	CATALOGUE_TIERS,
	SESSION_ARCHETYPES,
	catalogueTier,
	formatCitation,
	isCatalogueGoalEvent,
	isCatalogueLevel,
	isCataloguePhase,
	isCatalogueTier,
	isSessionArchetype,
	type CatalogueLevel,
	type CatalogueTier,
	type SessionArchetype,
} from '#app/utils/catalogue.ts'
import {
	attributionsFor,
	listOwnPublishableWorkouts,
	resolveSharedProvenance,
} from '#app/utils/community.server.ts'
import { readPublishState, type PublishState } from '#app/utils/community.ts'
import { formatDate } from '#app/utils/format.ts'
import {
	CATALOGUE_GOAL_EVENT_LABELS,
	CATALOGUE_LEVEL_LABELS,
	CATALOGUE_PHASE_LABELS,
	CATALOGUE_TIER_LABELS,
	DISCIPLINE_LABELS,
	SESSION_ARCHETYPE_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	provenanceNonVouch,
	provenanceSentence,
	readSessionProvenance,
	type SessionProvenance,
} from '#app/utils/plan-generation/provenance.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { DISCIPLINES, type Discipline } from '#app/utils/workout-schema.ts'
import { type Route } from './+types/catalogue.ts'
import { Disclosure } from './__plan-chrome.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: 'The Catalogue | Trainm8' },
]

/** How many rows a first page shows, and how many each "Show more" adds. */
const PAGE_SIZE = 24

/**
 * The facets, read off the URL and validated against their own vocabularies.
 *
 * An unrecognised value is **dropped** rather than rejected: a hand-edited or
 * stale link should show the Catalogue, not an error page, and a filter that
 * cannot be named cannot be listed in the empty state either.
 */
function readFilters(params: URLSearchParams) {
	function pick<T extends string>(
		key: string,
		isValid: (value: string) => value is T,
	): T | undefined {
		const raw = params.get(key)
		return raw != null && isValid(raw) ? raw : undefined
	}
	const isDiscipline = (value: string): value is Discipline =>
		(DISCIPLINES as readonly string[]).includes(value)

	const q = params.get('q')?.trim()
	return {
		discipline: pick('discipline', isDiscipline),
		archetype: pick('archetype', isSessionArchetype),
		phase: pick('phase', isCataloguePhase),
		goalEvent: pick('goalEvent', isCatalogueGoalEvent),
		level: pick('level', isCatalogueLevel),
		tier: pick('tier', isCatalogueTier),
		saved: params.get('saved') === '1',
		q: q ? q : undefined,
	}
}

type Filters = ReturnType<typeof readFilters>

/** The active facets, named the way the controls name them. */
function activeFilterLabels(filters: Filters): string[] {
	const labels: string[] = []
	if (filters.discipline) labels.push(DISCIPLINE_LABELS[filters.discipline])
	if (filters.archetype)
		labels.push(SESSION_ARCHETYPE_LABELS[filters.archetype])
	if (filters.phase) labels.push(CATALOGUE_PHASE_LABELS[filters.phase])
	if (filters.goalEvent)
		labels.push(CATALOGUE_GOAL_EVENT_LABELS[filters.goalEvent])
	if (filters.level)
		labels.push(`Suits ${CATALOGUE_LEVEL_LABELS[filters.level].toLowerCase()}`)
	if (filters.tier) labels.push(CATALOGUE_TIER_LABELS[filters.tier])
	if (filters.saved) labels.push('Saved')
	if (filters.q) labels.push(`“${filters.q}”`)
	return labels
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const url = new URL(request.url)
	const filters = readFilters(url.searchParams)

	const entries = await listCatalogue({
		viewerId: userId,
		discipline: filters.discipline,
		archetype: filters.archetype,
		phase: filters.phase,
		goalEvent: filters.goalEvent,
		level: filters.level,
		tier: filters.tier,
		savedBy: filters.saved ? userId : undefined,
		q: filters.q,
	})

	// The page is capped, and everything below is batched over the capped slice
	// rather than the whole corpus: 152 provenance walks to render 24 cards is a
	// cost the athlete pays for rows they cannot see.
	const shownCount = Math.min(
		Math.max(Number(url.searchParams.get('count')) || PAGE_SIZE, PAGE_SIZE),
		entries.length,
	)
	const page = entries.slice(0, shownCount)

	const community = page.filter(
		(entry) => catalogueTier(entry.workout, userId) === 'community',
	)
	const attributions = await attributionsFor(
		community.map((entry) => entry.workout.id),
	)
	const adapted = new Map(
		await Promise.all(
			community.map(
				async (entry) =>
					[
						entry.workout.id,
						(await resolveSharedProvenance(entry.workout.id)).adaptedFrom,
					] as const,
			),
		),
	)
	const saved = await catalogueSavedIds(
		userId,
		page.map((entry) => entry.workout.id),
	)

	const rows = page.map((entry) => ({
		workoutId: entry.workout.id,
		title: entry.workout.title,
		description: entry.workout.description,
		discipline: entry.workout.discipline,
		archetype: entry.archetype,
		level: entry.level,
		tier: catalogueTier(entry.workout, userId),
		// One reading for all three tiers (#474). An uncited **Stock Workout** is
		// about a third of the corpus — a Convention Row or a Hand-Written Row —
		// and each owes the athlete its own sentence, not an empty slot.
		sourcing: readSessionProvenance({
			authorship: entry.workout.authorship,
			description: entry.workout.description,
			citationAuthor: entry.citationAuthor,
			citationWork: entry.citationWork,
			citationYear: entry.citationYear,
			citationLocator: entry.citationLocator,
			attribution: attributions.get(entry.workout.id),
		}),
		adaptedFrom: adapted.get(entry.workout.id) ?? null,
		saved: saved.has(entry.workout.id),
	}))

	const own = await listOwnPublishableWorkouts(userId)

	return {
		rows,
		filters,
		total: entries.length,
		hasMore: entries.length > page.length,
		nextCount: shownCount + PAGE_SIZE,
		own: own.map((workout) => ({
			id: workout.id,
			title: workout.title,
			discipline: workout.discipline,
			state: readPublishState(workout, workout.attribution),
		})),
	}
}

/**
 * Save and unsave, the collection axis's only writes (#470).
 *
 * Both are idempotent and neither copies anything: the save points at the
 * original, so the citation an athlete reads stays the original's. The copy
 * happens later, at the first edit (ADR 0051 §5).
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const workoutId = String(formData.get('workoutId') ?? '')
	const intent = formData.get('intent')

	if (workoutId) {
		if (intent === 'save') await saveToCatalogueList(userId, workoutId)
		if (intent === 'unsave') await removeFromCatalogueList(userId, workoutId)
	}

	// Back to the list exactly as it was filtered and paged.
	const url = new URL(request.url)
	throw redirect(`/training/catalogue${url.search}`)
}

type CatalogueRow = Awaited<ReturnType<typeof loader>>['rows'][number]

function TierBadge({ tier }: { tier: CatalogueTier }) {
	return (
		<Badge
			variant={tier === 'stock' ? 'default' : 'secondary'}
			data-tier={tier}
			className="shrink-0"
		>
			{CATALOGUE_TIER_LABELS[tier]}
		</Badge>
	)
}

/**
 * The provenance slot. One position, one sentence per kind — and the community
 * one is the only one that says trainm8 is not standing behind it.
 *
 * Every sentence comes from `provenance.ts`, which is also what a generated
 * session's slot reads, so the two surfaces cannot word the same fact
 * differently.
 */
function ProvenanceSlot({
	sourcing,
	adaptedFrom,
}: {
	sourcing: SessionProvenance
	adaptedFrom: CatalogueRow['adaptedFrom']
}) {
	const timeZone = useAthleteTimezone()
	const nonVouch = provenanceNonVouch(sourcing)
	const publishedAt =
		sourcing.kind === 'community' ? sourcing.attribution?.publishedAt : null

	return (
		<div className="text-body-xs text-muted-foreground mt-2 space-y-1">
			<p>
				{provenanceSentence(sourcing)}
				{publishedAt ? ` · ${formatDate(publishedAt, timeZone)}` : null}
			</p>
			{/* The non-vouch, in the slot a Citation would occupy. It is trainm8's
			    statement about itself, identical on every community row, which is why
			    it is a constant and not a column. */}
			{nonVouch ? <p data-non-vouch>{nonVouch}</p> : null}
			{adaptedFrom ? (
				<p>
					Adapted from {formatCitation(adaptedFrom)} — that source belongs to
					the session this was forked from, not to this one.
				</p>
			) : null}
		</div>
	)
}

function EntryCard({ row, search }: { row: CatalogueRow; search: string }) {
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
							{SESSION_ARCHETYPE_LABELS[row.archetype as SessionArchetype] ??
								row.archetype}
						</span>
						{row.level ? (
							<>
								<span aria-hidden>·</span>
								<span className="font-medium">
									{CATALOGUE_LEVEL_LABELS[row.level as CatalogueLevel] ??
										row.level}{' '}
									and up
								</span>
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
				<ProvenanceSlot sourcing={row.sourcing} adaptedFrom={row.adaptedFrom} />
				<div className="mt-3 flex flex-wrap gap-2">
					<Link
						to={`/training/catalogue/place/${row.workoutId}${search}`}
						className={buttonVariants({ variant: 'default', size: 'sm' })}
					>
						<Icon name="calendar" size="sm" aria-hidden />
						Add to my calendar
					</Link>
					{/* Save is a POST and not a link: it writes. The count behind it is a
					    ranking input and is never rendered (ADR 0051 §6). */}
					<Form method="POST" replace>
						<input type="hidden" name="workoutId" value={row.workoutId} />
						<Button
							type="submit"
							name="intent"
							value={row.saved ? 'unsave' : 'save'}
							variant="outline"
							size="sm"
							aria-pressed={row.saved}
						>
							{row.saved ? <Icon name="check" size="sm" aria-hidden /> : null}
							{row.saved ? 'Saved' : 'Save'}
						</Button>
					</Form>
					{row.tier === 'community' ? (
						<Link
							to={`/training/catalogue/report/${row.workoutId}`}
							className={buttonVariants({ variant: 'ghost', size: 'sm' })}
						>
							Report
						</Link>
					) : null}
				</div>
			</CardContent>
		</Card>
	)
}

/**
 * One facet control — the shared `Select` primitive with a `name`, so it posts
 * its value with the surrounding GET form (ui-conventions §2.4 rules out a
 * native `<select>`: only the primitive gives a 44px trigger with 16px phone
 * type and labels drawn from `labels.ts`).
 *
 * The unfiltered choice is a **row** ("Any phase") and not a blank: a facet
 * panel is read at a glance, and an empty row says nothing about what it does.
 */
function Facet({
	name,
	label,
	value,
	anyLabel,
	options,
}: {
	name: string
	label: string
	value: string | undefined
	anyLabel: string
	options: ReadonlyArray<{ value: string; label: string }>
}) {
	const id = `facet-${name}`
	const items = [{ value: '', label: anyLabel }, ...options]
	return (
		<div className="space-y-1">
			<label htmlFor={id} className="text-body-xs text-muted-foreground">
				{label}
			</label>
			<Select name={name} defaultValue={value ?? ''}>
				<SelectTrigger id={id} className="w-full">
					<SelectValue>
						{(selected) =>
							items.find((item) => item.value === selected)?.label ?? anyLabel
						}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}

function FilterPanel({ filters }: { filters: Filters }) {
	const active = activeFilterLabels(filters)

	return (
		<Form method="GET" className="mb-4 space-y-3">
			<div className="flex gap-2">
				<Input
					type="search"
					name="q"
					defaultValue={filters.q ?? ''}
					aria-label="Search the Catalogue"
					placeholder="Search sessions"
				/>
				<Button type="submit" variant="outline" className="h-11 shrink-0">
					<Icon name="magnifying-glass" size="sm" aria-hidden />
					Search
				</Button>
			</div>

			<Disclosure
				summary="Filters"
				detail={active.length ? active.join(' · ') : 'All sessions'}
				defaultOpen={active.length > 0}
			>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<Facet
						name="discipline"
						label="Discipline"
						anyLabel="Any discipline"
						value={filters.discipline}
						options={DISCIPLINES.map((d) => ({
							value: d,
							label: DISCIPLINE_LABELS[d],
						}))}
					/>
					<Facet
						name="archetype"
						label="Kind of session"
						anyLabel="Any kind"
						value={filters.archetype}
						options={SESSION_ARCHETYPES.map((a) => ({
							value: a,
							label: SESSION_ARCHETYPE_LABELS[a],
						}))}
					/>
					<Facet
						name="phase"
						label="Phase"
						anyLabel="Any phase"
						value={filters.phase}
						options={CATALOGUE_PHASES.map((p) => ({
							value: p,
							label: CATALOGUE_PHASE_LABELS[p],
						}))}
					/>
					<Facet
						name="goalEvent"
						label="Goal event"
						anyLabel="Any event"
						value={filters.goalEvent}
						options={CATALOGUE_GOAL_EVENTS.map((g) => ({
							value: g,
							label: CATALOGUE_GOAL_EVENT_LABELS[g],
						}))}
					/>
					<Facet
						name="level"
						label="Suits"
						anyLabel="Any level"
						value={filters.level}
						options={CATALOGUE_LEVELS.map((l) => ({
							value: l,
							label: CATALOGUE_LEVEL_LABELS[l],
						}))}
					/>
					<Facet
						name="tier"
						label="Written by"
						anyLabel="Anyone"
						value={filters.tier}
						options={CATALOGUE_TIERS.map((t) => ({
							value: t,
							label: CATALOGUE_TIER_LABELS[t],
						}))}
					/>
				</div>

				{/* Saved is a facet, never a tier: an athlete's list is mostly sessions
				    they did not write (ADR 0051 §4). */}
				<label className="flex min-h-11 items-center gap-2 text-base md:text-sm">
					<input
						type="checkbox"
						name="saved"
						value="1"
						defaultChecked={filters.saved}
						className="size-4"
					/>
					In my list
				</label>

				<div className="flex flex-wrap gap-2">
					<Button type="submit" size="sm">
						Apply
					</Button>
					<Link
						to="/training/catalogue"
						className={buttonVariants({ variant: 'ghost', size: 'sm' })}
					>
						Clear all
					</Link>
				</div>
			</Disclosure>
		</Form>
	)
}

export default function CatalogueRoute({ loaderData }: Route.ComponentProps) {
	const { rows, own, filters, total, hasMore, nextCount } = loaderData
	const [searchParams] = useSearchParams()
	const active = activeFilterLabels(filters)

	// "Show more" keeps every facet and widens the cap by one page.
	const moreParams = new URLSearchParams(searchParams)
	moreParams.set('count', String(nextCount))
	const search = searchParams.toString()

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="The Catalogue"
				back={{ to: '/', label: 'Home' }}
				className="mb-2"
			/>
			<p className="text-muted-foreground mb-4 text-sm">
				Sessions to retrieve from — trainm8's, other athletes', and your own.
			</p>

			<section aria-labelledby="corpus" className="mb-8">
				<h2 id="corpus" className="sr-only">
					Sessions
				</h2>
				<FilterPanel filters={filters} />

				<p className="text-muted-foreground mb-3 text-sm" data-result-count>
					{total === 1 ? '1 session' : `${total} sessions`}
					{active.length ? ' match your filters' : null}
					{rows.length < total ? ` · showing ${rows.length}` : null}
				</p>

				{rows.length === 0 ? (
					<div className="space-y-2">
						<p className="text-muted-foreground text-sm">
							{active.length
								? `Nothing matches ${active.join(' · ')}.`
								: 'Nothing in the Catalogue yet.'}
						</p>
						{active.length ? (
							<Link
								to="/training/catalogue"
								className={buttonVariants({ variant: 'outline', size: 'sm' })}
							>
								Clear all
							</Link>
						) : null}
					</div>
				) : (
					<div className="space-y-3">
						{rows.map((row) => (
							<EntryCard
								key={row.workoutId}
								row={row}
								search={search ? `?${search}` : ''}
							/>
						))}
					</div>
				)}

				{hasMore ? (
					<Link
						to={`/training/catalogue?${moreParams.toString()}`}
						preventScrollReset
						className={cn(
							buttonVariants({ variant: 'outline' }),
							'mt-3 w-full',
						)}
					>
						Show more
					</Link>
				) : null}
			</section>

			<section aria-labelledby="your-sessions" className="space-y-2">
				<h2 id="your-sessions" className="text-h6">
					Your sessions
				</h2>
				<p className="text-muted-foreground text-sm">
					Publishing offers a session to every athlete, under a name you choose.
					trainm8 does not review or endorse what you publish.
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

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
