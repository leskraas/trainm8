// PROTOTYPE screenshot harness — drives the three step-wizard variants on
// desktop + mobile and writes PNGs to ./prototype-screens. Not a real test;
// delete with the prototype. Run:
//   PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test __plan-wizard-proto
import { type Page } from '@playwright/test'
import { expect, test } from '#tests/playwright-utils.ts'

// Two devices × stepping + generate waits per test blows the default budget.
test.describe.configure({ timeout: 120_000 })

const OUT = 'prototype-screens'
const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 390, height: 844 }
const DEVICES = [
	['desktop', DESKTOP],
	['mobile', MOBILE],
] as const

const GOAL = 'Run a sub-2:00 half marathon this autumn'

// Dispatch the click straight to the node — bypasses motion "stable" waits and
// the floating switcher pill that can overlap the CTA on mobile.
async function tap(page: Page, name: RegExp | string) {
	const b = page.getByRole('button', { name }).first()
	await b.scrollIntoViewIfNeeded()
	await b.dispatchEvent('click')
}

// Fill the goal (step 1), retrying until Continue enables — guards against
// typing before React has hydrated (controlled input drops it).
async function fillGoal(page: Page) {
	const goal = page.getByLabel('Goal')
	await goal.waitFor()
	await expect(async () => {
		await goal.fill(GOAL)
		await expect(
			page.getByRole('button', { name: 'Continue' }).first(),
		).toBeEnabled({ timeout: 750 })
	}).toPass({ timeout: 20_000 })
}

// Walk a variant from goal → review, screenshotting goal + timeline, then
// generate and screenshot the plan.
async function runWizard(page: Page, variant: string, device: string) {
	await page.goto(`/training/plan/new?variant=${variant}`)
	await fillGoal(page)
	await page.screenshot({
		path: `${OUT}/${variant}-1-goal-${device}.png`,
		fullPage: true,
	})

	await tap(page, 'Continue') // → sports
	await page.getByRole('button', { name: 'Swim' }).click()
	await tap(page, 'Continue') // → experience
	await page.getByRole('button', { name: 'Advanced' }).click()
	await tap(page, 'Continue') // → timeline
	await page.getByRole('button', { name: /Oslo Half Marathon/ }).click()
	await page.screenshot({
		path: `${OUT}/${variant}-2-timeline-${device}.png`,
		fullPage: true,
	})

	await tap(page, 'Continue') // → review
	await tap(page, 'Generate plan')
	await page
		.getByText('Threshold intervals')
		.first()
		.waitFor({ timeout: 10_000 })
	await page.screenshot({
		path: `${OUT}/${variant}-3-plan-${device}.png`,
		fullPage: true,
	})
}

test('variant rail — Progress Rail', async ({ page, login }) => {
	await login()
	for (const [device, size] of DEVICES) {
		await page.setViewportSize(size)
		await runWizard(page, 'rail', device)
	}
})

test('variant sidebar — Step Sidebar', async ({ page, login }) => {
	await login()
	for (const [device, size] of DEVICES) {
		await page.setViewportSize(size)
		await runWizard(page, 'sidebar', device)
	}
})

test('variant focus — Focus', async ({ page, login }) => {
	await login()
	for (const [device, size] of DEVICES) {
		await page.setViewportSize(size)
		await runWizard(page, 'focus', device)
	}
})
