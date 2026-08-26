import { type Page } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * The home timeline: one bi-directional stream anchored on today.
 *
 * This spec replaces the tabbed-dashboard one (#184's Week / Trends / History
 * panels), which asserted a composition the handoff removed. What is worth
 * driving a real browser for is the part jsdom cannot see: the screen is defined
 * by scroll behaviour, and every one of these assertions is about a measurement
 * that only exists once the thing has laid out.
 */

test.use({ viewport: { width: 390, height: 844 } })

/** The scroller, and everything worth knowing about where it is parked. */
async function streamState(page: Page) {
	return page.getByTestId('timeline-stream').evaluate((el) => ({
		scrollTop: Math.round(el.scrollTop),
		scrollHeight: el.scrollHeight,
		clientHeight: el.clientHeight,
		weeks: el.querySelectorAll('[data-timeline-week]').length,
		// Today's row, measured against the scroller's own box — never
		// `offsetTop`, whose offsetParent is not the thing being scrolled.
		todayOffset: (() => {
			const node = el.querySelector('[data-timeline-today]')
			if (!node) return null
			return Math.round(
				node.getBoundingClientRect().top -
					el.getBoundingClientRect().top +
					el.scrollTop,
			)
		})(),
	}))
}

/**
 * Is the hero in the tab order? (#487)
 *
 * The week strip is the hero's next-door neighbour in the DOM, so one
 * `Shift+Tab` off the first week cell steps backwards across exactly the
 * boundary in question and nothing else: with the hero open it lands on the
 * hero's last link, with the hero folded away it steps straight past into the
 * header. One keystroke rather than a walk from the top of the document,
 * because tabbing into the stream scrolls the stream, and scrolling the stream
 * is what opens and closes the thing being measured.
 */
async function heroInTabOrder(page: Page) {
	await page.locator('[data-timeline-cell]').first().focus()
	await page.keyboard.press('Shift+Tab')
	return page.evaluate(() => {
		const heading = document.querySelector('main h1')
		const hero = heading?.closest('[class*="max-h"]')
		return (
			!!hero &&
			!!document.activeElement &&
			hero.contains(document.activeElement)
		)
	})
}

async function seedSeason(userId: string) {
	const now = new Date()
	const day = 24 * 60 * 60 * 1000
	const workout = await prisma.workout.create({
		data: {
			title: 'Threshold Run',
			discipline: 'run',
			intent: 'threshold',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 1,
						steps: {
							create: [{ orderIndex: 0, kind: 'cardio', durationSec: 3720 }],
						},
					},
				],
			},
		},
	})
	const session = (data: {
		days: number
		status: string
		tssValue?: number | null
		plannedTssValue?: number | null
		source?: string
		withWorkout?: boolean
	}) =>
		prisma.workoutSession.create({
			data: {
				userId,
				workoutId: data.withWorkout === false ? null : workout.id,
				scheduledAt: new Date(now.getTime() + data.days * day),
				status: data.status,
				tssValue: data.tssValue ?? null,
				plannedTssValue: data.plannedTssValue ?? null,
				plannedTssConfidence: data.plannedTssValue != null ? 'full' : null,
				source: data.source ?? 'authored',
			},
		})

	// Three weeks back, with no plan to compare against: the row that must refuse
	// a percentage. Its week sits outside the initial window, so the strip is the
	// only way to reach it.
	await session({
		days: -22,
		status: 'completed',
		tssValue: 61,
		source: 'recorded',
		withWorkout: false,
	})
	await session({
		days: -21,
		status: 'completed',
		tssValue: 55,
		source: 'recorded',
		withWorkout: false,
	})
	// Done earlier *today*, and comparable: the one row that can carry a band. It
	// sits today rather than a fixed number of days back, because "eight days
	// ago" crosses a Monday on some weekdays and lands in a week the stream has
	// not loaded yet — which made this assertion pass or fail by calendar.
	await session({
		days: -3 / 24,
		status: 'completed',
		tssValue: 88,
		plannedTssValue: 91,
	})
	// Last week, so the stream has real height to scroll back through.
	await session({
		days: -9,
		status: 'completed',
		tssValue: 40,
		plannedTssValue: 45,
	})
	await session({ days: -10, status: 'missed', plannedTssValue: 60 })
	// This week: today's session — the landing anchor and the hero's subject —
	// and two more so there is room to read past it.
	const today = await session({
		days: 1 / 24,
		status: 'scheduled',
		plannedTssValue: 91,
	})
	await session({ days: 1, status: 'scheduled', plannedTssValue: 55 })
	await session({ days: 2, status: 'scheduled', plannedTssValue: 70 })
	// Two weeks further back, so reading backwards has more than one week to
	// find.
	await session({
		days: -15,
		status: 'completed',
		tssValue: 70,
		plannedTssValue: 72,
	})
	await session({
		days: -16,
		status: 'completed',
		tssValue: 30,
		plannedTssValue: 45,
	})
	// Several weeks forward, so the stream has somewhere to grow into and today's
	// row genuinely leaves the viewport when the reader moves on.
	for (const days of [8, 9, 15, 16, 17, 22, 23, 29]) {
		await session({ days, status: 'scheduled', plannedTssValue: 60 + days })
	}
	return { today }
}

test('opens parked on today, with the hero showing and no pill', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()
	await seedSeason(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	// Let the settle ladder finish (it holds the anchor for ~1.3s).
	await page.waitForTimeout(2500)

	const state = await streamState(page)
	// The stream is a bounded scroller, not the page: if this fails, the whole
	// screen degrades to a plain document scroll and nothing else here works.
	expect(state.scrollHeight).toBeGreaterThan(state.clientHeight)
	// Parked on today: today's row, less the landing offset.
	expect(state.todayOffset).not.toBeNull()
	expect(state.scrollTop).toBe(Math.max(0, state.todayOffset! - 96))
	// And the page itself does not scroll — the frame is the viewport.
	expect(
		await page.evaluate(
			() => document.documentElement.scrollHeight <= window.innerHeight + 1,
		),
	).toBe(true)

	// The hero is open, because the collapse is measured from the landing
	// position and not from zero.
	await expect(
		page.getByRole('heading', { name: 'Threshold Run', level: 1 }),
	).toBeVisible()
	// The pill is not visible on first paint: today is right there.
	await expect(
		page.getByRole('button', { name: /back to today/i }),
	).toHaveCount(0)
	// No horizontal overflow at 390px.
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0)
})

test('the hero collapses on movement away from today in either direction, and comes back', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedSeason(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const stream = page.getByTestId('timeline-stream')
	const landing = (await streamState(page)).scrollTop
	const heroMaxHeight = () =>
		page.evaluate(() => {
			const heading = document.querySelector('main h1')
			const wrapper = heading?.closest('[class*="max-h"]')
			return wrapper ? getComputedStyle(wrapper).maxHeight : null
		})

	expect(await heroMaxHeight()).not.toBe('0px')
	expect(await heroInTabOrder(page)).toBe(true)

	// Forward, as far as the stream goes — a fixed offset could clamp to within
	// the threshold on a short season and prove nothing.
	await stream.evaluate((el) => {
		el.scrollTop = el.scrollHeight
	})
	await page.waitForTimeout(700)
	expect(
		Math.abs((await streamState(page)).scrollTop - landing),
	).toBeGreaterThan(40)
	expect(await heroMaxHeight()).toBe('0px')
	// A folded hero is folded away from the keyboard too (#487): its links are
	// zero-height and unreadable, so tabbing must not land in them.
	expect(await heroInTabOrder(page)).toBe(false)
	await expect(
		page.getByRole('button', { name: '↑ Back to today' }),
	).toBeVisible()

	// Back to the landing point: it re-opens.
	await stream.evaluate((el, y) => {
		el.scrollTop = y
	}, landing)
	await page.waitForTimeout(700)
	expect(await heroMaxHeight()).not.toBe('0px')
	expect(await heroInTabOrder(page)).toBe(true)
	await expect(
		page.getByRole('button', { name: /back to today/i }),
	).toHaveCount(0)

	// Backward — the same threshold, the other way.
	await stream.evaluate((el, y) => {
		el.scrollTop = Math.max(0, y - 200)
	}, landing)
	await page.waitForTimeout(700)
	expect(
		Math.abs((await streamState(page)).scrollTop - landing),
	).toBeGreaterThan(40)
	expect(await heroMaxHeight()).toBe('0px')
})

test('the pill appears with the direction back to today, and takes you there', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedSeason(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const stream = page.getByTestId('timeline-stream')
	// Not on first paint: today is right there.
	await expect(
		page.getByRole('button', { name: /back to today/i }),
	).toHaveCount(0)

	// Read forward until today's row has actually left the top of the viewport.
	for (let pass = 0; pass < 12; pass++) {
		await stream.evaluate((el) => {
			el.scrollTop = el.scrollHeight
		})
		await page.waitForTimeout(450)
		const state = await streamState(page)
		if (state.todayOffset! - state.scrollTop < -60) break
	}
	const away = await streamState(page)
	expect(away.todayOffset! - away.scrollTop).toBeLessThan(-60)

	// The label carries the direction: today is above, so the arrow points up.
	const pill = page.getByRole('button', { name: '↑ Back to today' })
	await expect(pill).toBeVisible()

	// And it puts today's row back in view — which is the claim, and is not the
	// same as putting `scrollTop` back to the number it opened on. Where today
	// sits near the top of the loaded window, arriving back at the landing is
	// itself inside the load zone, so earlier weeks pull in and the position is
	// compensated downwards while the row stays visually put. The pixel legitimately
	// moves; the row does not.
	await pill.click()
	await expect(
		page.getByRole('button', { name: /back to today/i }),
	).toHaveCount(0)
	const back = await streamState(page)
	const rel = back.todayOffset! - back.scrollTop
	expect(rel).toBeGreaterThan(-60)
	expect(rel).toBeLessThan(back.clientHeight - 40)
	// And the hero is open again, because the stream is parked on today. A
	// collapsed hero is a zero-height box, so this is a real check and not a
	// restatement of the pill's absence.
	await expect(
		page.getByRole('heading', { name: 'Threshold Run', level: 1 }),
	).toBeVisible()
})

test('reading backwards loads earlier weeks without the reading position jumping', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedSeason(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const stream = page.getByTestId('timeline-stream')
	// Collapse the hero before measuring. Folding it away changes the scroller's
	// own height, and this test is about the growth compensation alone.
	await stream.evaluate((el) => {
		el.scrollTop = el.scrollHeight
	})
	await page.waitForTimeout(900)
	const before = await streamState(page)

	// One assignment into the top pad, with the reading position captured in the
	// same tick — the position of a mounted week inside the scroller's own box.
	const pre = await stream.evaluate((el) => {
		el.scrollTop = 60
		const node = el.querySelectorAll('[data-timeline-week]')[1]!
		return {
			key: node.getAttribute('data-timeline-week'),
			inStream: Math.round(
				node.getBoundingClientRect().top - el.getBoundingClientRect().top,
			),
			scrollTop: Math.round(el.scrollTop),
			weeks: el.querySelectorAll('[data-timeline-week]').length,
		}
	})
	await page.waitForTimeout(1200)
	const post = await stream.evaluate((el, key) => {
		const node = el.querySelector(`[data-timeline-week="${key}"]`)!
		return {
			inStream: Math.round(
				node.getBoundingClientRect().top - el.getBoundingClientRect().top,
			),
			scrollTop: Math.round(el.scrollTop),
			weeks: el.querySelectorAll('[data-timeline-week]').length,
		}
	}, pre.key)

	// A week arrived above.
	expect(post.weeks).toBeGreaterThan(pre.weeks)
	expect(before.weeks).toBeGreaterThan(0)
	// And the marked week did not move on screen: the compensation is that
	// week's own offset delta, never the delta of total scrollHeight.
	expect(post.inStream).toBe(pre.inStream)
	// Which means the scroll position moved by exactly the height inserted.
	expect(post.scrollTop).toBeGreaterThan(pre.scrollTop)
})

test('reading forwards loads later weeks, and the far end states itself', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedSeason(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const stream = page.getByTestId('timeline-stream')
	const start = await streamState(page)
	for (let pass = 0; pass < 12; pass++) {
		const before = await streamState(page)
		await stream.evaluate((el) => {
			el.scrollTop = el.scrollHeight
		})
		await page.waitForTimeout(450)
		if ((await streamState(page)).weeks === before.weeks) break
	}
	expect((await streamState(page)).weeks).toBeGreaterThan(start.weeks)

	// Both ends are stated rather than left as an empty scroll.
	await expect(page.getByText(/everything is written through/i)).toBeVisible()
})

test('a strip cell jumps the stream to that week and centres the cell', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedSeason(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const strip = page.getByTestId('week-strip')
	const cells = strip.getByRole('button')
	// The whole season is in the strip, not a window over it.
	expect(await cells.count()).toBeGreaterThan((await streamState(page)).weeks)

	// The oldest week is outside the loaded window; tapping it loads and jumps.
	const oldest = cells.first()
	const label = await oldest.textContent()
	await oldest.click()
	await page.waitForTimeout(1000)

	await expect(strip.locator('[aria-current="true"]')).toHaveText(label ?? '')
	const centring = await strip.evaluate((el) => {
		const cell = el.querySelector('[aria-current="true"]')
		if (!cell) return null
		const cellBox = cell.getBoundingClientRect()
		const stripBox = el.getBoundingClientRect()
		return {
			cellCentre: Math.round(cellBox.left + cellBox.width / 2 - stripBox.left),
			stripCentre: Math.round(stripBox.width / 2),
		}
	})
	// Centred to within a pixel of the strip's middle — unless the cell is at one
	// end of the season, where `scrollLeft` has run out of room to centre it.
	const clamped = await strip.evaluate(
		(el) =>
			el.scrollLeft === 0 || el.scrollLeft >= el.scrollWidth - el.clientWidth,
	)
	if (!clamped) {
		expect(Math.abs(centring!.cellCentre - centring!.stripCentre)).toBeLessThan(
			2,
		)
	}
})

test('a comparable session names its basis and its band; an unplanned one refuses to', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedSeason(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	// The session done earlier today has both sides, so it bands.
	await expect(page.getByText('TSS 88 / 91 · ON TARGET')).toBeVisible()

	// The recorded session three weeks back has no plan to compare against.
	const strip = page.getByTestId('week-strip')
	await strip.getByRole('button').first().click()
	await page.waitForTimeout(1000)
	await expect(
		page.getByText('UNPLANNED · NO PLAN TO COMPARE').first(),
	).toBeVisible()
	// Never a fabricated percentage.
	await expect(page.getByTestId('timeline-stream')).not.toContainText('%')
})
