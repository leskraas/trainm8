import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * CTA semantics (#179): buttons must promise exactly what they do.
 *
 * - The Dashboard's today-session CTA derives its label from Session Status
 *   ("View session" for a scheduled session) and never says "Start session" —
 *   in-app recording is a stated non-goal, and the button only opens the
 *   Workout Detail View.
 * - Deleting an Event is destructive and must go through a confirmation
 *   dialog whose copy distinguishes Delete (destroys the event) from Cancel
 *   (keeps it with a cancelled status).
 */

test('today-session CTA says "View session" and opens the Workout Detail View', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()

	// A session scheduled later today — the Today hero's subject.
	const workout = await prisma.workout.create({
		data: {
			title: 'Threshold Run',
			discipline: 'run',
			intent: 'threshold',
			ownerId: user.id,
		},
	})
	const session = await prisma.workoutSession.create({
		data: {
			userId: user.id,
			workoutId: workout.id,
			scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
			status: 'scheduled',
			source: 'authored',
		},
	})

	await navigate('/')

	// The CTA is honest about Session Status: a scheduled session is viewed.
	// base-ui's Button renders the Link as an anchor carrying role="button".
	const cta = page.getByRole('button', { name: 'View session' })
	await expect(cta).toBeVisible()
	// It never promises recording — that affordance does not exist in-app.
	await expect(page.getByText('Start session')).not.toBeVisible()

	await cta.click()
	await page.waitForURL(`/training/sessions/${session.id}`)
	// Anchor on a detail-only affordance first: the URL flips before the new
	// tree commits, so dashboard elements can linger for a frame.
	await expect(
		page.getByRole('button', { name: 'Delete session' }),
	).toBeVisible()
	await expect(page.getByText('Scheduled', { exact: true })).toBeVisible()
	await expect(page.getByText('Threshold Run')).toBeVisible()
})

test('deleting an Event requires confirmation with copy that distinguishes it from Cancel', async ({
	page,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()
	const event = await prisma.event.create({
		data: {
			athleteId: user.id,
			name: 'Autumn 10k',
			kind: 'race',
			priority: 'B',
			startDate: new Date('2027-10-03T00:00:00.000Z'),
			disciplines: JSON.stringify(['run']),
		},
	})

	await page.goto(`/training/events/${event.id}`)
	await expect(page.getByText('Autumn 10k')).toBeVisible()

	// Clicking Delete does not delete — it opens the confirmation dialog.
	// Retried because a click that lands before React hydrates is a no-op.
	const dialog = page.getByRole('alertdialog')
	await expect(async () => {
		await page.getByRole('button', { name: 'Delete', exact: true }).click()
		await expect(dialog).toBeVisible({ timeout: 1000 })
	}).toPass()
	await expect(dialog.getByText('Delete this event?')).toBeVisible()
	// The copy explains the Cancel-vs-Delete distinction.
	await expect(dialog.getByText(/cancelled status/)).toBeVisible()
	await expect(dialog.getByText(/cannot be undone/)).toBeVisible()

	// Backing out keeps the event.
	await dialog.getByRole('button', { name: 'Keep event' }).click()
	await expect(dialog).not.toBeVisible()
	expect(
		await prisma.event.findUnique({ where: { id: event.id } }),
	).not.toBeNull()

	// Confirming actually deletes and returns to the events list.
	await page.getByRole('button', { name: 'Delete', exact: true }).click()
	await page
		.getByRole('alertdialog')
		.getByRole('button', { name: 'Delete event' })
		.click()
	await page.waitForURL('/training/events')
	expect(await prisma.event.findUnique({ where: { id: event.id } })).toBeNull()
})
