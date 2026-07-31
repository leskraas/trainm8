/**
 * The manual planning surface: the season the athlete authored, read back.
 *
 * Two readings of one object (spec #399 story 67) — **Blocks** shapes the season
 * and **Weeks** audits it — selected by a `?tab=` search param rather than nested
 * routes — the same URL-state rule the **Discipline Query** follows — because they
 * are two views and not two pages. Both are read-only at this stage: authoring the structure, the ramps and
 * the mixes lands with its own tickets.
 *
 * Every number here is **derived** on read from the **Season Anchor** and the
 * phases (ADR 0040 §1) — nothing on this page is stored per week, so no reading
 * can go stale when the structure above it changes. Where a track's rule cannot
 * price a week the surface says **Unavailable** with its reason, and never a
 * fabricated figure.
 */
import { Link, redirect } from 'react-router'
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
import { dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatDate, formatWeeklyVolume } from '#app/utils/format.ts'
import {
	DISCIPLINE_LABELS,
	RHYTHM_LABELS,
	VOLUME_CURRENCY_UNITS,
	WEEK_ROLE_LABELS,
} from '#app/utils/labels.ts'
import {
	getActiveSeason,
	getSeasonForEvent,
} from '#app/utils/training.server.ts'
import { type Route } from './+types/plan.ts'

export const meta: Route.MetaFunction = () => [{ title: 'Plan | Trainm8' }]

const TABS = ['blocks', 'weeks'] as const
type Tab = (typeof TABS)[number]

/**
 * The two readings' own names. Not a domain enum — **Block** is a UI word only
 * (CONTEXT.md, Plan Outline phase) and these label a view, so they live beside
 * the view rather than in `labels.ts`.
 */
const TAB_LABELS: Record<Tab, string> = { blocks: 'Blocks', weeks: 'Weeks' }

function tabFrom(request: Request): Tab {
	const raw = new URL(request.url).searchParams.get('tab')
	return TABS.includes(raw as Tab) ? (raw as Tab) : 'blocks'
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	// `?event=` addresses one Event's season — the plan just authored, or the one
	// an Event linked to. Without it the surface shows the active plan: the nearest
	// upcoming outlined Event (ADR 0018), which is the plan the athlete is living
	// in but not necessarily the one they just asked for.
	const eventId = new URL(request.url).searchParams.get('event')
	const season = eventId
		? await getSeasonForEvent(userId, eventId)
		: await getActiveSeason(userId)
	// An Event with no plan of its own falls back to the active plan rather than
	// dead-ending; with no plan at all, the flow's first question is the honest
	// destination — not a hollow page.
	if (!season) throw redirect(eventId ? '/training/plan' : '/training/plan/new')

	return {
		eventQuery: eventId,
		tab: tabFrom(request),
		season: {
			...season,
			/**
			 * Each week's Monday as the instant of local midnight, so the display layer
			 * formats the calendar day the athlete's week actually opens on.
			 */
			weeks: season.weeks.map((week) => ({
				...week,
				startsAt: dayBoundsUTC(week.weekKey, season.timezone).start,
			})),
			phases: season.phases.map((phase) => ({
				...phase,
				startsAt: dayBoundsUTC(phase.fromWeekKey, season.timezone).start,
			})),
		},
	}
}

export default function PlanRoute({ loaderData }: Route.ComponentProps) {
	const { season, tab, eventQuery } = loaderData
	const timezone = season.timezone
	const totalWeeks = season.weeks.length

	// The tab is URL state, and it must not drop the season the athlete is looking
	// at: both params travel together, with the default tab kept out of the URL.
	function readingHref(name: Tab): string {
		const params = new URLSearchParams()
		if (eventQuery) params.set('event', eventQuery)
		if (name !== 'blocks') params.set('tab', name)
		const search = params.toString()
		return search ? `/training/plan?${search}` : '/training/plan'
	}

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="Season plan"
				back={{ to: '/', label: 'Home' }}
				className="mb-4"
			/>

			<div className="mb-8 space-y-3">
				<div className="space-y-1">
					<p className="font-medium">
						<Link
							to={`/training/events/${season.eventId}`}
							className="hover:underline"
						>
							{season.eventName}
						</Link>
					</p>
					{/* The Event's date is a calendar day anchor, formatted in UTC like
					    every other Event date in the app (ADR 0023). */}
					<p className="text-muted-foreground text-sm">
						{formatDate(season.eventDate, 'UTC')} ·{' '}
						{totalWeeks === 1 ? '1 week' : `${totalWeeks} weeks`} from{' '}
						{formatDate(season.phases[0]!.startsAt, timezone)}
					</p>
				</div>
				<p className="text-sm">{fitSentence(season.fit)}</p>
				<ul className="space-y-1">
					{season.tracks.map((track) => (
						<li key={track.discipline} className="text-sm">
							<span className="font-medium">
								{DISCIPLINE_LABELS[track.discipline]}
							</span>{' '}
							<span className="text-muted-foreground">
								· authored in {VOLUME_CURRENCY_UNITS[track.currency]} · starts
								at {formatWeeklyVolume(track.anchors[0]!.value, track.currency)}
							</span>
						</li>
					))}
				</ul>
			</div>

			<nav aria-label="Season views" className="mb-4 flex gap-2">
				{TABS.map((name) => (
					<Link
						key={name}
						to={readingHref(name)}
						aria-current={tab === name ? 'page' : undefined}
						className={buttonVariants({
							variant: tab === name ? 'default' : 'outline',
							size: 'sm',
						})}
					>
						{TAB_LABELS[name]}
					</Link>
				))}
			</nav>

			{tab === 'blocks' ? (
				<BlocksReading season={season} />
			) : (
				<WeeksReading season={season} />
			)}
		</main>
	)
}

type SeasonData = Route.ComponentProps['loaderData']['season']

/**
 * The Blocks reading: the phases in authored order. A phase carries a name, a
 * span and a rhythm and nothing about volume (ADR 0041), and its dates are
 * derived from the Plan Start Week rather than stored beside it.
 */
function BlocksReading({ season }: { season: SeasonData }) {
	return (
		<ol aria-label="Phases" className="space-y-3">
			{season.phases.map((phase) => (
				// Keyed by the week the phase opens on, which is unique across a season
				// by construction (phases are contiguous, ADR 0044 §3) — an array index
				// would reuse the wrong card once phases can be reordered.
				<li key={phase.fromWeekKey}>
					<Card>
						<CardHeader className="gap-1">
							<CardTitle className="flex flex-wrap items-center gap-2 text-base">
								{phase.name}
								{phase.tapers ? (
									<Badge variant="secondary">Tapers</Badge>
								) : null}
							</CardTitle>
							<p className="text-muted-foreground text-sm">
								{phase.fromWeekInPlan === phase.toWeekInPlan
									? `Week ${phase.fromWeekInPlan}`
									: `Weeks ${phase.fromWeekInPlan}–${phase.toWeekInPlan}`}{' '}
								· from {formatDate(phase.startsAt, season.timezone)}
							</p>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground text-sm">
								{RHYTHM_LABELS[phase.rhythm]}
							</p>
						</CardContent>
					</Card>
				</li>
			))}
		</ol>
	)
}

/**
 * The Weeks reading: every Training Week with its role and its derived target per
 * track. One column per track in **that track's** own currency — never a total
 * across them, which would need an exchange rate the app refuses to invent
 * (ADR 0043 §5).
 */
function WeeksReading({ season }: { season: SeasonData }) {
	// A track whose every week reads Unavailable gets its reason said once, rather
	// than a column of dashes the athlete has to interpret (Unavailable Metric).
	const unpricedTracks = season.tracks.filter((track) =>
		season.weeks.every(
			(week) =>
				week.targets.find((target) => target.discipline === track.discipline)
					?.value == null,
		),
	)

	return (
		<>
			<ul aria-label="Training weeks" className="divide-border divide-y">
				{season.weeks.map((week) => (
					<li
						key={week.weekKey}
						className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
					>
						<div className="text-sm">
							<span className="font-medium">Week {week.weekInPlan}</span>{' '}
							<span className="text-muted-foreground">
								· {formatDate(week.startsAt, season.timezone)} ·{' '}
								{season.phases[week.phaseIndex]?.name} ·{' '}
								{WEEK_ROLE_LABELS[week.role]}
							</span>
						</div>
						<dl className="flex flex-wrap gap-x-4 text-sm">
							{week.targets.map((target) => (
								<div key={target.discipline} className="flex gap-1.5">
									<dt className="text-muted-foreground">
										{DISCIPLINE_LABELS[target.discipline]}
									</dt>
									<dd className="font-medium tabular-nums">
										{target.value == null ? (
											<span className="text-muted-foreground font-normal">
												Unavailable
											</span>
										) : (
											formatWeeklyVolume(target.value, target.currency)
										)}
									</dd>
								</div>
							))}
						</dl>
					</li>
				))}
			</ul>
			{unpricedTracks.map((track) => (
				<p
					key={track.discipline}
					className="text-muted-foreground mt-3 text-sm"
				>
					{DISCIPLINE_LABELS[track.discipline]} weeks read Unavailable — a
					strength track&rsquo;s weekly sets are not derived yet.
				</p>
			))}
		</>
	)
}

/**
 * Where the season ends against the Event, said plainly. The plan is never
 * stretched to meet the Event: the athlete decides whether to add weeks (ADR 0044
 * §3, spec #399 story 4).
 */
function fitSentence(fit: SeasonData['fit']): string {
	const weeks = fit.kind === 'ends-on-event-week' ? 0 : fit.weeks
	const plural = weeks === 1 ? 'week' : 'weeks'
	if (fit.kind === 'ends-on-event-week') {
		return 'Your plan ends on your event’s week.'
	}
	return fit.kind === 'ends-before'
		? `Your plan ends ${weeks} ${plural} before your event’s week. Add weeks if you want it to reach the event.`
		: `Your plan runs ${weeks} ${plural} past your event’s week.`
}

export { GeneralErrorBoundary as ErrorBoundary }
