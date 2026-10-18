import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { prisma } from '#app/utils/db.server.ts'
import { AUTOPILOT_NOTICE_LABELS } from '#app/utils/labels.ts'
import { createPlanOutline } from '#app/utils/plan-outline/authoring.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import {
	readAutopilotHistory,
	readAutopilotNotice,
	undoAutopilotChange,
} from './autopilot-notice.server.ts'
import { type ProposalAuthor } from './propose-week-change.ts'
import { runWeekChangeForUser } from './week-change.server.ts'

// The Autopilot on for everyone (#583, spec #558 Testing Decisions, ADR 0100):
// the data migration run for real, a migrated athlete's first close and a new
// athlete's, the one-time line, and a next round's before → after line — read
// back from the database through the weekly Week Change, with an injected
// clock, as the autopilot's other tests do.

const OSLO = 'Europe/Oslo'

/** Oslo wall-clock time, as the UTC instant the server is handed. */
const oslo = (day: string, time: string) => {
	const [y, mo, d] = day.split('-').map(Number)
	const [h, m] = time.split(':').map(Number)
	return new Date(Date.UTC(y!, mo! - 1, d!, h! - 1, m!))
}

const SUNDAY_2001 = oslo('2030-01-13', '20:01')
const SUNDAY_2100 = oslo('2030-01-13', '21:00')
const MONDAY_0601 = oslo('2030-01-14', '06:01')
const NEXT_SUNDAY_2001 = oslo('2030-01-20', '20:01')
const NEXT_SUNDAY_2100 = oslo('2030-01-20', '21:00')

const MIGRATION = path.join(
	process.cwd(),
	'prisma/migrations/20261018090000_the_autopilot_is_on_for_everyone/migration.sql',
)

/** The migration's data step: its statements below the `-- backfill` marker. */
async function runBackfill() {
	const sql = fs.readFileSync(MIGRATION, 'utf8')
	const [, backfill] = sql.split(/^-- backfill$/m)
	if (!backfill) throw new Error('no -- backfill marker in the migration')
	const statements = backfill
		.split(/;\s*$/m)
		.map((statement) =>
			statement
				.split('\n')
				.filter((line) => !line.trimStart().startsWith('--'))
				.join('\n')
				.trim(),
		)
		.filter(Boolean)
	for (const statement of statements) {
		await prisma.$executeRawUnsafe(statement)
	}
}

/** An athlete; `autopilot` left out takes the column's default, as signup does. */
async function createAthlete({ autopilot }: { autopilot?: boolean } = {}) {
	const userData = createUser()
	return prisma.user.create({
		select: { id: true },
		data: {
			...userData,
			password: { create: createPassword(userData.username) },
			athleteProfile: {
				create: {
					timezone: OSLO,
					defaultTrainingTime: '07:00',
					...(autopilot == null ? {} : { autopilot }),
				},
			},
		},
	})
}

/** An open-ended plan of one two-week round from 31 Dec, in hours. */
async function giveOpenEndedPlan(userId: string) {
	const created = await createPlanOutline(
		userId,
		{
			startWeekKey: '2029-12-31',
			structure: {
				phases: [{ name: 'Blokk 1', weeks: 2, rhythm: 'none' as const }],
			},
			tracks: [{ discipline: 'run', currency: 'hours', anchorValue: 4 }],
		},
		new Date('2029-12-20T12:00:00Z'),
	)
	if (!created.ok) throw new Error(`plan setup failed: ${created.reason}`)
	const phase = await prisma.planOutlinePhase.findFirstOrThrow({
		where: { outlineId: created.outlineId },
		select: { id: true },
	})
	return { outlineId: created.outlineId, phaseId: phase.id }
}

/** The next round, proposed at `factor`, as the author words it. */
function nextRound(
	plan: { outlineId: string; phaseId: string },
	factor: number,
): ProposalAuthor {
	return (facts) => ({
		outcome: 'proposed',
		reason: 'Test author.',
		proposals: [
			{
				payload: {
					kind: 'add-phase' as const,
					outlineId: plan.outlineId,
					afterPhaseId: plan.phaseId,
					name: 'Blokk 2',
					weeks: 2,
					rhythm: 'none' as const,
					factor,
				},
				targetSessionId: null,
				targetWeekKey: facts.targetWeekKey,
				reason: 'Blokk 2 er lagt inn med litt mer.',
			},
		],
	})
}

/** A week with nothing to change: the close still writes its notice. */
const keepWeek: ProposalAuthor = (facts) => ({
	outcome: 'proposed',
	reason: 'Test author.',
	proposals: [
		{
			payload: { kind: 'keep' as const },
			targetSessionId: null,
			targetWeekKey: facts.targetWeekKey,
			reason: 'Uka står som planlagt.',
		},
	],
})

async function profileOf(userId: string) {
	return prisma.athleteProfile.findUniqueOrThrow({
		where: { userId },
		select: { autopilot: true, autopilotIntroPending: true },
	})
}

test('the migration turns autopilot on for everyone, and marks only athletes it is news to', async () => {
	// As they stood before it: on Spør meg først, with and without a plan,
	// and one already on autopilot.
	const withPlan = await createAthlete({ autopilot: false })
	await giveOpenEndedPlan(withPlan.id)
	const withoutPlan = await createAthlete({ autopilot: false })
	const alreadyOn = await createAthlete({ autopilot: true })
	await giveOpenEndedPlan(alreadyOn.id)

	await runBackfill()

	expect(await profileOf(withPlan.id)).toEqual({
		autopilot: true,
		autopilotIntroPending: true,
	})
	expect(await profileOf(withoutPlan.id)).toEqual({
		autopilot: true,
		autopilotIntroPending: false,
	})
	expect(await profileOf(alreadyOn.id)).toEqual({
		autopilot: true,
		autopilotIntroPending: false,
	})
})

test('a new athlete starts on autopilot, and their first close has no one-time line', async () => {
	const user = await createAthlete()
	expect(await profileOf(user.id)).toEqual({
		autopilot: true,
		autopilotIntroPending: false,
	})

	await runWeekChangeForUser(user.id, SUNDAY_2001, keepWeek)

	const notice = await readAutopilotNotice(user.id, { now: SUNDAY_2100 })
	expect(notice).not.toBeNull()
	expect(notice!.introLine).toBeNull()
})

test('a migrated athlete’s first notice carries the one-time line, and no notice after it does', async () => {
	const user = await createAthlete({ autopilot: false })
	await giveOpenEndedPlan(user.id)
	await runBackfill()

	await runWeekChangeForUser(user.id, SUNDAY_2001, keepWeek)

	const first = await readAutopilotNotice(user.id, { now: SUNDAY_2100 })
	expect(first!.introLine).toBe(AUTOPILOT_NOTICE_LABELS.intro)
	// It stays with that week's notice while it is on I dag …
	expect(
		(await readAutopilotNotice(user.id, { now: MONDAY_0601 }))!.introLine,
	).toBe(AUTOPILOT_NOTICE_LABELS.intro)
	expect(await profileOf(user.id)).toMatchObject({
		autopilotIntroPending: false,
	})

	// … and the next close's notice does not have it.
	await runWeekChangeForUser(user.id, NEXT_SUNDAY_2001, keepWeek)
	const second = await readAutopilotNotice(user.id, { now: NEXT_SUNDAY_2100 })
	expect(second).not.toBeNull()
	expect(second!.introLine).toBeNull()
	// It is news, not history: Se hele sesongen leaves it out.
	const history = await readAutopilotHistory(user.id, {
		now: NEXT_SUNDAY_2100,
	})
	expect(history).toHaveLength(2)
	expect(history.every((notice) => notice.introLine == null)).toBe(true)
})

test('a migrated athlete who switches back to Spør meg først before a close never gets the line', async () => {
	const user = await createAthlete({ autopilot: false })
	await giveOpenEndedPlan(user.id)
	await runBackfill()
	// As the Meg setting writes it (resources/autopilot, intent=mode).
	await prisma.athleteProfile.update({
		where: { userId: user.id },
		data: { autopilot: false, autopilotIntroPending: false },
	})

	await runWeekChangeForUser(user.id, SUNDAY_2001, keepWeek)

	expect(await readAutopilotNotice(user.id, { now: SUNDAY_2100 })).toBeNull()
	const replan = await prisma.weekReplan.findFirstOrThrow({
		where: { athleteId: user.id },
		select: { autopilot: true, autopilotIntro: true },
	})
	expect(replan).toEqual({ autopilot: false, autopilotIntro: false })
})

test('a next round applied at the close says its peak week before → after in hours, and Angre takes it back', async () => {
	const user = await createAthlete()
	const plan = await giveOpenEndedPlan(user.id)

	await runWeekChangeForUser(user.id, SUNDAY_2001, nextRound(plan, 1.05))

	const notice = await readAutopilotNotice(user.id, { now: SUNDAY_2100 })
	const [line] = notice!.lines
	expect(line).toMatchObject({
		kind: 'changed',
		text: 'Blokk 2 er lagt inn med litt mer.',
		undo: 'offered',
		volumeLine: expect.stringMatching(/^Toppuka: [\d,]+ → [\d,]+ t$/),
	})
	const [before, after] = line!
		.volumeLine!.replace('Toppuka: ', '')
		.replace(' t', '')
		.split(' → ')
		.map((figure) => Number(figure.replace(',', '.')))
	expect(after).toBeCloseTo(before! * 1.05, 1)

	const undo = await undoAutopilotChange(user.id, line!.proposalId, SUNDAY_2100)
	expect(undo.ok).toBe(true)
	const undone = await readAutopilotNotice(user.id, { now: SUNDAY_2100 })
	expect(undone!.lines[0]).toMatchObject({ undo: 'undone', volumeLine: null })
})

test('a next round that keeps the volume says no before → after', async () => {
	const user = await createAthlete()
	const plan = await giveOpenEndedPlan(user.id)

	await runWeekChangeForUser(user.id, SUNDAY_2001, nextRound(plan, 1))

	const notice = await readAutopilotNotice(user.id, { now: SUNDAY_2100 })
	expect(notice!.lines[0]).toMatchObject({ kind: 'changed', volumeLine: null })
})

test('under Spør meg først, a next round that adds load still waits for a yes', async () => {
	const user = await createAthlete({ autopilot: false })
	const plan = await giveOpenEndedPlan(user.id)

	await runWeekChangeForUser(user.id, SUNDAY_2001, nextRound(plan, 1.05))
	await runWeekChangeForUser(user.id, MONDAY_0601)

	const round = await prisma.weekReplanProposal.findFirstOrThrow({
		where: { athleteId: user.id, kind: 'add-phase' },
		select: { answer: true, appliedAt: true, autopilotOutcome: true },
	})
	expect(round).toEqual({
		answer: 'pending',
		appliedAt: null,
		autopilotOutcome: null,
	})
	expect(
		await prisma.planOutlinePhase.count({
			where: { outlineId: plan.outlineId },
		}),
	).toBe(1)
})
