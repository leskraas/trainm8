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
 * **A card leads with the session** (#505 round 2, Arket M): its Token
 * Sentence, then its minutes or km and the level it suits, then the prose, then
 * the provenance as one footnote (`__catalogue-card.ts`). The card's actions are
 * all quiet — outline and ghost — so no list of 24 green buttons competes with
 * the page's one primary, the filter's *Bruk filter*.
 *
 * What is *not* here, on purpose: no save count, no adoption badge, no author
 * profile to tap through to. `GOAL.md`'s permanent no is on the vanity layer, and
 * "847 saves 🔥" is that layer arriving through the back door (ADR 0051 §6).
 *
 * The rows' titles and prose are corpus **content** and stay as the corpus
 * wrote them (ADR 0027 A3); every word around them is Norwegian (ADR 0081).
 */
import { type Prisma } from '@prisma/client'
import { Form, Link, redirect, useSearchParams } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Checkbox } from '#app/components/ui/checkbox.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { LIBRARY_SECTION_HREF } from '#app/utils/app-tabs.ts'
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
import { prisma } from '#app/utils/db.server.ts'
import { formatNbDate } from '#app/utils/format.ts'
import {
	APP_TAB_LABELS,
	CATALOGUE_LABELS,
	NB_CATALOGUE_GOAL_EVENT_LABELS,
	NB_CATALOGUE_LEVEL_LABELS,
	NB_CATALOGUE_PHASE_LABELS,
	NB_CATALOGUE_TIER_LABELS,
	NB_DISCIPLINE_LABELS,
	NB_SESSION_ARCHETYPE_LABELS,
	nbDisciplineLabel,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { readSessionProvenance } from '#app/utils/plan-generation/provenance.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { DISCIPLINES, type Discipline } from '#app/utils/workout-schema.ts'
import { workoutCopySelect } from '#app/utils/workout.server.ts'
import { type Route } from './+types/catalogue.ts'
import {
	buildCatalogueCard,
	catalogueBlurb,
	nbProvenanceNonVouch,
	nbProvenanceSentence,
} from './__catalogue-card.ts'
import { Disclosure } from './__plan-chrome.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: CATALOGUE_LABELS.metaTitle },
]

/** How many rows a first page shows, and how many each "Vis flere" adds. */
const PAGE_SIZE = 24

/**
 * What a card reads off a row's Workout: the tree the Token Sentence and the
 * figures are built from — the copy select's, plus a lift's name, which a
 * strength row's sentence says.
 */
const cardWorkoutSelect = {
	id: true,
	discipline: true,
	blocks: {
		...workoutCopySelect.blocks,
		select: {
			...workoutCopySelect.blocks.select,
			steps: {
				...workoutCopySelect.blocks.select.steps,
				select: {
					...workoutCopySelect.blocks.select.steps.select,
					exercise: { select: { name: true } },
				},
			},
		},
	},
} satisfies Prisma.WorkoutSelect

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
	if (filters.discipline) labels.push(NB_DISCIPLINE_LABELS[filters.discipline])
	if (filters.archetype)
		labels.push(NB_SESSION_ARCHETYPE_LABELS[filters.archetype])
	if (filters.phase) labels.push(NB_CATALOGUE_PHASE_LABELS[filters.phase])
	if (filters.goalEvent)
		labels.push(NB_CATALOGUE_GOAL_EVENT_LABELS[filters.goalEvent])
	if (filters.level)
		labels.push(
			CATALOGUE_LABELS.suits(NB_CATALOGUE_LEVEL_LABELS[filters.level]),
		)
	if (filters.tier) labels.push(NB_CATALOGUE_TIER_LABELS[filters.tier])
	if (filters.saved) labels.push(CATALOGUE_LABELS.savedFilter)
	if (filters.q) labels.push(CATALOGUE_LABELS.query(filters.q))
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
	const pageIds = page.map((entry) => entry.workout.id)

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
	const saved = await catalogueSavedIds(userId, pageIds)
	// The sessions themselves, for the cards' sentences and figures: one read
	// for the page, never for the corpus.
	const trees = new Map(
		(
			await prisma.workout.findMany({
				where: { id: { in: pageIds } },
				select: cardWorkoutSelect,
			})
		).map((workout) => [workout.id, workout]),
	)

	const rows = page.map((entry) => {
		const level = entry.level
			? (NB_CATALOGUE_LEVEL_LABELS[entry.level as CatalogueLevel] ?? null)
			: null
		// One reading for all three tiers (#474). An uncited **Stock Workout** is
		// about a third of the corpus — a Convention Row or a Hand-Written Row —
		// and each owes the athlete its own sentence, not an empty slot.
		const sourcing = readSessionProvenance({
			authorship: entry.workout.authorship,
			description: entry.workout.description,
			citationAuthor: entry.citationAuthor,
			citationWork: entry.citationWork,
			citationYear: entry.citationYear,
			citationLocator: entry.citationLocator,
			attribution: attributions.get(entry.workout.id),
		})
		const adaptedFrom = adapted.get(entry.workout.id) ?? null
		return {
			workoutId: entry.workout.id,
			title: entry.workout.title,
			blurb: catalogueBlurb(entry.workout.description),
			discipline: entry.workout.discipline,
			archetype: entry.archetype,
			tier: catalogueTier(entry.workout, userId),
			card: buildCatalogueCard({
				workout: trees.get(entry.workout.id) ?? null,
				level,
			}),
			provenance: {
				sentence: nbProvenanceSentence(sourcing),
				publishedAt:
					sourcing.kind === 'community'
						? (sourcing.attribution?.publishedAt ?? null)
						: null,
				nonVouch: nbProvenanceNonVouch(sourcing),
				adaptedFrom: adaptedFrom
					? CATALOGUE_LABELS.adaptedFrom(formatCitation(adaptedFrom))
					: null,
			},
			saved: saved.has(entry.workout.id),
		}
	})

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
			variant={tier === 'stock' ? 'secondary' : 'outline'}
			data-tier={tier}
			className="shrink-0"
		>
			{NB_CATALOGUE_TIER_LABELS[tier]}
		</Badge>
	)
}

/**
 * The provenance footnote. One position, one sentence per kind — and the
 * community one is the only one that says trainm8 is not standing behind it.
 * Every sentence comes from `__catalogue-card.ts`, so the slot and a placed
 * session's cannot word the same fact differently.
 */
function ProvenanceSlot({
	provenance,
}: {
	provenance: CatalogueRow['provenance']
}) {
	const timeZone = useAthleteTimezone()
	return (
		<div className="text-footnote text-muted-foreground border-border/60 mt-3 space-y-1 border-t pt-3">
			<p>
				{provenance.sentence}
				{provenance.publishedAt
					? ` · ${formatNbDate(provenance.publishedAt, timeZone)}`
					: null}
			</p>
			{/* The non-vouch, in the slot a Citation would occupy. It is trainm8's
			    statement about itself, identical on every community row, which is why
			    it is a constant and not a column. */}
			{provenance.nonVouch ? <p data-non-vouch>{provenance.nonVouch}</p> : null}
			{provenance.adaptedFrom ? <p>{provenance.adaptedFrom}</p> : null}
		</div>
	)
}

function EntryCard({ row, search }: { row: CatalogueRow; search: string }) {
	return (
		<article className="bg-card rounded-4xl p-4 shadow-xs md:p-5">
			{/* The badge has a fixed slot at the title's right, so it never wraps
			    under a long title on one card and sits beside it on the next. */}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="text-callout [overflow-wrap:anywhere]">{row.title}</h3>
					<p className="text-footnote text-muted-foreground mt-0.5">
						{nbDisciplineLabel(row.discipline)}
						<span aria-hidden> · </span>
						{NB_SESSION_ARCHETYPE_LABELS[row.archetype as SessionArchetype] ??
							row.archetype}
					</p>
				</div>
				<TierBadge tier={row.tier} />
			</div>

			{/* The session first (Arket M): what it is, then how long or how far. */}
			{row.card.sentence ? (
				<p className="text-body mt-3 font-medium [overflow-wrap:anywhere]">
					{row.card.sentence}
				</p>
			) : null}
			{row.card.figures.length > 0 ? (
				<p className="text-footnote text-muted-foreground mt-1 tabular-nums">
					{row.card.figures.join(' · ')}
				</p>
			) : null}

			{row.blurb ? (
				<p className="text-footnote text-muted-foreground mt-3">{row.blurb}</p>
			) : null}

			<ProvenanceSlot provenance={row.provenance} />

			<div className="mt-3 flex flex-wrap gap-2">
				<Link
					to={`/training/catalogue/place/${row.workoutId}${search}`}
					className={cn(
						buttonVariants({ variant: 'outline', size: 'sm' }),
						'rounded-full',
					)}
				>
					<Icon name="calendar" size="sm" aria-hidden />
					{CATALOGUE_LABELS.place}
				</Link>
				{/* Save is a POST and not a link: it writes. The count behind it is a
				    ranking input and is never rendered (ADR 0051 §6). */}
				<Form method="POST" replace>
					<input type="hidden" name="workoutId" value={row.workoutId} />
					<Button
						type="submit"
						name="intent"
						value={row.saved ? 'unsave' : 'save'}
						variant="ghost"
						size="sm"
						className="rounded-full"
						aria-pressed={row.saved}
					>
						<Icon name={row.saved ? 'check' : 'plus'} size="sm" aria-hidden />
						{row.saved ? CATALOGUE_LABELS.saved : CATALOGUE_LABELS.save}
					</Button>
				</Form>
				{row.tier === 'community' ? (
					<Link
						to={`/training/catalogue/report/${row.workoutId}`}
						className={cn(
							buttonVariants({ variant: 'ghost', size: 'sm' }),
							'rounded-full',
						)}
					>
						{CATALOGUE_LABELS.report}
					</Link>
				) : null}
			</div>
		</article>
	)
}

/**
 * One facet control — the shared `Select` primitive with a `name`, so it posts
 * its value with the surrounding GET form (ui-conventions §2.4 rules out a
 * native `<select>`: only the primitive gives a 44px trigger with 16px phone
 * type and labels drawn from `labels.ts`).
 *
 * The unfiltered choice is a **row** ("Alle faser") and not a blank: a facet
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
		<div className="space-y-1.5">
			<label htmlFor={id} className="text-footnote text-muted-foreground">
				{label}
			</label>
			<Select name={name} defaultValue={value ?? ''} items={items}>
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
	const F = CATALOGUE_LABELS.facets

	return (
		<Form method="GET" className="mb-4 space-y-3">
			<div className="flex gap-2">
				<Input
					type="search"
					name="q"
					defaultValue={filters.q ?? ''}
					aria-label={CATALOGUE_LABELS.searchLabel}
					placeholder={CATALOGUE_LABELS.searchPlaceholder}
					enterKeyHint="search"
				/>
				<Button
					type="submit"
					variant="outline"
					className="shrink-0 rounded-full"
				>
					<Icon name="magnifying-glass" size="sm" aria-hidden />
					{CATALOGUE_LABELS.searchButton}
				</Button>
			</div>

			<Disclosure
				summary={CATALOGUE_LABELS.filters}
				detail={
					active.length ? active.join(' · ') : CATALOGUE_LABELS.allSessions
				}
				defaultOpen={active.length > 0}
			>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<Facet
						name="discipline"
						label={F.discipline}
						anyLabel={F.anyDiscipline}
						value={filters.discipline}
						options={DISCIPLINES.map((d) => ({
							value: d,
							label: NB_DISCIPLINE_LABELS[d],
						}))}
					/>
					<Facet
						name="archetype"
						label={F.archetype}
						anyLabel={F.anyArchetype}
						value={filters.archetype}
						options={SESSION_ARCHETYPES.map((a) => ({
							value: a,
							label: NB_SESSION_ARCHETYPE_LABELS[a],
						}))}
					/>
					<Facet
						name="phase"
						label={F.phase}
						anyLabel={F.anyPhase}
						value={filters.phase}
						options={CATALOGUE_PHASES.map((p) => ({
							value: p,
							label: NB_CATALOGUE_PHASE_LABELS[p],
						}))}
					/>
					<Facet
						name="goalEvent"
						label={F.goalEvent}
						anyLabel={F.anyGoalEvent}
						value={filters.goalEvent}
						options={CATALOGUE_GOAL_EVENTS.map((g) => ({
							value: g,
							label: NB_CATALOGUE_GOAL_EVENT_LABELS[g],
						}))}
					/>
					<Facet
						name="level"
						label={F.level}
						anyLabel={F.anyLevel}
						value={filters.level}
						options={CATALOGUE_LEVELS.map((l) => ({
							value: l,
							label: NB_CATALOGUE_LEVEL_LABELS[l],
						}))}
					/>
					<Facet
						name="tier"
						label={F.tier}
						anyLabel={F.anyTier}
						value={filters.tier}
						options={CATALOGUE_TIERS.map((t) => ({
							value: t,
							label: NB_CATALOGUE_TIER_LABELS[t],
						}))}
					/>
				</div>

				{/* Saved is a facet, never a tier: an athlete's list is mostly sessions
				    they did not write (ADR 0051 §4). The whole row is the label, so
				    the 16px box has a 44px target. */}
				<label className="text-body flex min-h-11 items-center gap-3">
					<Checkbox name="saved" value="1" defaultChecked={filters.saved} />
					{CATALOGUE_LABELS.savedOnly}
				</label>

				<div className="flex flex-wrap gap-2">
					<Button type="submit" className="rounded-full">
						{CATALOGUE_LABELS.apply}
					</Button>
					<Link
						to="/training/catalogue"
						className={cn(buttonVariants({ variant: 'ghost' }), 'rounded-full')}
					>
						{CATALOGUE_LABELS.clear}
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

	// "Vis flere" keeps every facet and widens the cap by one page.
	const moreParams = new URLSearchParams(searchParams)
	moreParams.set('count', String(nextCount))
	const search = searchParams.toString()

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={CATALOGUE_LABELS.title}
				back={{ to: LIBRARY_SECTION_HREF, label: APP_TAB_LABELS.plan }}
				className="mb-2"
			/>
			<p className="text-footnote text-muted-foreground mb-4">
				{CATALOGUE_LABELS.intro}
			</p>

			<section aria-labelledby="corpus" className="mb-8">
				<h2 id="corpus" className="sr-only">
					{CATALOGUE_LABELS.sessionsHeading}
				</h2>
				<FilterPanel filters={filters} />

				<p
					className="text-footnote text-muted-foreground mb-3 tabular-nums"
					data-result-count
				>
					{CATALOGUE_LABELS.resultLine(total, active.length > 0, rows.length)}
				</p>

				{rows.length === 0 ? (
					<div className="space-y-2">
						<p className="text-footnote text-muted-foreground">
							{active.length
								? CATALOGUE_LABELS.noneMatch(active.join(' · '))
								: CATALOGUE_LABELS.empty}
						</p>
						{active.length ? (
							<Link
								to="/training/catalogue"
								className={cn(
									buttonVariants({ variant: 'outline', size: 'sm' }),
									'rounded-full',
								)}
							>
								{CATALOGUE_LABELS.clear}
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
							'mt-3 w-full rounded-full',
						)}
					>
						{CATALOGUE_LABELS.showMore}
					</Link>
				) : null}
			</section>

			<section aria-labelledby="your-sessions" className="space-y-2">
				<h2 id="your-sessions" className="text-heading">
					{CATALOGUE_LABELS.yourSessions}
				</h2>
				<p className="text-footnote text-muted-foreground">
					{CATALOGUE_LABELS.publishIntro}
				</p>
				{own.length === 0 ? (
					<p className="text-footnote text-muted-foreground">
						{CATALOGUE_LABELS.noOwn}
					</p>
				) : (
					<ul className="bg-card divide-border/60 mt-2 divide-y rounded-4xl px-4 shadow-xs">
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
	return (
		<li className="flex items-center justify-between gap-3 py-3">
			<div className="min-w-0">
				<p className="text-callout [overflow-wrap:anywhere]">{workout.title}</p>
				<p className="text-footnote text-muted-foreground">
					{nbDisciplineLabel(workout.discipline)} ·{' '}
					{CATALOGUE_LABELS.publishState[state.kind]}
				</p>
			</div>
			<Link
				to={`/training/catalogue/publish/${workout.id}`}
				className={cn(
					buttonVariants({ variant: 'outline', size: 'sm' }),
					'shrink-0 rounded-full',
				)}
			>
				{state.kind === 'published'
					? CATALOGUE_LABELS.manage
					: CATALOGUE_LABELS.publish}
			</Link>
		</li>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
