// PROTOTYPE screenshot harness — drives the three "optimal" plan-wizard variants
// on desktop + mobile and writes PNGs to ./prototype-screens. Not a real test;
// delete with the prototype. Run:
//   PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test __plan-wizard-proto
import { type Page } from '@playwright/test'
import { expect, test } from '#tests/playwright-utils.ts'

// Two devices × generate waits per test blows the default 15s budget.
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

// Fill the goal, retrying until the named CTA enables — guards against typing
// into the input before React has hydrated (controlled input drops it).
async function fillGoalUntilReady(page: Page, ctaName: RegExp) {
	const goal = page.getByPlaceholder('e.g. Sub-2:00 half marathon')
	await goal.waitFor()
	await expect(async () => {
		await goal.fill(GOAL)
		await expect(
			page.getByRole('button', { name: ctaName }).first(),
		).toBeEnabled({ timeout: 750 })
	}).toPass({ timeout: 20_000 })
}

async function setUp(page: Page, ctaName: RegExp) {
	await fillGoalUntilReady(page, ctaName)
	await page.getByRole('button', { name: 'Swim' }).click()
	await page.getByRole('radio', { name: 'Advanced' }).click()
	await page.getByLabel('Target event').selectOption({ index: 1 })
}

test('variant planner — Planner hybrid', async ({ page, login }) => {
	await login()
	for (const [device, size] of DEVICES) {
		await page.setViewportSize(size)
		await page.goto('/training/plan/new?variant=planner')

		await setUp(page, /Generate plan/)
		await page.screenshot({ path: `${OUT}/planner-1-setup-${device}.png`, fullPage: true })

		await tap(page, /Generate plan/)
		await page.getByText('Threshold intervals').first().waitFor({ timeout: 10_000 })
		await page.screenshot({ path: `${OUT}/planner-2-tape-${device}.png`, fullPage: true })

		await page.getByRole('tab', { name: 'weeks' }).click()
		await page.screenshot({ path: `${OUT}/planner-3-weeks-${device}.png`, fullPage: true })
	}
})

test('variant sculptor — Load Sculptor', async ({ page, login }) => {
	await login()
	for (const [device, size] of DEVICES) {
		await page.setViewportSize(size)
		await page.goto('/training/plan/new?variant=sculptor')

		await setUp(page, /Generate sessions/)
		await page.screenshot({ path: `${OUT}/sculptor-1-setup-${device}.png`, fullPage: true })

		await tap(page, /Generate sessions/)
		await page.getByText('Threshold intervals').first().waitFor({ timeout: 10_000 })
		await page.screenshot({ path: `${OUT}/sculptor-2-plan-${device}.png`, fullPage: true })
	}
})

test('variant brief — Training Brief', async ({ page, login }) => {
	await login()
	for (const [device, size] of DEVICES) {
		await page.setViewportSize(size)
		await page.goto('/training/plan/new?variant=brief')

		await setUp(page, /Build plan/)
		await page.screenshot({ path: `${OUT}/brief-1-setup-${device}.png`, fullPage: true })

		await tap(page, /Build plan/)
		await page.getByText('Threshold intervals').first().waitFor({ timeout: 10_000 })
		await page.screenshot({ path: `${OUT}/brief-2-plan-${device}.png`, fullPage: true })
	}
})
