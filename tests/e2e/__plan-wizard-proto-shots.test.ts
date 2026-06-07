// THROWAWAY — screenshots the plan-wizard prototype variants. Delete with the
// prototype. Run: npx playwright test __plan-wizard-proto-shots --project=chromium
// `force: true` on generate clicks bypasses the floating PrototypeSwitcher bar,
// which overlaps page-bottom buttons (a screenshot-harness artifact only).
import { expect, test } from '#tests/playwright-utils.ts'

test.use({ viewport: { width: 1280, height: 900 } })

const DIR = 'tests/.proto-shots'
const GOAL = 'Run a sub-2:00 half marathon'
const goalField = 'e.g. Run a sub-2:00 half marathon'

test('A · Guided Stepper', async ({ page, login }) => {
	await login()
	await page.goto('/training/plan/new?variant=A')
	await expect(page.getByText('Which disciplines?')).toBeVisible()
	await page.screenshot({
		path: `${DIR}/A1-stepper-disciplines.png`,
		fullPage: true,
	})

	await page.getByRole('button', { name: 'Next', exact: true }).click() // → experience
	await page.screenshot({
		path: `${DIR}/A2-stepper-experience.png`,
		fullPage: true,
	})
	await page.getByRole('button', { name: 'Next', exact: true }).click() // → goal
	await page.getByPlaceholder(goalField).fill(GOAL)
	await page.getByRole('button', { name: 'Next', exact: true }).click() // → target
	await page.getByRole('button', { name: 'Next', exact: true }).click() // → review
	await expect(page.getByText('Ready to generate')).toBeVisible()
	await page.screenshot({
		path: `${DIR}/A3-stepper-review.png`,
		fullPage: true,
	})

	await page
		.getByRole('button', { name: 'Generate plan' })
		.click({ force: true })
	await expect(page.getByRole('button', { name: /Approve/ })).toBeVisible({
		timeout: 10_000,
	})
	await page.screenshot({
		path: `${DIR}/A4-stepper-preview.png`,
		fullPage: true,
	})
})

test('B · Narrative builder', async ({ page, login }) => {
	await login()
	await page.goto('/training/plan/new?variant=B')
	await expect(page.getByText('Build me a')).toBeVisible()
	await page.screenshot({
		path: `${DIR}/B1-narrative-initial.png`,
		fullPage: true,
	})

	await page.getByRole('button', { name: 'describe a goal' }).click()
	await page.getByPlaceholder(goalField).fill(GOAL)
	await page.screenshot({
		path: `${DIR}/B2-narrative-editing.png`,
		fullPage: true,
	})
	await page.getByText('Build me a').click() // close popover

	await page
		.getByRole('button', { name: 'Generate my plan' })
		.click({ force: true })
	await expect(page.getByRole('button', { name: /Approve/ })).toBeVisible({
		timeout: 10_000,
	})
	await page.screenshot({
		path: `${DIR}/B3-narrative-preview.png`,
		fullPage: true,
	})
})

test('C · Split workbench', async ({ page, login }) => {
	await login()
	await page.goto('/training/plan/new?variant=C')
	await expect(
		page.getByText('Your plan preview will appear here'),
	).toBeVisible()
	await page.screenshot({
		path: `${DIR}/C1-workbench-empty.png`,
		fullPage: true,
	})

	await page.getByPlaceholder(goalField).fill(GOAL)
	await page
		.getByRole('button', { name: 'Generate plan' })
		.click({ force: true })
	await expect(page.getByText('Plan preview')).toBeVisible({ timeout: 10_000 })
	await page.screenshot({
		path: `${DIR}/C2-workbench-preview.png`,
		fullPage: true,
	})
})

test('D · Coach chat', async ({ page, login }) => {
	await login()
	await page.goto('/training/plan/new?variant=D')
	await expect(page.getByText('Trainm8 coach')).toBeVisible()
	await page.screenshot({ path: `${DIR}/D1-chat-start.png`, fullPage: true })

	// Walk the conversation: disciplines → experience → goal → target.
	await page.getByRole('button', { name: 'Send' }).click() // run preselected
	await page.getByRole('button', { name: 'Intermediate' }).click()
	await page.getByPlaceholder(goalField).fill(GOAL)
	await page.getByRole('button', { name: 'Send' }).click()
	await page.screenshot({ path: `${DIR}/D2-chat-midway.png`, fullPage: true })
	// Target stage: no events seeded, so set weeks then send.
	await page.getByRole('button', { name: 'Send' }).click()
	await expect(page.getByRole('button', { name: /Approve/ })).toBeVisible({
		timeout: 10_000,
	})
	await page.screenshot({ path: `${DIR}/D3-chat-preview.png`, fullPage: true })
})

test('E · Timeline canvas', async ({ page, login }) => {
	await login()
	await page.goto('/training/plan/new?variant=E')
	await expect(page.getByText('Plan timeline')).toBeVisible()
	await page.screenshot({
		path: `${DIR}/E1-timeline-empty.png`,
		fullPage: true,
	})

	await page.getByPlaceholder(goalField).fill(GOAL)
	await page.getByRole('button', { name: 'Plot plan' }).click({ force: true })
	await expect(page.getByText('Sessions on the timeline')).toBeVisible({
		timeout: 10_000,
	})
	await page.screenshot({
		path: `${DIR}/E2-timeline-plotted.png`,
		fullPage: true,
	})
})

test('F · Cockpit dials', async ({ page, login }) => {
	await login()
	await page.goto('/training/plan/new?variant=F')
	await expect(page.getByText('Plan Control')).toBeVisible()
	await page.screenshot({ path: `${DIR}/F1-cockpit.png`, fullPage: true })

	await page.getByPlaceholder('> describe the goal').fill(GOAL)
	await page
		.getByRole('button', { name: /launch generation/ })
		.click({ force: true })
	await expect(page.getByText('Readout')).toBeVisible({ timeout: 10_000 })
	await page.screenshot({
		path: `${DIR}/F2-cockpit-readout.png`,
		fullPage: true,
	})
})
