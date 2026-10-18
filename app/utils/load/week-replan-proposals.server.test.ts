import { expect, test } from 'vitest'
import { addDays, weekMonday } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { deriveLedgerStatus } from '#app/utils/training.ts'
import { updateWorkoutSession } from '#app/utils/workout.server.ts'
import { createUser, createPassword } from '#tests/db-utils.ts'
import { createPlanOutline } from '../plan-outline/authoring.server.ts'
import { getWeekVolumes } from '../plan-outline/week-volumes.server.ts'
import { recomputePlannedTssForSession } from './planned-tss.server.ts'
import {
	answerProposal,
	easeWeek,
	releaseSession,
} from './week-replan-answers.server.ts'
import { type ProposalDraft } from './week-replan-proposal.ts'
import {
	applyDueProposals,
	recordProposals,
} from './week-replan-proposals.server.ts'
import { applyWeekReplanForUser } from './week-replan.server.ts'

// ── fixtures ──────────────────────────────────────────────────────────────
//
// Seam 1 for the Week Replan as proposals (#505, ADR 0080): a closed week goes
// in, proposals come out, and Ok, Nei takk and silence each leave the sessions
// in a state these tests read back from the database — external behaviour only.
//
// The clock is this week's Wednesday noon UTC, for the reason the ADR 0025
// tests give: the TSB trust gate counts history against the real clock. So the
// closed week is last week, the coming week is this one, and of this week only
// Thursday to Sunday are still ahead.

const NOW = new Date(
	`${addDays(weekMonday(new Date(), 'UTC'), 2)}T12:00:00.000Z`,
)
const CURRENT_MONDAY = weekMonday(NOW, 'UTC')
const CLOSED_MONDAY = addDays(CURRENT_MONDAY, -7)
const THURSDAY = addDays(CURRENT_MONDAY, 3)
const FRIDAY = addDays(CURRENT_MONDAY, 4)
const SATURDAY = addDays(CURRENT_MONDAY, 5)

const dayMs = 24 * 60 * 60 * 1000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const at = (day: string, time = '08:00') => new Date(`${day}T${time}:00.000Z`)

async function createBiker({ tsb = -12 }: { tsb?: number } = {}) {
	const userData = createUser()
	const user = await prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: 'UTC',
					// Spør meg først (ADR 0080): the proposals wait (#583).
					autopilot: false,
					disciplineProfiles: {
						create: [
							{
								discipline: 'bike',
								ftp: 250,
								zoneSystem: 'coggan-power-7',
								preferCogganTss: true,
							},
						],
					},
				},
			},
		},
	})
	// 60 days of history (past the trust gate), and today's TSB.
	for (const [date, snapshotTsb] of [
		[iso(new Date(NOW.getTime() - 60 * dayMs)), 0],
		[iso(NOW), tsb],
	] as const) {
		await prisma.loadSnapshot.create({
			data: {
				athleteId: user.id,
				date,
				tssTotal: 0,
				tssByDiscipline: '{}',
				ctl: 40,
				atl: 40 - snapshotTsb,
				tsb: snapshotTsb,
			},
		})
	}
	return user
}

/** A done session in the closed week: planned 100, actual 125 → 25 % over. */
async function createDoneSession(
	userId: string,
	{ plannedTss = 100, actualTss = 125 } = {},
) {
	await prisma.workoutSession.create({
		data: {
			userId,
			scheduledAt: at(addDays(CLOSED_MONDAY, 2)),
			status: 'completed',
			tssValue: actualTss,
			plannedTssValue: plannedTss,
		},
	})
}

/** A quantified bike session; by default the machine's, this Thursday. */
async function createSession(
	userId: string,
	{
		title = 'Tempo ride',
		durationSec = 3600,
		source = 'generated',
		adoptedAt = null as Date | null,
		releasedAt = null as Date | null,
		status = 'scheduled',
		scheduledAt = at(THURSDAY),
	} = {},
) {
	const workout = await prisma.workout.create({
		data: {
			title,
			discipline: 'bike',
			intent: 'tempo',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'bike',
									durationSec,
									intensity: JSON.stringify({
										kind: 'powerPct',
										minPct: 85,
										maxPct: 95,
									}),
								},
							],
						},
					},
				],
			},
		},
		select: { id: true },
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt,
			status,
			source,
			adoptedAt,
			releasedAt,
		},
		select: { id: true },
	})
	await recomputePlannedTssForSession(userId, session.id)
	return session
}

async function readSession(sessionId: string) {
	const session = await prisma.workoutSession.findUniqueOrThrow({
		where: { id: sessionId },
		select: {
			status: true,
			scheduledAt: true,
			source: true,
			adoptedAt: true,
			releasedAt: true,
			replanReason: true,
			plannedTssValue: true,
			workout: {
				select: {
					title: true,
					blocks: { select: { steps: { select: { durationSec: true } } } },
				},
			},
		},
	})
	return {
		...session,
		durationSec: session.workout?.blocks[0]?.steps[0]?.durationSec ?? null,
	}
}

async function readProposals(userId: string) {
	const rows = await prisma.weekReplanProposal.findMany({
		where: { athleteId: userId },
		orderBy: { createdAt: 'asc' },
		select: {
			id: true,
			kind: true,
			payload: true,
			reason: true,
			loadDirection: true,
			scope: true,
			answer: true,
			answeredAt: true,
			appliedAt: true,
			targetSessionId: true,
			targetWeekKey: true,
		},
	})
	return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) }))
}

async function proposalFor(userId: string, sessionId: string) {
	const found = (await readProposals(userId)).find(
		(p) => p.targetSessionId === sessionId,
	)
	expect(found).toBeDefined()
	return found!
}

async function sessionsOn(userId: string, day: string) {
	return prisma.workoutSession.findMany({
		where: {
			userId,
			scheduledAt: { gte: at(day, '00:00'), lt: at(addDays(day, 1), '00:00') },
		},
		select: { id: true, source: true, workout: { select: { title: true } } },
	})
}

// ── which proposals come out ─────────────────────────────────────────────────

test('an overloaded week proposes to soften every adjustable session of the coming week, the athlete’s own included and named as theirs — and changes nothing yet', async () => {
	const user = await createBiker({ tsb: -12 })
	await createDoneSession(user.id) // 25 % over → scale 0.8
	const machine = await createSession(user.id)
	const authored = await createSession(user.id, {
		source: 'authored',
		scheduledAt: at(FRIDAY),
	})
	const adopted = await createSession(user.id, {
		adoptedAt: new Date(NOW.getTime() - dayMs),
		scheduledAt: at(SATURDAY),
	})

	await applyWeekReplanForUser(user.id, NOW)

	const replan = await prisma.weekReplan.findUniqueOrThrow({
		where: {
			athleteId_weekKey: { athleteId: user.id, weekKey: CLOSED_MONDAY },
		},
		select: { outcome: true, appliedScale: true },
	})
	expect(replan).toEqual({ outcome: 'proposed', appliedScale: null })

	const proposals = await readProposals(user.id)
	expect(proposals).toHaveLength(3)
	for (const p of proposals) {
		expect(p).toMatchObject({
			kind: 'scale',
			payload: { kind: 'scale', factor: 0.8 },
			loadDirection: 'keeps-or-reduces',
			scope: null,
			answer: 'pending',
			appliedAt: null,
			targetWeekKey: CURRENT_MONDAY,
		})
	}
	expect((await proposalFor(user.id, machine.id)).reason).toBe(
		'Forrige uke ble 25 % tyngre enn planlagt, og formen er −12. Vi foreslår å gjøre denne økta ca. 20 % kortere.',
	)
	for (const own of [authored, adopted]) {
		expect((await proposalFor(user.id, own.id)).reason).toContain(
			'Dette er din økt, så den endres bare hvis du sier ja.',
		)
	}

	// Proposing is not applying: every prescription is as it was.
	for (const s of [machine, authored, adopted]) {
		expect((await readSession(s.id)).durationSec).toBe(3600)
		expect((await readSession(s.id)).replanReason).toBeNull()
	}
})

test('a week with nothing to change gets an explicit keep with a plain Norwegian reason', async () => {
	const user = await createBiker()
	await createDoneSession(user.id, { plannedTss: 100, actualTss: 100 })
	const session = await createSession(user.id)

	await applyWeekReplanForUser(user.id, NOW)

	expect(await readProposals(user.id)).toEqual([
		expect.objectContaining({
			kind: 'keep',
			payload: { kind: 'keep' },
			targetSessionId: null,
			targetWeekKey: CURRENT_MONDAY,
			loadDirection: 'keeps-or-reduces',
			reason: 'Forrige uke gikk som planlagt. Denne uka står som den er.',
		}),
	])
	const replan = await prisma.weekReplan.findFirstOrThrow({
		where: { athleteId: user.id },
	})
	expect(replan.outcome).toBe('no-change')
	expect((await readSession(session.id)).durationSec).toBe(3600)
})

test('a week too new to judge still gets a keep that says why', async () => {
	const user = await createBiker()

	await applyWeekReplanForUser(user.id, NOW)

	const [keep] = await readProposals(user.id)
	expect(keep).toMatchObject({ kind: 'keep', targetSessionId: null })
	expect(keep!.reason).toMatch(/for lite å gå på/)
	const replan = await prisma.weekReplan.findFirstOrThrow({
		where: { athleteId: user.id },
	})
	expect(replan.outcome).toBe('insufficient-data')
})

test('the proposals are written once per closed week — a second recompute adds none', async () => {
	const user = await createBiker()
	await createDoneSession(user.id)
	await createSession(user.id)

	await applyWeekReplanForUser(user.id, NOW)
	await applyWeekReplanForUser(user.id, NOW)

	expect(await readProposals(user.id)).toHaveLength(1)
	expect(await prisma.weekReplan.count({ where: { athleteId: user.id } })).toBe(
		1,
	)
})

// ── Ok, Nei takk and silence ─────────────────────────────────────────────────

test('silence applies a softening to the machine’s session and leaves the athlete’s own untouched and still answerable', async () => {
	const user = await createBiker()
	await createDoneSession(user.id)
	const machine = await createSession(user.id)
	const authored = await createSession(user.id, {
		source: 'authored',
		scheduledAt: at(FRIDAY),
	})
	await applyWeekReplanForUser(user.id, NOW)
	const before = await readSession(machine.id)

	const result = await applyDueProposals(user.id, NOW)

	const machineAfter = await readSession(machine.id)
	expect(machineAfter.durationSec).toBe(2880) // 0.8 × 60 min
	expect(machineAfter.replanReason).toMatch(/ca\. 20 % kortere/)
	expect(machineAfter.plannedTssValue!).toBeLessThan(before.plannedTssValue!)
	expect(machineAfter.source).toBe('generated')
	expect(machineAfter.adoptedAt).toBeNull()

	const authoredAfter = await readSession(authored.id)
	expect(authoredAfter.durationSec).toBe(3600)
	expect(authoredAfter.replanReason).toBeNull()

	const machineProposal = await proposalFor(user.id, machine.id)
	const authoredProposal = await proposalFor(user.id, authored.id)
	expect(result).toEqual({
		applied: [machineProposal.id],
		held: [authoredProposal.id],
	})
	// Applied by silence: no answer was given.
	expect(machineProposal).toMatchObject({ answer: 'pending', answeredAt: null })
	expect(machineProposal.appliedAt).not.toBeNull()
	expect(authoredProposal).toMatchObject({ answer: 'pending', appliedAt: null })
})

test('Ok applies a proposal to the athlete’s own session; that is the only way it changes', async () => {
	const user = await createBiker()
	await createDoneSession(user.id)
	const authored = await createSession(user.id, { source: 'authored' })
	await applyWeekReplanForUser(user.id, NOW)
	const proposal = await proposalFor(user.id, authored.id)

	await applyDueProposals(user.id, NOW)
	expect((await readSession(authored.id)).durationSec).toBe(3600)

	expect(
		await answerProposal(user.id, proposal.id, 'accepted', undefined, NOW),
	).toEqual({ ok: true, applied: true })

	const after = await readSession(authored.id)
	expect(after.durationSec).toBe(2880)
	// Still theirs: a yes is not a hand-back.
	expect(after.source).toBe('authored')
	expect(await proposalFor(user.id, authored.id)).toMatchObject({
		answer: 'accepted',
		answeredAt: NOW,
		appliedAt: NOW,
	})
})

test('Nei takk applies nothing — not even when silence comes round the next morning', async () => {
	const user = await createBiker()
	await createDoneSession(user.id)
	const machine = await createSession(user.id)
	await applyWeekReplanForUser(user.id, NOW)
	const proposal = await proposalFor(user.id, machine.id)

	expect(
		await answerProposal(user.id, proposal.id, 'declined', undefined, NOW),
	).toEqual({ ok: true, applied: false })
	await applyDueProposals(user.id, NOW)

	expect((await readSession(machine.id)).durationSec).toBe(3600)
	expect(await proposalFor(user.id, machine.id)).toMatchObject({
		answer: 'declined',
		answeredAt: NOW,
		appliedAt: null,
	})
	// An answered proposal cannot be answered again.
	expect(
		await answerProposal(user.id, proposal.id, 'accepted', undefined, NOW),
	).toEqual({ ok: false, reason: 'already-answered' })
})

test('a proposal silence already applied cannot be answered afterwards', async () => {
	const user = await createBiker()
	await createDoneSession(user.id)
	const machine = await createSession(user.id)
	await applyWeekReplanForUser(user.id, NOW)
	await applyDueProposals(user.id, NOW)
	const proposal = await proposalFor(user.id, machine.id)

	expect(
		await answerProposal(user.id, proposal.id, 'declined', undefined, NOW),
	).toEqual({ ok: false, reason: 'already-applied' })
})

test('silence re-checks ownership when it applies: a session the athlete took over since is left alone', async () => {
	const user = await createBiker()
	await createDoneSession(user.id)
	const machine = await createSession(user.id)
	await applyWeekReplanForUser(user.id, NOW)

	// Before the morning, the athlete rewrites the session — adopting it.
	await updateWorkoutSession(user.id, machine.id, {
		title: 'Min tempotur',
		discipline: 'bike',
		intent: 'tempo',
		scheduledAt: at(THURSDAY),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'bike',
						durationSec: 4500,
						intensity: { kind: 'zoneLabel' as const, label: 'Z3' },
					},
				],
			},
		],
	})
	await applyDueProposals(user.id, NOW)

	const after = await readSession(machine.id)
	expect(after.adoptedAt).not.toBeNull()
	expect(after.durationSec).toBe(4500)
	expect(await proposalFor(user.id, machine.id)).toMatchObject({
		answer: 'pending',
		appliedAt: null,
	})
})

test('added load never applies on silence, even on the machine’s own session — only on a yes', async () => {
	const user = await createBiker()
	const machine = await createSession(user.id)
	const catalogued = await createSession(user.id, {
		title: 'Rolig langtur',
		scheduledAt: at(addDays(CURRENT_MONDAY, -14)),
		status: 'completed',
	})
	const workoutId = (await prisma.workoutSession.findUniqueOrThrow({
		where: { id: catalogued.id },
		select: { workoutId: true },
	}))!.workoutId!
	const drafts: ProposalDraft[] = [
		{
			payload: { kind: 'scale', factor: 1.2 },
			targetSessionId: machine.id,
			targetWeekKey: CURRENT_MONDAY,
			reason: 'Runden gikk etter planen, så vi foreslår litt mer.',
		},
		{
			payload: { kind: 'add', workoutId, date: SATURDAY, time: '09:00' },
			targetSessionId: null,
			targetWeekKey: CURRENT_MONDAY,
			reason: 'En ekstra rolig tur lørdag?',
		},
	]
	await prisma.$transaction((tx) => recordProposals(tx, user.id, drafts))
	const stored = await readProposals(user.id)
	const scaleUp = stored.find((p) => p.kind === 'scale')
	const add = stored.find((p) => p.kind === 'add')
	expect(scaleUp!.loadDirection).toBe('adds')
	expect(add!.loadDirection).toBe('adds')

	const silence = await applyDueProposals(user.id, NOW)

	expect(silence.applied).toEqual([])
	expect((await readSession(machine.id)).durationSec).toBe(3600)
	expect(await sessionsOn(user.id, SATURDAY)).toHaveLength(0)

	// The same proposals do apply on an explicit yes.
	await answerProposal(user.id, scaleUp!.id, 'accepted', undefined, NOW)
	await answerProposal(user.id, add!.id, 'accepted', undefined, NOW)
	expect((await readSession(machine.id)).durationSec).toBe(4320)
	const added = await sessionsOn(user.id, SATURDAY)
	expect(added).toHaveLength(1)
	expect(added[0]).toMatchObject({
		source: 'generated',
		workout: { title: 'Rolig langtur' },
	})
})

test('a proposal whose session was deleted applies nothing on Ok — it never widens to the week', async () => {
	const user = await createBiker()
	await createDoneSession(user.id)
	const machine = await createSession(user.id)
	const authored = await createSession(user.id, {
		source: 'authored',
		scheduledAt: at(FRIDAY),
	})
	await applyWeekReplanForUser(user.id, NOW)
	const proposal = await proposalFor(user.id, machine.id)
	await prisma.workoutSession.delete({ where: { id: machine.id } })

	const answered = await answerProposal(
		user.id,
		proposal.id,
		'accepted',
		undefined,
		NOW,
	)

	expect(answered).toEqual({ ok: true, applied: false })
	const after = await readSession(authored.id)
	expect(after.durationSec).toBe(3600)
	expect(after.replanReason).toBeNull()
})

test('silence takes a swap only when both sessions are the machine’s', async () => {
	const user = await createBiker()
	const thursday = await createSession(user.id)
	const friday = await createSession(user.id, { scheduledAt: at(FRIDAY) })
	const theirs = await createSession(user.id, {
		source: 'authored',
		scheduledAt: at(SATURDAY),
	})
	const swap = (targetId: string, otherId: string): ProposalDraft => ({
		payload: { kind: 'swap', otherSessionId: otherId },
		targetSessionId: targetId,
		targetWeekKey: CURRENT_MONDAY,
		reason: 'Terskelen passer bedre etter hviledagen.',
	})
	const machinesOwn = swap(thursday.id, friday.id)
	const withTheirs = swap(friday.id, theirs.id)
	await prisma.$transaction((tx) => recordProposals(tx, user.id, [withTheirs]))

	const held = await applyDueProposals(user.id, NOW)

	expect(held.applied).toEqual([])
	expect((await readSession(friday.id)).scheduledAt).toEqual(at(FRIDAY))
	expect((await readSession(theirs.id)).scheduledAt).toEqual(at(SATURDAY))

	await prisma.$transaction((tx) => recordProposals(tx, user.id, [machinesOwn]))
	const silence = await applyDueProposals(user.id, NOW)

	expect(silence.applied).toHaveLength(1)
	expect((await readSession(thursday.id)).scheduledAt).toEqual(at(FRIDAY))
	expect((await readSession(friday.id)).scheduledAt).toEqual(at(THURSDAY))
	expect((await readSession(theirs.id)).scheduledAt).toEqual(at(SATURDAY))
})

// ── missed sessions ──────────────────────────────────────────────────────────

test('a missed session stays ikke gjort on its day; the key one is offered as a make-up on a free day and the rest are let go', async () => {
	const user = await createBiker()
	// Two missed sessions in the closed week; Tuesday's carries more load.
	const keyMissed = await createSession(user.id, {
		title: 'Terskel',
		durationSec: 4800,
		scheduledAt: at(addDays(CLOSED_MONDAY, 1)),
	})
	const otherMissed = await createSession(user.id, {
		title: 'Rolig',
		durationSec: 1800,
		scheduledAt: at(addDays(CLOSED_MONDAY, 3)),
		status: 'missed',
	})
	// Thursday is taken, so Friday is the first free day still ahead.
	await createSession(user.id, { scheduledAt: at(THURSDAY) })

	await applyWeekReplanForUser(user.id, NOW)

	const move = await proposalFor(user.id, keyMissed.id)
	expect(move).toMatchObject({
		kind: 'move',
		payload: {
			kind: 'move',
			fromDate: addDays(CLOSED_MONDAY, 1),
			toDate: FRIDAY,
			makeUp: true,
		},
		loadDirection: 'adds',
		scope: 'this-time',
	})
	expect(move.reason).toBe(
		'«Terskel» ble ikke gjort tirsdag, og står der som ikke gjort. Vil du ta den igjen fredag? Den dagen er ledig. Det gir mer trening denne uka, så den legges bare inn hvis du sier ja.',
	)
	const letGo = await proposalFor(user.id, otherMissed.id)
	expect(letGo).toMatchObject({ kind: 'keep' })
	expect(letGo.reason).toMatch(/la den gå/)

	// Silence never makes it up: it adds load.
	await applyDueProposals(user.id, NOW)
	expect(await sessionsOn(user.id, FRIDAY)).toHaveLength(0)

	// On Ok, a copy goes on Friday — and the missed session does not move.
	await answerProposal(user.id, move.id, 'accepted', undefined, NOW)
	const makeUp = await sessionsOn(user.id, FRIDAY)
	expect(makeUp).toHaveLength(1)
	expect(makeUp[0]).toMatchObject({
		source: 'generated',
		workout: { title: 'Terskel' },
	})
	expect(makeUp[0]!.id).not.toBe(keyMissed.id)
	for (const missed of [keyMissed, otherMissed]) {
		const after = await readSession(missed.id)
		expect(deriveLedgerStatus(after, NOW)).toBe('missed')
	}
	expect((await readSession(keyMissed.id)).scheduledAt).toEqual(
		at(addDays(CLOSED_MONDAY, 1)),
	)
})

test('after an overloaded week a missed session is let go, never made up', async () => {
	const user = await createBiker({ tsb: -12 })
	await createDoneSession(user.id)
	const missed = await createSession(user.id, {
		scheduledAt: at(addDays(CLOSED_MONDAY, 1)),
	})

	await applyWeekReplanForUser(user.id, NOW)

	const proposal = await proposalFor(user.id, missed.id)
	expect(proposal.kind).toBe('keep')
	expect(proposal.reason).toMatch(/Uka var tung nok likevel/)
})

test('a slot of the machine’s missed two weeks running gets a plain move of its next session, with the reach left to the athlete', async () => {
	const user = await createBiker()
	const slot = { title: 'Terskel' }
	// Friday, missed the week before last and last week.
	await createSession(user.id, {
		...slot,
		scheduledAt: at(addDays(CLOSED_MONDAY, -3)),
	})
	await createSession(user.id, {
		...slot,
		scheduledAt: at(addDays(CLOSED_MONDAY, 4)),
	})
	const next = await createSession(user.id, {
		...slot,
		scheduledAt: at(FRIDAY),
	})

	await applyWeekReplanForUser(user.id, NOW)

	const move = await proposalFor(user.id, next.id)
	// Thursday went to the make-up of last week's miss; Saturday is next free.
	expect(move.payload).toEqual({
		kind: 'move',
		fromDate: FRIDAY,
		toDate: SATURDAY,
		makeUp: false,
	})
	expect(move.scope).toBe('this-time')
	expect(move.loadDirection).toBe('keeps-or-reduces')
	expect(move.reason).toMatch(/to uker på rad/)
	// Nothing moved until it is answered.
	expect((await readSession(next.id)).scheduledAt).toEqual(at(FRIDAY))

	await answerProposal(user.id, move.id, 'accepted', 'from-now-on', NOW)
	expect((await readSession(next.id)).scheduledAt).toEqual(at(SATURDAY))
})

test('a slot missed only once, or the athlete’s own, gets no slot move', async () => {
	const user = await createBiker()
	await createSession(user.id, {
		title: 'Terskel',
		scheduledAt: at(addDays(CLOSED_MONDAY, 4)),
	})
	const machineNext = await createSession(user.id, {
		title: 'Terskel',
		scheduledAt: at(FRIDAY),
	})
	for (const day of [addDays(CLOSED_MONDAY, -2), addDays(CLOSED_MONDAY, 5)]) {
		await createSession(user.id, {
			title: 'Langtur',
			source: 'authored',
			scheduledAt: at(day),
		})
	}
	const ownNext = await createSession(user.id, {
		title: 'Langtur',
		source: 'authored',
		scheduledAt: at(SATURDAY),
	})

	await applyWeekReplanForUser(user.id, NOW)

	const proposals = await readProposals(user.id)
	expect(
		proposals.filter((p) =>
			[machineNext.id, ownNext.id].includes(p.targetSessionId ?? ''),
		),
	).toEqual([])
})

// ── bare denne gangen / fra nå av ─────────────────────────────────────────────

async function setUpMissedTuesday() {
	const user = await createBiker()
	const missed = await createSession(user.id, {
		title: 'Terskel',
		scheduledAt: at(addDays(CLOSED_MONDAY, 1)),
	})
	// The same slot in the weeks ahead: two of the machine's, one the athlete's.
	const nextTuesday = await createSession(user.id, {
		title: 'Terskel',
		scheduledAt: at(addDays(CURRENT_MONDAY, 8)),
	})
	const laterTuesday = await createSession(user.id, {
		title: 'Terskel',
		scheduledAt: at(addDays(CURRENT_MONDAY, 15)),
	})
	const ownTuesday = await createSession(user.id, {
		title: 'Terskel',
		source: 'authored',
		scheduledAt: at(addDays(CURRENT_MONDAY, 22)),
	})
	await applyWeekReplanForUser(user.id, NOW)
	const move = await proposalFor(user.id, missed.id)
	expect(move.payload).toMatchObject({ toDate: THURSDAY })
	return { user, move, nextTuesday, laterTuesday, ownTuesday }
}

test('“bare denne gangen” makes up the missed session once and leaves the weeks ahead alone', async () => {
	const { user, move, nextTuesday, laterTuesday, ownTuesday } =
		await setUpMissedTuesday()

	await answerProposal(user.id, move.id, 'accepted', 'this-time', NOW)

	expect(await sessionsOn(user.id, THURSDAY)).toHaveLength(1)
	expect((await readSession(nextTuesday.id)).scheduledAt).toEqual(
		at(addDays(CURRENT_MONDAY, 8)),
	)
	expect((await readSession(laterTuesday.id)).scheduledAt).toEqual(
		at(addDays(CURRENT_MONDAY, 15)),
	)
	expect((await readSession(ownTuesday.id)).scheduledAt).toEqual(
		at(addDays(CURRENT_MONDAY, 22)),
	)
	expect((await proposalFor(user.id, move.targetSessionId!)).scope).toBe(
		'this-time',
	)
})

test('a make-up takes no “fra nå av”: it is a copy, not a reschedule', async () => {
	const { user, move, nextTuesday } = await setUpMissedTuesday()

	expect(
		await answerProposal(user.id, move.id, 'accepted', 'from-now-on', NOW),
	).toEqual({ ok: false, reason: 'scope-not-for-a-make-up' })
	expect(await sessionsOn(user.id, THURSDAY)).toHaveLength(0)
	expect((await readSession(nextTuesday.id)).scheduledAt).toEqual(
		at(addDays(CURRENT_MONDAY, 8)),
	)
	expect((await proposalFor(user.id, move.targetSessionId!)).answer).toBe(
		'pending',
	)
})

test('“fra nå av” also moves the machine’s later sessions of that slot to the new weekday, never the athlete’s', async () => {
	const user = await createBiker()
	const slot = { title: 'Terskel' }
	const thisFriday = await createSession(user.id, {
		...slot,
		scheduledAt: at(FRIDAY),
	})
	const nextFriday = await createSession(user.id, {
		...slot,
		scheduledAt: at(addDays(FRIDAY, 7)),
	})
	const laterFriday = await createSession(user.id, {
		...slot,
		scheduledAt: at(addDays(FRIDAY, 14)),
	})
	const ownFriday = await createSession(user.id, {
		...slot,
		source: 'authored',
		scheduledAt: at(addDays(FRIDAY, 21)),
	})
	await prisma.$transaction((tx) =>
		recordProposals(tx, user.id, [
			{
				payload: {
					kind: 'move',
					fromDate: FRIDAY,
					toDate: SATURDAY,
					makeUp: false,
				},
				targetSessionId: thisFriday.id,
				targetWeekKey: CURRENT_MONDAY,
				reason: 'Flytt terskelen til lørdag?',
			},
		]),
	)
	const move = await proposalFor(user.id, thisFriday.id)

	await answerProposal(user.id, move.id, 'accepted', 'from-now-on', NOW)

	// Friday → Saturday, one day on for each, same time of day.
	expect((await readSession(thisFriday.id)).scheduledAt).toEqual(at(SATURDAY))
	expect((await readSession(nextFriday.id)).scheduledAt).toEqual(
		at(addDays(SATURDAY, 7)),
	)
	expect((await readSession(laterFriday.id)).scheduledAt).toEqual(
		at(addDays(SATURDAY, 14)),
	)
	expect((await readSession(ownFriday.id)).scheduledAt).toEqual(
		at(addDays(FRIDAY, 21)),
	)
	expect((await proposalFor(user.id, thisFriday.id)).scope).toBe('from-now-on')
})

test('“fra nå av” across a week boundary moves each later session the same days on, into the next week', async () => {
	const user = await createBiker()
	const sunday = addDays(CURRENT_MONDAY, 6)
	const nextMonday = addDays(CURRENT_MONDAY, 7)
	const thisSunday = await createSession(user.id, {
		title: 'Langtur',
		scheduledAt: at(sunday),
	})
	const laterSunday = await createSession(user.id, {
		title: 'Langtur',
		scheduledAt: at(addDays(sunday, 7)),
	})
	await prisma.$transaction((tx) =>
		recordProposals(tx, user.id, [
			{
				payload: {
					kind: 'move',
					fromDate: sunday,
					toDate: nextMonday,
					makeUp: false,
				},
				targetSessionId: thisSunday.id,
				targetWeekKey: CURRENT_MONDAY,
				reason: 'Flytt langturen til mandag?',
			},
		]),
	)
	const move = await proposalFor(user.id, thisSunday.id)

	await answerProposal(user.id, move.id, 'accepted', 'from-now-on', NOW)

	// One day on, not six back: Sunday → the Monday after, each of them.
	expect((await readSession(thisSunday.id)).scheduledAt).toEqual(at(nextMonday))
	expect((await readSession(laterSunday.id)).scheduledAt).toEqual(
		at(addDays(nextMonday, 7)),
	)
})

test('a scope only belongs to a move', async () => {
	const user = await createBiker()
	await createDoneSession(user.id)
	const machine = await createSession(user.id)
	await applyWeekReplanForUser(user.id, NOW)
	const proposal = await proposalFor(user.id, machine.id)

	expect(
		await answerProposal(user.id, proposal.id, 'accepted', 'from-now-on', NOW),
	).toEqual({ ok: false, reason: 'scope-not-a-move' })
	expect((await readSession(machine.id)).durationSec).toBe(3600)
})

// ── lås opp ──────────────────────────────────────────────────────────────────

test('lås opp hands the athlete’s session back: silence may then adjust it', async () => {
	const user = await createBiker()
	await createDoneSession(user.id)
	const own = await createSession(user.id, { source: 'authored' })

	expect(await releaseSession(user.id, own.id, NOW)).toEqual({
		ok: true,
		released: true,
	})
	await applyWeekReplanForUser(user.id, NOW)
	const proposal = await proposalFor(user.id, own.id)
	expect(proposal.reason).not.toContain('Dette er din økt')
	await applyDueProposals(user.id, NOW)

	const after = await readSession(own.id)
	expect(after.durationSec).toBe(2880)
	expect(after.source).toBe('authored')
	expect(after.releasedAt).toEqual(NOW)
})

test('a session released after its proposal was written is not stale: silence may then apply it', async () => {
	const user = await createBiker()
	await createDoneSession(user.id)
	const own = await createSession(user.id, { source: 'authored' })
	await applyWeekReplanForUser(user.id, NOW)
	const proposal = await proposalFor(user.id, own.id)
	expect((await applyDueProposals(user.id, NOW)).held).toEqual([proposal.id])

	// Released on the real clock, after the proposal was written.
	await releaseSession(user.id, own.id)
	const silence = await applyDueProposals(user.id, NOW)

	expect(silence.applied).toEqual([proposal.id])
	expect((await readSession(own.id)).durationSec).toBe(2880)
})

test('rewriting a released session takes it back: silence leaves it alone again', async () => {
	const user = await createBiker()
	await createDoneSession(user.id)
	const own = await createSession(user.id, { source: 'authored' })
	await releaseSession(user.id, own.id, NOW)

	await updateWorkoutSession(user.id, own.id, {
		title: 'Min tempotur',
		discipline: 'bike',
		intent: 'tempo',
		scheduledAt: at(THURSDAY),
		blocks: [
			{
				repeatCount: 1,
				steps: [
					{
						kind: 'cardio',
						discipline: 'bike',
						durationSec: 3000,
						intensity: { kind: 'zoneLabel' as const, label: 'Z3' },
					},
				],
			},
		],
	})
	expect((await readSession(own.id)).releasedAt).toBeNull()

	await applyWeekReplanForUser(user.id, NOW)
	await applyDueProposals(user.id, NOW)

	expect((await readSession(own.id)).durationSec).toBe(3000)
})

test('lås opp on a session that is already the machine’s changes nothing', async () => {
	const user = await createBiker()
	const machine = await createSession(user.id)

	expect(await releaseSession(user.id, machine.id, NOW)).toEqual({
		ok: true,
		released: false,
	})
	expect((await readSession(machine.id)).releasedAt).toBeNull()
})

// ── Gjør uka lettere −15 % ────────────────────────────────────────────────────

test('easeWeek softens every session still ahead in the week by 15 %, the athlete’s own too, and reports before and after', async () => {
	const user = await createBiker()
	// A ride track in hours: before and after are its Planned Volume, the
	// number the week header holds.
	const plan = await createPlanOutline(
		user.id,
		{
			startWeekKey: CURRENT_MONDAY,
			structure: { phases: [{ name: 'Blokk 1', weeks: 4, rhythm: '3:1' }] },
			tracks: [{ discipline: 'bike', currency: 'hours', anchorValue: 6 }],
		},
		new Date(NOW.getTime() - 7 * dayMs),
	)
	expect(plan.ok).toBe(true)
	const machine = await createSession(user.id)
	const own = await createSession(user.id, {
		source: 'authored',
		scheduledAt: at(FRIDAY),
	})
	// Already behind us this week: not eased.
	const past = await createSession(user.id, {
		scheduledAt: at(addDays(CURRENT_MONDAY, 1)),
	})

	const result = await easeWeek(user.id, CURRENT_MONDAY, NOW)

	expect(result.ok).toBe(true)
	if (!result.ok) return
	expect(result.sessionsChanged).toBe(2)
	expect(result.before.tracks).toEqual([
		expect.objectContaining({
			discipline: 'bike',
			currency: 'hours',
			planned: 3,
		}),
	])
	// 0.85 × 60 min = 51 min, twice; Tuesday's hour stands. Each session is
	// read at the track's tenth (0.9 t), as the week header reads it: 2.8 t.
	expect(result.after.tracks).toEqual([
		expect.objectContaining({ discipline: 'bike', planned: 2.8 }),
	])
	const header = await getWeekVolumes(user.id, {
		weekKey: CURRENT_MONDAY,
		now: NOW,
	})
	expect(header.tracks[0]!.planned).toBe(2.8)

	expect((await readSession(machine.id)).durationSec).toBe(3060)
	expect((await readSession(own.id)).durationSec).toBe(3060)
	expect((await readSession(past.id)).durationSec).toBe(3600)

	expect(await readProposals(user.id)).toEqual([
		expect.objectContaining({
			kind: 'scale',
			// The week's numbers before and after are kept with it, so the card
			// can say "før → etter" after a reload.
			payload: {
				kind: 'scale',
				factor: 0.85,
				scope: 'week',
				volumes: { before: result.before, after: result.after },
			},
			targetSessionId: null,
			targetWeekKey: CURRENT_MONDAY,
			answer: 'accepted',
			answeredAt: NOW,
			appliedAt: NOW,
			loadDirection: 'keeps-or-reduces',
		}),
	])

	// Once per week: a second tap never compounds.
	expect(await easeWeek(user.id, CURRENT_MONDAY, NOW)).toEqual({
		ok: false,
		reason: 'already-eased',
	})
	expect((await readSession(machine.id)).durationSec).toBe(3060)
})

test('easeWeek refuses a key that is not a Monday', async () => {
	const user = await createBiker()
	expect(await easeWeek(user.id, THURSDAY, NOW)).toEqual({
		ok: false,
		reason: 'not-a-week',
	})
})

test('easeWeek eases only the week after the closed one: never a past week, never one further ahead', async () => {
	const user = await createBiker()
	const ahead = await createSession(user.id, {
		scheduledAt: at(addDays(CURRENT_MONDAY, 9)),
	})
	for (const weekKey of [CLOSED_MONDAY, addDays(CURRENT_MONDAY, 7)]) {
		expect(await easeWeek(user.id, weekKey, NOW)).toEqual({
			ok: false,
			reason: 'not-the-coming-week',
		})
	}
	expect((await readSession(ahead.id)).durationSec).toBe(3600)
	expect(await readProposals(user.id)).toEqual([])
})
