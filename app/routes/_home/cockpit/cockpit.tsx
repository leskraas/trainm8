// The Cockpit home (PR #128). Reads top→bottom the way an athlete opens the app:
//   Orient  — readiness + road-to-race context
//   Act     — today's session beside the fitness curve it builds toward
//   Week    — the Mon→Sun timeline
//   Analyse — the build (weekly load) + recent planned-vs-actual
//   History — the dense Session Ledger
// The zones are dumb; all data mapping lives in ./presenter.ts.
import { Link } from 'react-router'
import { CreateMenu } from '#app/components/create-menu.tsx'
import {
	type LoadSnapshot,
	type LoadTriad,
} from '#app/components/form-load-card.tsx'
import { greetingFor, paletteFor } from '#app/utils/dashboard.ts'
import { type DisciplineThresholdMap } from '#app/utils/intensity-target.ts'
import { type WeeklyAdherence } from '#app/utils/load/adherence.ts'
import { type SustainedDeviation } from '#app/utils/load/coach.ts'
import { type SessionNudge } from '#app/utils/load/session-nudge.ts'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { cn } from '#app/utils/misc.tsx'
import { type PersonalRecord } from '#app/utils/personal-records.ts'
import {
	type ActivePlan,
	type LedgerSession,
} from '#app/utils/training.server.ts'
import { useOptionalUser } from '#app/utils/user.ts'
import { SessionLedger } from '../session-ledger.tsx'
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
} from './presenter.ts'
import { ProofStrip } from './proof-strip.tsx'
import { ReadinessBanner } from './readiness-banner.tsx'
import { RecentCompare } from './recent-compare.tsx'
import { Tile } from './shared.tsx'
import { TodayHero } from './today-hero.tsx'
import { WeekTimeline } from './week-timeline.tsx'
import { WeeklyBuild } from './weekly-build.tsx'

export type CockpitData = {
	now?: Date | string
	recentLogs: Array<{
		id: string
		content: string
		rpe: number | null
		session: { id: string; workout: { title: string } | null }
	}>
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

const ACTIVITY_QUICK_STARTS = [
	{ key: 'run', label: 'Run' },
	{ key: 'bike', label: 'Ride' },
	{ key: 'swim', label: 'Swim' },
	{ key: 'strength', label: 'Strength' },
] as const

export function Cockpit({ data }: { data: CockpitData }) {
	const user = useOptionalUser()
	// `now` comes from the loader so SSR and hydration agree on "today".
	const now = data.now ? new Date(data.now) : new Date()

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
	const today = buildTodayCard(data.ledger, now, data.thresholds)
	const weekCells = buildWeekTimeline(data.ledger, now, data.thresholds)
	const recentRows = buildRecentCompare(data.ledger, now)
	const buildBars = buildWeeklyBuild(data.weeklyBuild, now)
	const proofRecords = buildProofStrip(data.personalRecords)

	const weekDone = weekCells.filter((c) => c.state === 'completed').length
	const weekPlanned = weekCells.filter((c) => c.session !== null).length

	const heading = planContext ? 'Road to race day' : "Here's your week"

	return (
		<main className="min-h-screen px-4 py-8">
			<div className="mx-auto max-w-6xl space-y-6">
				<header className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<p className="text-muted-foreground text-sm">
							{greetingFor(now)}, {user?.name ?? user?.username ?? 'athlete'}.
						</p>
						<h1 className="text-foreground mt-1 text-3xl font-semibold tracking-tight">
							{heading}
						</h1>
					</div>
					{/*
						"+ New" is the single creation menu (#178): New session /
						Generate plan / New event. The old header "New session" button
						and the pill nav's "+" both collapsed into it.
					*/}
					<CreateMenu />
				</header>

				{/* Orient */}
				<ReadinessBanner
					current={data.current}
					snapshots={data.snapshots}
					trust={data.tsbTrust}
					sustained={data.sustained}
					nudge={data.nudge}
					planContext={planContext}
				/>

				{/* Act */}
				<div className="grid gap-6 lg:grid-cols-2">
					<Tile title="Today" labelledBy="cockpit-today">
						<TodayHero today={today} />
					</Tile>
					<Tile
						title="Progression · fitness to race"
						labelledBy="cockpit-progression"
					>
						<FitnessJourney
							snapshots={data.snapshots}
							phaseBands={phaseBands}
							planContext={planContext}
							projection={fitnessProjection}
						/>
					</Tile>
				</div>

				{/* Week */}
				<Tile
					title="This week"
					labelledBy="cockpit-week"
					action={
						<span className="text-muted-foreground text-xs tabular-nums">
							{weekDone}/{weekPlanned} done
						</span>
					}
				>
					<WeekTimeline cells={weekCells} />
				</Tile>

				{/* Analyse */}
				<div className="grid gap-6 lg:grid-cols-2">
					<Tile title="The build · weekly load" labelledBy="cockpit-build">
						<WeeklyBuild bars={buildBars} />
					</Tile>
					<Tile title="Recent · planned vs actual" labelledBy="cockpit-recent">
						<RecentCompare rows={recentRows} />
					</Tile>
				</div>

				{/* Proof — derived best-efforts showing training is working */}
				<Tile title="Proof · personal records" labelledBy="cockpit-proof">
					<ProofStrip records={proofRecords} />
				</Tile>

				{/* History */}
				<section aria-labelledby="cockpit-ledger">
					<h2
						id="cockpit-ledger"
						className="text-foreground mb-4 text-lg font-semibold tracking-tight"
					>
						Session ledger
					</h2>
					<SessionLedger sessions={data.ledger} now={now} />
				</section>

				{data.recentLogs.length > 0 ? (
					<section aria-labelledby="cockpit-reflections">
						<h2
							id="cockpit-reflections"
							className="text-foreground mb-4 text-lg font-semibold tracking-tight"
						>
							Recent reflections
						</h2>
						<div className="grid gap-3 md:grid-cols-3">
							{data.recentLogs.map((log) => (
								<Link
									key={log.id}
									to={`/training/sessions/${log.session.id}`}
									className="bg-card hover:bg-muted/30 border-border/60 flex flex-col rounded-lg border p-4 transition"
								>
									<div className="flex items-start justify-between gap-2">
										<p className="text-foreground text-sm font-medium">
											{log.session.workout?.title ?? 'Recording'}
										</p>
										{log.rpe != null ? (
											<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
												RPE {log.rpe}
											</span>
										) : null}
									</div>
									<p className="text-muted-foreground mt-2 line-clamp-3 flex-1 text-xs">
										{log.content}
									</p>
								</Link>
							))}
						</div>
					</section>
				) : null}

				<section
					aria-labelledby="cockpit-quick"
					className="border-border/60 border-t pt-8"
				>
					<h2
						id="cockpit-quick"
						className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase"
					>
						Quick start a new session
					</h2>
					<div className="flex flex-wrap gap-2">
						{ACTIVITY_QUICK_STARTS.map((a) => (
							<Link
								key={a.key}
								to={`/training/sessions/new?discipline=${a.key}`}
								className="hover:bg-muted/40 border-border/60 bg-card inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition"
							>
								<span
									className={cn(
										'size-1.5 rounded-full',
										paletteFor(a.key).chip,
									)}
								/>
								<span className="text-foreground text-xs font-medium">
									{a.label}
								</span>
							</Link>
						))}
					</div>
				</section>
			</div>
		</main>
	)
}
