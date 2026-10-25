/**
 * The full Home Timeline's server half (#558, #562): what the list, the strip,
 * the writing line, the composer, the panes and the Ukeskiftet card read, and
 * every write they post. Two routes render the same timeline — I dag (`/`) and
 * its full view at its own address, _Se hele sesongen_ (`/season`) — and both
 * hand their loader and action to this module, so the two cannot drift apart.
 *
 * Fetchers on the timeline post to the route they are rendered in, which is
 * why both routes carry the same action rather than one posting to the other.
 */
import { invariantResponse } from '@epic-web/invariant'
import { data } from 'react-router'
import { isCalendarDay, localDate } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	placeCatalogueSession,
	readRetrievableEntry,
} from '#app/utils/catalogue.server.ts'
import {
	copySessionToDay,
	finishComposerWrite,
	stampSessionOnDay,
	undoDayStamp,
	writeSessionOnDay,
} from '#app/utils/day-stamp.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { WEEK_SUM_LABELS } from '#app/utils/labels.ts'
import {
	readAutopilotHistory,
	readAutopilotNotice,
} from '#app/utils/load/autopilot-notice.server.ts'
import { SUSTAINED_WEEKS, sustainedAdherence } from '#app/utils/load/coach.ts'
import {
	dismissLoadRecomputeNotice,
	getLoadRecomputeNotice,
} from '#app/utils/load/recompute-notice.server.ts'
import { getCurrentLoad, getTsbTrust } from '#app/utils/load/snapshot.server.ts'
import { readWeekChange } from '#app/utils/load/week-change-card.server.ts'
import { readMostTrainedDiscipline } from '#app/utils/most-trained-discipline.server.ts'
import { derivedAttributionLines } from '#app/utils/source-attribution.ts'
import { readRecordedBindingSet } from '#app/utils/source-terms.server.ts'
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
import {
	type ComposerExtras,
	ComposerExtrasSchema,
	CopySessionSchema,
	PlaceSessionSchema,
	WriteSessionSchema,
} from '#app/utils/writing-line-schema.ts'
import {
	readSentenceExercises,
	readTimelineWindow,
	withWeekSumToast,
} from '#app/utils/writing-line.server.ts'
import { buildSessionNudge } from './presenter.ts'
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

export async function readHomeTimeline(userId: string) {
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
		autopilotNotice,
		autopilotHistory,
		loadRecomputeNotice,
		athleteProfile,
		stampDiscipline,
		importConnections,
		loadBindingSet,
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
		// The Autopilot Notice (#576, ADR 0100 §5): what the autopilot wrote at
		// the latest close, when that week closed under autopilot.
		readAutopilotNotice(userId),
		// Every notice the autopilot wrote, for _Se hele sesongen_ to show at
		// the week each one laid (#580) — I dag shows only the one above.
		readAutopilotHistory(userId),
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
		// The Origin Platforms behind the load the coach's verdict reads (ADR
		// 0098 §1), for the derived-data line Garmin's terms ask of it.
		readRecordedBindingSet(userId),
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
		autopilotNotice,
		autopilotHistory,
		loadRecomputeNotice,
		stampDiscipline,
		importConnected: importConnections > 0,
		sourceCredits: derivedAttributionLines(loadBindingSet),
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

/**
 * Every composer write, landed the same way (ADR 0088): the write, what it
 * says beside its session (Annet, _Allerede gjort_, a note —
 * `finishComposerWrite`), and the week's sum before → after read on both sides
 * of it (#505 story 39).
 *
 * `reply('toast')` is the composer's: the week's sum rides on the reply for
 * the client's toast, which carries Angre, and nothing is flashed beside it.
 * `reply('row')` is the older landing, which flashes the sum.
 */
async function landComposerWrite(
	userId: string,
	{
		date,
		discipline,
		extras,
		now,
		timezone,
		write,
	}: {
		date: string
		discipline: string
		extras: ComposerExtras
		now: Date
		timezone: string
		write: () => Promise<{ ok: true; sessionId: string } | { ok: false }>
	},
) {
	let done = false
	const { result, headers, description } = await withWeekSumToast(
		userId,
		{ dayKey: date, discipline, change: 'added', timezone, now },
		async () => {
			const written = await write()
			if (written.ok) {
				;({ done } = await finishComposerWrite(userId, written.sessionId, {
					extras,
					now,
					timezone,
				}))
			}
			return written
		},
	)
	// A session written into Annet moves no track's sum, and saying `0 → 0 km`
	// would read as the write having failed.
	const weekSumLine = extras.annet
		? WEEK_SUM_LABELS.annetChange('added')
		: description
	if (!result.ok) return { ok: false as const }
	const sessionId = result.sessionId
	return {
		ok: true as const,
		reply: (landing: 'row' | 'toast') =>
			landing === 'toast'
				? data({ stampedSessionId: sessionId, weekSumLine, done })
				: data(
						{ stampedSessionId: sessionId },
						headers ? { headers } : undefined,
					),
	}
}

export async function homeTimelineAction({ request }: { request: Request }) {
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
	 * **The Day Stamp** (ADR 0065 §5): the composer's empty state —
	 * `Legg til 45 min rolig` — commits a real session on that date. The date is
	 * the day the composer is on and the discipline is the chip — both travel
	 * with the post, because neither may be decided here.
	 *
	 * A past day takes this identically: what it writes is a **Workout
	 * Session**, a prescription carrying a date in the past. It is a record of
	 * what was done only when the athlete says so with _Allerede gjort_
	 * (`done`, ADR 0088); executed cardio still arrives by Activity Import.
	 *
	 * From the composer (`landing: toast`) the day may be any distance ahead,
	 * as a sentence's may: its way back is the toast's and the row's Angre, not
	 * a row that only exists inside the window (ADR 0088 amends ADR 0076).
	 */
	if (intent === 'stamp-day') {
		const date = formData.get('date')
		const discipline = formData.get('discipline')
		const landing = formData.get('landing') === 'toast' ? 'toast' : 'row'
		const extras = ComposerExtrasSchema.parse(Object.fromEntries(formData))
		const now = new Date()
		const timezone = await getAthleteTimezone(userId)
		invariantResponse(
			typeof date === 'string' &&
				(await isPostableDay(userId, date, {
					now,
					timezone,
					reach: landing === 'toast' ? 'sentence' : 'stamp',
				})),
			'A day is required',
			{ status: 400 },
		)
		invariantResponse(
			typeof discipline === 'string' &&
				(DISCIPLINES as readonly string[]).includes(discipline),
			'A discipline is required',
			{ status: 400 },
		)
		const landed = await landComposerWrite(userId, {
			date,
			discipline,
			extras,
			now,
			timezone,
			write: () =>
				stampSessionOnDay({
					userId,
					dateKey: date,
					discipline: discipline as (typeof DISCIPLINES)[number],
					timezone,
				}),
		})
		// A discipline the line cannot say (strength needs a lift named) never
		// reaches here — the composer offers no stamp for it — so a refusal is a
		// malformed post rather than a state to render.
		invariantResponse(landed.ok, 'That discipline needs the full editor', {
			status: 400,
		})
		return landed.reply(landing)
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
		const {
			date,
			sentence,
			discipline = null,
			landing,
			...extras
		} = posted.data
		const now = new Date()
		const timezone = await getAthleteTimezone(userId)
		invariantResponse(
			await isPostableDay(userId, date, { now, timezone, reach: 'sentence' }),
			'A day is required',
			{ status: 400 },
		)
		// Refused before anything is read or written: a sentence the reader is
		// unsure of is a malformed post, since the line never offers to save one.
		// Lifts are named against the athlete's own catalogue, read here and
		// never taken from the client (ADR 0089).
		const exercises = await readSentenceExercises(userId)
		const read = parseWorkoutSentence(sentence, { discipline, exercises })
		invariantResponse(
			read.structure != null,
			'The sentence could not be read',
			{
				status: 400,
			},
		)
		const landed = await landComposerWrite(userId, {
			date,
			// The toast's sport is the one the reader settled on, which a word
			// in the sentence may have changed from the chip.
			discipline: read.structure.discipline,
			extras,
			now,
			timezone,
			write: () =>
				writeSessionOnDay({
					userId,
					dateKey: date,
					discipline,
					sentence,
					timezone,
					exercises,
				}),
		})
		invariantResponse(landed.ok, 'The sentence could not be read', {
			status: 400,
		})
		return landed.reply(landing ?? 'row')
	}

	/**
	 * **Bibliotek** (owner decisions 1 and 11): a Catalogue session put on the
	 * composer's day, through the Catalogue's own placement — a fresh copy with
	 * its lineage back to the row (`placeCatalogueSession`, #470), never a
	 * second way to copy. Read through the same visibility guard as the list,
	 * so a row the athlete can no longer see places nothing.
	 */
	if (intent === 'place-session') {
		const posted = PlaceSessionSchema.safeParse(Object.fromEntries(formData))
		invariantResponse(posted.success, 'A day and a session are required', {
			status: 400,
		})
		const { date, workoutId, ...extras } = posted.data
		const now = new Date()
		const timezone = await getAthleteTimezone(userId)
		invariantResponse(
			await isPostableDay(userId, date, { now, timezone, reach: 'sentence' }),
			'A day is required',
			{ status: 400 },
		)
		const entry = await readRetrievableEntry(userId, workoutId)
		invariantResponse(entry, 'That session is no longer in the Catalogue', {
			status: 404,
		})
		const landed = await landComposerWrite(userId, {
			date,
			discipline: entry.workout.discipline,
			extras,
			now,
			timezone,
			write: () =>
				placeCatalogueSession({ athleteId: userId, workoutId, date }),
		})
		invariantResponse(landed.ok, 'That session could not be placed', {
			status: 400,
		})
		return landed.reply('toast')
	}

	/**
	 * **Kopier** (owner decision 1): another of the athlete's sessions copied
	 * onto the composer's day — a fresh Workout through the one deep-copy seam
	 * (`copySessionToDay` → `copyWorkout`), owner-scoped.
	 */
	if (intent === 'copy-session') {
		const posted = CopySessionSchema.safeParse(Object.fromEntries(formData))
		invariantResponse(posted.success, 'A day and a session are required', {
			status: 400,
		})
		const { date, sessionId, ...extras } = posted.data
		const now = new Date()
		const timezone = await getAthleteTimezone(userId)
		invariantResponse(
			await isPostableDay(userId, date, { now, timezone, reach: 'sentence' }),
			'A day is required',
			{ status: 400 },
		)
		const from = await prisma.workoutSession.findFirst({
			where: { id: sessionId, userId },
			select: { workout: { select: { discipline: true } } },
		})
		invariantResponse(from?.workout, 'That session has nothing to copy', {
			status: 404,
		})
		const landed = await landComposerWrite(userId, {
			date,
			discipline: from.workout.discipline,
			extras,
			now,
			timezone,
			write: () =>
				copySessionToDay({ userId, sessionId, dateKey: date, timezone }),
		})
		invariantResponse(landed.ok, 'That session has nothing to copy', {
			status: 404,
		})
		return landed.reply('toast')
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
