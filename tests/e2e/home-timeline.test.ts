import { type Locator, type Page } from '@playwright/test'
import sharp from 'sharp'
import { landingTop } from '#app/routes/_home/timeline/anchoring.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Theme } from '#app/utils/theme.server.ts'
import { expect, middayTimezone, test } from '#tests/playwright-utils.ts'

/**
 * I dag: the top line, the season strip and the list, opened on today
 * (ADR 0086). No hero; a list that never has its scroll taken from the reader.
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
	return page.getByTestId('timeline-stream').evaluate((el) => {
		const offset = (node: Element) =>
			Math.round(
				node.getBoundingClientRect().top -
					el.getBoundingClientRect().top +
					el.scrollTop,
			)
		const today = el.querySelector('[data-timeline-today]')
		const week = today?.closest('[data-timeline-week]')
		const header = week?.querySelector('[data-week-header]')
		return {
			scrollTop: Math.round(el.scrollTop),
			scrollHeight: el.scrollHeight,
			clientHeight: el.clientHeight,
			weeks: el.querySelectorAll('[data-timeline-week]').length,
			// Today's row, measured against the scroller's own box — never
			// `offsetTop`, whose offsetParent is not the thing being scrolled.
			todayOffset: today ? offset(today) : null,
			todayHeight: today ? today.getBoundingClientRect().height : 0,
			weekOffset: week ? offset(week) : null,
			// The week's sticky header, measured: never a fixed number — it grows
			// with the week's tracks.
			headerHeight: header ? header.getBoundingClientRect().height : 0,
		}
	})
}

/** Where "parked on today" is right now: the landing's own rule, measured. */
async function landingOf(page: Page) {
	const state = await streamState(page)
	return Math.round(
		landingTop({
			weekOffset: state.weekOffset!,
			todayOffset: state.todayOffset!,
			todayHeight: state.todayHeight,
			headerHeight: state.headerHeight,
			clientHeight: state.clientHeight,
		}),
	)
}

/**
 * Scroll the stream the way a reader does: an input first (a wheel), then the
 * position, **instantly**. The input matters (ADR 0086): until the reader's
 * first input the landing still follows late layout, and a probe that only
 * assigns `scrollTop` is not a reader. The scroller carries `scroll-behavior:
 * smooth` for the keyboard, which native gestures ignore and an assignment
 * does not, so it is switched off around the write.
 */
async function scrollStreamTo(page: Page, top: number | 'end') {
	await page.getByTestId('timeline-stream').evaluate((el, to) => {
		el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 1 }))
		const previous = el.style.scrollBehavior
		el.style.scrollBehavior = 'auto'
		el.scrollTop = to === 'end' ? el.scrollHeight : to
		el.style.scrollBehavior = previous
	}, top)
}

/**
 * Count the app's own `scrollTop` writes on the list from here on — the
 * writes made by the page's bundled code, told apart from a test's
 * `evaluate` by the stack, which for the app's names a served script URL.
 */
async function countAppWrites(page: Page) {
	await page.evaluate(() => {
		const w = window as unknown as { __appWrites?: number[] }
		if (w.__appWrites) {
			w.__appWrites.length = 0
			return
		}
		w.__appWrites = []
		const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!
		Object.defineProperty(Element.prototype, 'scrollTop', {
			configurable: true,
			get() {
				return d.get!.call(this)
			},
			set(value: number) {
				if (
					this instanceof Element &&
					this.hasAttribute('data-timeline-stream') &&
					/https?:\/\//.test(new Error().stack ?? '')
				) {
					w.__appWrites!.push(value)
				}
				d.set!.call(this, value)
			},
		})
	})
	return () =>
		page.evaluate(
			() => (window as unknown as { __appWrites: number[] }).__appWrites.length,
		)
}

/**
 * Read forward until the stream stops growing — the way a thumb reaches the end
 * of the season. One write to the end is not enough: the window grows as the
 * reader nears its edge, and a week arriving below is more stream to read.
 */
async function readToTheEnd(page: Page) {
	for (let pass = 0; pass < 12; pass++) {
		const before = (await streamState(page)).weeks
		await scrollStreamTo(page, 'end')
		await page.waitForTimeout(450)
		const after = await streamState(page)
		if (
			after.weeks === before &&
			after.scrollTop >= after.scrollHeight - after.clientHeight - 1
		)
			break
	}
}

/**
 * The "I dag" pill in the season strip (#505): always there, and where today
 * is from the reader — `-1` above, `0` in view, `1` below — is its `data-away`.
 */
function todayPill(page: Page) {
	return page.locator('[data-today-pill]')
}

/**
 * Open every folded week the stream has mounted (#505 story 31): a closed week
 * reads as one line until it is opened, and some of these checks are about the
 * rows inside one.
 */
async function openFoldedWeeks(page: Page) {
	const folds = page.locator('[data-timeline-fold][aria-expanded="false"]')
	for (let tries = 0; tries < 20 && (await folds.count()) > 0; tries++) {
		await folds.first().dispatchEvent('click')
		await page.waitForTimeout(150)
	}
}

async function seedSeason(userId: string) {
	const now = new Date()
	const day = 24 * 60 * 60 * 1000
	// "Earlier today" and "later today" below are hours from now, so the
	// athlete's day has to have those hours in it.
	await prisma.athleteProfile.create({
		data: { userId, timezone: middayTimezone(now) },
	})
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
	// This week: today's session — the landing anchor and today's row's subject —
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

/**
 * A lifting day that ran one set short: `5 × 5` squats prescribed, four logged,
 * plus a warm-up rung and an abandoned set that must reach neither the kilos
 * line nor the count. Yesterday, so it lands in the window the stream opens on.
 */
async function seedShortLiftingSession(userId: string) {
	const exercise = await prisma.exercise.create({
		select: { id: true },
		data: { name: 'Back Squat', primaryMuscle: 'quads', isCompound: true },
	})
	const workout = await prisma.workout.create({
		select: {
			id: true,
			blocks: { select: { steps: { select: { id: true } } } },
		},
		data: {
			title: 'Workout A',
			discipline: 'strength',
			intent: 'strength',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'strength',
									exerciseId: exercise.id,
									sets: {
										create: [0, 1, 2, 3, 4].map((i) => ({
											orderIndex: i,
											kind: 'reps',
											reps: 5,
											load: JSON.stringify({ kind: 'absolute', kg: 82.5 }),
										})),
									},
								},
							],
						},
					},
				],
			},
		},
	})
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
			status: 'completed',
			tssValue: 78,
		},
	})
	const load = JSON.stringify({ kind: 'external', kg: 82.5 })
	const stepId = workout.blocks[0]!.steps[0]!.id
	await prisma.exerciseSetLog.createMany({
		data: [
			...[0, 1, 2, 3].map((i) => ({
				sessionId: session.id,
				stepId,
				exerciseId: exercise.id,
				orderIndex: i,
				role: 'working',
				outcome: 'completed',
				load,
				reps: 5,
			})),
			{
				sessionId: session.id,
				stepId,
				exerciseId: exercise.id,
				orderIndex: 1000,
				role: 'warmup',
				outcome: 'completed',
				load: JSON.stringify({ kind: 'external', kg: 40 }),
				reps: 5,
			},
			{
				sessionId: session.id,
				stepId,
				exerciseId: exercise.id,
				orderIndex: 4,
				role: 'working',
				outcome: 'abandoned',
				load,
				reps: null,
			},
		],
	})
}

test('opens parked on today before the first paint: no hero, no jump, and the list gets the screen', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()
	await seedSeason(user.id)

	// Where the list is when the document has been parsed — before the app has
	// hydrated at all. The server's landing script (ADR 0086, #505 P6) has
	// already parked it; the old screen showed the top of the season here and
	// jumped to today a moment later.
	await page.addInitScript(() => {
		document.addEventListener('DOMContentLoaded', () => {
			const el = document.querySelector('[data-timeline-stream]')
			;(window as unknown as { __parsedAt: number | null }).__parsedAt = el
				? Math.round(el.scrollTop)
				: null
		})
	})
	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(1500)

	const state = await streamState(page)
	// The stream is a bounded scroller, not the page.
	expect(state.scrollHeight).toBeGreaterThan(state.clientHeight)
	// Parked by the landing rule: the week's top when the week fits up to
	// today, else today under the week's sticky header.
	expect(state.todayOffset).not.toBeNull()
	expect(
		Math.abs(state.scrollTop - (await landingOf(page))),
	).toBeLessThanOrEqual(1)
	const parsedAt = await page.evaluate(
		() => (window as unknown as { __parsedAt: number | null }).__parsedAt,
	)
	expect(parsedAt).not.toBeNull()
	expect(parsedAt).toBeGreaterThan(0)
	expect(Math.abs(parsedAt! - state.scrollTop)).toBeLessThanOrEqual(2)
	// Today lands *below* its week's sticky header, never under it.
	const clear = await page.getByTestId('timeline-stream').evaluate((el) => {
		const today = el.querySelector('[data-timeline-today]')!
		const header = today
			.closest('[data-timeline-week]')!
			.querySelector('[data-week-header]')!
		return (
			today.getBoundingClientRect().top - header.getBoundingClientRect().bottom
		)
	})
	expect(clear).toBeGreaterThanOrEqual(8)
	// The page itself does not scroll — the frame is the viewport.
	expect(
		await page.evaluate(
			() => document.documentElement.scrollHeight <= window.innerHeight + 1,
		),
	).toBe(true)
	// No hero, and the list gets what is left: well over half the phone.
	await expect(page.getByTestId('hero-fold')).toHaveCount(0)
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0)
	expect(state.clientHeight).toBeGreaterThan(500)
	// The week header and day rows on the first screen, not one row.
	const rows = await page.getByTestId('timeline-stream').evaluate((el) => {
		const box = el.getBoundingClientRect()
		return [...el.querySelectorAll('[data-timeline-day]')].filter((row) => {
			const r = row.getBoundingClientRect()
			return r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1
		}).length
	})
	expect(rows).toBeGreaterThanOrEqual(2)
	// The pill points nowhere on first paint: today is right there.
	await expect(todayPill(page)).toHaveAttribute('data-away', '0')
	await expect(todayPill(page)).toHaveText('I dag')
	// No horizontal overflow at 390px.
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0)
})

test('the reader’s own scroll is never taken back: no snap-back to today', async ({
	page,
	navigate,
	login,
}) => {
	// #505 P1: the settle ladder re-applied the landing for 1.3s, so a reader
	// who scrolled at 400ms was yanked back at 1.7s. The landing now follows late
	// layout only until the reader's first input, and never after it.
	test.setTimeout(120_000)
	const user = await login()
	await seedSeason(user.id)

	await navigate('/')
	const stream = page.getByTestId('timeline-stream')
	await expect(stream).toBeVisible()
	await page.waitForTimeout(300)
	const landed = (await streamState(page)).scrollTop
	const box = (await stream.boundingBox())!
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
	await page.mouse.wheel(0, 300)
	await expect
		.poll(async () => (await streamState(page)).scrollTop)
		.toBeGreaterThan(landed + 100)
	const scrolled = (await streamState(page)).scrollTop
	await page.waitForTimeout(1600)
	expect((await streamState(page)).scrollTop).toBe(scrolled)
})

test('the whole past is mounted on open, and scrolling up through it writes no scroll position', async ({
	page,
	navigate,
	login,
}) => {
	// #505 P2: reading up used to mount one folded week per frame and write
	// `scrollTop` to pay for each, which cancels a phone's fling. Every week
	// before today is mounted from the start now, so there is nothing to grow
	// and nothing to pay for.
	test.setTimeout(120_000)
	const user = await login()
	await seedSeason(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(1500)

	const weeks = (await streamState(page)).weeks
	const firstWeek = await page
		.getByTestId('week-strip')
		.locator('[data-timeline-cell]')
		.first()
		.getAttribute('data-timeline-cell')
	await expect(
		page.locator(`[data-timeline-week="${firstWeek}"]`),
	).toBeAttached()

	const appWrites = await countAppWrites(page)
	const start = (await streamState(page)).scrollTop
	for (let top = start; top > 0; top -= 120) {
		await scrollStreamTo(page, top)
		await page.evaluate(
			() => new Promise((r) => requestAnimationFrame(() => r(null))),
		)
	}
	await scrollStreamTo(page, 0)
	await page.waitForTimeout(500)
	expect(await appWrites()).toBe(0)
	expect((await streamState(page)).weeks).toBe(weeks)
	expect((await streamState(page)).scrollTop).toBe(0)
	// The near end says how far home reads.
	await expect(page.getByText(/^I dag leser tilbake til/)).toBeVisible()
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

	// Not pointing anywhere on first paint: today is right there.
	await expect(todayPill(page)).toHaveAttribute('data-away', '0')

	// Read forward until today's row has actually left the top of the viewport.
	for (let pass = 0; pass < 12; pass++) {
		await scrollStreamTo(page, 'end')
		await page.waitForTimeout(450)
		const state = await streamState(page)
		if (state.todayOffset! - state.scrollTop < -60) break
	}
	const away = await streamState(page)
	expect(away.todayOffset! - away.scrollTop).toBeLessThan(-60)

	// The label carries the direction: today is above, so the arrow points up —
	// and the pill, which was there all along, changes look rather than arriving.
	const pill = page.getByRole('button', { name: 'Gå opp til i dag' })
	await expect(pill).toBeVisible()
	await expect(pill).toHaveAttribute('data-away', '-1')

	// And it puts the list back on the landing, at once: a jump, not a glide.
	await pill.click()
	expect((await streamState(page)).scrollTop).toBe(await landingOf(page))
	await expect(todayPill(page)).toHaveAttribute('data-away', '0')
	const back = await streamState(page)
	const rel = back.todayOffset! - back.scrollTop
	expect(rel).toBeGreaterThan(-60)
	expect(rel).toBeLessThan(back.clientHeight - 40)
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

	// Weeks ahead mount below as the reader nears the end, which moves nothing
	// they can see — so it needs no compensation, and makes no write.
	const appWrites = await countAppWrites(page)
	await readToTheEnd(page)
	expect(await appWrites()).toBe(0)

	// Both ends are stated rather than left as an empty scroll.
	await expect(page.getByText(/alt er skrevet til og med/i)).toBeVisible()
})

test('tapping a week in the strip jumps the stream there, and the frame follows the scroll', async ({
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
	const cells = strip.locator('[data-timeline-cell]')
	// The whole season is in the strip, all of it on screen at once: nothing to
	// scroll sideways, so no week is ever cut off at an edge.
	expect(await cells.count()).toBeGreaterThanOrEqual(
		(await streamState(page)).weeks,
	)
	expect(
		await strip.evaluate((el) => el.scrollWidth - el.clientWidth),
	).toBeLessThanOrEqual(0)
	const box = await strip.locator('[data-strip-bars]').boundingBox()
	expect(box!.x).toBeGreaterThanOrEqual(0)
	expect(box!.x + box!.width).toBeLessThanOrEqual(390)

	/** Which weeks the frame outlines, read off its geometry against the bars. */
	const framed = () =>
		strip.evaluate((el) => {
			const frame = el
				.querySelector('[data-strip-frame]')!
				.getBoundingClientRect()
			return [...el.querySelectorAll<HTMLElement>('[data-timeline-cell]')]
				.filter((cell) => {
					const b = cell.getBoundingClientRect()
					const centre = b.left + b.width / 2
					return centre > frame.left && centre < frame.right
				})
				.map((cell) => cell.getAttribute('data-timeline-cell'))
		})
	/** The weeks whose headers are on screen in the stream right now. */
	const onScreen = () =>
		page.getByTestId('timeline-stream').evaluate((el) => {
			const top = el.getBoundingClientRect().top
			const bottom = top + el.clientHeight
			const weeks = [
				...el.querySelectorAll<HTMLElement>('[data-timeline-week]'),
			]
			return weeks
				.filter((week, i) => {
					const start = week.getBoundingClientRect().top
					const next = weeks[i + 1]?.getBoundingClientRect().top ?? Infinity
					return start < bottom && next > top
				})
				.map((week) => week.getAttribute('data-timeline-week'))
		})

	// Parked on today: the frame is over the weeks the stream shows, today's
	// among them.
	const todayWeek = await cells.evaluateAll((all) =>
		all
			.find((cell) => cell.hasAttribute('data-now'))
			?.getAttribute('data-timeline-cell'),
	)
	await expect.poll(framed).toContain(todayWeek)
	expect(await framed()).toEqual(await onScreen())

	// Reading forwards moves it with the reader.
	await readToTheEnd(page)
	await expect
		.poll(async () => (await framed()).join())
		.toBe((await onScreen()).join())
	expect(await framed()).not.toContain(todayWeek)

	// Tapping the oldest week jumps there **at once** (ADR 0086): measured in
	// the same task as the press, so a smooth glide, or a jump that waited for a
	// later frame, would fail it.
	const oldest = cells.first()
	const key = await oldest.getAttribute('data-timeline-cell')
	const cellBox = (await oldest.boundingBox())!
	const jumped = await page.evaluate(
		({ key, x, y }) => {
			const bars = document.querySelector('[data-strip-bars]')!
			bars.dispatchEvent(
				new PointerEvent('pointerdown', {
					bubbles: true,
					clientX: x,
					clientY: y,
					button: 0,
					pointerId: 1,
				}),
			)
			bars.dispatchEvent(
				new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }),
			)
			const el = document.querySelector('[data-timeline-stream]')!
			const week = el.querySelector(`[data-timeline-week="${key}"]`)!
			return Math.round(
				week.getBoundingClientRect().top - el.getBoundingClientRect().top,
			)
		},
		{
			key,
			x: cellBox.x + cellBox.width / 2,
			y: cellBox.y + cellBox.height / 2,
		},
	)
	expect(Math.abs(jumped)).toBeLessThanOrEqual(4)
	// It stays there: nothing re-lands the reader after a jump.
	await page.waitForTimeout(1000)
	await expect(strip.locator('[aria-current="true"]')).toHaveAttribute(
		'data-timeline-cell',
		key!,
	)
	await expect.poll(framed).toContain(key)
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
	await expect(page.getByText('TSS 88 / 91 · I RUTE')).toBeVisible()

	// The recorded session three weeks back has no plan to compare against.
	const strip = page.getByTestId('week-strip')
	await strip.locator('[data-timeline-cell]').first().click()
	await page.waitForTimeout(1000)
	await expect(
		page.getByText('UTENFOR PLANEN · INGEN PLAN Å SAMMENLIGNE MED').first(),
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
	// Settle the box before reading it. The list's scroller is smooth for the
	// keyboard, so "scroll, wait a beat, screenshot" is not sound. A clip taken mid-motion lands on the neighbouring row's ink, or on
	// bare surface, and reports a contrast that belongs to neither. This waits
	// for the element to come to rest and shoots it there; it never moves an
	// element a caller has already placed, because a visible box needs no
	// scrolling.
	await target.scrollIntoViewIfNeeded()
	let last = ''
	for (let tries = 0; tries < 25; tries++) {
		const here = JSON.stringify(await target.boundingBox())
		if (here === last) break
		last = here
		await target.page().waitForTimeout(100)
	}
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

		// **No** row hover, measured as paint (#502). This probe was written for
		// the tint — `bg-white/4` over a white stream is a perfectly well-formed
		// colour that paints nothing, which is what #486 fixed — and the motion
		// pass then removed the tint outright: a touchscreen fires a false hover on
		// every tap, so the row lit up under a finger that had already left it.
		// The probe stays, inverted, because "the tint is gone" is worth holding as
		// tightly as "the tint is visible" was. It goes on a row carrying no tint
		// of its own — today's rows do — at a point the row actually owns: a row is
		// ~115px tall in a ~380px scroller with a sticky week header over the top
		// of it, so both "wait for a whole row" and "take the middle of what shows"
		// land on nothing worth measuring.
		//
		// On a phone the tab bar (ADR 0083) takes the bottom of the screen, so at
		// rest today's tinted rows can be all the stream shows. Then the probe reads
		// the stream once more, a little further on.
		const findProbe = () =>
			page.getByTestId('timeline-stream').evaluate((el) => {
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
		let probe = await findProbe()
		if (probe == null) {
			await page
				.getByTestId('timeline-stream')
				.evaluate((el) => el.scrollBy({ top: 240, behavior: 'instant' }))
			await page.waitForTimeout(600)
			probe = await findProbe()
		}
		expect(probe).not.toBeNull()
		const atRest = await pixelAt(page, probe!.x, probe!.y)
		await page.mouse.move(probe!.centre, probe!.y)
		await page.mouse.move(probe!.centre + 1, probe!.y)
		await page.waitForTimeout(150)
		const hovered = await pixelAt(page, probe!.x, probe!.y)
		expect(apart(atRest, hovered)).toBe(0)
		await page.mouse.move(1, 1)

		// The season strip's marks (#505): a planned bar, and what was done
		// filling one — the two states a bar can say — each read against the strip
		// behind it, in a week where all three show: surface above the bar, bar
		// above the fill, fill at the foot.
		const strip = page.getByTestId('week-strip')
		await strip.scrollIntoViewIfNeeded()
		const spots = await strip.evaluate((el) => {
			for (const cell of el.querySelectorAll('[data-timeline-cell]')) {
				const bar = cell.querySelector('[data-strip-bar]')
				const done = cell.querySelector('[data-strip-done]')
				if (!bar || !done) continue
				const c = cell.getBoundingClientRect()
				const b = bar.getBoundingClientRect()
				const d = done.getBoundingClientRect()
				if (b.top - c.top < 6 || d.top - b.top < 4 || d.height < 4) continue
				const x = d.left + d.width / 2
				return {
					surface: { x, y: c.top + 2 },
					planned: { x, y: b.top + (d.top - b.top) / 2 },
					done: { x, y: d.top + d.height / 2 },
				}
			}
			return null
		})
		expect(spots).not.toBeNull()
		const surface = await pixelAt(page, spots!.surface.x, spots!.surface.y)
		const plannedInk = await pixelAt(page, spots!.planned.x, spots!.planned.y)
		const doneInk = await pixelAt(page, spots!.done.x, spots!.done.y)
		const planned = { mark: plannedInk, contrast: apart(plannedInk, surface) }
		const empty = { mark: doneInk, contrast: apart(doneInk, surface) }

		// The missed session's dot, on the row it belongs to. Centred rather than
		// merely scrolled into view: the week header is sticky, and a mark under
		// it is a mark that was never measured.
		// Yesterday can sit in last week, which reads folded until it is opened.
		await openFoldedWeeks(page)
		const missedRow = page.locator('[data-status="missed"]').first()
		await missedRow.evaluate((el) => el.scrollIntoView({ block: 'center' }))
		await page.waitForTimeout(800)
		const missed = await dotPaint(
			page.getByRole('img', { name: /— ikke gjort$/ }).first(),
		)

		// Each of the three is a mark at all…
		expect(planned.contrast).toBeGreaterThanOrEqual(MARK_MIN)
		expect(empty.contrast).toBeGreaterThanOrEqual(MARK_MIN)
		expect(missed.contrast).toBeGreaterThanOrEqual(MARK_MIN)
		// …and a planned bar and what was done inside it say two different
		// things: a bar tuned for one theme that composites to nothing in the
		// other would lose the difference while its class name still looked
		// right (#486).
		expect(apart(planned.mark, empty.mark)).toBeGreaterThanOrEqual(MARKS_APART)

		// And the pill, once today is away, is a filled control in this theme:
		// its fill stands apart from the page behind it (#486's lesson, for the
		// one control that changes look).
		for (let pass = 0; pass < 12; pass++) {
			await scrollStreamTo(page, 'end')
			await page.waitForTimeout(450)
			const state = await streamState(page)
			if (state.todayOffset! - state.scrollTop < -60) break
		}
		const pill = page.getByRole('button', { name: 'Gå opp til i dag' })
		await expect(pill).toBeVisible()
		const fill = await inkPaint(pill)
		const page_ = await pixelAt(
			page,
			((await pill.boundingBox())!.x as number) - 8,
			(await pill.boundingBox())!.y + 4,
		)
		expect(apart(fill.surface, page_)).toBeGreaterThanOrEqual(MARKS_APART)
	})
}

/**
 * Today's row says what today holds (#493, ADR 0086): the hero's old job.
 *
 * Three fixtures at 390x844, one per shape of today — still to come, completed,
 * and empty — with the same session waiting two days out in all three, so the
 * only thing that differs is what today itself holds.
 *
 * The times are absolute rather than relative: the athlete timezone defaults to
 * UTC, so today's own midnight is always in the past and today's last
 * millisecond is always in the future, whatever hour CI happens to run at.
 */
type TodayShape = 'to-come' | 'completed' | 'empty'

async function seedTodayShape(userId: string, shape: TodayShape) {
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

	// Two days out, in every fixture.
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

const todayRow = (page: Page) =>
	page.getByTestId('timeline-stream').locator('[data-timeline-today]')

test('today still to come: today’s row is that session, with its action on it', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedTodayShape(user.id, 'to-come')

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()

	const row = todayRow(page)
	await expect(row).toBeInViewport()
	await expect(row.getByRole('link', { name: /Tempo Run/ })).toBeVisible()
	const cta = row.getByRole('link', { name: 'Se økta' })
	await expect(cta).toBeVisible()
	// A real 44px-reachable control, on the row it opens.
	expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(32)
	// The coach's one line, said once, in today's row.
	await expect(row.locator('[data-today-verdict]')).toHaveCount(1)
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0)
})

test('today completed: today’s row is the done session, and nothing later is headlined as today’s', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedTodayShape(user.id, 'completed')

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()

	const row = todayRow(page)
	await expect(row.getByRole('link', { name: /Tempo Run/ })).toBeVisible()
	await expect(row).not.toContainText('Interval Run')
	await expect(page.getByRole('link', { name: 'Se økta' })).toHaveCount(0)
})

test('today empty: today’s row says so, and is the cell that writes one', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedTodayShape(user.id, 'empty')

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()

	const row = todayRow(page)
	await expect(row).toContainText('Ingenting i dag')
	await expect(row).not.toContainText('Interval Run')
	await expect(page.getByRole('link', { name: 'Se økta' })).toHaveCount(0)
	await row.locator('[data-timeline-empty]').click()
	await expect(row.locator('[data-timeline-draft]')).toBeVisible()
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0)
})

/**
 * One vertical axis and one strip (ADR 0086). The hero's pager is gone, so
 * the only sideways instrument is the strip, which shows the whole season and
 * has nothing to scroll; a vertical drag anywhere on the list scrolls the list.
 */
for (const theme of ['light', 'dark'] as const) {
	test(`a sideways swipe over the strip moves nothing, and the list scrolls (${theme})`, async ({
		page,
		navigate,
		login,
	}) => {
		test.setTimeout(120_000)
		const user = await login()
		await seedSeason(user.id)
		await useTheme(page, theme)

		await navigate('/')
		await expect(page.getByTestId('timeline-stream')).toBeVisible()
		await page.waitForTimeout(1500)

		const strip = page.getByTestId('week-strip')
		expect(
			await strip.evaluate((el) => el.scrollWidth - el.clientWidth),
		).toBeLessThanOrEqual(0)
		await expect(strip).toBeInViewport()
		const before = await streamState(page)

		const box = (await strip.boundingBox())!
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
		await page.mouse.wheel(240, 0)
		await page.waitForTimeout(400)
		expect((await streamState(page)).scrollTop).toBe(before.scrollTop)

		// The list's overscroll is contained: its end never drags the page.
		expect(
			await page
				.getByTestId('timeline-stream')
				.evaluate((el) => getComputedStyle(el).overscrollBehaviorY),
		).toBe('contain')
		const list = (await page.getByTestId('timeline-stream').boundingBox())!
		await page.mouse.move(list.x + list.width / 2, list.y + list.height / 2)
		await page.mouse.wheel(0, 200)
		await expect
			.poll(async () => (await streamState(page)).scrollTop)
			.toBeGreaterThan(before.scrollTop)

		expect(
			await page.evaluate(
				() =>
					document.documentElement.scrollWidth -
					document.documentElement.clientWidth,
			),
		).toBeLessThanOrEqual(0)
	})
}

for (const theme of ['light', 'dark'] as const) {
	test(`a lifting session states what it lifted, and its shortfall (${theme})`, async ({
		page,
		navigate,
		login,
	}) => {
		test.setTimeout(120_000)
		const user = await login()
		await seedShortLiftingSession(user.id)
		// Both themes, because the chip's amber is a token and a token can be
		// undefined on one side of the switch (#486).
		await page.context().addCookies([
			{
				name: 'en_theme',
				value: theme,
				url: page.url().startsWith('http') ? page.url() : 'http://localhost',
			},
		])

		await navigate('/')
		const stream = page.getByTestId('timeline-stream')
		await expect(stream).toBeVisible()

		// Line 1: the lift and its kilos — never the warm-up's 40 kg, and never
		// the prescription's own numbers.
		await expect(stream.getByText('Back Squat 82.5 × 5')).toBeVisible()
		// Line 2: the figure, naming where it came from.
		await expect(
			stream.getByText('sRPE 78 — fra tid og innsats, ikke fra settene'),
		).toBeVisible()
		// The chip: four of five, because the abandoned set is not a set that
		// happened and the warm-up rung was never asked for.
		const chip = stream.getByText('SETT 4 / 5')
		await expect(chip).toBeVisible()
		// Amber, and a real colour rather than an unresolved token.
		const colour = await chip.evaluate(
			(el) => getComputedStyle(el).color as string,
		)
		expect(colour).toMatch(/^(rgb|oklch|color)\(/)
		expect(colour).not.toBe('rgba(0, 0, 0, 0)')
	})
}

// ── the grid: every day from today forward is a row (#497) ────────────────

/**
 * A week shaped the way a plan shapes one: sessions on some days, nothing on
 * others, and **nothing on today**. That is what a rest day looks like on this
 * surface, and it is one or two days a week in an endurance plan rather than an
 * edge case.
 *
 * The offsets are all in whole days from today, so the fixture is the same
 * shape whatever weekday the suite runs on — but which of them land in *this*
 * week moves with the calendar, which is exactly why the assertions below are
 * written about the set of dates the stream renders rather than about named
 * weekdays.
 */
async function seedRestDayToday(userId: string, opts: { around: boolean }) {
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
							create: [{ orderIndex: 0, kind: 'cardio', durationSec: 3600 }],
						},
					},
				],
			},
		},
	})
	const session = (days: number, status: string, tss: number | null) =>
		prisma.workoutSession.create({
			data: {
				userId,
				workoutId: workout.id,
				scheduledAt: new Date(Date.now() + days * day),
				status,
				tssValue: tss,
				plannedTssValue: 60,
				plannedTssConfidence: 'full',
				source: 'authored',
			},
		})

	// Far enough either side that the season has weeks to grow into and the
	// stream is a real scroller — without which there is no landing to measure.
	await session(-16, 'completed', 55)
	await session(-15, 'completed', 48)
	await session(-9, 'completed', 61)
	await session(9, 'scheduled', null)
	await session(16, 'scheduled', null)
	// The days immediately either side of today, or nothing at all: a rest day
	// the plan left inside a written week, against a day in a week nobody has
	// written anything in. The row is the same either way — which is the point.
	if (opts.around) {
		await session(-1, 'completed', 52)
		await session(1, 'scheduled', null)
		await session(2, 'scheduled', null)
	}
}

/**
 * Every day the stream has a row for, and whether that row is an empty cell —
 * a day folded into a run of free days (#505 story 30) included, as a day the
 * stream holds behind one short row.
 */
async function renderedDays(page: Page) {
	return page.getByTestId('timeline-stream').evaluate((el) => ({
		days: [
			...[...el.querySelectorAll<HTMLElement>('[data-timeline-day]')].map(
				(node) => ({
					key: node.dataset.timelineDay ?? '',
					empty: !!node.querySelector('[data-timeline-empty]'),
				}),
			),
			...[...el.querySelectorAll<HTMLElement>('[data-band-days]')].flatMap(
				(node) =>
					(node.dataset.bandDays ?? '')
						.split(' ')
						.map((key) => ({ key, empty: true })),
			),
		],
		lastWeek:
			[...el.querySelectorAll<HTMLElement>('[data-timeline-week]')]
				.map((node) => node.getAttribute('data-timeline-week') ?? '')
				.pop() ?? '',
	}))
}

/** `YYYY-MM-DD`, `days` on. */
function dayKey(from: string, days: number): string {
	const date = new Date(`${from}T00:00:00.000Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}

for (const around of [true, false] as const) {
	const shape = around
		? 'a rest day the plan left in a written week'
		: 'a day in a week nobody has written'
	test(`the grid has no holes forward of today — ${shape}`, async ({
		page,
		navigate,
		login,
	}) => {
		test.setTimeout(120_000)
		const user = await login()
		await seedRestDayToday(user.id, { around })

		await navigate('/')
		await expect(page.getByTestId('timeline-stream')).toBeVisible()
		await page.waitForTimeout(2500)

		const today = new Date().toISOString().slice(0, 10)
		const { days, lastWeek } = await renderedDays(page)
		const rendered = new Set(days.map((day) => day.key))
		// Every date from today to the forward horizon — the far end of the last
		// week the stream has mounted — has a row, or sits in a run of free days
		// that opens into rows. A gap is a hole in the grid.
		const horizon = dayKey(lastWeek, 6)
		expect(Date.parse(horizon)).toBeGreaterThan(Date.parse(today))
		for (let key = today; key <= horizon; key = dayKey(key, 1)) {
			expect(rendered).toContain(key)
		}
		// And today is one of them, with nothing on it.
		expect(days.find((day) => day.key === today)?.empty).toBe(true)

		// Every empty row is a real control at the 44px floor — the actual button,
		// not a hit area painted around something inert (ADR 0028 §2). Open the
		// runs of free days first, so their cells are among them.
		const closed = page.locator(
			'[data-band-kind="free"] > button[aria-expanded="false"]',
		)
		for (let tries = 0; tries < 20 && (await closed.count()) > 0; tries++) {
			await closed.first().dispatchEvent('click')
			await page.waitForTimeout(100)
		}
		const cells = await page.getByTestId('timeline-stream').evaluate((el) =>
			[...el.querySelectorAll('[data-timeline-empty]')].map((node) => ({
				tag: node.tagName,
				type: node.getAttribute('type'),
				height: node.getBoundingClientRect().height,
				text: node.textContent ?? '',
			})),
		)
		expect(cells.length).toBeGreaterThan(0)
		for (const cell of cells) {
			expect(cell.tag).toBe('BUTTON')
			expect(cell.type).toBe('button')
			expect(cell.height).toBeGreaterThanOrEqual(44)
			// No label where nothing prescribed one. Nothing in the model states
			// per-day recovery, so this holds on every empty day the app can build
			// — including this one, whatever the week around it looks like.
			expect(cell.text).not.toMatch(/hviledag/i)
		}
		// Today's cell names its own day, so 182 identical prompts are still
		// distinguishable to a screen reader.
		await expect(
			page.getByTestId('timeline-stream').getByRole('button', {
				name: /^legg inn en økt /i,
			}),
		).not.toHaveCount(0)

		expect(
			await page.evaluate(
				() =>
					document.documentElement.scrollWidth -
					document.documentElement.clientWidth,
			),
		).toBeLessThanOrEqual(0)
	})
}

test('with nothing on today the stream still lands on today, and the pill still comes back', async ({
	page,
	navigate,
	login,
}) => {
	// The rest-day dead end. With no session on today the anchor used to be
	// null and the stream opened on the top of last week (ADR 0065 §1). A row on
	// today dissolves it.
	test.setTimeout(120_000)
	const user = await login()
	await seedRestDayToday(user.id, { around: true })

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(1500)

	const stream = page.getByTestId('timeline-stream')
	// 1 — parked on today, which is an empty cell that says so.
	const landed = await streamState(page)
	expect(landed.scrollHeight).toBeGreaterThan(landed.clientHeight)
	expect(landed.todayOffset).not.toBeNull()
	expect(
		Math.abs(landed.scrollTop - (await landingOf(page))),
	).toBeLessThanOrEqual(1)
	const anchorIsEmpty = await stream.evaluate(
		(el) =>
			!!el
				.querySelector('[data-timeline-today]')
				?.querySelector('[data-timeline-empty]'),
	)
	expect(anchorIsEmpty).toBe(true)
	await expect(todayPill(page)).toHaveAttribute('data-away', '0')

	// 2 — reading away from today, the pill points back.
	for (let pass = 0; pass < 12; pass++) {
		await scrollStreamTo(page, 'end')
		await page.waitForTimeout(450)
		const state = await streamState(page)
		if (state.todayOffset! - state.scrollTop < -60) break
	}
	const pill = page.getByRole('button', { name: 'Gå opp til i dag' })
	await expect(pill).toBeVisible()

	// 3 — and it works: today's row is back in view.
	await pill.click()
	await expect(todayPill(page)).toHaveAttribute('data-away', '0')
	const back = await streamState(page)
	const rel = back.todayOffset! - back.scrollTop
	expect(rel).toBeGreaterThan(-60)
	expect(rel).toBeLessThan(back.clientHeight - 40)
})

test('a day holding two sessions is one row under one gutter, between the cells around it', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedRestDayToday(user.id, { around: true })
	// A morning ride and an evening lift, both on today: two sessions belonging
	// to one day rather than two rows that happen to share a date (ADR 0065 §1).
	const cardio = (title: string, discipline: string) =>
		prisma.workout.create({
			data: {
				title,
				discipline,
				intent: 'endurance',
				ownerId: user.id,
				blocks: {
					create: [
						{
							orderIndex: 0,
							repeatCount: 1,
							steps: {
								create: [{ orderIndex: 0, kind: 'cardio', durationSec: 2700 }],
							},
						},
					],
				},
			},
		})
	const morning = await cardio('Morning ride', 'bike')
	const evening = await cardio('Evening swim', 'swim')
	const todayKey = new Date().toISOString().slice(0, 10)
	for (const [workout, at] of [
		[morning, '06:30'],
		[evening, '18:00'],
	] as const) {
		await prisma.workoutSession.create({
			data: {
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: new Date(`${todayKey}T${at}:00.000Z`),
				status: 'scheduled',
				plannedTssValue: 45,
				plannedTssConfidence: 'full',
				source: 'authored',
			},
		})
	}

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const row = page.locator(`[data-timeline-day="${todayKey}"]`)
	await expect(row.getByRole('link', { name: /morning ride/i })).toBeVisible()
	await expect(row.getByRole('link', { name: /evening swim/i })).toBeVisible()
	// One row, and it is the anchor — so a day with two sessions lands exactly
	// the way a day with none does.
	await expect(row).toHaveCount(1)
	await expect(row).toHaveAttribute('data-timeline-today', 'true')
	// A day with content is not a cell — and a nearby day the fixture wrote
	// nothing on still is, so the two kinds of row sit in the same column.
	await expect(row.locator('[data-timeline-empty]')).toHaveCount(0)
	// Three days out the fixture wrote nothing: an empty day, as a cell of its
	// own or folded with its neighbours into a run of free days (#505 story 30).
	const three = dayKey(todayKey, 3)
	await expect(
		page.locator(
			`[data-timeline-empty="${three}"], [data-band-days~="${three}"]`,
		),
	).toHaveCount(1)
})

test('a planned row says whose it is, and its title is never cut short (#505)', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedRestDayToday(user.id, { around: false })
	const titled = (title: string) =>
		prisma.workout.create({
			data: {
				title,
				discipline: 'run',
				intent: 'endurance',
				ownerId: user.id,
				blocks: {
					create: [
						{
							orderIndex: 0,
							repeatCount: 1,
							steps: {
								create: [{ orderIndex: 0, kind: 'cardio', durationSec: 5400 }],
							},
						},
					],
				},
			},
		})
	// Long enough that a 390px row cannot hold it on one line — the row has to
	// wrap it rather than cut it with "…".
	const longTitle =
		'Langtur med gjengen fra Sognsvann rundt Nordmarka og hjem over Frognerseteren'
	const own = await titled(longTitle)
	const planLaid = await titled('Rolig tur')
	const tomorrow = dayKey(new Date().toISOString().slice(0, 10), 1)
	for (const [workout, at, source] of [
		[own, '07:00', 'authored'],
		[planLaid, '18:00', 'generated'],
	] as const) {
		await prisma.workoutSession.create({
			data: {
				userId: user.id,
				workoutId: workout.id,
				scheduledAt: new Date(`${tomorrow}T${at}:00.000Z`),
				status: 'scheduled',
				plannedTssValue: 60,
				plannedTssConfidence: 'full',
				source,
			},
		})
	}

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()

	const row = page.locator(`[data-timeline-day="${tomorrow}"]`)
	const mine = row.getByRole('link', { name: /langtur med gjengen/i })
	const theApps = row.getByRole('link', { name: /rolig tur/i })
	await expect(mine).toBeVisible()
	await expect(theApps).toBeVisible()

	// Whose session it is, as a small glyph beside each row (#505 D6): a closed
	// lock on the athlete's own, an open one on the app's — each a control named
	// for what it is and that it explains.
	const mineGlyph = row.getByRole('button', {
		name: /^Din økt: Langtur med gjengen/,
	})
	const appsGlyph = row.getByRole('button', { name: /^Appens økt: Rolig tur/ })
	await expect(mineGlyph).toBeVisible()
	await expect(appsGlyph).toBeVisible()
	// The explanation and "Lås opp" are said once, behind the glyph — never
	// repeated under every row.
	await expect(
		page.getByText('Gi økta tilbake til appen', { exact: false }),
	).toHaveCount(0)
	await mineGlyph.click()
	const popover = page.locator('[data-owner-popover="athlete"]')
	await expect(popover).toBeVisible()
	await expect(popover).toContainText('Appen endrer den bare hvis du sier ja')
	await expect(
		popover.getByRole('button', { name: /^Lås opp Langtur med gjengen/ }),
	).toBeVisible()
	// Inside the phone, whole.
	const pbox = (await popover.boundingBox())!
	expect(pbox.x).toBeGreaterThanOrEqual(0)
	expect(pbox.x + pbox.width).toBeLessThanOrEqual(390)
	await page.keyboard.press('Escape')
	await expect(popover).toHaveCount(0)
	await appsGlyph.click()
	await expect(page.locator('[data-owner-popover="machine"]')).toContainText(
		'Planen la inn denne økta',
	)
	await expect(
		page.getByRole('button', { name: /^Lås opp Rolig tur/ }),
	).toHaveCount(0)
	await page.keyboard.press('Escape')

	// The whole title, on as many lines as it takes: nothing overflows, nothing
	// is clipped with an ellipsis, and the row grew to hold it.
	const title = mine.getByText(longTitle, { exact: true })
	await expect(title).toBeVisible()
	const box = await title.evaluate((el) => ({
		overflows: el.scrollWidth > el.clientWidth,
		ellipsis: getComputedStyle(el).textOverflow === 'ellipsis',
		lines: Math.round(
			el.getBoundingClientRect().height /
				parseFloat(getComputedStyle(el).lineHeight),
		),
	}))
	expect(box.overflows).toBe(false)
	expect(box.ellipsis).toBe(false)
	expect(box.lines).toBeGreaterThan(1)
})

test('today’s row wraps the session’s title, never cutting it (#505 story 32)', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedSeason(user.id)
	const longTitle =
		'Terskeløkt med gjengen fra Sognsvann rundt Nordmarka og hjem over Frognerseteren'
	await prisma.workout.updateMany({
		where: { ownerId: user.id, title: 'Threshold Run' },
		data: { title: longTitle },
	})

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()

	const title = page
		.locator('[data-timeline-today] [data-session-title]')
		.filter({ hasText: longTitle })
		.first()
	await expect(title).toHaveText(longTitle)
	const box = await title.evaluate((el) => ({
		overflows: el.scrollWidth > el.clientWidth,
		ellipsis: getComputedStyle(el).textOverflow === 'ellipsis',
		lines: Math.round(
			el.getBoundingClientRect().height /
				parseFloat(getComputedStyle(el).lineHeight),
		),
	}))
	expect(box.overflows).toBe(false)
	expect(box.ellipsis).toBe(false)
	expect(box.lines).toBeGreaterThan(1)
})

/**
 * What an element paints, and the surface it paints it on. The surface is the
 * commonest colour in the box — a row of text is mostly background — and the
 * ink is the pixel that gets furthest from it. Both read off one screenshot,
 * because a class name cannot tell a themed token from one that composites to
 * nothing (#486), and `getComputedStyle` cannot either.
 */
async function inkPaint(target: Locator) {
	const px = await pixelsOf(target)
	const tally = new Map<string, number>()
	for (let y = 0; y < px.height; y++) {
		for (let x = 0; x < px.width; x++) {
			const key = px.at(x, y).join(',')
			tally.set(key, (tally.get(key) ?? 0) + 1)
		}
	}
	const commonest = [...tally].sort((a, b) => b[1] - a[1])[0]![0]
	const surface = commonest.split(',').map(Number) as unknown as Rgb
	let mark = surface
	for (let y = 0; y < px.height; y++) {
		for (let x = 0; x < px.width; x++) {
			const here = px.at(x, y)
			if (apart(here, surface) > apart(mark, surface)) mark = here
		}
	}
	return { surface, mark, contrast: apart(mark, surface) }
}

for (const theme of ['light', 'dark'] as const) {
	test(`an empty cell is legible in ${theme} theme`, async ({
		page,
		navigate,
		login,
	}) => {
		// The cell is the one thing on this surface that is *only* dim ink: it has
		// no dot, no bar and no chip to be seen by. It reads off the Ink Ladder,
		// which the light theme mirrors rather than copies — so the tone that is
		// quiet on a near-black stream must still be quiet-but-there on a white
		// one, and the only way to know is to look at the pixels.
		test.setTimeout(120_000)
		await useTheme(page, theme)
		const user = await login()
		await seedRestDayToday(user.id, { around: true })

		await navigate('/')
		await expect(page.getByTestId('timeline-stream')).toBeVisible()
		await page.waitForTimeout(2500)

		const cell = page.locator('[data-timeline-empty]').first()
		await expect(cell).toBeVisible()
		const paint = await inkPaint(cell)
		// The affordance and the date both have to reach the eye.
		expect(paint.contrast).toBeGreaterThan(MARK_MIN)
		// And it must stay quieter than a row that carries content, or a week of
		// blanks reads as a list of prompts rather than as a blank column.
		// A title the reader can actually see: the week header is sticky, so
		// "centred" can still leave a title under it — measured, that is the
		// header's paint, not the title's.
		const titles = page.locator('[data-status] [data-session-title]')
		await titles.last().evaluate((el) => el.scrollIntoView({ block: 'center' }))
		await page.waitForTimeout(400)
		const seen = await titles.evaluateAll((nodes) =>
			nodes.findIndex((node) => {
				const box = node.getBoundingClientRect()
				const hit = document.elementFromPoint(
					box.x + Math.min(box.width / 2, 20),
					box.y + box.height / 2,
				)
				return box.height > 0 && !!hit && node.contains(hit)
			}),
		)
		expect(seen).toBeGreaterThanOrEqual(0)
		const title = await inkPaint(titles.nth(seen))
		expect(title.contrast).toBeGreaterThan(paint.contrast)
	})
}

/**
 * Open last week's fold and hand back its key — the key of the band inside it
 * too, since a band is keyed by its first day and last week's run starts on
 * its Monday. Last week is closed, so it reads as one line above today until
 * it is opened (#505 story 31).
 */
async function openLastWeek(page: Page) {
	const fold = page
		.getByTestId('timeline-stream')
		.locator('[data-timeline-fold]')
		.last()
	const key = (await fold.getAttribute('data-timeline-fold'))!
	const control = page.locator(`[data-timeline-fold="${key}"]`)
	await control.click()
	await expect(control).toHaveAttribute('aria-expanded', 'true')
	await page.waitForTimeout(400)
	return key
}

/**
 * A season with **one wholly empty week** behind today (#500).
 *
 * Last week is left blank on purpose and today's week is not, so the run behind
 * today is exactly seven days whatever weekday the suite runs on — the one
 * shape a band assertion can be written about without the calendar deciding how
 * long it is. Two weeks back carries sessions so the stream has real height,
 * and a couple forward so it has somewhere to grow into.
 */
async function seedEmptyWeekBehind(userId: string) {
	const day = 24 * 60 * 60 * 1000
	const monday = new Date()
	monday.setUTCHours(12, 0, 0, 0)
	// Monday of last week, in whole days back from today.
	const backToMonday = ((monday.getUTCDay() + 6) % 7) + 7
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
							create: [{ orderIndex: 0, kind: 'cardio', durationSec: 3600 }],
						},
					},
				],
			},
		},
	})
	const session = (days: number, status: string, tss: number | null) =>
		prisma.workoutSession.create({
			data: {
				userId,
				workoutId: workout.id,
				scheduledAt: new Date(Date.now() + days * day),
				status,
				tssValue: tss,
				plannedTssValue: 60,
				plannedTssConfidence: 'full',
				source: 'authored',
			},
		})

	// Two and three weeks back — before the blank week, so reading backwards has
	// somewhere to go.
	await session(-(backToMonday + 2), 'completed', 55)
	await session(-(backToMonday + 4), 'completed', 61)
	// Today, and the days around it: this week is not the blank one.
	await session(0, 'scheduled', null)
	await session(1, 'scheduled', null)
	await session(8, 'scheduled', null)
	await session(15, 'scheduled', null)
	return { firstBlankDay: backToMonday }
}

/**
 * The band, the days it stands for, and where all of it sits in the scroller.
 *
 * Addressed by its own key rather than by "the first one in the DOM": reading
 * backwards mounts earlier weeks with bands of their own, and the band this
 * test is about has to stay the band this test is about.
 */
async function bandState(page: Page, key?: string | null) {
	return page.getByTestId('timeline-stream').evaluate((el, key) => {
		const band = el.querySelector<HTMLElement>(
			key ? `[data-timeline-band="${key}"]` : '[data-timeline-band]',
		)
		const control = band?.querySelector('button')
		return {
			key: band?.dataset.timelineBand ?? null,
			expanded: control?.getAttribute('aria-expanded') ?? null,
			name: control?.getAttribute('aria-label') ?? null,
			text: control?.textContent ?? '',
			height: band ? Math.round(band.getBoundingClientRect().height) : 0,
			// The band's top, in the scroller's own box — what "the reader's
			// position" means for everything above it.
			inStream: band
				? Math.round(
						band.getBoundingClientRect().top - el.getBoundingClientRect().top,
					)
				: null,
			scrollTop: Math.round(el.scrollTop),
			days: [...el.querySelectorAll('[data-timeline-day]')].length,
			bandDays: band
				? [...band.querySelectorAll('[data-timeline-day]')].length
				: 0,
		}
	}, key ?? null)
}

test('a run of empty days behind today is one band, and opening it does not move the reader', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedEmptyWeekBehind(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const stream = page.getByTestId('timeline-stream')
	// Seven blank days behind today, said once (ADR 0065 §3) — inside last
	// week, which is folded above today until it is opened.
	const weekKey = await openLastWeek(page)
	const collapsed = await bandState(page, weekKey)
	expect(collapsed.key).toBe(weekKey)
	expect(collapsed.expanded).toBe('false')
	expect(collapsed.name).toMatch(/^7 dager uten noe logget, /)
	expect(collapsed.text).toContain('7 dager · ingenting logget')
	expect(collapsed.bandDays).toBe(0)
	// One row at the control floor, not seven blank ones.
	expect(collapsed.height).toBeGreaterThanOrEqual(44)
	expect(collapsed.height).toBeLessThan(88)

	// Park the band in the middle of the screen — it sits above today, which is
	// where the landing leaves the reader — and let the window settle, so the
	// measurement is not sharing a tick with a week loading in.
	const key = collapsed.key!
	// The direct child: expanded, the band holds seven day buttons as well.
	const control = stream.locator(`[data-timeline-band="${key}"] > button`)
	// A single computed write into a smooth scroller lands somewhere else
	// entirely, so park with `scroll-behavior` off and re-park until the position
	// holds still — what follows measures a reader who has come to rest.
	let parked = Number.NaN
	for (let tries = 0; tries < 10; tries++) {
		await stream.evaluate((el, key) => {
			el.style.scrollBehavior = 'auto'
			const band = el.querySelector(`[data-timeline-band="${key}"]`)!
			el.scrollTop +=
				band.getBoundingClientRect().top -
				el.getBoundingClientRect().top -
				el.clientHeight / 2
		}, key)
		await page.waitForTimeout(500)
		const now = (await bandState(page, key)).inStream!
		if (Math.abs(now - parked) <= 1) break
		parked = now
	}
	await page.waitForTimeout(1000)

	const before = await bandState(page, key)
	expect(before.inStream).toBeGreaterThan(0)
	expect(before.inStream).toBeLessThan(844)

	await control.click()
	await page.waitForTimeout(400)

	const after = await bandState(page, key)
	// The AC with teeth: the reading position did not move. The run grows
	// downwards out of the row under the athlete's thumb, so the band's own top
	// is where they left it and `scrollTop` was never written.
	expect(after.scrollTop).toBe(before.scrollTop)
	expect(after.inStream).toBe(before.inStream)
	// And it did expand: seven day rows, inside the band, below the control.
	expect(after.expanded).toBe('true')
	expect(after.bandDays).toBe(7)
	expect(after.height).toBeGreaterThan(before.height + 7 * 40)

	// Every one of them takes the same add gesture a day forward of today takes.
	const cells = await stream.evaluate(
		(el, key) =>
			[
				...el.querySelectorAll(
					`[data-timeline-band="${key}"] [data-timeline-empty]`,
				),
			].map((node) => ({
				tag: node.tagName,
				name: node.getAttribute('aria-label') ?? '',
				height: node.getBoundingClientRect().height,
			})),
		key,
	)
	expect(cells).toHaveLength(7)
	for (const cell of cells) {
		expect(cell.tag).toBe('BUTTON')
		expect(cell.name).toMatch(/^legg inn en økt /i)
		expect(cell.height).toBeGreaterThanOrEqual(44)
	}

	// Closing it is the same promise in reverse.
	await control.click()
	await page.waitForTimeout(400)
	const closed = await bandState(page, key)
	expect(closed.expanded).toBe('false')
	expect(closed.bandDays).toBe(0)
	expect(closed.scrollTop).toBe(before.scrollTop)
	expect(closed.inStream).toBe(before.inStream)

	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0)
})

test('a band whose top has gone up past the reading edge hands the height back', async ({
	page,
	navigate,
	login,
}) => {
	// The other half of the promise, and the one the arithmetic exists for
	// (`bandScrollTop`): with the band's own top above the reading edge, every
	// pixel the athlete can see is *below* the insertion, so the position has to
	// take the delta or the run walks them down the season (ADR 0065 §3).
	test.setTimeout(120_000)
	const user = await login()
	await seedEmptyWeekBehind(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const stream = page.getByTestId('timeline-stream')
	const key = await openLastWeek(page)
	// Mount the weeks ahead first, so there is stream enough below the band to
	// park it above the top edge at all: the free days ahead fold into short
	// rows (#505 story 30), and the window opens one week either side.
	await readToTheEnd(page)
	// Park the band's top 20px above the top edge, and let the window settle.
	await stream.evaluate((el, key) => {
		const band = el.querySelector(`[data-timeline-band="${key}"]`)!
		el.scrollTop +=
			band.getBoundingClientRect().top - el.getBoundingClientRect().top + 20
	}, key)
	await page.waitForTimeout(1500)

	/** Where today's row — below the band — sits on screen, and the position. */
	const reading = () =>
		stream.evaluate((el) => ({
			todayOnScreen: Math.round(
				el.querySelector('[data-timeline-today]')!.getBoundingClientRect().top -
					el.getBoundingClientRect().top,
			),
			scrollTop: Math.round(el.scrollTop),
		}))

	const before = await reading()
	const bandBefore = await bandState(page, key)
	expect(bandBefore.inStream).toBeLessThan(0)
	// Dispatched rather than clicked: a real click would scroll the half-visible
	// control into view first, which is the setup this test just built.
	await stream
		.locator(`[data-timeline-band="${key}"] > button`)
		.dispatchEvent('click')
	await page.waitForTimeout(400)

	const after = await reading()
	const bandAfter = await bandState(page, key)
	expect(bandAfter.expanded).toBe('true')
	// Today's row — everything the athlete can actually see — did not move.
	expect(after.todayOnScreen).toBe(before.todayOnScreen)
	// Which took exactly the height the run inserted, and no more.
	expect(after.scrollTop - before.scrollTop).toBe(
		bandAfter.height - bandBefore.height,
	)
})

test('the near end states how far home reads, never how far the athlete has trained', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedEmptyWeekBehind(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const stream = page.getByTestId('timeline-stream')
	// Read all the way back: the cap is only mounted once the first week is.
	for (let pass = 0; pass < 12; pass++) {
		const before = await streamState(page)
		await stream.evaluate((el) => {
			el.scrollTop = 0
		})
		await page.waitForTimeout(450)
		if ((await streamState(page)).weeks === before.weeks) break
	}

	await expect(stream.getByText(/i dag leser tilbake til/i)).toBeVisible()
	await expect(stream.getByText(/26 uker av det/i)).toBeVisible()
	// The claim that had to go: the query's own bound, stated as the beginning of
	// the athlete's training (#500).
	await expect(stream).not.toContainText(/så langt tilbake som historikken/i)
	await expect(stream).not.toContainText(/ingenting logget før/i)
})

/**
 * Tapping an empty day (#501, ADR 0065 §5).
 *
 * The unit tests own what the draft says and what the server writes. What only a
 * real browser can answer is the geometry: the token popover is a 324px
 * instrument arriving in a 44px row, and "opens without covering the next day's
 * row" is a claim about two boxes that only exist once the thing has laid out.
 */
test('tapping an empty day stamps a Token Sentence, and its popover does not cover the next day', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	// Completed runs, so the chip has a history to be derived from.
	await seedRestDayToday(user.id, { around: true })

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	// An empty day with a day after it, so "the next day's row" is a box that
	// exists — picked off what the stream actually drew rather than counted
	// forward from today, whose neighbours the fixture writes sessions onto.
	const key = await page.evaluate(() => {
		const cells = [...document.querySelectorAll('[data-timeline-empty]')]
		const withNeighbour = cells.find((cell) =>
			cell
				.closest('[data-timeline-day]')
				?.nextElementSibling?.hasAttribute('data-timeline-day'),
		)
		return (withNeighbour ?? cells[0])!.getAttribute('data-timeline-empty')!
	})
	const cell = page.locator(`[data-timeline-empty="${key}"]`)
	await cell.scrollIntoViewIfNeeded()
	await cell.click()

	// Derived, and shown before it commits — never silently defaulted.
	await expect(page.getByRole('radio', { name: 'Løping' })).toBeChecked()
	await page.getByRole('button', { name: 'Legg til 45 min Z2' }).click()

	// The row now renders the sentence, and every value in it is a token.
	const sentence = page.locator('[data-timeline-stamped]')
	await expect(sentence).toBeVisible()
	const tokens = sentence.locator('[data-token-trigger]')
	await expect(tokens).toHaveCount(2)
	await expect(tokens.first()).toHaveAttribute('aria-label', /45 min duration/)

	await tokens.first().click()
	await expect(page.locator('[data-slot="token-popover"]')).toBeVisible()
	// Type-to-edit with ± nudges — the editor's existing instrument, unforked.
	await expect(
		page.locator('[data-slot="token-popover"] input').first(),
	).toHaveValue('45 min')
	await page.waitForTimeout(400)

	const geometry = await page.evaluate((dayAttr) => {
		const popup = document
			.querySelector('[data-slot="token-popover"]')!
			.getBoundingClientRect()
		const row = document.querySelector(`[data-timeline-day="${dayAttr}"]`)!
		const next = row.nextElementSibling!.getBoundingClientRect()
		return {
			popupTop: Math.round(popup.top),
			popupBottom: Math.round(popup.bottom),
			rowBottom: Math.round(row.getBoundingClientRect().bottom),
			nextTop: Math.round(next.top),
		}
	}, key)
	// Below the cell, not above it — and the next day's row starts after the
	// instrument ends, because the open row grew to hold it rather than letting
	// it float over the day below.
	expect(geometry.popupTop).toBeGreaterThan(0)
	expect(geometry.nextTop).toBeGreaterThanOrEqual(geometry.popupBottom)
	expect(geometry.rowBottom).toBeGreaterThanOrEqual(geometry.popupBottom)
})

test('what a cell writes is a prescription, and a mistake is recoverable without leaving the timeline', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedRestDayToday(user.id, { around: true })

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	// Today's own cell — the earliest one the grid offers, because behind today
	// only days carrying a session are rows until #500's band expands. That the
	// gesture is identical on a genuinely past date is asserted where the
	// difference could actually live, on the server
	// (`index.day-stamp.test.ts`), rather than pantomimed through a row the
	// stream does not draw yet.
	const cell = page.locator('[data-timeline-empty]').first()
	await cell.scrollIntoViewIfNeeded()
	const key = await cell.getAttribute('data-timeline-empty')
	await cell.click()
	await page.getByRole('button', { name: 'Legg til 45 min Z2' }).click()
	await expect(page.locator('[data-timeline-stamped]')).toBeVisible()

	// What it wrote is a prescription, never an actual: the row states planned
	// load and claims nothing about what was done (`GOAL.md`'s no-recorder
	// non-goal — executed cardio still arrives only by import).
	const stamped = await prisma.workoutSession.findFirstOrThrow({
		where: { userId: user.id, workout: { title: '45 min Z2' } },
		select: { status: true, tssValue: true, recordingId: true },
	})
	expect(stamped).toEqual({
		status: 'scheduled',
		tssValue: null,
		recordingId: null,
	})

	// The way back, on the row (ADR 0076).
	await page
		.locator('[data-timeline-stamped]')
		.getByRole('button', { name: 'Angre', exact: true })
		.click()
	await expect(page.locator(`[data-timeline-empty="${key}"]`)).toBeVisible()
	// A real delete, not a status: the day is an empty cell again and nothing is
	// left behind (ADR 0076 §2).
	await expect
		.poll(() =>
			prisma.workoutSession.count({
				where: { userId: user.id, workout: { title: '45 min Z2' } },
			}),
		)
		.toBe(0)
})

/*
 * ── the motion pass (#502) ────────────────────────────────────────────────
 *
 * Four animations earn their place on this screen and nothing else does, which
 * is a claim about the *whole* frame rather than about the four elements — so
 * it is asserted by enumeration. Every transition and animation the timeline
 * declares is collected and compared against the list, and a fifth one arriving
 * later fails here whatever it is attached to.
 *
 * **What this does not cover**: it is a *declaration* audit, so it sees only
 * what the stylesheet says. Nothing on this screen animates from JavaScript
 * since the hero's pager went (ADR 0086).
 *
 * The frame is also the boundary: the app's shared overlays (the create menu,
 * the token popover) portal to `document.body`, are not the timeline's markup,
 * and already carry their own `motion-safe:` gating.
 */

/**
 * Every transition and keyframe animation declared anywhere under the timeline
 * frame, as `where — property duration easing`.
 *
 * Collected **per element**, not as a set of ingredients. A set answers "which
 * curves exist", and a fifth animation reusing an existing triple — a row-enter
 * fade written as `opacity 200ms var(--ease-out)`, exactly the one #502 removed
 * — would dedupe into the entry the accordions already put there and pass. The
 * element is what makes it a new fact, so the element is in the key.
 *
 * `where` is the nearest `data-` attribute at or above the element, which is
 * how this screen's own markup names its parts — stable across a class rename,
 * and unchanged by how many rows happen to be on screen (all the session rows
 * fold into one `[data-status]` entry).
 *
 * A declaration audit, not a recording: what is asserted is what the stylesheet
 * says may animate, which is the only form the claim "nothing else is animated
 * in CSS" can actually take.
 */
async function motionInFrame(page: Page) {
	return page.evaluate(() => {
		// Which part of the screen this element is: its own `data-` attribute, or
		// the nearest one above it plus the tag, so two animated children of one
		// marked box stay two entries.
		const where = (el: Element, from: Element) => {
			for (
				let node: Element | null = el;
				node;
				node = node === from ? null : node.parentElement
			) {
				// `data-tsd-source` is the dev server's devtools tagging elements
				// with their source file; it names no part of this screen, and a
				// production build does not carry it.
				const attr = node
					.getAttributeNames()
					.find(
						(name) => name.startsWith('data-') && name !== 'data-tsd-source',
					)
				if (attr) {
					return node === el
						? `[${attr}]`
						: `[${attr}] ${el.tagName.toLowerCase()}`
				}
			}
			return el.tagName.toLowerCase()
		}
		// Comma-separated CSS values, split at depth zero — `cubic-bezier(0.23, 1,
		// 0.32, 1)` has commas of its own and a naive split shreds it.
		const parts = (value: string) => {
			const out: string[] = []
			let depth = 0
			let current = ''
			for (const ch of value) {
				if (ch === '(') depth += 1
				if (ch === ')') depth -= 1
				if (ch === ',' && depth === 0) {
					out.push(current.trim())
					current = ''
				} else current += ch
			}
			if (current.trim()) out.push(current.trim())
			return out
		}
		const found = new Set<string>()
		const frame = document.querySelector('main')
		if (!frame) return ['no frame']
		for (const el of [frame, ...frame.querySelectorAll<HTMLElement>('*')]) {
			const style = getComputedStyle(el)
			const at = () => where(el, frame)
			for (const name of parts(style.animationName)) {
				if (name !== 'none') found.add(`${at()} — @keyframes ${name}`)
			}
			const props = parts(style.transitionProperty)
			const durations = parts(style.transitionDuration)
			const easings = parts(style.transitionTimingFunction)
			props.forEach((prop, i) => {
				const duration = durations[i % durations.length] ?? '0s'
				if (prop === 'none' || duration === '0s') return
				found.add(
					`${at()} — ${prop} ${duration} ${easings[i % easings.length]}`,
				)
			})
		}
		return [...found].sort()
	})
}

/** The ingredients alone, for the assertions that are about the curve rather
 * than about which element carries it. */
function ingredientsOf(declared: string[]): string[] {
	return declared.map((entry) => entry.split(' — ')[1] ?? entry)
}

/** The one curve on the scale a deliberate animation is allowed to use. */
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

test('the timeline animates its accordions and its press, and the frame declares nothing else', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedEmptyWeekBehind(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const stream = page.getByTestId('timeline-stream')
	// Every accordion on screen at once, because a transition that is not
	// mounted declares nothing and would pass this by not existing: last week's
	// fold, the band inside it, and the draft.
	const weekKey = await openLastWeek(page)
	await stream
		.locator(`[data-timeline-week="${weekKey}"] [data-timeline-band] > button`)
		.first()
		.click()
	await page.waitForTimeout(400)
	await stream.locator('[data-timeline-empty]').first().click()
	await expect(stream.locator('[data-timeline-draft]')).toBeVisible()

	// The whole frame, element by element (ADR 0086 updates the list): the
	// accordions (the draft, the band's run of days, and a folded week's days:
	// height + opacity, 200ms) and the system's press, `pressable` (ADR 0085:
	// `scale(0.97)` with the colours on the same 160ms curve) on what the
	// athlete taps — a row, a cell, a band, a fold, the ownership glyph and
	// "+ Ny" (`data-base-ui-click-trigger`), today's "Se økta" link
	// (`data-discover`) and the badge-and-pill buttons' `Button`s
	// (`data-slot`). Every one on the scale's own curve: no `all`, no
	// built-in easing, no keyframes. The strip and the list's scroll declare
	// nothing, and the "I dag" pill changes look instantly.
	//
	// Element by element, because a set of ingredients cannot fail on a new
	// element reusing a curve that is already on the list — which is exactly the
	// shape of the row-enter fade #502 removed.
	expect(await motionInFrame(page)).toEqual([
		`[data-base-ui-click-trigger] — background-color 0.16s ${EASE_OUT}`,
		`[data-base-ui-click-trigger] — border-color 0.16s ${EASE_OUT}`,
		`[data-base-ui-click-trigger] — color 0.16s ${EASE_OUT}`,
		`[data-base-ui-click-trigger] — transform 0.16s ${EASE_OUT}`,
		`[data-discover] — background-color 0.16s ${EASE_OUT}`,
		`[data-discover] — border-color 0.16s ${EASE_OUT}`,
		`[data-discover] — color 0.16s ${EASE_OUT}`,
		`[data-discover] — transform 0.16s ${EASE_OUT}`,
		`[data-slot] — background-color 0.16s ${EASE_OUT}`,
		`[data-slot] — border-color 0.16s ${EASE_OUT}`,
		`[data-slot] — color 0.16s ${EASE_OUT}`,
		`[data-slot] — transform 0.16s ${EASE_OUT}`,
		`[data-status] — background-color 0.16s ${EASE_OUT}`,
		`[data-status] — border-color 0.16s ${EASE_OUT}`,
		`[data-status] — color 0.16s ${EASE_OUT}`,
		`[data-status] — transform 0.16s ${EASE_OUT}`,
		`[data-timeline-band] button — background-color 0.16s ${EASE_OUT}`,
		`[data-timeline-band] button — border-color 0.16s ${EASE_OUT}`,
		`[data-timeline-band] button — color 0.16s ${EASE_OUT}`,
		`[data-timeline-band] button — transform 0.16s ${EASE_OUT}`,
		`[data-timeline-band] div — height 0.2s ${EASE_OUT}`,
		`[data-timeline-band] div — opacity 0.2s ${EASE_OUT}`,
		`[data-timeline-draft] — height 0.2s ${EASE_OUT}`,
		`[data-timeline-draft] — opacity 0.2s ${EASE_OUT}`,
		`[data-timeline-empty] — background-color 0.16s ${EASE_OUT}`,
		`[data-timeline-empty] — border-color 0.16s ${EASE_OUT}`,
		`[data-timeline-empty] — color 0.16s ${EASE_OUT}`,
		`[data-timeline-empty] — transform 0.16s ${EASE_OUT}`,
		`[data-timeline-fold-run] — height 0.2s ${EASE_OUT}`,
		`[data-timeline-fold-run] — opacity 0.2s ${EASE_OUT}`,
		`[data-timeline-fold] — background-color 0.16s ${EASE_OUT}`,
		`[data-timeline-fold] — border-color 0.16s ${EASE_OUT}`,
		`[data-timeline-fold] — color 0.16s ${EASE_OUT}`,
		`[data-timeline-fold] — transform 0.16s ${EASE_OUT}`,
	])

	// And the press is where it was promised: rows, cells, the band control and
	// the fold. Nothing in the strip declares anything.
	const pressed = await stream.evaluate((el) => {
		const has = (node: Element | null) =>
			node
				? getComputedStyle(node).transitionProperty.includes('transform')
				: false
		return {
			row: has(el.querySelector('[data-status]')),
			cell: has(el.querySelector('[data-timeline-empty]')),
			band: has(el.querySelector('[data-timeline-band] > button')),
			fold: has(el.querySelector('[data-timeline-fold]')),
		}
	})
	expect(pressed).toEqual({ row: true, cell: true, band: true, fold: true })
})

test.describe(() => {
	test.use({ contextOptions: { reducedMotion: 'reduce' } })

	test('reduced motion drops the movement and keeps the fade', async ({
		page,
		navigate,
		login,
	}) => {
		test.setTimeout(120_000)
		const user = await login()
		await seedEmptyWeekBehind(user.id)

		await navigate('/')
		await expect(page.getByTestId('timeline-stream')).toBeVisible()
		await page.waitForTimeout(2500)

		const stream = page.getByTestId('timeline-stream')
		const weekKey = await openLastWeek(page)
		await stream
			.locator(
				`[data-timeline-week="${weekKey}"] [data-timeline-band] > button`,
			)
			.first()
			.click()
		await page.waitForTimeout(400)

		// Gentler, never zero: the press-scale is gone — it is the one ingredient
		// that is only movement — and the accordions' height and opacity stay,
		// because a reflow that jumps is the jarring change they exist to prevent.
		const declared = ingredientsOf(await motionInFrame(page))
		expect(declared).not.toContain(`transform 0.16s ${EASE_OUT}`)
		expect(declared).toContain(`opacity 0.2s ${EASE_OUT}`)
		expect(declared).toContain(`height 0.2s ${EASE_OUT}`)

		const resting = await page.evaluate(() => {
			const pill = document.querySelector<HTMLElement>('[data-today-pill]')
			return {
				// The pill changes look and never moves (ADR 0082), so there is no
				// motion of its own for reduced motion to drop.
				pillMotion: pill ? getComputedStyle(pill).transitionDuration : null,
				// The stream does not glide: every write this screen makes is a
				// jump, and the athlete's own scrolling is not smoothed either. (The
				// strip no longer scrolls at all — ADR 0082 §5 — so it has no scroll
				// behaviour worth asserting.)
				stream: getComputedStyle(
					document.querySelector('[data-timeline-stream]')!,
				).scrollBehavior,
			}
		})
		expect(resting.stream).toBe('auto')
		expect(resting.pillMotion).toBe('0s')
	})
})

/*
 * ── I dag: the week model (#505 S9) ─────────────────────────────────────────
 *
 * A plan that runs past the Planning Horizon, so the season has every shape a
 * week can take: folded behind today, open around it, collapsed ahead of the
 * horizon — with one of the athlete's own sessions far out in a collapsed week.
 */

/** This week's Monday, `YYYY-MM-DD` in UTC — the athlete timezone's default. */
function thisMonday(): string {
	const now = new Date()
	const back = (now.getUTCDay() + 6) % 7
	return dayKey(now.toISOString().slice(0, 10), -back)
}

async function seedPlanPastTheHorizon(userId: string) {
	const monday = thisMonday()
	// An open-ended plan (ADR 0079) that began last week: eight weeks of
	// `Oppbygging` at 3:1, one run track holding 40 km a week.
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
	// Today, 10 km asked: this week's Planned Volume.
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
	// Two weeks out, past the horizon: the athlete's own fixed point.
	const group = await run('Langtur med gjengen', 24_000)
	const farKey = dayKey(monday, 16)
	await prisma.workoutSession.create({
		data: {
			userId,
			workoutId: group.id,
			scheduledAt: new Date(`${farKey}T09:00:00.000Z`),
			status: 'scheduled',
			source: 'authored',
		},
	})
	return { farWeek: dayKey(monday, 14), monday }
}

test('a week header reads the Week Target, the Planned Volume and the Actual Volume side by side (#505 story 23)', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	const { monday } = await seedPlanPastTheHorizon(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const week = page.locator(`[data-timeline-week="${monday}"]`)
	await expect(week.getByRole('heading', { level: 2 })).toHaveText(
		/^Denne uka /,
	)
	// The phase and the rhythm: the plan's second week, a hard one.
	await expect(week.locator('[data-week-kind]')).toHaveText(
		'Oppbygging · hard uke',
	)
	// Three numbers, in the track's own unit, on one line at 390px.
	const track = week.locator('[data-week-track]')
	await expect(track).toContainText('Løping')
	await expect(track).toContainText('mål 40')
	await expect(track).toContainText('planlagt 10')
	await expect(track).toContainText('gjort 0')
	await expect(track).toContainText('km')
	// 10 km laid against 40 is more than 10 % off: the `≠` mark, named.
	await expect(
		track.getByRole('img', { name: 'planlagt er mer enn 10 % unna målet' }),
	).toBeVisible()
	const line = await track.locator('> div').first().boundingBox()
	expect(line!.x + line!.width).toBeLessThanOrEqual(390)
	expect(
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
		),
	).toBeLessThanOrEqual(0)
})

test('a week past the Planning Horizon is one line, and still shows the athlete’s own session (#505 stories 27–28)', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	const { farWeek } = await seedPlanPastTheHorizon(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	// The far week may be past the weeks mounted ahead; the strip jumps
	// there, mounting it on the way.
	await page
		.getByTestId('week-strip')
		.locator(`[data-timeline-cell="${farWeek}"]`)
		.click()
	await page.waitForTimeout(800)

	const week = page.locator(`[data-timeline-week="${farWeek}"]`)
	await expect(week).toHaveAttribute('data-week-shape', 'collapsed')
	// One line: which week, its phase, its target, and that nothing fills it.
	await expect(week.locator('[data-timeline-collapsed]')).toContainText(
		/^Uke \d+ · Oppbygging · mål [\d.]+ km · ingen økter lagt inn ennå/,
	)
	// The athlete's own session is there, in full, with its mark…
	const mine = week.getByRole('link', { name: /langtur med gjengen/i })
	await expect(mine).toBeVisible()
	await expect(
		week.getByRole('button', { name: /^Din økt: Langtur med gjengen/ }),
	).toBeVisible()
	// …and it is the only day the collapsed week draws: no empty cells.
	await expect(week.locator('[data-timeline-day]')).toHaveCount(1)
	await expect(week.locator('[data-timeline-empty]')).toHaveCount(0)
})

test('a closed week folds to one line above today, and opens in place (#505 story 31)', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	const { monday } = await seedPlanPastTheHorizon(user.id)

	await navigate('/')
	await expect(page.getByTestId('timeline-stream')).toBeVisible()
	await page.waitForTimeout(2500)

	const lastWeek = dayKey(monday, -7)
	const fold = page.locator(`[data-timeline-fold="${lastWeek}"]`)
	await expect(fold).toHaveAttribute('aria-expanded', 'false')
	// Nothing done against last week's 40 km.
	await expect(fold).toContainText('Forrige uke')
	await expect(fold).toContainText('0 av 40 km · under')
	const height = (await fold.boundingBox())!.height
	expect(height).toBeGreaterThanOrEqual(44)
	expect(height).toBeLessThan(90)
	// Read from the top of the stream, where the reader is last parked in a
	// *later* week than the fold: the run must open below the line without the
	// stream crediting it to that week and throwing the reader down (S9
	// review).
	await scrollStreamTo(page, (await streamState(page)).scrollTop + 900)
	await page.waitForTimeout(600)
	await scrollStreamTo(page, 0)
	await page.waitForTimeout(600)
	const lineAt = (await fold.boundingBox())!.y
	await fold.click()
	await expect(fold).toHaveAttribute('aria-expanded', 'true')
	await page.waitForTimeout(600)
	expect((await streamState(page)).scrollTop).toBe(0)
	expect(Math.abs((await fold.boundingBox())!.y - lineAt)).toBeLessThanOrEqual(
		2,
	)
	// The opened week's figures sit on the stream's own gutter, not flush left.
	const figures = page
		.locator(`[data-timeline-week="${lastWeek}"] [data-week-track]`)
		.first()
	expect((await figures.boundingBox())!.x).toBeGreaterThanOrEqual(16)
	await expect(
		page.locator(`[data-timeline-week="${lastWeek}"] [data-week-track]`),
	).toContainText('mål 40')
})
