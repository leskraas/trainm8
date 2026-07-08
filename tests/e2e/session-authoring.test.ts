import { type Page } from '@playwright/test'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Session authoring end-to-end (#176, ADR 0027 R5): the new-session form is now
 * the always-on Token Sentence editor — the simple/structured toggle is gone, so
 * a new session opens as a single one-step sentence with the classic per-step
 * fields (humane units: duration in minutes, distance in km) beneath it. A
 * 40-minute easy run authored through it lands on the Dashboard. The same flow
 * runs at desktop and at 390px (#171: the PWA is a real mobile experience).
 */
async function createEasyRun({
	page,
	navigate,
}: {
	page: Page
	navigate: (to: '/') => Promise<unknown>
}) {
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

	// The structured Token Sentence editor is always present now (ADR 0027 R5):
	// the sentence itself plus the classic one-step field editor underneath.
	await expect(page.locator('[data-token-sentence-editor]')).toBeVisible()
	await expect(page.getByText(/block 1/i)).toBeVisible()

	// Defaults are Run / Endurance with one cardio step, so the whole flow is:
	// title, the step's duration, submit.
	await page.getByLabel(/title/i).fill('Easy Run')
	await page.getByLabel('Duration', { exact: true }).fill('40 min')
	await page.getByRole('button', { name: /create session/i }).click()

	// Persisted as a real Workout Session and shown on its detail view.
	await expect(page).toHaveURL(/\/training\/sessions\/[a-z0-9]+$/i)
	await expect(page.getByText('Easy Run').first()).toBeVisible()

	// Back on the Dashboard, the session shows up on the default Week view
	// (the ledger itself lives behind the History tab, #184).
	await navigate('/')
	await expect(page.getByTestId('week-timeline')).toBeVisible()
	await expect(page.getByText('Easy Run').first()).toBeVisible()
}

test('athlete creates a 40-minute easy run and sees it on the Dashboard', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	await login()
	await createEasyRun({ page, navigate })
})

test.describe('at 390px (mobile PWA)', () => {
	test.use({ viewport: { width: 390, height: 844 } })

	test('the same authoring flow works end to end', async ({
		page,
		navigate,
		login,
	}) => {
		test.setTimeout(120_000)
		await login()
		await createEasyRun({ page, navigate })
	})
})
