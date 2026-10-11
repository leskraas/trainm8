import { type Locator, type Page } from '@playwright/test'
import {
	createActivityImport,
	promoteToNewSession,
} from '#app/utils/activity-import.server.ts'
import { localDate, localTimeUTC } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test, untilHydrated } from '#tests/playwright-utils.ts'

/**
 * Imports on I dag end to end on a phone (#505 stories 79–82): a run that
 * landed as _ekstra_ on a day with a planned run is asked about — "hva var
 * dette?" — and answered by linking it; the link is undone with _Angre
 * kobling_ and made again with _Koble igjen_, each read back off the rows and
 * the database. Then a run marked _Gjort_ by hand says its numbers are not
 * coming, because no import is connected. Both writes — _Gjort_ and a link
 * answer — are taken back with _Angre_ from their toast or their row (ADR
 * 0088, amended), and the database reads as before the tap.
 *
 * Every date is the athlete's local day (the Athlete Timezone is UTC here):
 * today, so the rows sit in the open current week whatever weekday it runs.
 */
test.use({ viewport: { width: 390, height: 844 } })

const TZ = 'UTC'
const SHOTS = process.env.IMPORTS_SHOTS

async function shot(page: Page, name: string, centre?: Locator) {
	if (!SHOTS) return
	// The stream scrolls inside its own box: bring the subject up to a third of
	// the screen, clear of the sticky week header.
	if (centre) {
		// After the landing has settled, or it pins today back to the top.
		await page.waitForTimeout(1500)
		// Twice, in case late layout moved it after the first.
		for (let pass = 0; pass < 2; pass++) {
			await centre.evaluate((el) => {
				const stream = el.closest('[data-testid="timeline-stream"]')!
				const offset =
					el.getBoundingClientRect().top -
					stream.getBoundingClientRect().top +
					stream.scrollTop
				stream.scrollTo({ top: offset - 140, behavior: 'instant' })
			})
			await page.waitForTimeout(400)
		}
	}
	await page.waitForTimeout(300)
	await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function plannedRun(userId: string, title: string, at: Date) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: userId,
			title,
			discipline: 'run',
			intent: 'endurance',
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									distanceM: 10_000,
								},
							],
						},
					},
				],
			},
		},
	})
	return prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: at,
			source: 'generated',
		},
	})
}

/** A run imported that fit nothing when it landed: an ekstra session. */
async function ekstraRun(userId: string, at: Date) {
	const imported = await createActivityImport(userId, {
		externalProvider: 'intervalsicu',
		externalId: `e2e-${userId}`,
		startedAt: at,
		endedAt: new Date(at.getTime() + 52 * 60_000),
		durationSec: 52 * 60,
		distanceM: 10_400,
		discipline: 'run',
		rawJson: '{}',
	})
	await promoteToNewSession(userId, imported.id)
	return imported.id
}

async function recordingOf(sessionId: string) {
	return await prisma.workoutSession.findUnique({
		where: { id: sessionId },
		select: { recordingId: true, status: true },
	})
}

test('hva var dette? answered by linking, then Angre kobling and Koble igjen', async ({
	page,
	navigate,
	login,
}) => {
	// The first navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const errors: string[] = []
	page.on('pageerror', (error) => {
		if (!/websocket/i.test(error.message)) errors.push(error.message)
	})

	const user = await login()
	await prisma.athleteProfile.create({
		data: { userId: user.id, timezone: TZ },
	})
	const today = localDate(new Date(), TZ)
	// The run was in the morning; the plan said evening. Written after the run
	// landed, so auto-save stood the run up on its own.
	const importId = await ekstraRun(user.id, localTimeUTC(today, '06:30', TZ))
	const plan = await plannedRun(
		user.id,
		'Rolig 10 km',
		localTimeUTC(today, '18:00', TZ),
	)
	await navigate('/')

	// The ekstra row carries its chip and the question.
	const question = page.getByRole('group', { name: 'Hva var dette?' })
	await expect(question).toBeVisible()
	await expect(page.getByText('ekstra', { exact: true })).toBeVisible()
	await shot(page, '1-question', question)

	// It was the planned run: the ekstra goes, the plan holds the import.
	const answer = question.getByRole('button', { name: 'Det var Rolig 10 km' })
	await untilHydrated(answer)
	await answer.click()
	await expect
		.poll(async () => (await recordingOf(plan.id))?.recordingId)
		.toBe(importId)
	expect((await recordingOf(plan.id))?.status).toBe('completed')
	await expect(question).toHaveCount(0)
	await expect(page.getByText('ekstra', { exact: true })).toHaveCount(0)
	// The row's quieter actions sit behind its glyph, said once (ADR 0086).
	const undo = page.getByRole('button', {
		name: 'Angre kobling på Rolig 10 km',
	})
	await openDetailsHolding(page, undo)
	await expect(undo).toBeVisible()
	await shot(page, '2-linked', undo)

	// Angre kobling: the run stands on its own again, and the plan is free.
	await undo.click()
	const relink = page.getByRole('button', {
		name: 'Koble igjen til Rolig 10 km',
	})
	await page.keyboard.press('Escape')
	await openDetailsHolding(page, relink)
	await expect(relink).toBeVisible()
	expect(await recordingOf(plan.id)).toEqual({
		recordingId: null,
		status: 'scheduled',
	})
	// The row is ekstra again — said on it, and in its details.
	await expect(page.getByText('ekstra', { exact: true }).first()).toBeVisible()
	// Answered once: not asked again.
	await expect(question).toHaveCount(0)
	await shot(page, '3-undone', relink)

	// Koble igjen: back on the plan.
	await relink.click()
	await page.keyboard.press('Escape')
	await openDetailsHolding(page, undo)
	await expect(undo).toBeVisible()
	expect(await recordingOf(plan.id)).toEqual({
		recordingId: importId,
		status: 'completed',
	})
	await shot(page, '4-relinked', undo)
	expect(errors).toEqual([])
})

test('Gjort by hand says the numbers are not coming when no import is connected', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await prisma.athleteProfile.create({
		data: { userId: user.id, timezone: TZ },
	})
	const today = localDate(new Date(), TZ)
	const plan = await plannedRun(
		user.id,
		'Morgentur',
		localTimeUTC(today, '00:30', TZ),
	)
	await navigate('/')

	const done = page.getByRole('button', { name: 'Merk Morgentur som gjort' })
	await untilHydrated(done)
	await done.click()
	await expect
		.poll(async () => (await recordingOf(plan.id))?.status)
		.toBe('completed')
	await expect(
		page.getByText('Gjort · uten tall, ingen import er koblet til'),
	).toBeVisible()
	await shot(
		page,
		'5-done-by-hand',
		page.getByText('Gjort · uten tall, ingen import er koblet til'),
	)
})

test('Gjort is taken back with the toast’s Angre, and the session stands as before', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await prisma.athleteProfile.create({
		data: { userId: user.id, timezone: TZ },
	})
	const today = localDate(new Date(), TZ)
	const plan = await plannedRun(
		user.id,
		'Morgentur',
		localTimeUTC(today, '00:30', TZ),
	)
	await navigate('/')

	const done = page.getByRole('button', { name: 'Merk Morgentur som gjort' })
	await untilHydrated(done)
	await done.click()

	// It lands as every write on I dag does (ADR 0088): a toast saying what
	// changed with Angre, and the row tinted with its own Angre.
	const toast = page.locator('[data-sonner-toast]', {
		hasText: 'Merket som gjort.',
	})
	await expect(toast).toBeVisible()
	await expect(toast.getByText('«Morgentur»')).toBeVisible()
	const rowUndo = page.getByRole('button', { name: 'Angre Morgentur' })
	await expect(rowUndo).toBeVisible()
	await expect
		.poll(async () => (await recordingOf(plan.id))?.status)
		.toBe('completed')
	await shot(page, '6-done-landed', rowUndo)

	await toast.getByRole('button', { name: 'Angre' }).click()

	await expect
		.poll(async () =>
			prisma.workoutSession.findUnique({
				where: { id: plan.id },
				select: { status: true, markedDoneAt: true },
			}),
		)
		.toEqual({ status: 'scheduled', markedDoneAt: null })
	// The row offers Gjort again, and its own Angre went with the toast's.
	await expect(done).toBeVisible()
	await expect(rowUndo).toHaveCount(0)
	await expect(
		page.getByText('Gjort er angret. «Morgentur» står som før.'),
	).toBeVisible()
	await shot(page, '7-done-undone', done)
})

test('a link answer is taken back with the row’s Angre, and the question is asked again', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const errors: string[] = []
	page.on('pageerror', (error) => {
		if (!/websocket/i.test(error.message)) errors.push(error.message)
	})
	const user = await login()
	await prisma.athleteProfile.create({
		data: { userId: user.id, timezone: TZ },
	})
	const today = localDate(new Date(), TZ)
	const importId = await ekstraRun(user.id, localTimeUTC(today, '06:30', TZ))
	const plan = await plannedRun(
		user.id,
		'Rolig 10 km',
		localTimeUTC(today, '18:00', TZ),
	)
	await navigate('/')

	const question = page.getByRole('group', { name: 'Hva var dette?' })
	const answer = question.getByRole('button', { name: 'Det var Rolig 10 km' })
	await untilHydrated(answer)
	await answer.click()

	const toast = page.locator('[data-sonner-toast]', {
		hasText: 'Importen er koblet til økta.',
	})
	await expect(toast).toBeVisible()
	const rowUndo = page.getByRole('button', { name: 'Angre Rolig 10 km' })
	await expect(rowUndo).toBeVisible()
	await expect
		.poll(async () => (await recordingOf(plan.id))?.recordingId)
		.toBe(importId)
	await shot(page, '8-link-landed', rowUndo)

	await rowUndo.click()

	// The plan is free and not done; the run is ekstra again, unanswered.
	await expect
		.poll(async () =>
			prisma.activityImport.findUniqueOrThrow({
				where: { id: importId },
				select: {
					linkAnsweredAt: true,
					unlinkedFromSessionId: true,
					promotedSession: { select: { source: true, status: true } },
				},
			}),
		)
		.toEqual({
			linkAnsweredAt: null,
			unlinkedFromSessionId: null,
			promotedSession: { source: 'recorded', status: 'completed' },
		})
	expect(await recordingOf(plan.id)).toEqual({
		recordingId: null,
		status: 'scheduled',
	})
	await expect(question).toBeVisible()
	await expect(toast).toHaveCount(0)
	await expect(page.getByText('ekstra', { exact: true }).first()).toBeVisible()
	await shot(page, '9-link-undone', question)
	expect(errors).toEqual([])
})

/**
 * Open the session glyph whose popover holds `target` (ADR 0086: a row's
 * quieter actions — Angre kobling, Koble igjen — live behind its glyph).
 */
async function openDetailsHolding(page: Page, target: Locator) {
	const glyphs = page.locator('[data-owner-glyph]')
	await expect(glyphs.first()).toBeVisible()
	// The write that puts the action there revalidates the page, so look again
	// until it has landed.
	await expect
		.poll(async () => {
			for (let i = 0; i < (await glyphs.count()); i++) {
				await glyphs.nth(i).click()
				await page.waitForTimeout(300)
				if (await target.isVisible()) return true
				await page.keyboard.press('Escape')
			}
			return false
		})
		.toBe(true)
}
