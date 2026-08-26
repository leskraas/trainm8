import { type Locator, type Page } from '@playwright/test'
import sharp from 'sharp'
import { prisma } from '#app/utils/db.server.ts'
import { type Theme } from '#app/utils/theme.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * The home timeline: one bi-directional stream anchored on today.
 *
 * This spec replaces the tabbed-dashboard one (#184's Week / Trends / History
 * panels), which asserted a composition the handoff removed. What is worth
 * driving a real browser for is the part jsdom cannot see: the screen is defined
 * by scroll behaviour, and every one of these assertions is about a measurement
 * that only exists once the thing has laid out.
 *
 * The last pair of tests is about the other thing jsdom cannot see: **paint**
 * (#486). The surface was drawn against the dark theme and shipped with six
 * marks hardcoded white or a dark-tuned black, and the app defaults to light —
 * so those marks composited to nothing on a white stream while every class name
 * still looked right. A class-name assertion cannot tell the two apart, and
 * neither can `getComputedStyle`: `rgba(255,255,255,0.04)` is a perfectly
 * well-formed colour that happens to be invisible. So those two read the marks
 * off a real screenshot and measure how far the ink gets from the surface
 * behind it.
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

/**
 * The theme cookie `app/utils/theme.server.ts` reads. Setting it directly is
 * the same technique the `login` fixture uses for the auth cookie, and it is
 * the only way to pin the theme: without it the app falls back to a client
 * hint, so a spec that just assumed the default would be asserting against
 * whatever colour scheme the machine running it happened to prefer.
 */
async function useTheme(page: Page, theme: Theme) {
	await page
		.context()
		.addCookies([
			{ name: 'en_theme', value: theme, domain: 'localhost', path: '/' },
		])
}

/**
 * The token minted for the back-to-today pill, in each theme's own terms. Its
 * geometry rather than its literal text: the build minifies `oklch(0 0 0 /
 * 0.16)` down to `oklch(0% 0 0/.16)`, so asserting the string as authored would
 * pass against the dev server and fail against the built app.
 */
const PILL_SHADOW: Record<Theme, { offsets: string; alpha: string }> = {
	light: { offsets: '6px 20px', alpha: '.16' },
	dark: { offsets: '8px 24px', alpha: '.45' },
}

/**
 * The two marks `seedSeason` cannot be relied on to put where they can be
 * measured, both placed so no weekday can move them:
 *
 * - **A missed session yesterday.** `seedSeason`'s own missed session sits ten
 *   days back, which lands in the week before last on most weekdays — outside
 *   the initial one-week window, and so off screen. Yesterday is inside that
 *   window on every weekday, Monday included.
 * - **A part-done week.** The load bar only paints three bands where all three
 *   layers have width, and every week `seedSeason` builds either has no actual
 *   yet or has one that fills its plan. One session, a month back, a quarter of
 *   its plan done: one session cannot straddle a Monday, so the week is the
 *   same week whatever day the suite runs on.
 */
async function seedThemeMarks(userId: string) {
	const workout = await prisma.workout.findFirstOrThrow({
		where: { ownerId: userId },
		select: { id: true },
	})
	const day = 24 * 60 * 60 * 1000
	const session = (data: {
		days: number
		status: string
		tssValue?: number
		plannedTssValue: number
	}) =>
		prisma.workoutSession.create({
			data: {
				userId,
				workoutId: workout.id,
				scheduledAt: new Date(Date.now() + data.days * day),
				status: data.status,
				tssValue: data.tssValue ?? null,
				plannedTssValue: data.plannedTssValue,
				plannedTssConfidence: 'full',
				source: 'authored',
			},
		})
	await session({ days: -1, status: 'missed', plannedTssValue: 55 })
	await session({
		days: -30,
		status: 'completed',
		tssValue: 30,
		plannedTssValue: 120,
	})
}

type Rgb = readonly [number, number, number]

/** How far apart two painted colours are, as a straight line through sRGB. */
function apart(a: Rgb, b: Rgb) {
	return Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
}

/** How far a mark's ink has to get from the surface behind it to be a mark. */
const MARK_MIN = 8
/** And how far two marks have to be apart to read as two different states. */
const MARKS_APART = 20

/** One element's pixels, composited over whatever is behind it. */
async function pixelsOf(target: Locator) {
	const { data, info } = await sharp(await target.screenshot({ scale: 'css' }))
		.raw()
		.toBuffer({ resolveWithObject: true })
	return {
		width: info.width,
		height: info.height,
		at(x: number, y: number): Rgb {
			const i = (y * info.width + x) * info.channels
			return [data[i]!, data[i + 1]!, data[i + 2]!]
		},
	}
}

/** The colour of one pixel of the screen, in viewport coordinates. */
async function pixelAt(page: Page, x: number, y: number): Promise<Rgb> {
	const { data } = await sharp(
		await page.screenshot({
			scale: 'css',
			clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 },
		}),
	)
		.raw()
		.toBuffer({ resolveWithObject: true })
	return [data[0]!, data[1]!, data[2]!]
}

/**
 * What a dot actually paints, and what it paints it on. A round dot never
 * reaches the corner of its own box, so that corner is the surface behind it;
 * the mark is the pixel that gets furthest from that — which reads a filled dot
 * and a border-only one on the same terms, and reads both against the surface
 * they are actually sitting on rather than against an assumed page colour.
 */
async function dotPaint(dot: Locator) {
	const px = await pixelsOf(dot)
	const surface = px.at(0, 0)
	let mark = surface
	for (let y = 0; y < px.height; y++) {
		for (let x = 0; x < px.width; x++) {
			const here = px.at(x, y)
			if (apart(here, surface) > apart(mark, surface)) mark = here
		}
	}
	return { surface, mark, contrast: apart(mark, surface) }
}

/**
 * The bands the week strip's load bar paints, read left to right along its
 * middle scanline. Three layers nest inside one another — the track, the
 * planned load, the part of it that has happened — so a layer that composites
 * to nothing costs the bar a band while its class name still looks right.
 *
 * Runs shorter than four pixels are the antialiasing on the rounded ends and on
 * each layer's own cap, not a layer.
 */
async function loadBands(bar: Locator) {
	const px = await pixelsOf(bar)
	const y = Math.floor(px.height / 2)
	const bands: { colour: Rgb; width: number }[] = []
	for (let x = 0; x < px.width; x++) {
		const here = px.at(x, y)
		const last = bands.at(-1)
		if (last && apart(here, last.colour) <= 6) last.width += 1
		else bands.push({ colour: here, width: 1 })
	}
	return bands.filter((band) => band.width >= 4)
}

/**
 * The strip's first load bar with all three layers wide enough to measure —
 * chosen from the laid-out widths rather than from a week key, because which
 * week is heaviest, and therefore how wide every other bar is drawn, depends on
 * the seed's arithmetic and not on the calendar.
 */
async function threeLayerBarIndex(strip: Locator) {
	const widths = await strip.evaluate((el) =>
		[...el.querySelectorAll('[data-load-bar]')].map((bar) => {
			const planned = bar.firstElementChild
			const done = planned?.firstElementChild
			return {
				track: bar.getBoundingClientRect().width,
				planned: planned?.getBoundingClientRect().width ?? 0,
				done: done?.getBoundingClientRect().width ?? 0,
			}
		}),
	)
	return widths.findIndex(
		(w) => w.done >= 5 && w.planned - w.done >= 5 && w.track - w.planned >= 5,
	)
}

for (const theme of ['light', 'dark'] as const) {
	test(`every state mark on the timeline is legible in ${theme} theme`, async ({
		page,
		navigate,
		login,
	}) => {
		test.setTimeout(120_000)
		const user = await login()
		await seedSeason(user.id)
		await seedThemeMarks(user.id)
		await useTheme(page, theme)

		await navigate('/')
		await expect(page.getByTestId('timeline-stream')).toBeVisible()
		await page.waitForTimeout(2500)
		// The theme is the one asked for, not whatever the machine prefers.
		expect(
			await page.evaluate(() => document.documentElement.className),
		).toContain(theme)

		// The row hover, measured as paint: `bg-white/4` over a white stream is a
		// perfectly well-formed colour that paints nothing. The probe goes on a row
		// carrying no tint of its own — today's rows do — at a point the row
		// actually owns: a row is ~115px tall in a ~380px scroller with a sticky
		// week header over the top of it, so both "wait for a whole row" and "take
		// the middle of what shows" land on nothing worth measuring.
		const probe = await page.getByTestId('timeline-stream').evaluate((el) => {
			const stream = el.getBoundingClientRect()
			for (const node of el.querySelectorAll<HTMLElement>('[data-status]')) {
				if (getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)')
					continue
				const box = node.getBoundingClientRect()
				const floor = Math.max(box.top, stream.top)
				for (
					let y = Math.min(box.bottom, stream.bottom) - 8;
					y > floor;
					y -= 8
				) {
					const owns = (x: number) =>
						node.contains(document.elementFromPoint(x, y))
					// The right margin, where no text can be mistaken for a tint.
					if (owns(box.right - 8) && owns(box.x + box.width / 2)) {
						return { x: box.right - 8, y, centre: box.x + box.width / 2 }
					}
				}
			}
			return null
		})
		expect(probe).not.toBeNull()
		const atRest = await pixelAt(page, probe!.x, probe!.y)
		await page.mouse.move(probe!.centre, probe!.y)
		await page.mouse.move(probe!.centre + 1, probe!.y)
		await page.waitForTimeout(150)
		const hovered = await pixelAt(page, probe!.x, probe!.y)
		expect(apart(atRest, hovered)).toBeGreaterThan(2)
		await page.mouse.move(1, 1)

		// The week strip's day dots: a planned day and an empty day, taken from
		// the same cell so they are read against the same surface.
		const strip = page.getByTestId('week-strip')
		const cell = strip.locator('button:has([title$="planned"])').first()
		const planned = await dotPaint(cell.locator('[title$="planned"]').first())
		const empty = await dotPaint(cell.locator('[title$="nothing"]').first())

		// The missed session's dot, on the row it belongs to. Centred rather than
		// merely scrolled into view: the week header is sticky, and a mark under
		// it is a mark that was never measured.
		const missedRow = page.locator('[data-status="missed"]').first()
		await missedRow.evaluate((el) => el.scrollIntoView({ block: 'center' }))
		await page.waitForTimeout(800)
		const missed = await dotPaint(
			page.getByRole('img', { name: /— missed$/ }).first(),
		)

		// Each of the three is a mark at all…
		expect(planned.contrast).toBeGreaterThanOrEqual(MARK_MIN)
		expect(empty.contrast).toBeGreaterThanOrEqual(MARK_MIN)
		expect(missed.contrast).toBeGreaterThanOrEqual(MARK_MIN)
		// …a planned day and an empty one say different things in the same cell…
		expect(apart(planned.mark, empty.mark)).toBeGreaterThanOrEqual(MARKS_APART)
		if (theme === 'light') {
			// …and in the theme this ticket is about, the missed lane is a third
			// tone rather than either of them. Only in light: the dark theme's
			// `ink-dimmest` and a 30% white border land within ten of each other,
			// which is #486's own mapping doing what it says and not a regression
			// this spec should hide — the two marks are a filled dot on a stream row
			// and an outline in the strip, never side by side.
			expect(apart(planned.mark, missed.mark)).toBeGreaterThanOrEqual(
				MARKS_APART,
			)
			expect(apart(empty.mark, missed.mark)).toBeGreaterThanOrEqual(MARKS_APART)
		}

		// The load bar keeps all three of its layers.
		const barIndex = await threeLayerBarIndex(strip)
		expect(barIndex).toBeGreaterThanOrEqual(0)
		const bands = await loadBands(
			strip.locator('[data-load-bar]').nth(barIndex),
		)
		expect(bands).toHaveLength(3)
		expect(apart(bands[0]!.colour, bands[1]!.colour)).toBeGreaterThanOrEqual(
			MARKS_APART,
		)
		expect(apart(bands[1]!.colour, bands[2]!.colour)).toBeGreaterThanOrEqual(
			MARKS_APART,
		)

		// And the pill wears this theme's shadow, off the one token minted for it.
		// The token is defined for this theme…
		const token = await page.evaluate(() =>
			getComputedStyle(document.documentElement)
				.getPropertyValue('--shadow-pill')
				.trim(),
		)
		expect(token).toContain(PILL_SHADOW[theme].offsets)
		expect(token).toContain(PILL_SHADOW[theme].alpha)
		const stream = page.getByTestId('timeline-stream')
		for (let pass = 0; pass < 12; pass++) {
			await stream.evaluate((el) => {
				el.scrollTop = el.scrollHeight
			})
			await page.waitForTimeout(450)
			const state = await streamState(page)
			if (state.todayOffset! - state.scrollTop < -60) break
		}
		const pill = page.getByRole('button', { name: /back to today/i })
		await expect(pill).toBeVisible()
		// …and it is the token the pill is painting with, not a literal of its own.
		const shadow = await pill.evaluate((el) => getComputedStyle(el).boxShadow)
		expect(shadow).toContain(PILL_SHADOW[theme].offsets)
		expect(shadow).not.toContain(
			PILL_SHADOW[theme === 'light' ? 'dark' : 'light'].offsets,
		)
	})
}

/**
 * The hero names the day of the session it is showing (#493).
 *
 * Three fixtures at 390x844, one per shape of today — still to come, completed,
 * and empty — with the same session waiting two days out in all three, so the
 * only thing that differs is what today itself holds.
 *
 * The times are absolute rather than relative: the athlete timezone defaults to
 * UTC, so today's own midnight is always in the past and today's last
 * millisecond is always in the future, whatever hour CI happens to run at. An
 * offset like "now + 1 hour" reads as tomorrow just after midnight, which is
 * exactly the kind of by-the-calendar failure #493 is about.
 */
type TodayShape = 'to-come' | 'completed' | 'empty'

/** The weekday name the hero must use for a session two days out. */
function weekdayTwoDaysOut(): string {
	const day = 24 * 60 * 60 * 1000
	return new Intl.DateTimeFormat('en-GB', {
		weekday: 'long',
		timeZone: 'UTC',
	}).format(new Date(Date.now() + 2 * day))
}

async function seedHeroDay(userId: string, shape: TodayShape) {
	const todayKey = new Date().toISOString().slice(0, 10)
	const day = 24 * 60 * 60 * 1000
	const nextKey = new Date(Date.now() + 2 * day).toISOString().slice(0, 10)
	const workout = (title: string) =>
		prisma.workout.create({
			data: {
				title,
				discipline: 'run',
				intent: 'threshold',
				ownerId: userId,
				blocks: {
					create: [
						{
							orderIndex: 0,
							repeatCount: 1,
							steps: {
								create: [{ orderIndex: 0, kind: 'cardio', durationSec: 3600 }],
							},
						},
					],
				},
			},
		})
	const session = (data: {
		workoutId: string
		scheduledAt: Date
		status: string
		tssValue?: number | null
		plannedTssValue: number
	}) =>
		prisma.workoutSession.create({
			data: {
				userId,
				workoutId: data.workoutId,
				scheduledAt: data.scheduledAt,
				status: data.status,
				tssValue: data.tssValue ?? null,
				plannedTssValue: data.plannedTssValue,
				plannedTssConfidence: 'full',
				source: 'authored',
			},
		})

	// Two days out, in every fixture: the session the hero falls back to.
	const next = await workout('Interval Run')
	await session({
		workoutId: next.id,
		scheduledAt: new Date(`${nextKey}T12:00:00.000Z`),
		status: 'scheduled',
		plannedTssValue: 55,
	})
	if (shape === 'empty') return
	const today = await workout('Tempo Run')
	await session({
		workoutId: today.id,
		// Today's last millisecond when it is still to come; today's first when it
		// is already logged.
		scheduledAt: new Date(
			shape === 'to-come'
				? `${todayKey}T23:59:59.999Z`
				: `${todayKey}T00:00:00.000Z`,
		),
		status: shape === 'to-come' ? 'scheduled' : 'completed',
		tssValue: shape === 'to-come' ? null : 88,
		plannedTssValue: 91,
	})
}

test('today still to come: the kicker says today and the heading is that session', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedHeroDay(user.id, 'to-come')

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()

	await expect(
		page.getByRole('heading', { name: 'Tempo Run', level: 1 }),
	).toBeVisible()
	await expect(page.getByText(/^today · run/i)).toBeVisible()
	// The headline is already today's, so there is nothing to demote to a fact.
	await expect(page.getByText(/next up ·/i)).toHaveCount(0)
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0)
})

test("today completed: the hero says today is done, never headlining a later session as today's", async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedHeroDay(user.id, 'completed')

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()

	await expect(
		page.getByRole('heading', { name: 'Today is done', level: 1 }),
	).toBeVisible()
	await expect(page.getByText('Next up · Interval Run')).toBeVisible()
	// The kicker names the day that session is actually on.
	await expect(
		page.getByText(new RegExp(`^${weekdayTwoDaysOut()} · run`, 'i')),
	).toBeVisible()
	await expect(page.getByText(/^today · run/i)).toHaveCount(0)
})

test('today empty: the hero says so and presents what is next as a fact', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedHeroDay(user.id, 'empty')

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()

	await expect(
		page.getByRole('heading', { name: 'Nothing on today', level: 1 }),
	).toBeVisible()
	await expect(page.getByText('Next up · Interval Run')).toBeVisible()
	await expect(
		page.getByText(new RegExp(`^${weekdayTwoDaysOut()} · run`, 'i')),
	).toBeVisible()
	await expect(page.getByText(/^today · run/i)).toHaveCount(0)
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0)
})
