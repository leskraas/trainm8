import { type Page } from '@playwright/test'
import { localDate, localTimeUTC } from '#app/utils/athlete-calendar.ts'
import { prisma } from '#app/utils/db.server.ts'
import { SIMPLE_START_LABELS } from '#app/utils/labels.ts'
import { expect, test, untilHydrated } from '#tests/playwright-utils.ts'

/**
 * **Motion that explains** end to end on a phone (spec #558 S10, #582).
 *
 * _Uka di_ morphs into the top Start Option card, the chosen card into the
 * plan's curve, the curve into I dag's week; back plays each in reverse; a tap
 * or a key lands a transition at once. The first _Gjort_ on a session sends
 * eight sparks from its check, once, never on _Angre_. Under reduced motion
 * every morph is a 200ms crossfade in place and the sparks are a check fade.
 *
 * What is asserted is what the browser was asked to animate, recorded by an
 * init script before the app loads: every `Element.animate` call (the morph's
 * container transform, the sparks, the check fade), and every animation on a
 * `::view-transition-*` pseudo-element once a transition is ready (the
 * crossfades the stylesheet declares). A recording, not a screenshot: motion
 * cannot be read off a still frame, and its ingredients are the claim.
 */
test.use({ viewport: { width: 390, height: 844 } })

const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'

/** Answers the start carries in its URL: a beginner running three days. */
const ANSWERS = 'level=beginner&hours=3&discipline=run&days=0,2,4'

/** The hours stepper's minus. */
const FEWER_HOURS = SIMPLE_START_LABELS.level.fewer

type Played = {
	/** `::view-transition-group(start-week)`, or the element's `data-` name. */
	target: string
	props: string[]
	duration: number
	easing: string
}

type Transition = {
	played: Played[]
	skipped: boolean
	/** `performance.now()` when it was ready to play, and when it finished. */
	readyAt: number | null
	finishedAt: number | null
}

declare global {
	interface Window {
		__motion: {
			transitions: Transition[]
			animated: Played[]
			/** `performance.now()` of the last pointerdown. */
			tappedAt: number | null
		}
	}
}

/** Records what the page asks the browser to animate (see the file's header). */
async function recordMotion(page: Page) {
	await page.addInitScript(() => {
		const motion = (window.__motion = {
			transitions: [] as Transition[],
			animated: [] as Played[],
			tappedAt: null as number | null,
		})
		window.addEventListener(
			'pointerdown',
			() => (motion.tappedAt = performance.now()),
			{ capture: true },
		)
		const propsOf = (frames: Keyframe[] | PropertyIndexedKeyframes | null) =>
			[
				...new Set(
					(Array.isArray(frames) ? frames : frames ? [frames] : []).flatMap(
						(frame) =>
							Object.keys(frame).filter(
								(key) =>
									!['offset', 'computedOffset', 'easing', 'composite'].includes(
										key,
									),
							),
					),
				),
			].sort()
		const nameOf = (el: Element) =>
			el.getAttributeNames().find((name) => name.startsWith('data-')) ??
			el.tagName.toLowerCase()
		const animate = Element.prototype.animate
		Element.prototype.animate = function (frames, options) {
			const timing =
				typeof options === 'number' ? { duration: options } : options
			motion.animated.push({
				target:
					(timing as KeyframeAnimationOptions | undefined)?.pseudoElement ??
					`[${nameOf(this)}]`,
				props: propsOf(frames),
				duration: Number(timing?.duration ?? 0),
				easing: String(timing?.easing ?? 'linear'),
			})
			return animate.call(this, frames, options)
		}
		const start = document.startViewTransition?.bind(document)
		if (!start) return
		document.startViewTransition = ((update) => {
			const transition = start(update)
			const entry: Transition = {
				played: [],
				skipped: false,
				readyAt: null,
				finishedAt: null,
			}
			motion.transitions.push(entry)
			const skip = transition.skipTransition.bind(transition)
			transition.skipTransition = () => {
				entry.skipped = true
				skip()
			}
			transition.ready
				.then(() => (entry.readyAt = performance.now()))
				.then(
					() =>
						new Promise((resolve) =>
							requestAnimationFrame(() => resolve(null)),
						),
				)
				.then(() => {
					for (const animation of document.documentElement.getAnimations({
						subtree: true,
					})) {
						const effect = animation.effect as KeyframeEffect | null
						if (!effect?.pseudoElement?.startsWith('::view-transition')) {
							continue
						}
						const timing = effect.getTiming()
						const frames = effect.getKeyframes()
						const props = propsOf(frames)
						// The browser's own blend helper for a crossfade: no motion.
						if (props.every((prop) => prop === 'mixBlendMode')) continue
						entry.played.push({
							target: effect.pseudoElement,
							props,
							duration: Number(timing.duration),
							// A CSS animation's curve is on its keyframes.
							easing:
								timing.easing !== 'linear'
									? String(timing.easing)
									: String(frames[0]?.easing ?? 'linear'),
						})
					}
				})
				.catch(() => {})
			transition.finished
				.catch(() => {})
				.finally(() => (entry.finishedAt = performance.now()))
			return transition
		}) as Document['startViewTransition']
	})
}

async function transitions(page: Page): Promise<Transition[]> {
	return page.evaluate(() => window.__motion.transitions)
}

/** Wait for the `n`th transition (1-based) to have been read. */
async function nthTransition(page: Page, n: number): Promise<Transition> {
	await expect
		.poll(async () => {
			const all = await transitions(page)
			const it = all[n - 1]
			return it ? it.played.length > 0 || it.skipped : false
		})
		.toBe(true)
	return (await transitions(page))[n - 1]!
}

/** The played animations on one pseudo-element. */
function on(transition: Transition, target: string) {
	return transition.played.filter((played) => played.target === target)
}

/** A morph as #558 has it: 280ms on `--ease-in-out`, by transform and clip. */
function expectMorph(transition: Transition, name: string) {
	const group = on(transition, `::view-transition-group(${name})`)
	expect(group).toEqual([
		{
			target: `::view-transition-group(${name})`,
			props: ['clipPath', 'transform'],
			duration: 280,
			easing: EASE_IN_OUT,
		},
	])
	// What the old screen leaves fades faster than the new arrives.
	expect(on(transition, `::view-transition-old(${name})`)).toEqual([
		expect.objectContaining({ duration: 160, easing: EASE_OUT }),
	])
	expect(on(transition, `::view-transition-new(${name})`)).toEqual([
		expect.objectContaining({ duration: 200, easing: EASE_OUT }),
	])
}

/** Nothing in any transition animates layout, and nothing runs 300ms or more. */
function expectCompositorOnly(all: Transition[]) {
	for (const played of all.flatMap((transition) => transition.played)) {
		for (const prop of played.props) {
			expect(['opacity', 'transform', 'clipPath'], played.target).toContain(
				prop,
			)
		}
		expect(played.duration).toBeLessThan(300)
	}
}

async function seedTodayRun(userId: string, title: string) {
	const timezone = 'UTC'
	await prisma.athleteProfile.create({ data: { userId, timezone } })
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			ownerId: userId,
			title,
			discipline: 'run',
			intent: 'endurance',
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									discipline: 'run',
									durationSec: 40 * 60,
								},
							],
						},
					},
				],
			},
		},
	})
	return prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			workoutId: workout.id,
			scheduledAt: localTimeUTC(
				localDate(new Date(), timezone),
				'00:30',
				timezone,
			),
			source: 'generated',
		},
	})
}

test('Uka di becomes the cards, the chosen card the curve, the curve I dag’s week, and back reverses each', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(180_000)
	await recordMotion(page)
	await login()

	await navigate(`/start/okter?${ANSWERS}` as '/start/okter')
	const next = page.getByRole('button', { name: 'Hopp over', exact: true })
	await untilHydrated(next)
	await next.click()
	await expect(page).toHaveURL(/\/start\/valg/)
	// Uka di → the top card.
	expectMorph(await nthTransition(page, 1), 'start-week')

	// Back to the question: the same morph, played the other way.
	const back = page.getByRole('link', {
		name: 'Tilbake til hva slags økter du liker',
	})
	await untilHydrated(back)
	await back.click()
	await expect(page).toHaveURL(/\/start\/okter/)
	expectMorph(await nthTransition(page, 2), 'start-week')

	await untilHydrated(next)
	await next.click()
	await expect(page).toHaveURL(/\/start\/valg/)
	await nthTransition(page, 3)

	// The chosen card → the plan's curve.
	const choose = page.getByRole('button', { name: /^Velg denne: / }).first()
	await untilHydrated(choose)
	await choose.click()
	await expect(page).toHaveURL('/start/klar')
	const toCurve = await nthTransition(page, 4)
	expectMorph(toCurve, 'start-plan')
	// The top card was not chosen into anything else.
	expect(on(toCurve, '::view-transition-group(start-week)')).toEqual([])

	// The curve → I dag's week.
	const toToday = page.getByRole('link', { name: 'Til I dag' })
	await untilHydrated(toToday)
	await toToday.click()
	await expect(page).toHaveURL('/')
	expectMorph(await nthTransition(page, 5), 'start-plan')

	// Browser back from I dag: the week morphs back into the curve.
	await page.goBack()
	await expect(page).toHaveURL('/start/klar')
	expectMorph(await nthTransition(page, 6), 'start-plan')

	expectCompositorOnly(await transitions(page))
})

/** How each block of _Uka di_ is declared to move, by its state. */
async function sketchBlocks(page: Page) {
	return page.locator('[data-week-sketch] .sketch-block').evaluateAll((els) =>
		els.map((el) => {
			const style = getComputedStyle(el)
			return {
				state: el.hasAttribute('data-leaving')
					? 'leaving'
					: el.hasAttribute('data-entering')
						? 'entering'
						: 'staying',
				property: style.transitionProperty,
				duration: style.transitionDuration,
				easing: style.transitionTimingFunction,
				delay: style.transitionDelay,
			}
		}),
	)
}

test('Uka di’s blocks rise in 30ms apart, stretch in place, and drop out in 160ms', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	await login()
	await navigate('/start/niva')
	const experienced = page.getByRole('radio', { name: /Erfaren/ })
	await untilHydrated(experienced)
	await experienced.click()

	// Five days arrive, each 30ms after the one before, rising on ease-out.
	const arrived = await sketchBlocks(page)
	expect(arrived.map((block) => block.state)).toEqual(Array(5).fill('entering'))
	expect(arrived.map((block) => block.delay)).toEqual(
		['0s', '0.03s', '0.06s', '0.09s', '0.12s'],
	)
	for (const block of arrived) {
		expect(block.property).toBe('transform, clip-path, opacity')
		expect(block.duration).toBe('0.2s')
		expect(block.easing).toBe(EASE_OUT)
	}

	// Fewer hours: the same blocks stretch in place, on the morph's curve —
	// arrived blocks stay, whether or not the change moved their sizes.
	await page.getByRole('button', { name: FEWER_HOURS }).click()
	await expect
		.poll(async () => (await sketchBlocks(page)).map((block) => block.state))
		.toEqual(Array(5).fill('staying'))
	for (const block of await sketchBlocks(page)) {
		expect(block.property).toBe('transform, clip-path, opacity')
		expect(block.duration).toBe('0.28s, 0.28s, 0.2s')
		expect(block.easing).toBe([EASE_IN_OUT, EASE_IN_OUT, EASE_OUT].join(', '))
	}

	// A beginner's three days: days go, faster than anything arrives…
	await page.getByRole('radio', { name: /Nybegynner/ }).click()
	const leaving = (await sketchBlocks(page)).filter(
		(block) => block.state === 'leaving',
	)
	expect(leaving.length).toBeGreaterThan(0)
	for (const block of leaving) {
		expect(block.duration).toBe('0.16s')
		expect(block.easing).toBe(EASE_OUT)
	}
	// …and are gone once they have dropped out.
	await expect(
		page.locator('[data-week-sketch] .sketch-block[data-leaving]'),
	).toHaveCount(0)
	expect(await sketchBlocks(page)).toHaveLength(3)
})

test('a tap during a morph lands it at once, and a key never animates', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(180_000)
	await recordMotion(page)
	await login()

	await navigate(`/start/okter?${ANSWERS}` as '/start/okter')
	const next = page.getByRole('button', { name: 'Hopp over', exact: true })
	await untilHydrated(next)
	// Started from the keyboard: the transition is skipped before it plays.
	await next.focus()
	await page.keyboard.press('Enter')
	await expect(page).toHaveURL(/\/start\/valg/)
	const keyed = await nthTransition(page, 1)
	expect(keyed.skipped).toBe(true)

	// Started by a tap, then tapped again while it runs: it lands at once.
	const back = page.getByRole('link', {
		name: 'Tilbake til hva slags økter du liker',
	})
	await untilHydrated(back)
	await back.click()
	await page.waitForFunction(
		() => window.__motion.transitions[1]?.readyAt != null,
		null,
		{ polling: 'raf' },
	)
	await page.mouse.click(4, 400)
	await expect(page).toHaveURL(/\/start\/okter/)
	await expect
		.poll(async () => (await transitions(page))[1]?.finishedAt)
		.not.toBeNull()
	const tapped = (await transitions(page))[1]!
	const tappedAt = await page.evaluate(() => window.__motion.tappedAt)
	expect(tapped.skipped).toBe(true)
	// Landed with the tap, well inside the 280ms it would have run.
	expect(tapped.finishedAt! - tappedAt!).toBeLessThan(100)
})

test('the first Gjort on a session sends eight sparks from its check, once, and never on Angre', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	await recordMotion(page)
	const user = await login()
	const run = await seedTodayRun(user.id, 'Morgentur')
	await navigate('/')

	const done = page.getByRole('button', {
		name: 'Marker «Morgentur» som gjort',
	})
	await untilHydrated(done)
	await done.click()
	await expect(page.locator('[data-today-card="done"]')).toBeVisible()

	const sparks = async () =>
		(await page.evaluate(() => window.__motion.animated)).filter(
			(played) => played.target === '[data-spark]',
		)
	await expect.poll(async () => (await sparks()).length).toBe(8)
	for (const spark of await sparks()) {
		expect(spark).toEqual({
			target: '[data-spark]',
			props: ['opacity', 'transform'],
			duration: 300,
			easing: EASE_OUT,
		})
	}
	// They leave the page when they are done.
	await expect(page.locator('[data-spark]')).toHaveCount(0)

	// Angre: no sparks for taking it back.
	await page.locator(`[data-today-undo="${run.id}"]`).click()
	await expect(done).toBeVisible()
	expect(await sparks()).toHaveLength(8)

	// Marked again: the session was celebrated once, and stays quiet.
	await untilHydrated(done)
	await done.click()
	await expect(page.locator('[data-today-card="done"]')).toBeVisible()
	await page.waitForTimeout(600)
	expect(await sparks()).toHaveLength(8)
})

test.describe(() => {
	test.use({ contextOptions: { reducedMotion: 'reduce' } })

	test('reduced motion crossfades every morph in place, never jumps, and the sparks are a check fade', async ({
		page,
		navigate,
		login,
	}) => {
		test.setTimeout(180_000)
		await recordMotion(page)
		await login()

		await navigate(`/start/okter?${ANSWERS}` as '/start/okter')
		const next = page.getByRole('button', { name: 'Hopp over', exact: true })
		await untilHydrated(next)
		await next.click()
		await expect(page).toHaveURL(/\/start\/valg/)
		const toCards = await nthTransition(page, 1)

		const choose = page.getByRole('button', { name: /^Velg denne: / }).first()
		await untilHydrated(choose)
		await choose.click()
		await expect(page).toHaveURL('/start/klar')
		const toCurve = await nthTransition(page, 2)

		for (const transition of [toCards, toCurve]) {
			// Nothing travels: no group moves, and only opacity changes…
			expect(
				transition.played.filter((played) =>
					played.target.startsWith('::view-transition-group'),
				),
			).toEqual([])
			// …in a 200ms crossfade, which is still motion (ADR 0077).
			expect(transition.played.length).toBeGreaterThan(0)
			for (const played of transition.played) {
				expect(played.props).toEqual(['opacity'])
				expect(played.duration).toBe(200)
			}
		}
		// And the container transform was never asked for.
		expect(
			(await page.evaluate(() => window.__motion.animated)).filter((played) =>
				played.target.startsWith('::view-transition'),
			),
		).toEqual([])
	})

	test('reduced motion: Uka di’s blocks fade where they stand', async ({
		page,
		navigate,
		login,
	}) => {
		test.setTimeout(120_000)
		await login()
		await navigate('/start/niva')
		const experienced = page.getByRole('radio', { name: /Erfaren/ })
		await untilHydrated(experienced)
		await experienced.click()
		const blocks = await sketchBlocks(page)
		expect(blocks).toHaveLength(5)
		for (const block of blocks) {
			expect(block.property).toBe('opacity')
			expect(block.duration).toBe('0.2s')
			expect(block.delay).toBe('0s')
		}
	})

	test('reduced motion turns the sparks into a calm check fade', async ({
		page,
		navigate,
		login,
	}) => {
		test.setTimeout(120_000)
		await recordMotion(page)
		const user = await login()
		await seedTodayRun(user.id, 'Morgentur')
		await navigate('/')

		const done = page.getByRole('button', {
			name: 'Marker «Morgentur» som gjort',
		})
		await untilHydrated(done)
		await done.click()
		await expect(page.locator('[data-today-card="done"]')).toBeVisible()
		const checks = async () =>
			(await page.evaluate(() => window.__motion.animated)).filter(
				(one) => one.target === '[data-today-check]',
			)
		await expect.poll(async () => (await checks()).length).toBe(1)
		expect(await checks()).toEqual([
			{
				target: '[data-today-check]',
				props: ['opacity'],
				duration: 200,
				easing: EASE_OUT,
			},
		])
		expect(
			(await page.evaluate(() => window.__motion.animated)).filter(
				(one) => one.target === '[data-spark]',
			),
		).toEqual([])
	})
})
