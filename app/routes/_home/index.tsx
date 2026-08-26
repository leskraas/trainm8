import { invariantResponse } from '@epic-web/invariant'
import { useLoaderData } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { getUserId, requireUserId } from '#app/utils/auth.server.ts'
import { stampSessionOnDay, undoDayStamp } from '#app/utils/day-stamp.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useRevalidateOnImportEvent } from '#app/utils/imports-events.ts'
import { SUSTAINED_WEEKS, sustainedAdherence } from '#app/utils/load/coach.ts'
import {
	dismissLoadRecomputeNotice,
	getLoadRecomputeNotice,
} from '#app/utils/load/recompute-notice.server.ts'
import {
	getCurrentLoad,
	getLoadSnapshots,
	getTsbTrust,
} from '#app/utils/load/snapshot.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { readMostTrainedDiscipline } from '#app/utils/most-trained-discipline.server.ts'
import { getPersonalRecords } from '#app/utils/personal-records.server.ts'
import { getStrengthSummaryCount } from '#app/utils/strength-log.server.ts'
import {
	getActivePlan,
	getDisciplineThresholds,
	getLatestWeekReplan,
	getRecentWeeklyBuild,
	getSessionLedger,
	getWeeklyAdherence,
} from '#app/utils/training.server.ts'
import { DISCIPLINES } from '#app/utils/workout-schema.ts'
import { logos } from './+logos/logos.ts'
import { type Route } from './+types/index.ts'
import { buildSessionNudge } from './presenter.ts'
import { HomeTimeline } from './timeline/home-timeline.tsx'
import { TIMELINE_TRAILING_DAYS } from './timeline/presenter.ts'

export const meta: Route.MetaFunction = () => [{ title: 'Trainm8' }]

// How many trailing weeks the home "build" chart spans. The same series feeds
// sustained-adherence detection (which walks back from the current week, so a
// longer window is a strict superset of the SUSTAINED_WEEKS the coach needs).
const BUILD_WEEKS = Math.max(8, SUSTAINED_WEEKS)

/**
 * How far forward the home timeline reaches. The screen is a season, not a
 * fortnight: the week strip renders every week at once and the stream scrolls
 * back through the weeks the athlete imported from before their plan existed, so
 * the Cockpit's 42-day trailing window would have cut the history the design is
 * about.
 *
 * Half a year each way rather than everything: an unbounded query grows with the
 * account, and both ends of the stream state their own limit, so a bound the
 * athlete can see is better than one they cannot. The trailing half is
 * `TIMELINE_TRAILING_DAYS`, which the presenter owns because the start cap
 * states it and no day behind it is built (#500).
 */
const TIMELINE_HORIZON_DAYS = 182

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await getUserId(request)
	if (!userId) {
		return { isAuthenticated: false as const }
	}
	// Reflections (Session Logs) left the home scroll in the #184 re-composition;
	// they live on the Workout Detail View, so the loader no longer fetches them.
	const [
		ledger,
		currentLoad,
		snapshots,
		tsbTrust,
		activePlan,
		weeklyAdherence,
		weeklyBuild,
		thresholds,
		personalRecords,
		weekReplan,
		loadRecomputeNotice,
		athleteProfile,
		strengthCount,
		stampDiscipline,
	] = await Promise.all([
		getSessionLedger(userId, {
			trailingDays: TIMELINE_TRAILING_DAYS,
			horizonDays: TIMELINE_HORIZON_DAYS,
		}),
		getCurrentLoad(userId),
		getLoadSnapshots(userId, 90),
		getTsbTrust(userId),
		getActivePlan(userId),
		getWeeklyAdherence(userId),
		getRecentWeeklyBuild(userId, BUILD_WEEKS),
		getDisciplineThresholds(userId),
		getPersonalRecords(userId),
		// The stored Week Replan decision for the latest closed week (ADR 0025) —
		// read-only; the recompute-path applier is the only writer.
		getLatestWeekReplan(userId),
		// The undismissed Load Recompute Notice (ADR 0046 §2) — why a number the
		// athlete had already read moved. Read-only; the one-shot backfill writes it
		// and the dismiss action below clears it.
		getLoadRecomputeNotice(userId),
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: { timezone: true },
		}),
		// ADR 0046 §4's Strength Summary Count — mandated there and unbuilt until
		// `ExerciseSetLog` existed, because "completed" on a gym session used to
		// mean only that somebody had typed an RPE (ADR 0056).
		getStrengthSummaryCount(userId),
		// The Discipline a tapped empty cell prefills (ADR 0065 §5) — read from
		// the athlete's own history, and null where there is none, in which case
		// the cell asks. One query, and the same reader the full authoring route
		// derives its own default with, so the two ways in cannot disagree about
		// what this athlete trains.
		readMostTrainedDiscipline(userId),
	])
	// The Athlete Timezone the shared formatting layer renders in (#172) — the
	// same zone the server-computed nudge names weekdays with.
	const timezone = athleteProfile?.timezone ?? 'UTC'
	const now = new Date()
	const current = currentLoad
		? { ctl: currentLoad.ctl, atl: currentLoad.atl, tsb: currentLoad.tsb }
		: null
	// Sustained-deviation detection reads the comparable-sessions adherence of
	// the same build series (ADR 0019/0025), so the chart and the Coach card can
	// never disagree about the streak.
	const sustained = sustainedAdherence(weeklyBuild.map((w) => w.adherence))
	// Read-only: compute the coach→plan nudge for the next planned session so the
	// Coach card can show its reason line — including the miss-driven one (#187),
	// honesty-guarded so an unpersisted ease is acknowledged, never claimed. No
	// session is mutated here (the applier persists any ease on the
	// load-recompute path, not on GET).
	const nudge = buildSessionNudge({
		ledger,
		current,
		trust: tsbTrust,
		sustained,
		now,
		thresholds,
		timezone,
	})
	return {
		isAuthenticated: true as const,
		now,
		ledger,
		current,
		// Only the two fields the Form pane's trend line reads (#499). Fatigue and
		// Form are a *day's* numbers and come from `current`; shipping 90 days of
		// them was payload for a chart that no longer exists.
		snapshots: snapshots.map((s) => ({ date: s.date, ctl: s.ctl })),
		tsbTrust,
		activePlan,
		weeklyAdherence,
		// `weeklyBuild` itself is deliberately NOT returned: the trailing series
		// fed the retired weekly-build chart, and what survives of it is the
		// `sustained` streak computed just below. The query stays because that
		// streak is the Coach card's reason line.
		thresholds,
		sustained,
		nudge,
		personalRecords,
		weekReplan,
		loadRecomputeNotice,
		strengthCount,
		stampDiscipline,
	}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'dismiss-load-recompute-notice') {
		// Scoped to the kind the athlete actually read: the notice they were shown
		// posts its own kind back, so acknowledging one explanation can never
		// silence another they never saw.
		const kind = formData.get('kind')
		invariantResponse(
			typeof kind === 'string' && kind.length > 0,
			'A notice kind is required',
			{ status: 400 },
		)
		await dismissLoadRecomputeNotice(userId, kind)
		return { dismissed: true as const }
	}

	/**
	 * **The Day Stamp** (ADR 0065 §5): a tapped empty cell commits a real
	 * session on that date without leaving the timeline. The date is the day the
	 * athlete tapped and the discipline is the one the chip was showing when they
	 * tapped — both travel with the post, because neither may be decided here.
	 *
	 * A past day takes this identically: what it writes is a **Workout Session**,
	 * a prescription carrying a date in the past. Nothing on this path records
	 * what was *done* — executed cardio still arrives only by Activity Import
	 * (ADR 0049), so `GOAL.md`'s no-in-app-recorder non-goal is untouched.
	 */
	if (intent === 'stamp-day') {
		const date = formData.get('date')
		const discipline = formData.get('discipline')
		invariantResponse(
			typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date),
			'A day is required',
			{ status: 400 },
		)
		invariantResponse(
			typeof discipline === 'string' &&
				(DISCIPLINES as readonly string[]).includes(discipline),
			'A discipline is required',
			{ status: 400 },
		)
		const stamped = await stampSessionOnDay({
			userId,
			dateKey: date,
			discipline: discipline as (typeof DISCIPLINES)[number],
		})
		// A discipline the line cannot say (strength needs a lift named) never
		// reaches here — the cell sends those to the full route instead — so a
		// refusal is a malformed post rather than a state to render.
		invariantResponse(stamped.ok, 'That discipline needs the full editor', {
			status: 400,
		})
		return { stampedSessionId: stamped.sessionId }
	}

	/**
	 * The way back (ADR 0076). Every empty row is a write target now, so a mistap
	 * commits a database row, and a grid that is easy to write into and hard to
	 * correct is worse than the plan surface it shortcuts.
	 */
	if (intent === 'undo-stamp') {
		const sessionId = formData.get('sessionId')
		invariantResponse(
			typeof sessionId === 'string' && sessionId.length > 0,
			'A session is required',
			{ status: 400 },
		)
		// Null when there is nothing there — a double tap on Undo, or a session
		// already gone — which is a no-op and not an error the athlete caused.
		await undoDayStamp(userId, sessionId)
		return { undone: true as const }
	}

	invariantResponse(false, 'Unknown intent', { status: 400 })
}

export default function Index() {
	const data = useLoaderData<typeof loader>()

	if (!data.isAuthenticated) {
		return <MarketingLanding />
	}

	return <AuthenticatedHome data={data} />
}

/**
 * The athlete's home surface, split out so the Live Imports Stream only opens
 * for a signed-in athlete (the SSE resource route requires auth, and hooks
 * can't sit behind the `isAuthenticated` branch above).
 */
function AuthenticatedHome({
	data,
}: {
	data: Extract<Awaited<ReturnType<typeof loader>>, { isAuthenticated: true }>
}) {
	// The Live Imports Stream lands here now that imports auto-save (ADR 0049):
	// a new activity becomes a Workout Session on The Tape, so this surface — not
	// a queue of things to link — is what refreshes when one arrives (#75).
	useRevalidateOnImportEvent()

	return <HomeTimeline data={data} />
}

const columnClasses: Record<(typeof logos)[number]['column'], string> = {
	1: 'xl:col-start-1',
	2: 'xl:col-start-2',
	3: 'xl:col-start-3',
	4: 'xl:col-start-4',
	5: 'xl:col-start-5',
}
const rowClasses: Record<(typeof logos)[number]['row'], string> = {
	1: 'xl:row-start-1',
	2: 'xl:row-start-2',
	3: 'xl:row-start-3',
	4: 'xl:row-start-4',
	5: 'xl:row-start-5',
	6: 'xl:row-start-6',
}

function MarketingLanding() {
	return (
		<main className="font-poppins grid h-full place-items-center">
			<div className="grid place-items-center px-4 py-16 xl:grid-cols-2 xl:gap-24">
				<div className="flex max-w-md flex-col items-center text-center xl:order-2 xl:items-start xl:text-left">
					<a
						href="https://www.epicweb.dev/stack"
						className="animate-slide-top xl:animate-slide-left [animation-fill-mode:backwards] xl:[animation-delay:0.5s] xl:[animation-fill-mode:backwards]"
					>
						<svg
							className="text-foreground size-20 xl:-mt-4"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 65 65"
						>
							<path
								fill="currentColor"
								d="M39.445 25.555 37 17.163 65 0 47.821 28l-8.376-2.445Zm-13.89 0L28 17.163 0 0l17.179 28 8.376-2.445Zm13.89 13.89L37 47.837 65 65 47.821 37l-8.376 2.445Zm-13.89 0L28 47.837 0 65l17.179-28 8.376 2.445Z"
							></path>
						</svg>
					</a>
					<h1
						data-heading
						className="animate-slide-top text-foreground xl:animate-slide-left mt-8 text-4xl font-medium [animation-delay:0.3s] [animation-fill-mode:backwards] md:text-5xl xl:mt-4 xl:text-6xl xl:[animation-delay:0.8s] xl:[animation-fill-mode:backwards]"
					>
						<a href="https://www.epicweb.dev/stack">The Epic Stack</a>
					</h1>
					<p
						data-paragraph
						className="animate-slide-top text-muted-foreground xl:animate-slide-left mt-6 text-xl/7 [animation-delay:0.8s] [animation-fill-mode:backwards] xl:mt-8 xl:text-xl/6 xl:leading-10 xl:[animation-delay:1s] xl:[animation-fill-mode:backwards]"
					>
						Check the{' '}
						<a
							className="underline hover:no-underline"
							href="https://github.com/epicweb-dev/epic-stack/blob/main/docs/getting-started.md"
						>
							Getting Started guide
						</a>{' '}
						file for how to get your project off the ground!
					</p>
				</div>
				<ul className="mt-16 flex max-w-3xl flex-wrap justify-center gap-2 sm:gap-4 xl:mt-0 xl:grid xl:grid-flow-col xl:grid-cols-5 xl:grid-rows-6">
					<TooltipProvider>
						{logos.map((logo, i) => (
							<li
								key={logo.href}
								className={cn(
									columnClasses[logo.column],
									rowClasses[logo.row],
									'animate-roll-reveal [animation-fill-mode:backwards]',
								)}
								style={{ animationDelay: `${i * 0.07}s` }}
							>
								<Tooltip>
									<TooltipTrigger
										render={
											<a
												href={logo.href}
												className="grid size-20 place-items-center rounded-2xl bg-violet-600/10 p-4 transition hover:-rotate-6 hover:bg-violet-600/15 sm:size-24 dark:bg-violet-200 dark:hover:bg-violet-100"
											>
												<img src={logo.src} alt="" />
											</a>
										}
									/>
									<TooltipContent>{logo.alt}</TooltipContent>
								</Tooltip>
							</li>
						))}
					</TooltipProvider>
				</ul>
			</div>
		</main>
	)
}

/**
 * Home is the default post-login destination and its loader is the widest in the
 * app — a 182-day session ledger, load snapshots, adherence, personal records
 * and a strength count — so it is also the route with the most ways to fail.
 * Without a boundary of its own every one of them fell through to the root, and
 * a failed query cost the athlete the wordmark row and the way back to anything
 * else. Caught here, the failure stays the size it is: one screen, inside the
 * app.
 *
 * The 404 handler is not decoration. `GeneralErrorBoundary`'s default prints the
 * status and the server's own string, which reads the same whether the athlete's
 * training could not be found or something broke — one of those is a state they
 * can act on and the other is a bug, and they should not sound alike.
 */
export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => <p>We could not find your training.</p>,
			}}
		/>
	)
}
