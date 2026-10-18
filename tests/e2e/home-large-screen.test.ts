import { type Page } from '@playwright/test'
import { HOME_TIMELINE_HREF } from '#app/utils/app-tabs.ts'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * I dag's full Home Timeline on a large screen (#505 story 60, ADR 0087, Arket
 * variant Q), driven at its own address, _Se hele sesongen_ (#562): the
 * season — plan card, season table, compact curve — left of the list, and the
 * selected day right of it from 1280px, or in a Sheet from 1024px to 1279px.
 *
 * What is worth a real browser here is what jsdom cannot see: the grid lays
 * out without a horizontal scroll, each pane scrolls on its own, a row of the
 * table moves the list, and a pick in the list moves the pane without moving
 * the page. The panes' words are proved in `large-screen.test.tsx`.
 */

test.use({ viewport: { width: 1280, height: 860 } })

function dayKey(from: string, days: number): string {
	const date = new Date(`${from}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

function thisMonday(): string {
	const now = new Date()
	const back = (now.getUTCDay() + 6) % 7
	return dayKey(now.toISOString().slice(0, 10), -back)
}

/**
 * An open-ended plan (ADR 0079) begun last week: eight weeks of Oppbygging at
 * 3:1, one run track at 40 km a week, a run today and the athlete's own long
 * run two weeks out, past the Planning Horizon.
 */
async function seedPlan(userId: string) {
	const monday = thisMonday()
	await prisma.planOutline.create({
		data: {
			athleteId: userId,
			startWeekKey: dayKey(monday, -7),
			phases: {
				create: [
					{ orderIndex: 0, name: 'Oppbygging', weeks: 8, rhythm: '3:1' },
				],
			},
			tracks: {
				create: [
					{
						discipline: 'run',
						currency: 'km',
						anchors: {
							create: [{ fromWeekKey: dayKey(monday, -7), value: 40 }],
						},
					},
				],
			},
		},
	})
	const run = (title: string, distanceM: number) =>
		prisma.workout.create({
			data: {
				title,
				discipline: 'run',
				intent: 'endurance',
				ownerId: userId,
				blocks: {
					create: [
						{
							orderIndex: 0,
							repeatCount: 1,
							steps: {
								create: [{ orderIndex: 0, kind: 'cardio', distanceM }],
							},
						},
					],
				},
			},
		})
	const today = new Date().toISOString().slice(0, 10)
	const easy = await run('Rolig 10 km', 10_000)
	await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: easy.id,
			scheduledAt: new Date(`${today}T23:59:59.000Z`),
			status: 'scheduled',
			source: 'authored',
		},
	})
	const group = await run('Langtur med gjengen', 24_000)
	await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: group.id,
			scheduledAt: new Date(`${dayKey(monday, 16)}T09:00:00.000Z`),
			status: 'scheduled',
			source: 'authored',
		},
	})
	return { today, monday, farWeek: dayKey(monday, 14) }
}

/** The page's own horizontal overflow, in px: 0 is the only right answer. */
function overflowX(page: Page) {
	return page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth,
	)
}

test('three columns: the season, the list and the day, each scrolling on its own (#505 story 60)', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	const { today, monday, farWeek } = await seedPlan(user.id)
	await navigate(HOME_TIMELINE_HREF)

	const season = page.getByRole('complementary', { name: 'Sesongen' })
	const day = page.locator('[data-day-pane]')
	const stream = page.getByTestId('timeline-stream')
	await expect(
		season.getByRole('table', { name: 'Sesongtabell' }),
	).toBeVisible()
	await expect(day.locator(`[data-day-detail="${today}"]`)).toBeVisible()
	expect(await overflowX(page)).toBe(0)

	// Left to right, side by side, and the strip has stepped aside for the
	// table.
	const [s, l, d] = await Promise.all([
		season.boundingBox(),
		page.locator('[data-timeline-column]').boundingBox(),
		day.boundingBox(),
	])
	expect(s!.x + s!.width).toBeLessThanOrEqual(l!.x)
	expect(l!.x + l!.width).toBeLessThanOrEqual(d!.x)
	await expect(page.getByTestId('week-strip')).toBeHidden()

	// Each pane keeps its scroll to itself.
	for (const pane of [season, day, stream]) {
		expect(
			await pane.evaluate((el) => getComputedStyle(el).overscrollBehaviorY),
		).toBe('contain')
	}

	// The table: this week outlined, the horizon once, Norwegian throughout.
	const now = season.locator('[data-season-row][aria-current="date"]')
	await expect(now).toHaveAttribute('data-season-row', monday)
	await expect(season.locator('[data-season-horizon]')).toHaveCount(1)
	await expect(season.locator('[data-season-horizon]')).toHaveText(
		'horisont · økter fylles hit, videre bare mål',
	)
	await expect(season.getByRole('region', { name: 'Planen' })).toContainText(
		/blokk \d+ av ∞/i,
	)
	await expect(page.getByText(/Your season|Read in|Layers/)).toHaveCount(0)

	// A row of the table jumps the list to its week; the page stays put.
	await season
		.locator(`[data-season-row="${farWeek}"]`)
		.getByRole('button')
		.click()
	const far = page.locator(`[data-timeline-week="${farWeek}"]`)
	await expect
		.poll(async () => {
			const [box, frame] = await Promise.all([
				far.boundingBox(),
				stream.boundingBox(),
			])
			return box && frame ? Math.abs(box.y - frame.y) < 4 : false
		})
		.toBe(true)
	await expect(
		season.locator(`[data-season-row="${farWeek}"][data-in-view]`),
	).toHaveCount(1)

	// A pick in the list: the row's gutter, not its link. The pane follows,
	// nothing navigates, and the row carries the mark.
	const fixedDay = dayKey(farWeek, 2)
	await page
		.locator(`[data-timeline-day="${fixedDay}"] [data-gutter-date]`)
		.first()
		.click()
	await expect(day.locator(`[data-day-detail="${fixedDay}"]`)).toBeVisible()
	await expect(
		day.getByRole('article', { name: 'Langtur med gjengen' }),
	).toContainText('din økt')
	await expect(
		day.getByRole('link', { name: 'Rediger Langtur med gjengen' }),
	).toBeVisible()
	await expect(page).toHaveURL(/\/season$/)
	await expect(
		page.locator(`[data-timeline-day="${fixedDay}"][data-day-selected]`),
	).toHaveCount(1)

	// The plan card's I dag brings both the list and the pane back to today.
	await season.getByRole('button', { name: 'Gå til i dag' }).click()
	await expect(day.locator(`[data-day-detail="${today}"]`)).toBeVisible()
})

test.describe('1024–1279', () => {
	test.use({ viewport: { width: 1024, height: 800 } })

	test('two columns, and the day opens in a sheet from the right', async ({
		page,
		navigate,
		login,
	}) => {
		test.setTimeout(120_000)
		const user = await login()
		const { today } = await seedPlan(user.id)
		await navigate(HOME_TIMELINE_HREF)

		const season = page.getByRole('complementary', { name: 'Sesongen' })
		await expect(
			season.getByRole('table', { name: 'Sesongtabell' }),
		).toBeVisible()
		await expect(page.locator('[data-day-pane]')).toBeHidden()
		expect(await overflowX(page)).toBe(0)

		await page
			.locator(`[data-timeline-day="${today}"] [data-gutter-date]`)
			.first()
			.click()
		const sheet = page.getByRole('dialog')
		await expect(sheet).toBeVisible()
		await expect(
			sheet.getByRole('article', { name: 'Rolig 10 km' }),
		).toContainText('planlagt')
		await page.keyboard.press('Escape')
		await expect(sheet).toBeHidden()
	})
})

test('1440: no horizontal overflow, and the list keeps a reading width', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	await page.setViewportSize({ width: 1440, height: 900 })
	const user = await login()
	await seedPlan(user.id)
	await navigate(HOME_TIMELINE_HREF)
	await expect(page.locator('[data-day-detail]')).toBeVisible()
	expect(await overflowX(page)).toBe(0)
	const list = await page.locator('[data-timeline-column]').boundingBox()
	expect(list!.width).toBeLessThanOrEqual(800)
})
