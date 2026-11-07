import { prisma } from '#app/utils/db.server.ts'
import { createFirstRunPlan } from '#app/utils/first-run/plan.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Editing the activities in _Meg_ → _Nivå og økter_ end to end (#587, ADR
 * 0109): an athlete whose plan the start made swaps bike for swimming and
 * drops strength, sees the first week the edit lays before anything changes,
 * confirms, and reads the new activities — on a phone, with no sideways
 * scroll and every control in reach.
 */
test.use({ viewport: { width: 390, height: 844 } })

test('the activities are edited in place: previewed with Vis ny uke, laid on Bekreft', async ({
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
	await prisma.athleteProfile.upsert({
		where: { userId: user.id },
		update: { timezone: 'Europe/Oslo' },
		create: { userId: user.id, timezone: 'Europe/Oslo' },
	})
	const made = await createFirstRunPlan(user.id, {
		level: 'recreational',
		discipline: 'run',
		otherSports: ['bike'],
		hours: 6,
		days: [0, 1, 3, 5, 6],
		family: 'polarized',
		strength: 2,
	})
	if (!made.ok) throw new Error(made.reason)

	await navigate('/settings/level')
	const section = page.locator('[data-meg-activities]')
	const bike = section.getByRole('button', { name: 'Sykling', exact: true })
	const swim = section.getByRole('button', { name: 'Svømming', exact: true })
	const strength = section.getByRole('button', { name: 'Styrke', exact: true })
	// Pre-filled with the plan's activities now.
	await expect(bike).toHaveAttribute('aria-pressed', 'true')
	await expect(strength).toHaveAttribute('aria-pressed', 'true')
	await expect(swim).toHaveAttribute('aria-pressed', 'false')

	const show = page.getByRole('button', { name: 'Vis ny uke' })
	// The same activities write nothing, and say so beside the editor.
	await show.click()
	await expect(
		page.getByText(/Det er de samme aktivitetene som planen har nå/),
	).toBeVisible()
	if (process.env.SHOTS_DIR) {
		await page.screenshot({
			path: `${process.env.SHOTS_DIR}/meg-activities-before.png`,
			fullPage: true,
		})
	}

	await bike.click()
	await swim.click()
	await strength.click()
	await show.click()

	const preview = page.locator('[data-activities-preview]')
	await expect(preview).toBeVisible()
	await expect(preview.getByText(/^Ny uke · uke \d+$/)).toBeVisible()
	await expect(preview).toBeFocused()

	// Nothing on the phone scrolls sideways, and the controls are thumb-sized.
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth - window.innerWidth,
		),
	).toBeLessThanOrEqual(0)
	for (const control of [
		swim,
		show,
		preview.getByRole('button', { name: 'Bekreft' }),
	]) {
		const box = await control.boundingBox()
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
	}
	if (process.env.SHOTS_DIR) {
		await page.screenshot({
			path: `${process.env.SHOTS_DIR}/meg-activities-preview.png`,
			fullPage: true,
		})
	}

	// A chip changed after the preview takes the preview and its Bekreft away.
	await strength.click()
	await expect(preview).toBeHidden()
	await expect(page.getByText(/Trykk Vis ny uke for å se uka/)).toBeVisible()
	await strength.click()
	await show.click()
	await expect(preview).toBeVisible()

	await preview.getByRole('button', { name: 'Bekreft' }).click()
	const done = page.locator('[data-activities-done]')
	await expect(done).toContainText('Aktivitetene er endret')
	await expect(done).toBeFocused()

	await page.reload()
	await expect(swim).toHaveAttribute('aria-pressed', 'true')
	await expect(bike).toHaveAttribute('aria-pressed', 'false')
	await expect(strength).toHaveAttribute('aria-pressed', 'false')
	if (process.env.SHOTS_DIR) {
		await page.screenshot({
			path: `${process.env.SHOTS_DIR}/meg-activities-after.png`,
			fullPage: true,
		})
	}
	expect(errors).toEqual([])
})
