import { invariantResponse } from '@epic-web/invariant'
import { data, useLoaderData } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { isCalendarDay, localDate } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { getUserId, requireUserId } from '#app/utils/auth.server.ts'
import {
	stampSessionOnDay,
	undoDayStamp,
	writeSessionOnDay,
} from '#app/utils/day-stamp.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useRevalidateOnImportEvent } from '#app/utils/imports-events.ts'
import { SUSTAINED_WEEKS, sustainedAdherence } from '#app/utils/load/coach.ts'
import {
	dismissLoadRecomputeNotice,
	getLoadRecomputeNotice,
} from '#app/utils/load/recompute-notice.server.ts'
import { getCurrentLoad, getTsbTrust } from '#app/utils/load/snapshot.server.ts'
import { readWeekChange } from '#app/utils/load/week-change-card.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { readMostTrainedDiscipline } from '#app/utils/most-trained-discipline.server.ts'
import {
	isInWindow,
	isWritableDay,
	TIMELINE_TRAILING_DAYS,
	timelineWindow,
} from '#app/utils/timeline-window.ts'
import {
	getActivePlan,
	getDisciplineThresholds,
	getRecentWeeklyBuild,
	getSessionLedger,
} from '#app/utils/training.server.ts'
import { DISCIPLINES } from '#app/utils/workout-schema.ts'
import { parseWorkoutSentence } from '#app/utils/workout-sentence.ts'
import { WriteSessionSchema } from '#app/utils/writing-line-schema.ts'
import {
	readTimelineWindow,
	withWeekSumToast,
} from '#app/utils/writing-line.server.ts'
import { logos } from './+logos/logos.ts'
import { type Route } from './+types/index.ts'
import { buildSessionNudge } from './presenter.ts'
import { HomeTimeline } from './timeline/home-timeline.tsx'

export const meta: Route.MetaFunction = () => [{ title: 'Trainm8' }]

// How many trailing weeks the home "build" chart spans. The same series feeds
// sustained-adherence detection (which walks back from the current week, so a
// longer window is a strict superset of the SUSTAINED_WEEKS the coach needs).
const BUILD_WEEKS = Math.max(8, SUSTAINED_WEEKS)

// How far the home timeline reaches (`timeline-window.ts`). The
// screen is a season, not a fortnight: the week strip renders every week at
// once and the stream scrolls back through the weeks the athlete imported from
// before their plan existed, so the Cockpit's 42-day trailing window would have
// cut the history the design is about.
//
// Half a year back and two years ahead rather than everything: an unbounded
// query grows with the account, and both ends of the stream state their own
// limit, so a bound the athlete can see is better than one they cannot. The
// start cap states the trailing one (#500), and the writing line's panel
// offers no day past the leading one.

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await getUserId(request)
	if (!userId) {
		return { isAuthenticated: false as const }
	}
	// Reflections (Session Logs) left the home scroll in the #184 re-composition;
	// they live on the Workout Detail View, so the loader no longer fetches them.
	// The ledger reaches as far ahead as the writing line may write — two
	// years, or the plan's end where that is later (`timeline-window.ts`) — so
	// a session written into a week months out is read back here.
	const requestedAt = new Date()
	const activePlanRead = getActivePlan(userId)
	const ledgerRead = Promise.all([
		getAthleteTimezone(userId),
		activePlanRead,
	]).then(([timezone, plan]) =>
		getSessionLedger(userId, {
			trailingDays: TIMELINE_TRAILING_DAYS,
			// A day past the window's last, so a session late on its last day is in.
			horizonDays:
				timelineWindow({ now: requestedAt, timezone, plan }).horizonDays + 1,
			now: requestedAt,
		}),
	)
	const [
		ledger,
		currentLoad,
		tsbTrust,
		activePlan,
		weeklyBuild,
		thresholds,
		weekChange,
		loadRecomputeNotice,
		athleteProfile,
		stampDiscipline,
		importConnections,
	] = await Promise.all([
		ledgerRead,
		getCurrentLoad(userId),
		getTsbTrust(userId),
		activePlanRead,
		getRecentWeeklyBuild(userId, BUILD_WEEKS),
		getDisciplineThresholds(userId),
		// The Ukeskiftet card (#505 stories 42–55): the closed week's proposals,
		// only while one still waits for an answer — on every other day this is
		// one indexed lookup that ships nothing.
		readWeekChange(userId, { onlyOpen: true }),
		// The undismissed Load Recompute Notice (ADR 0046 §2) — why a number the
		// athlete had already read moved. Read-only; the one-shot backfill writes it
		// and the dismiss action below clears it.
		getLoadRecomputeNotice(userId),
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: { timezone: true },
		}),
		// The Discipline a tapped empty cell prefills (ADR 0065 §5) — read from
		// the athlete's own history, and null where there is none, in which case
		// the cell asks. One query, and the same reader the full authoring route
		// derives its own default with, so the two ways in cannot disagree about
		// what this athlete trains.
		readMostTrainedDiscipline(userId),
		// Whether an import source is connected, so a session marked done with
		// no numbers may say the numbers come from the import (#505 story 82) —
		// and says something honest instead when nothing will bring them.
		prisma.accountConnection.count({
			where: { athleteId: userId, status: 'active' },
		}),
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
		tsbTrust,
		activePlan,
		// `weeklyBuild` itself is deliberately NOT returned: the trailing series
		// fed the retired weekly-build chart, and what survives of it is the
		// `sustained` streak computed just below. The query stays because that
		// streak is the Coach card's reason line.
		thresholds,
		sustained,
		nudge,
		weekChange,
		loadRecomputeNotice,
		stampDiscipline,
		importConnected: importConnections > 0,
	}
}

/**
 * Whether a posted day may be written on. Checked against a **calendar**, not
 * a shape — `2026-13-45` matches `YYYY-MM-DD` and the day maths would roll it
 * over rather than refuse it — and then against the window the loader reads
 * (`timeline-window.ts`).
 *
 * Two readings of that window. A **stamp** comes from an empty cell, which
 * only exists inside it, so it is held to it (`stamp`). A **sentence** may go
 * any distance ahead (#505 story 40): it is held only to the window's first
 * day, since its way back is the toast's Angre and not a row on screen (ADR
 * 0076).
 */
async function isPostableDay(
	userId: string,
	date: unknown,
	{
		now,
		timezone,
		reach,
	}: { now: Date; timezone: string; reach: 'stamp' | 'sentence' },
): Promise<boolean> {
	if (typeof date !== 'string' || !isCalendarDay(date, timezone)) return false
	const window = await readTimelineWindow(userId, { now, timezone })
	return reach === 'stamp'
		? isInWindow(date, window)
		: isWritableDay(date, window)
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
		const now = new Date()
		const timezone = await getAthleteTimezone(userId)
		invariantResponse(
			typeof date === 'string' &&
				(await isPostableDay(userId, date, { now, timezone, reach: 'stamp' })),
			'A day is required',
			{ status: 400 },
		)
		invariantResponse(
			typeof discipline === 'string' &&
				(DISCIPLINES as readonly string[]).includes(discipline),
			'A discipline is required',
			{ status: 400 },
		)
		const { result: stamped, headers } = await withWeekSumToast(
			userId,
			{ dayKey: date, discipline, change: 'added', timezone, now },
			() =>
				stampSessionOnDay({
					userId,
					dateKey: date,
					discipline: discipline as (typeof DISCIPLINES)[number],
					timezone,
				}),
		)
		// A discipline the line cannot say (strength needs a lift named) never
		// reaches here — the cell sends those to the full route instead — so a
		// refusal is a malformed post rather than a state to render.
		invariantResponse(stamped.ok, 'That discipline needs the full editor', {
			status: 400,
		})
		return data(
			{ stampedSessionId: stamped.sessionId },
			headers ? { headers } : undefined,
		)
	}

	/**
	 * **The writing line** (#505 stories 35–40): a session typed as a sentence,
	 * read again here — the client's preview is never trusted as structure —
	 * and written through the stamp's own path onto the day it names. The chip
	 * travels with it and a discipline word in the sentence wins over it; a
	 * sentence the reader is unsure of writes nothing.
	 */
	if (intent === 'write-session') {
		const posted = WriteSessionSchema.safeParse(Object.fromEntries(formData))
		invariantResponse(posted.success, 'A day and a sentence are required', {
			status: 400,
		})
		const { date, sentence, discipline = null, landing } = posted.data
		const now = new Date()
		const timezone = await getAthleteTimezone(userId)
		invariantResponse(
			await isPostableDay(userId, date, { now, timezone, reach: 'sentence' }),
			'A day is required',
			{ status: 400 },
		)
		// Refused before anything is read or written: a sentence the reader is
		// unsure of is a malformed post, since the line never offers to save one.
		const read = parseWorkoutSentence(sentence, { discipline })
		invariantResponse(
			read.structure != null,
			'The sentence could not be read',
			{
				status: 400,
			},
		)
		const {
			result: written,
			headers,
			description,
		} = await withWeekSumToast(
			userId,
			{
				dayKey: date,
				// The toast's sport is the one the reader settled on, which a word
				// in the sentence may have changed from the chip.
				discipline: read.structure.discipline,
				change: 'added',
				timezone,
				now,
			},
			() =>
				writeSessionOnDay({
					userId,
					dateKey: date,
					discipline,
					sentence,
					timezone,
				}),
		)
		invariantResponse(written.ok, 'The sentence could not be read', {
			status: 400,
		})
		// From "+ Ny" the row may be anywhere in the list, so the way back is the
		// toast: the client shows the week's sum itself, with Angre on it, and no
		// second toast is flashed beside it (ADR 0082 S11, ADR 0076).
		if (landing === 'toast') {
			return data({
				stampedSessionId: written.sessionId,
				weekSumLine: description,
			})
		}
		return data(
			{ stampedSessionId: written.sessionId },
			headers ? { headers } : undefined,
		)
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
		// Read before it goes, owner-scoped: the day and the sport are what the
		// toast's week sum is about. Another athlete's id reads as nothing.
		const target = await prisma.workoutSession.findFirst({
			where: { id: sessionId, userId },
			select: { scheduledAt: true, workout: { select: { discipline: true } } },
		})
		// Null when there is nothing there — a double tap on Undo, or a session
		// already gone — which is a no-op and not an error the athlete caused.
		if (!target?.workout) {
			await undoDayStamp(userId, sessionId)
			return { undone: true as const }
		}
		const now = new Date()
		const timezone = await getAthleteTimezone(userId)
		const { headers } = await withWeekSumToast(
			userId,
			{
				dayKey: localDate(target.scheduledAt, timezone),
				discipline: target.workout.discipline,
				change: 'removed',
				timezone,
				now,
			},
			() => undoDayStamp(userId, sessionId),
		)
		return data({ undone: true as const }, headers ? { headers } : undefined)
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
