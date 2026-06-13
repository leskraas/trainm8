// PROTOTYPE screenshot harness — drives the three plan-wizard variants on
// desktop + mobile and writes PNGs to ./prototype-screens. Not a real test;
// delete with the prototype. Run:
//   PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test __plan-wizard-proto
import { type Page } from '@playwright/test'
import { expect, test } from '#tests/playwright-utils.ts'

// Two devices × generate waits per test blows the default 15s budget.
test.describe.configure({ timeout: 120_000 })

// Dispatch the click straight to the node — bypasses both the motion "stable"
// wait and the floating switcher pill that can overlap the CTA on mobile.
async function tap(page: Page, name: string) {
	const b = page.getByRole('button', { name }).first()
	await b.scrollIntoViewIfNeeded()
	await b.dispatchEvent('click')
}

const OUT = 'prototype-screens'
const DESKTOP = { width: 1280, height: 900 }
const MOBILE = { width: 390, height: 844 }
const DEVICES = [
	['desktop', DESKTOP],
	['mobile', MOBILE],
] as const

const GOAL = 'Run a sub-2:00 half marathon this autumn'

// Fill the goal, retrying until the named CTA enables — guards against typing
// into the textarea before React has hydrated (controlled input drops it).
async function fillGoalUntilReady(page: Page, ctaName: RegExp) {
	const ta = page.locator('textarea').first()
	await ta.waitFor()
	await expect(async () => {
		await ta.fill(GOAL)
		await expect(
			page.getByRole('button', { name: ctaName }).first(),
		).toBeEnabled({ timeout: 750 })
	}).toPass({ timeout: 20_000 })
}

test('variant A — Guided Stepper', async ({ page, login }) => {
	await login()
	for (const [device, size] of DEVICES) {
		await page.setViewportSize(size)
		await page.goto('/training/plan/new?variant=A')

		await fillGoalUntilReady(page, /Continue/)
		await page.screenshot({
			path: `${OUT}/A-1-goal-${device}.png`,
			fullPage: true,
		})

		await page.getByRole('button', { name: 'Continue' }).click()
		await page.getByRole('button', { name: 'Swim' }).click()
		await page.getByRole('button', { name: 'Continue' }).click()
		await page.getByRole('button', { name: 'Advanced' }).click()
		await page.getByRole('button', { name: 'Continue' }).click()
		await page.getByRole('button', { name: /Oslo Half Marathon/ }).click()
		await page.getByRole('button', { name: 'Continue' }).click()
		await page.screenshot({
			path: `${OUT}/A-2-review-${device}.png`,
			fullPage: true,
		})

		await tap(page, 'Generate plan')
		await page
			.getByText('Threshold intervals')
			.first()
			.waitFor({ timeout: 10_000 })
		await page.screenshot({
			path: `${OUT}/A-3-plan-${device}.png`,
			fullPage: true,
		})
	}
})

test('variant B — Split Studio', async ({ page, login }) => {
	await login()
	for (const [device, size] of DEVICES) {
		await page.setViewportSize(size)
		await page.goto('/training/plan/new?variant=B')

		await fillGoalUntilReady(page, /Generate plan/)
		await page.getByRole('button', { name: 'Bike' }).click()
		await page.getByRole('button', { name: 'Advanced' }).click()
		await page.screenshot({
			path: `${OUT}/B-1-inputs-${device}.png`,
			fullPage: true,
		})

		await tap(page, 'Generate plan')
		await page
			.getByText('Threshold intervals')
			.first()
			.waitFor({ timeout: 10_000 })
		await page.screenshot({
			path: `${OUT}/B-2-plan-${device}.png`,
			fullPage: true,
		})
	}
})

test('variant C — Coach Chat', async ({ page, login }) => {
	await login()
	for (const [device, size] of DEVICES) {
		await page.setViewportSize(size)
		await page.goto('/training/plan/new?variant=C')

		await fillGoalUntilReady(page, /Build my plan/)
		await page.getByRole('button', { name: 'Swim' }).click()
		await page.getByRole('button', { name: 'Advanced' }).click()
		await page.getByRole('button', { name: /Oslo Half Marathon/ }).click()
		await page.screenshot({
			path: `${OUT}/C-1-chat-${device}.png`,
			fullPage: true,
		})

		await tap(page, 'Build my plan')
		await page
			.getByText('Threshold intervals')
			.first()
			.waitFor({ timeout: 10_000 })
		await page.screenshot({
			path: `${OUT}/C-2-plan-${device}.png`,
			fullPage: true,
		})
	}
})
