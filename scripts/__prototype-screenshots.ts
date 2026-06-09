// PROTOTYPE — throwaway script: log in as kody, screenshot each home
// redesign variant. Delete with the prototype.
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3000'
const VARIANTS = ['live', 'a', 'b', 'c', 'd']

async function main() {
	const browser = await chromium.launch()
	const page = await browser.newPage({
		viewport: { width: 1440, height: 900 },
	})

	await page.goto(`${BASE}/login`)
	await page.getByLabel(/username/i).fill('kody')
	await page.getByLabel(/^password$/i).fill('kodylovesyou')
	await page.getByRole('button', { name: /log in/i }).click()
	await page.waitForURL((url) => !url.pathname.includes('login'), {
		timeout: 15000,
	})

	for (const v of VARIANTS) {
		await page.goto(`${BASE}/?variant=${v}`)
		await page.waitForLoadState('networkidle')
		await page.waitForTimeout(800)
		await page.screenshot({
			path: `/tmp/home-variant-${v}.png`,
			fullPage: true,
		})
		console.log(`captured ${v}`)
	}

	await browser.close()
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
