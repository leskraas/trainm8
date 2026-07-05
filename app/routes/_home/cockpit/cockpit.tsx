// The Cockpit home, re-composed as the tabbed Dashboard (#184): decide first,
// then dig in. Under the wordmark row (#178) the page is
//   Header   — greeting, the plan-arc chip (countdown · phase · week N of M,
//              → Target Event detail) and the single "+ New" creation menu
//   Decide   — the permanent decision strip: Form + label, today's session,
//              the coach's one-line reasoning, one honestly-named action
//   Dig in   — Week / Trends / History tabs, one dense panel at a time:
//              Week   = This Week strip + Recent planned-vs-actual
//              Trends = fitness trend, weekly load, Proof Strip (the one home
//                       for the load story)
//              History = the full Session Ledger (cards below the tablet
//                        breakpoint, #182), session count on the tab
// The selected tab lives in the URL (?tab=) so back/refresh keep the view.
// The zones are dumb; all data mapping lives in ./presenter.ts.
import { Link, useSearchParams } from 'react-router'
import { CreateMenu } from '#app/components/create-menu.tsx'
import { LoadLegendLabel } from '#app/components/load-legend.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { Tabs, TabsList, TabsPanel, TabsTab } from '#app/components/ui/tabs.tsx'
import { greetingFor } from '#app/utils/dashboard.ts'
import { formatLoad } from '#app/utils/format.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
import {
	FATIGUE_LEGEND,
	FITNESS_LEGEND,
	FORM_LEGEND,
	type LoadLegend,
} from '#app/utils/load/legends.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type LoadSnapshot, type LoadTriad } from '#app/utils/load/types.ts'
import { type PersonalRecord } from '#app/utils/personal-records.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import { useAthleteTimezone, useOptionalUser } from '#app/utils/user.ts'
import { SessionLedger } from '../session-ledger.tsx'
import { DecisionStrip } from './decision-strip.tsx'
import { FitnessJourney } from './fitness-journey.tsx'
import {
	buildFitnessProjection,
	buildPhaseBands,
	buildPlanContext,
	buildProofStrip,
	buildRecentCompare,
	buildTodayCard,
	buildWeekTimeline,
	buildWeeklyBuild,
	type PlanContext,
	weekProgressLabel,
} from './presenter.ts'
import { ProofStrip } from './proof-strip.tsx'
import { RecentCompare } from './recent-compare.tsx'
import { Tile } from './shared.tsx'
import { WeekTimeline } from './week-timeline.tsx'
import { WeeklyBuild } from './weekly-build.tsx'

export type CockpitData = {
	now?: Date | string
	ledger: LedgerSession[]
	current: LoadTriad | null
	snapshots: LoadSnapshot[]
	tsbTrust: TsbTrust
	activePlan: ActivePlan | null
	weeklyAdherence: WeeklyAdherence | null
	weeklyBuild: Array<WeeklyAdherence | null>
	sustained: SustainedDeviation | null
	/** Read-only coach→plan decision for the next planned session (#157). */
	nudge: SessionNudge
	/** Per-discipline thresholds for resolving Intensity Targets into metric targets. */
	thresholds: DisciplineThresholdMap
	personalRecords: PersonalRecord[]
}

const DASHBOARD_TABS = ['week', 'trends', 'history'] as const
type DashboardTab = (typeof DASHBOARD_TABS)[number]

function isDashboardTab(value: unknown): value is DashboardTab {
	return DASHBOARD_TABS.includes(value as DashboardTab)
}

export function Cockpit({ data }: { data: CockpitData }) {
	const user = useOptionalUser()
	// `now` comes from the loader so SSR and hydration agree on "today"; the
	// Athlete Timezone fixes which calendar day/labels that instant renders as,
	// identically on server and client (#172).
	const now = data.now ? new Date(data.now) : new Date()
	const timezone = useAthleteTimezone()

	// The selected tab is URL state (?tab=) so back/refresh keep the view; an
	// absent or unknown value is the default Week view (kept out of the URL).
	const [searchParams, setSearchParams] = useSearchParams()
	const rawTab = searchParams.get('tab')
	const tab: DashboardTab = isDashboardTab(rawTab) ? rawTab : 'week'
	function onTabChange(value: unknown) {
		const next: DashboardTab = isDashboardTab(value) ? value : 'week'
		if (next === tab) return
		setSearchParams(
			(prev) => {
				const params = new URLSearchParams(prev)
				if (next === 'week') params.delete('tab')
				else params.set('tab', next)
				return params
			},
			{ preventScrollReset: true },
		)
	}

	const planContext = buildPlanContext(
		data.activePlan,
		data.weeklyAdherence,
		now,
	)
	const phaseBands = buildPhaseBands(data.activePlan, now)
	const fitnessProjection = buildFitnessProjection(
		data.activePlan,
		data.snapshots,
		data.tsbTrust,
	)
	const today = buildTodayCard(data.ledger, now, data.thresholds, timezone)
	const weekCells = buildWeekTimeline(
		data.ledger,
		now,
		data.thresholds,
		timezone,
	)
	const recentRows = buildRecentCompare(data.ledger, now, 4, timezone)
	const buildBars = buildWeeklyBuild(data.weeklyBuild, now, timezone)
	const proofRecords = buildProofStrip(data.personalRecords)

	// Plain-language week progress (#181): "2 of 4 sessions done", not "2/4 done".
	const weekProgress = weekProgressLabel(weekCells)

	const heading = planContext ? 'Road to race day' : "Here's your week"

	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-6xl space-y-6">
				<header className="flex flex-wrap items-end justify-between gap-4">
					<div className="min-w-0">
						<p className="text-muted-foreground text-sm">
							{greetingFor(now, timezone)},{' '}
							{user?.name ?? user?.username ?? 'athlete'}.
						</p>
						<h1 className="text-foreground mt-1 text-3xl font-semibold tracking-tight">
							{heading}
						</h1>
						{/* The plan arc folded into the header as a compact chip (#184).
						    It keeps the #178 contract of the 3-stat bar it replaces:
						    clicking it opens the Target Event detail. Events stays a
						    first-class, labelled destination in both plan states (#171
						    story 12); without a plan the slot adds the Plan Generation
						    call-to-action. */}
						<div className="mt-3">
							{planContext ? (
								<div className="flex flex-wrap items-center gap-2">
									<PlanArcChip ctx={planContext} />
									<EventsLink />
								</div>
							) : (
								<PlanCta />
							)}
						</div>
					</div>
					{/*
						"+ New" is the single creation menu (#178): New session /
						Generate plan / New event. Quick-start folds into its "New
						session" flow (#184) — the discipline is picked on the form.
					*/}
					<CreateMenu />
				</header>

				{/* Decide — always visible, above the tabs. */}
				<DecisionStrip
					current={data.current}
					trust={data.tsbTrust}
					sustained={data.sustained}
					nudge={data.nudge}
					today={today}
				/>

				{/* Dig in — one dense view at a time. */}
				<Tabs value={tab} onValueChange={onTabChange}>
					<TabsList aria-label="Dashboard views">
						<TabsTab value="week">Week</TabsTab>
						<TabsTab value="trends">Trends</TabsTab>
						<TabsTab value="history">
							History
							<span
								aria-label={`${data.ledger.length} sessions`}
								className="text-muted-foreground text-xs tabular-nums"
							>
								{data.ledger.length}
							</span>
						</TabsTab>
					</TabsList>

					<TabsPanel value="week" className="space-y-6">
						<Tile
							title="This week"
							labelledBy="cockpit-week"
							action={
								<span className="text-muted-foreground text-right text-xs tabular-nums">
									{weekProgress}
									{planContext ? ` · ${planContext.weekLoadLabel}` : null}
								</span>
							}
						>
							<WeekTimeline cells={weekCells} />
						</Tile>
						<Tile
							title="Recent · planned vs actual"
							labelledBy="cockpit-recent"
						>
							<RecentCompare rows={recentRows} />
						</Tile>
					</TabsPanel>

					<TabsPanel value="trends" className="space-y-6">
						<Tile
							title="Progression · fitness to race"
							labelledBy="cockpit-progression"
							action={<LoadTriadStats current={data.current} />}
						>
							<FitnessJourney
								snapshots={data.snapshots}
								phaseBands={phaseBands}
								planContext={planContext}
								projection={fitnessProjection}
							/>
						</Tile>
						<Tile title="The build · weekly load" labelledBy="cockpit-build">
							<WeeklyBuild bars={buildBars} />
						</Tile>
						<Tile title="Proof · personal records" labelledBy="cockpit-proof">
							<ProofStrip records={proofRecords} />
						</Tile>
					</TabsPanel>

					<TabsPanel value="history">
						<section aria-labelledby="cockpit-ledger">
							<h2
								id="cockpit-ledger"
								className="text-foreground mb-4 text-lg font-semibold tracking-tight"
							>
								Session ledger
							</h2>
							<SessionLedger sessions={data.ledger} now={now} />
						</section>
					</TabsPanel>
				</Tabs>
			</div>
		</main>
	)
}

/**
 * The compact plan-arc chip in the page header (#184): countdown, phase and
 * week N of M spelled out (#181, the presenter's `arcChipLabel`), replacing
 * the 3-stat plan bar. Same #178 contract: it opens the Target Event detail.
 */
function PlanArcChip({ ctx }: { ctx: PlanContext }) {
	return (
		<Link
			to={`/training/events/${ctx.eventId}`}
			aria-label={`Plan: ${ctx.eventName}`}
			className="border-border/60 bg-card hover:bg-muted/40 focus-visible:outline-ring inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2"
		>
			<span className="bg-primary size-1.5 shrink-0 rounded-full" />
			<span className="text-foreground truncate font-medium">
				{ctx.arcChipLabel}
			</span>
		</Link>
	)
}

/**
 * The header plan slot without an active plan (#178): the Plan Generation
 * call-to-action plus the Events entry, so Events stays reachable when there
 * is no plan-arc chip to click through.
 */
function PlanCta() {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-muted-foreground text-sm">No active plan</span>
			<EventsLink />
			<Link
				to="/training/plan/new"
				className={buttonVariants({ variant: 'default', size: 'sm' })}
			>
				Generate plan
			</Link>
		</div>
	)
}

// The labelled Events entry shown in the header plan slot in both plan
// states, so the Target Event list is always one visible click away (#171
// story 12).
function EventsLink() {
	return (
		<Link
			to="/training/events"
			className={buttonVariants({ variant: 'outline', size: 'sm' })}
		>
			Events
		</Link>
	)
}

// The CTL/ATL/TSB evidence beside the fitness trend — Trends is the one home
// for the load story (#184). Each abbreviated label is a legend trigger
// (#181): hover or focus spells out the glossary definition, and the
// accessible name is the full term.
function LoadTriadStats({ current }: { current: LoadTriad | null }) {
	return (
		<span className="text-muted-foreground flex gap-4 text-xs">
			<TriadStat legend={FITNESS_LEGEND} value={current?.ctl} />
			<TriadStat legend={FATIGUE_LEGEND} value={current?.atl} />
			<TriadStat legend={FORM_LEGEND} value={current?.tsb} />
		</span>
	)
}

function TriadStat({
	legend,
	value,
}: {
	legend: LoadLegend
	value?: number | null
}) {
	return (
		<span className="flex items-baseline gap-1.5">
			<LoadLegendLabel legend={legend} className="text-xs" />
			<span className="text-foreground text-sm font-semibold tabular-nums">
				{value != null ? formatLoad(value) : '—'}
			</span>
		</span>
	)
}
