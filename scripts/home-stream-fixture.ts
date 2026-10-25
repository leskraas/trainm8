/**
 * The 364-row season #503 is about, built on a freshly seeded local database
 * (`npx prisma db seed`), so the numbers in ADR 0078's "As measured (#503,
 * 2026-10)" can be taken again by anyone.
 *
 * The stream draws whole weeks from the first Monday inside the query's reach
 * (182 days behind today), so kody's plan is stretched, and his race moved to
 * the Sunday that closes it, until that Monday plus 51 weeks: **52 weeks,
 * every day a row — 364 day rows** (ADR 0086 §2). With the seed's plan start
 * that is a 34- or 35-week plan, depending on the weekday it is run. Behind
 * today every Tuesday, Thursday, Saturday and Sunday without a session gets a
 * completed one; ahead, the same four days get a scheduled one, to race week.
 * That is a realistic four-a-week athlete across the whole span, rather than
 * an empty calendar that only measures the cost of `fri`.
 *
 * **Local only.** Nothing seeds in production
 * (`docs/agents/production-seed-data.md`), and this refuses to run there.
 *
 *   npx tsx scripts/home-stream-fixture.ts
 */
import { addDays, localDate, weekMonday } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'

if (process.env.NODE_ENV === 'production') {
	throw new Error('home-stream-fixture is a local measuring fixture.')
}

/** Tuesday, Thursday, Saturday, Sunday, as days after Monday. */
const TRAINING_DAYS = [1, 3, 5, 6]
/** Every phase but the last; the last takes what is left of the 52 weeks. */
const LEADING_PHASE_WEEKS = [12, 12, 6]
const STREAM_WEEKS = 52

const user = await prisma.user.findUniqueOrThrow({
	where: { username: 'kody' },
	select: { id: true, athleteProfile: { select: { timezone: true } } },
})
const timezone = user.athleteProfile?.timezone ?? 'UTC'
const outline = await prisma.planOutline.findFirstOrThrow({
	where: { athleteId: user.id },
	select: {
		id: true,
		startWeekKey: true,
		eventId: true,
		phases: { select: { id: true }, orderBy: { orderIndex: 'asc' } },
	},
})

const now = new Date()
const todayKey = localDate(now, timezone)
const reachKey = addDays(todayKey, -182)
const reachMonday = weekMonday(new Date(`${reachKey}T12:00:00Z`), timezone)
// The week the reach starts inside is not drawn unless the reach is its Monday.
const firstMonday =
	reachMonday === reachKey ? reachMonday : addDays(reachMonday, 7)
const lastMonday = addDays(firstMonday, 7 * (STREAM_WEEKS - 1))
const planWeeks =
	Math.round(
		(Date.parse(`${lastMonday}T00:00:00Z`) -
			Date.parse(`${outline.startWeekKey}T00:00:00Z`)) /
			(7 * 86_400_000),
	) + 1
const leading = LEADING_PHASE_WEEKS.slice(0, outline.phases.length - 1)
for (const [index, phase] of outline.phases.entries()) {
	const last = index === outline.phases.length - 1
	await prisma.planOutlinePhase.update({
		where: { id: phase.id },
		data: {
			weeks: last
				? planWeeks - leading.reduce((a, b) => a + b, 0)
				: (leading[index] ?? 1),
		},
	})
}
const raceDay = addDays(lastMonday, 6)
if (outline.eventId) {
	await prisma.event.update({
		where: { id: outline.eventId },
		data: { startDate: new Date(`${raceDay}T09:00:00Z`) },
	})
}

const workouts = await prisma.workout.findMany({
	where: { ownerId: user.id, discipline: { in: ['run', 'strength'] } },
	select: { id: true },
	orderBy: { createdAt: 'asc' },
	take: 8,
})
const taken = new Set(
	(
		await prisma.workoutSession.findMany({
			where: { userId: user.id },
			select: { scheduledAt: true },
		})
	).map((s) => localDate(s.scheduledAt, timezone)),
)

let made = 0
for (let monday = firstMonday; monday <= lastMonday; ) {
	for (const offset of TRAINING_DAYS) {
		const day = addDays(monday, offset)
		if (day === todayKey || taken.has(day)) continue
		const past = day < todayKey
		const workout = workouts[made % workouts.length]
		await prisma.workoutSession.create({
			data: {
				userId: user.id,
				workoutId: workout?.id ?? null,
				scheduledAt: new Date(`${day}T07:00:00Z`),
				status: past ? 'completed' : 'scheduled',
				tssValue: past ? 40 + ((made * 17) % 60) : null,
				plannedTssValue: 45 + ((made * 13) % 50),
				plannedTssConfidence: 'full',
				source: 'authored',
			},
		})
		made++
	}
	monday = addDays(monday, 7)
}

const weeks =
	Math.round(
		(Date.parse(`${lastMonday}T00:00:00Z`) -
			Date.parse(`${firstMonday}T00:00:00Z`)) /
			(7 * 86_400_000),
	) + 1
console.log(
	`kody: ${made} sessions added, a ${planWeeks}-week plan, ${firstMonday} → ${raceDay}, ${weeks} weeks, ${weeks * 7} day rows`,
)
await prisma.$disconnect()
