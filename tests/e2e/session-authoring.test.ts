import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Simple-mode session authoring (#176): the default new-session form speaks
 * humane units (duration in minutes, distance in km) with no Blocks/Steps
 * visible, and a 40-minute easy run created through it lands on the Dashboard.
 */
test('athlete creates a 40-minute easy run in simple mode and sees it on the Dashboard', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	await login()
	await navigate('/')

	// Creation goes through the "+ New" menu (#178). The first interaction after
	// page load can race client hydration, so retry until the menu opens.
	const newSessionItem = page.getByRole('menuitem', { name: /new session/i })
	await expect(async () => {
		await page.getByRole('button', { name: /create/i }).click()
		await expect(newSessionItem).toBeVisible({ timeout: 2000 })
	}).toPass()
	await newSessionItem.click()
	await expect(page).toHaveURL('/training/sessions/new')

	// Simple mode is the default: no Blocks/Steps editor in sight.
	await expect(page.getByText(/block 1/i)).toHaveCount(0)
	await expect(page.getByText(/step 1/i)).toHaveCount(0)

	// The selects already carry human labels (Run / Endurance) as defaults, so
	// the whole flow is: title, duration, submit.
	await page.getByLabel(/title/i).fill('Easy Run')
	await page.getByLabel(/duration/i).fill('40 min')
	await page.getByRole('button', { name: /create session/i }).click()

	// Persisted as a real Workout Session and shown on its detail view.
	await expect(page).toHaveURL(/\/training\/sessions\/[a-z0-9]+$/i)
	await expect(page.getByText('Easy Run').first()).toBeVisible()

	// Back on the Dashboard, the session shows up on the default Week view
	// (the ledger itself lives behind the History tab, #184).
	await navigate('/')
	await expect(page.getByTestId('week-timeline')).toBeVisible()
	await expect(page.getByText('Easy Run').first()).toBeVisible()
})
