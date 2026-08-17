/**
 * PROTOTYPE — four variants of the create-a-plan journey, switchable via
 * `?variant=`, on the throwaway `/training/plan/prototype` route.
 *
 * **This route reads a real athlete.** The journey is driven by a seeded
 * athlete's own history — Season Anchors from the last four complete Training
 * Weeks, their Training Availability, their thresholds (including the ones they
 * deliberately never set), and their own future Target Event. `?athlete=<username>`
 * picks which one; the default is whoever is logged in, falling back to `ida`.
 *
 * Dev-gated exactly like `/dev/athletes`: it reads another athlete's training
 * without asking them, so it must not exist in production.
 *
 * THROWAWAY — do not ship.
 */
import { useSearchParams } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { weekMonday } from '#app/utils/athlete-calendar.ts'
import { getUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatPace } from '#app/utils/format.ts'
import { readAnchorContext } from '#app/utils/plan-outline/history.server.ts'
import { proposeTrack } from '#app/utils/plan-outline/proposal.ts'
import { type Route } from './+types/plan.prototype.ts'
import {
	DAYS,
	SEASON_START_MONDAY,
	type Currency,
	type Day,
	type Discipline,
	type IntensityBasis,
	type PrototypeAthlete,
	type PrototypeEvent,
	type PrototypeTrack,
	type ThresholdReading,
} from './__prototype-data.ts'
import { PrototypeSwitcher } from './__prototype-switcher.tsx'
import VariantA from './__prototype-variant-a.tsx'
import VariantB from './__prototype-variant-b.tsx'
import VariantC from './__prototype-variant-c.tsx'
import VariantD from './__prototype-variant-d.tsx'
import VariantE from './__prototype-variant-e.tsx'
import VariantF from './__prototype-variant-f.tsx'
import VariantG from './__prototype-variant-g.tsx'
import VariantH from './__prototype-variant-h.tsx'
import VariantI from './__prototype-variant-i.tsx'
import VariantJ from './__prototype-variant-j.tsx'
import VariantK from './__prototype-variant-k.tsx'
import VariantL from './__prototype-variant-l.tsx'

const VARIANTS = [
	{ key: 'A', name: 'Two-question form' },
	{ key: 'B', name: 'Conversational one-thing-at-a-time' },
	{ key: 'C', name: 'Dashboard / control panel' },
	{ key: 'D', name: 'Direct-manipulation canvas' },
	{ key: 'E', name: 'Swipeable week cards' },
	{ key: 'F', name: 'Scrollytelling reveal' },
	{ key: 'G', name: 'Dial and rings' },
	{ key: 'H', name: 'Command palette' },
	{ key: 'I', name: 'Calendar-native' },
	{ key: 'J', name: 'Merged — calendar + two questions + ⌘K' },
	{ key: 'K', name: 'Control panel, second cut' },
	{ key: 'L', name: 'TanStack Charts spike' },
]

/**
 * The same hard gate `/dev/athletes` carries, for the same reason: this page
 * renders one athlete's training history from their username alone. 404 outside
 * development, in one function so nothing can drift.
 */
function requireDevelopment() {
	if (process.env.NODE_ENV !== 'development') {
		throw new Response('Not found', { status: 404 })
	}
}

/** The seeded athletes from `prisma/seed-athlete-levels.ts`. */
const SEEDED = [
	{ username: 'bea', label: 'bea · beginner 16 km/wk' },
	{ username: 'rune', label: 'rune · real replay 19 km/wk' },
	{ username: 'ida', label: 'ida · intermediate 50 km/wk' },
	{ username: 'arne', label: 'arne · advanced 88 km/wk' },
	{ username: 'tora', label: 'tora · triathlete, 3 tracks' },
	{ username: 'kody', label: 'kody · epic seed' },
] as const

const FALLBACK_USERNAME = 'ida'

const MS_PER_DAY = 86_400_000
/** How many closed Training Weeks the medians are taken over. */
const MEDIAN_WEEKS = 12

const CARDIO: Discipline[] = ['run', 'bike', 'swim']

function isCardio(discipline: string): discipline is Discipline {
	return (CARDIO as string[]).includes(discipline)
}

function mondayUTC(date: Date): Date {
	const x = new Date(date)
	x.setUTCHours(0, 0, 0, 0)
	const dow = (x.getUTCDay() + 6) % 7
	return new Date(x.getTime() - dow * MS_PER_DAY)
}

function median(xs: number[]): number {
	if (xs.length === 0) return 0
	const s = [...xs].sort((a, b) => a - b)
	const mid = Math.floor(s.length / 2)
	return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/**
 * Median sessions and km per **closed** Training Week — the same measurement
 * `prisma/seed-athlete-levels.ts` prints in its summary table (and `/dev/athletes`
 * repeats), narrowed to the last {@link MEDIAN_WEEKS} weeks. The week in progress
 * is excluded: on a Tuesday it would drag both medians down.
 */
async function readMedians(userId: string, now: Date) {
	const since = new Date(
		mondayUTC(now).getTime() - MEDIAN_WEEKS * 7 * MS_PER_DAY,
	)
	const sessions = await prisma.workoutSession.findMany({
		where: { userId, scheduledAt: { gte: since }, status: 'completed' },
		select: {
			scheduledAt: true,
			recording: { select: { distanceM: true } },
		},
	})
	const byWeek = new Map<string, { n: number; km: number }>()
	for (const session of sessions) {
		const key = mondayUTC(session.scheduledAt).toISOString().slice(0, 10)
		const week = byWeek.get(key) ?? { n: 0, km: 0 }
		week.n += 1
		week.km += (session.recording?.distanceM ?? 0) / 1000
		byWeek.set(key, week)
	}
	const currentWeekKey = mondayUTC(now).toISOString().slice(0, 10)
	const weeks = [...byWeek.entries()]
		.filter(([key]) => key !== currentWeekKey)
		.map(([, value]) => value)

	return {
		medianSessionsPerWeek: Math.round(median(weeks.map((w) => w.n)) * 10) / 10,
		medianWeeklyKm: Math.round(median(weeks.map((w) => w.km)) * 10) / 10,
		closedWeeksWithTraining: weeks.length,
	}
}

type DisciplineProfileRow = {
	discipline: string
	maxHr: number | null
	lthr: number | null
	ftp: number | null
	runPowerThresholdW: number | null
	thresholdPaceSecPerKm: number | null
	cssSecPer100m: number | null
	zoneSystem: string | null
}

function mmss(totalSeconds: number): string {
	const minutes = Math.floor(totalSeconds / 60)
	const seconds = Math.round(totalSeconds % 60)
	return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Which unit this discipline's intensity can honestly be stated in, and every
 * applicable threshold with the unset ones kept visible.
 *
 * The order is least-derived first: a measured threshold pace or power beats HR,
 * HR beats a bare zone label, and an athlete with none of it gets RPE. Several
 * seeded athletes have thresholds deliberately unset (arne has no LTHR and no
 * max HR), and the journey must degrade rather than invent one (ADR 0008).
 */
function readThresholds(
	discipline: Discipline,
	profile: DisciplineProfileRow | undefined,
): { basis: IntensityBasis; thresholds: ThresholdReading[] } {
	const rows: ThresholdReading[] = []
	const push = (label: string, value: string | null) =>
		rows.push({ label, value })

	if (discipline === 'run') {
		push(
			'Threshold pace',
			profile?.thresholdPaceSecPerKm != null
				? formatPace(profile.thresholdPaceSecPerKm)
				: null,
		)
		push(
			'Critical power',
			profile?.runPowerThresholdW != null
				? `${profile.runPowerThresholdW} W`
				: null,
		)
	} else if (discipline === 'bike') {
		push('FTP', profile?.ftp != null ? `${profile.ftp} W` : null)
	} else {
		push(
			'CSS',
			profile?.cssSecPer100m != null
				? `${mmss(profile.cssSecPer100m)} /100 m`
				: null,
		)
	}
	push('LTHR', profile?.lthr != null ? `${profile.lthr} bpm` : null)
	push('Max HR', profile?.maxHr != null ? `${profile.maxHr} bpm` : null)

	const primary = rows[0]?.value != null
	const secondary = discipline === 'run' && rows[1]?.value != null
	const basis: IntensityBasis = primary
		? discipline === 'bike'
			? 'power'
			: 'pace'
		: secondary
			? 'power'
			: profile?.lthr != null || profile?.maxHr != null
				? 'hr'
				: profile?.zoneSystem
					? 'zone'
					: 'rpe'

	return {
		basis,
		thresholds: rows,
	}
}

/** `[1,3,6]` (0=Sun…6=Sat) → `['Mon','Wed','Sat']`, in weekday order. */
function parseTrainableDays(json: string | null): Day[] {
	if (!json) return []
	let raw: unknown
	try {
		raw = JSON.parse(json)
	} catch {
		return []
	}
	if (!Array.isArray(raw)) return []
	const days = raw
		.filter((n): n is number => typeof n === 'number')
		// Prisma stores 0=Sun…6=Sat; `DAYS` starts on Monday.
		.map((n) => DAYS[(n + 6) % 7])
		.filter((day): day is Day => day != null)
	return DAYS.filter((day) => days.includes(day))
}

function weeksBetween(fromMonday: string, isoDate: string): number {
	const from = Date.parse(`${fromMonday}T00:00:00Z`)
	const to = Date.parse(`${isoDate}T00:00:00Z`)
	if (Number.isNaN(from) || Number.isNaN(to)) return 18
	return Math.max(6, Math.min(30, Math.ceil((to - from) / (7 * MS_PER_DAY))))
}

export async function loader({ request }: Route.LoaderArgs) {
	requireDevelopment()

	const url = new URL(request.url)
	const requested = url.searchParams.get('athlete')
	const loggedInId = await getUserId(request)

	// ?athlete wins; then whoever is logged in; then `ida`, so the journey is
	// never empty for a visitor who never logged in.
	const candidates = [
		requested && SEEDED.some((a) => a.username === requested)
			? { username: requested }
			: null,
		loggedInId ? { id: loggedInId } : null,
		{ username: FALLBACK_USERNAME },
	].filter((candidate): candidate is { username: string } | { id: string } =>
		Boolean(candidate),
	)

	let user: { id: string; username: string; name: string | null } | null = null
	let anchors: Awaited<ReturnType<typeof readAnchorContext>> | null = null
	for (const where of candidates) {
		const found = await prisma.user.findUnique({
			where,
			select: { id: true, username: true, name: true },
		})
		if (!found) continue
		const context = await readAnchorContext(found.id)
		const hasHistory = context.volumes.some(
			(volume) => volume.sessions > 0 && isCardio(volume.discipline),
		)
		user = found
		anchors = context
		if (hasHistory) break
	}

	if (!user || !anchors) {
		throw new Response(
			'No seeded athlete found — run `npx tsx prisma/seed-athlete-levels.ts`',
			{ status: 404 },
		)
	}

	const profile = await prisma.athleteProfile.findUnique({
		where: { userId: user.id },
		select: {
			trainableWeekdays: true,
			weeklyCapacityHours: true,
			timezone: true,
			disciplineProfiles: {
				select: {
					discipline: true,
					maxHr: true,
					lthr: true,
					ftp: true,
					runPowerThresholdW: true,
					thresholdPaceSecPerKm: true,
					cssSecPer100m: true,
					zoneSystem: true,
				},
			},
		},
	})

	// One track per cardio discipline the athlete actually trained, busiest
	// first, each one carrying the Volume Currency and Season Anchor the *real*
	// proposal code derives from the four-week window.
	const tracks: PrototypeTrack[] = anchors.volumes
		.filter((volume) => isCardio(volume.discipline) && volume.sessions > 0)
		.sort((a, b) => b.sessions - a.sessions)
		.flatMap((volume): PrototypeTrack[] => {
			const proposal = proposeTrack(volume)
			const currency = proposal.currency
			if (currency == null || currency === 'sets') return []
			const prefill = proposal.anchors[currency]
			if (!prefill) return []
			const discipline = volume.discipline as Discipline
			const { basis, thresholds } = readThresholds(
				discipline,
				profile?.disciplineProfiles.find(
					(row) => row.discipline === discipline,
				),
			)
			return [
				{
					discipline,
					currency: currency as Currency,
					proposedAnchor: prefill.value,
					anchorSource: `Your last ${prefill.derivation.windowWeeks} weeks — ${
						Math.round(prefill.derivation.total * 10) / 10
					} ${currency === 'hours' ? 'h' : currency} over ${
						prefill.derivation.weeksTrained
					} week${prefill.derivation.weeksTrained === 1 ? '' : 's'} trained`,
					derivation: {
						windowWeeks: prefill.derivation.windowWeeks,
						weeksTrained: prefill.derivation.weeksTrained,
						total: Math.round(prefill.derivation.total * 10) / 10,
						sessions: volume.sessions,
					},
					intensityBasis: basis,
					thresholds,
					unsetThresholds: thresholds
						.filter((row) => row.value == null)
						.map((row) => row.label),
				},
			]
		})

	if (tracks.length === 0) {
		throw new Response(
			`${user.username} has no cardio history in the last 4 weeks — try ?athlete=ida`,
			{ status: 404 },
		)
	}

	const now = new Date()
	const medians = await readMedians(user.id, now)

	// The season starts the Monday after the current Training Week, so week 1 is
	// a whole week the athlete has not started living yet.
	const timezone = profile?.timezone ?? anchors.timezone
	const currentMonday = weekMonday(now, timezone)
	const seasonStartMonday = new Date(
		Date.parse(`${currentMonday}T00:00:00Z`) + 7 * MS_PER_DAY,
	)
		.toISOString()
		.slice(0, 10)

	// The athlete's own future Target Event. Each seeded athlete has exactly one,
	// and it carries no Plan Outline yet — which is precisely the journey's premise.
	const eventRows = await prisma.event.findMany({
		where: { athleteId: user.id, startDate: { gte: now } },
		orderBy: { startDate: 'asc' },
		select: {
			id: true,
			name: true,
			startDate: true,
			priority: true,
			disciplines: true,
			planOutline: { select: { id: true } },
		},
	})

	const events: PrototypeEvent[] = eventRows.map((row) => {
		let disciplines: unknown = []
		try {
			disciplines = JSON.parse(row.disciplines)
		} catch {
			disciplines = []
		}
		const named = Array.isArray(disciplines)
			? disciplines.filter((d): d is Discipline => isCardio(String(d)))
			: []
		const date = row.startDate.toISOString().slice(0, 10)
		return {
			id: row.id,
			name: row.name,
			date,
			discipline: named[0] ?? tracks[0]!.discipline,
			priority: (row.priority === 'A' || row.priority === 'B'
				? row.priority
				: 'C') as PrototypeEvent['priority'],
			weeksAway: weeksBetween(seasonStartMonday, date),
		}
	})

	// No future event seeded: a placeholder 18 weeks out keeps the journey whole
	// rather than dead-ending on an empty state the prototype is not about.
	const event: PrototypeEvent = events[0] ?? {
		id: 'no-event',
		name: 'No event yet — 18 weeks out',
		date: new Date(
			Date.parse(`${seasonStartMonday}T00:00:00Z`) + 18 * 7 * MS_PER_DAY,
		)
			.toISOString()
			.slice(0, 10),
		discipline: tracks[0]!.discipline,
		priority: 'A',
		weeksAway: 18,
	}

	const athlete: PrototypeAthlete = {
		username: user.username,
		name: user.name ?? user.username,
		tracks,
		trainableDays: parseTrainableDays(profile?.trainableWeekdays ?? null),
		weeklyCapacityHours: profile?.weeklyCapacityHours ?? null,
		...medians,
	}

	return {
		athlete,
		event,
		events: events.length > 0 ? events : [event],
		seasonStartMonday: seasonStartMonday || SEASON_START_MONDAY,
		seasonWeeks: event.weeksAway,
		athletes: SEEDED.map((seeded) => ({
			username: seeded.username,
			label: seeded.label,
		})),
	}
}

export default function PlanPrototypeRoute({
	loaderData,
}: Route.ComponentProps) {
	const [searchParams] = useSearchParams()
	const requested = searchParams.get('variant')?.toUpperCase() ?? 'A'
	const variant = VARIANTS.some((v) => v.key === requested) ? requested : 'A'
	const { athlete, event, events, seasonStartMonday, seasonWeeks, athletes } =
		loaderData

	// Keying on the athlete remounts the variant when the athlete changes, so a
	// variant's own `useState` (a picked event, a dragged anchor) cannot survive
	// into a different athlete's numbers.
	const props = { athlete, event, events, seasonStartMonday, seasonWeeks }

	return (
		<main className="bg-background min-h-screen pb-24">
			{variant === 'A' ? <VariantA key={athlete.username} {...props} /> : null}
			{variant === 'B' ? <VariantB key={athlete.username} {...props} /> : null}
			{variant === 'C' ? <VariantC key={athlete.username} {...props} /> : null}
			{variant === 'D' ? <VariantD key={athlete.username} {...props} /> : null}
			{variant === 'E' ? <VariantE key={athlete.username} {...props} /> : null}
			{variant === 'F' ? <VariantF key={athlete.username} {...props} /> : null}
			{variant === 'G' ? <VariantG key={athlete.username} {...props} /> : null}
			{variant === 'H' ? <VariantH key={athlete.username} {...props} /> : null}
			{variant === 'I' ? <VariantI key={athlete.username} {...props} /> : null}
			{variant === 'J' ? <VariantJ key={athlete.username} {...props} /> : null}
			{variant === 'K' ? <VariantK key={athlete.username} {...props} /> : null}
			{variant === 'L' ? <VariantL key={athlete.username} {...props} /> : null}
			<PrototypeSwitcher
				variants={VARIANTS}
				current={variant}
				athletes={athletes}
				currentAthlete={athlete.username}
			/>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
