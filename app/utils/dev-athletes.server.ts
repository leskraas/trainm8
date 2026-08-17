/**
 * DEV ONLY — the seeded-athlete switcher's server half.
 *
 * A convenience wrapper over the *real* login: the seeded logins from
 * `prisma/seed-athlete-levels.ts` all use `password === username`, so the
 * switcher calls `login()` with those known credentials rather than minting a
 * session behind auth's back. Nothing here is a new auth path.
 *
 * **Why the hard gate below:** this is still a one-click login bypass — anyone
 * who can reach it is anyone whose password you already know. Callers 404
 * unless `NODE_ENV === 'development'`, so it does not exist in production or in
 * test builds, and the root loader never even queries for it there.
 */
import { prisma } from './db.server.ts'

/**
 * The production gate. Kept as one function so every caller — the root loader
 * and the switch action — cannot drift apart, and so a reader sees exactly one
 * condition to trust.
 */
export function requireDevelopment() {
	if (process.env.NODE_ENV !== 'development') {
		throw new Response('Not found', { status: 404 })
	}
}

/** Login → password. The seed sets `password === username`; kody predates it. */
export const DEV_CREDENTIALS = [
	{ username: 'bea', password: 'bea', level: 'beginner' },
	{ username: 'rune', password: 'rune', level: 'real' },
	{ username: 'ida', password: 'ida', level: 'intermediate' },
	{ username: 'arne', password: 'arne', level: 'advanced' },
	{ username: 'tora', password: 'tora', level: 'triathlete' },
	{ username: 'kody', password: 'kodylovesyou', level: 'epic seed' },
] as const

export function findDevCredentials(username: string) {
	return DEV_CREDENTIALS.find((c) => c.username === username)
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKS = 52

function mondayOf(d: Date): Date {
	const x = new Date(d)
	x.setUTCHours(0, 0, 0, 0)
	const dow = (x.getUTCDay() + 6) % 7
	return new Date(x.getTime() - dow * DAY_MS)
}

function median(xs: number[]): number {
	if (xs.length === 0) return 0
	const s = [...xs].sort((a, b) => a - b)
	const mid = Math.floor(s.length / 2)
	return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export type DevAthlete = {
	username: string
	level: string
	/** False when the athlete-level seed hasn't been run (or was wiped). */
	seeded: boolean
	kmPerWeek: number
	sessionsPerWeek: number
}

/**
 * Seeded history barely changes, but this query hangs off the *root* loader, so
 * it would otherwise cost ~16ms on every single dev page load. Cached in module
 * scope with a short TTL: fast in the common case, and self-healing within a
 * minute of a reseed rather than needing a server restart.
 */
const CACHE_TTL_MS = 60_000
let cache: { at: number; athletes: DevAthlete[] } | null = null

/**
 * The same measurement `prisma/seed-athlete-levels.ts` prints when it seeds —
 * medians over *closed* Training Weeks in the last 52, so the partial week in
 * progress never drags the figures down. Queried live; never hardcoded.
 *
 * Two queries total for all athletes (users, then their sessions in one
 * `IN` scan) — this runs on every dev page load, so no per-athlete fan-out.
 */
export async function getDevAthletes(): Promise<DevAthlete[]> {
	requireDevelopment()

	if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.athletes

	const now = new Date()
	const since = new Date(mondayOf(now).getTime() - WEEKS * 7 * DAY_MS)
	const currentWeekKey = mondayOf(now).toISOString().slice(0, 10)

	const users = await prisma.user.findMany({
		where: { username: { in: DEV_CREDENTIALS.map((c) => c.username) } },
		select: { id: true, username: true },
	})
	const sessions = users.length
		? await prisma.workoutSession.findMany({
				where: {
					userId: { in: users.map((u) => u.id) },
					scheduledAt: { gte: since },
					status: 'completed',
				},
				select: {
					userId: true,
					scheduledAt: true,
					recording: { select: { distanceM: true } },
				},
			})
		: []

	// userId → week Monday → { n, km }
	const byUser = new Map<string, Map<string, { n: number; km: number }>>()
	for (const s of sessions) {
		const key = mondayOf(s.scheduledAt).toISOString().slice(0, 10)
		if (key === currentWeekKey) continue
		let weeks = byUser.get(s.userId)
		if (!weeks) byUser.set(s.userId, (weeks = new Map()))
		const week = weeks.get(key) ?? { n: 0, km: 0 }
		week.n += 1
		week.km += (s.recording?.distanceM ?? 0) / 1000
		weeks.set(key, week)
	}

	const athletes = DEV_CREDENTIALS.map(({ username, level }) => {
		const user = users.find((u) => u.username === username)
		const weeks = [...(byUser.get(user?.id ?? '')?.values() ?? [])]
		return {
			username,
			level,
			seeded: Boolean(user),
			kmPerWeek: median(weeks.map((w) => w.km)),
			sessionsPerWeek: median(weeks.map((w) => w.n)),
		}
	})
	cache = { at: Date.now(), athletes }
	return athletes
}
