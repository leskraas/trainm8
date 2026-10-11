import { type Locator, type Page } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { saveGymProfile } from '#app/utils/plate-inventory.server.ts'
import { saveLoggedSet } from '#app/utils/strength-log.server.ts'
import {
	type ProgramSummary,
	listPrograms,
	openNextProgramSession,
	startProgram,
} from '#app/utils/strength-program.server.ts'
import { finishStrengthSession } from '#app/utils/strength-runner.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * **The four strength screens at 390×844** (#489).
 *
 * ADR 0028's last line makes the reference viewport the gate: *"every screen
 * change under the standard is verified with Playwright at 390×844 before its
 * ticket closes."* The strength module (#476) shipped four screens across nine
 * issues with route-level RTL tests only, and `tests/e2e` had nothing touching
 * programs, the runner or lift history — so the one thing jsdom cannot see was
 * never looked at: **what these screens measure once they have laid out.**
 *
 * That is what this spec is for, and it is why almost every assertion here is a
 * number read off a real box:
 *
 * - **no zone extends past 390px** — the standard's own litmus test (§5);
 * - **every interactive control is 44px to a thumb** — ADR 0028 pillar 2, and
 *   {@link hitBox} measures the *effective* target, so a 36px control that
 *   reaches 44px through the `after:` inset the standard sanctions passes on
 *   the same terms the ADR states;
 * - **the set circles, the warm-up chips and the rest bar work from a
 *   keyboard** — the runner is a screen of custom `<button>`s, and a control
 *   that only answers a tap is one a switch user cannot run a workout with.
 *
 * The state assertions are read from what the athlete can see — the weight on
 * the card, `2 of 5 logged`, the rest bar's clock — rather than from test ids,
 * because a test id can stay green while the screen says nothing.
 *
 * **Two of these fail against the product, and are marked `test.fail()` rather
 * than softened** — the programs list has controls under 44px, and the runner's
 * tap cycle cannot reach zero, which is the rung ADR 0064 §1 clears a set
 * through. Each says which defect it is standing on. A softened assertion is a
 * guard that stopped guarding; `test.fail()` keeps running the measurement,
 * keeps the suite green on a defect that is somebody else's ticket, and goes
 * red the day it is fixed, which is when somebody wants to hear about it.
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 }

test.use({ viewport: MOBILE_VIEWPORT })

/** The platform minimum ADR 0028 pillar 2 adopts, in CSS pixels. */
const MIN_TOUCH_TARGET = 44

/** The standard's litmus test: no zone extends past the 390px viewport. */
async function expectNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth -
			document.documentElement.clientWidth,
	)
	expect(
		overflow,
		'a screen extends past the 390px viewport (docs/design/ui-conventions.md §2.5/§5)',
	).toBeLessThanOrEqual(0)
}

type HitTarget = { name: string; width: number; height: number }

/**
 * **Every interactive control on the screen, measured as a thumb meets it.**
 *
 * The box is not `getBoundingClientRect()` alone. ADR 0028 pillar 2 keeps the
 * invisible `after:` hit-area extension *"only where a control can't be 44px
 * tall"* — icon buttons, inline links, glyph chrome — so a 36px button with
 * `after:absolute after:-inset-1` is a 44px target and the standard says so.
 * Measuring the border box would fail those controls for obeying the rule; the
 * union with an absolutely-positioned pseudo-element's negative insets is what
 * the ADR actually asks for.
 *
 * Controls the athlete cannot reach — zero-sized, `display:none`, inside a
 * closed `<details>` — are not targets and are skipped.
 */
async function touchTargets(scope: Locator): Promise<HitTarget[]> {
	return scope.evaluate((root: HTMLElement) => {
		const SELECTOR = [
			'a[href]',
			'button',
			'summary',
			'select',
			'textarea',
			'input:not([type="hidden"])',
			'[role="button"]',
			'[role="tab"]',
			'[role="switch"]',
		].join(',')

		function grow(value: string): number {
			const n = Number.parseFloat(value)
			return Number.isFinite(n) ? Math.max(0, -n) : 0
		}

		/** The border box, unioned with any absolutely-positioned `::before` /
		 * `::after` that reaches outside it. */
		function hitBox(el: Element): { width: number; height: number } {
			const rect = el.getBoundingClientRect()
			let width = rect.width
			let height = rect.height
			for (const pseudo of ['::before', '::after']) {
				const style = getComputedStyle(el, pseudo)
				if (!style || style.content === 'none') continue
				if (style.position !== 'absolute' && style.position !== 'fixed')
					continue
				width = Math.max(
					width,
					rect.width + grow(style.left) + grow(style.right),
				)
				height = Math.max(
					height,
					rect.height + grow(style.top) + grow(style.bottom),
				)
			}
			return { width, height }
		}

		/** What to call this control in a failure message: the athlete's own name
		 * for it wherever there is one. */
		function nameOf(el: Element): string {
			const label =
				el.getAttribute('aria-label') ??
				(el as HTMLElement).innerText?.trim().split('\n')[0] ??
				''
			const tag = el.tagName.toLowerCase()
			const kind = el.getAttribute('type')
			return `<${tag}${kind ? ` type=${kind}` : ''}> ${label || '(unnamed)'}`.slice(
				0,
				90,
			)
		}

		// Every control, not only the offenders: the caller asserts on an empty
		// list of offenders, and a screen that turned up no controls at all is a
		// fixture failure it has to be able to tell apart from a clean pass.
		const seen: Array<{ name: string; width: number; height: number }> = []
		for (const el of root.querySelectorAll(SELECTOR)) {
			const rect = el.getBoundingClientRect()
			if (rect.width === 0 || rect.height === 0) continue
			const { width, height } = hitBox(el)
			seen.push({ name: nameOf(el), width, height })
		}
		return seen
	})
}

/**
 * The controls that do not reach 44px in both directions.
 *
 * Half a pixel of slack on the height, and none on the width: a control built
 * to the standard lands on 44 exactly, and sub-pixel layout rounding is not a
 * violation worth a red build.
 */
function undersized(targets: HitTarget[]): string[] {
	return targets
		.filter(
			(t) =>
				t.width < MIN_TOUCH_TARGET - 0.5 || t.height < MIN_TOUCH_TARGET - 0.5,
		)
		.map((t) => `${t.name} — ${Math.round(t.width)}×${Math.round(t.height)}`)
}

/** ADR 0028 pillar 2, asserted over a whole screen. */
async function expectEveryControlTappable(scope: Locator) {
	const targets = await touchTargets(scope)
	expect(
		targets.length,
		'no interactive controls were found to measure',
	).toBeGreaterThan(0)
	expect(
		undersized(targets),
		'controls below the 44px effective touch target (ADR 0028 pillar 2)',
	).toEqual([])
}

/**
 * **Wait until React has taken over the markup**, naming one control that has
 * to end up with a handler on it.
 *
 * The runner is the one screen here whose whole behaviour is client-side, and a
 * tap that lands before hydration is silently dropped. The repo's other specs
 * work around that by retrying the click (`cta-semantics`, `embedded-nav`) —
 * but on this screen **every tap is a write**, so a retried tap on a set circle
 * is a second set logged and a retried tap on a chip un-ticks it. So this waits
 * for the handler to exist rather than tapping twice: React attaches its props
 * to the host node as it hydrates, and until it has, there is nothing to press.
 */
async function waitForHydration(page: Page, selector: string) {
	await page.waitForFunction(
		(sel) => {
			const el = document.querySelector(sel)
			return (
				el != null &&
				Object.keys(el).some((key) => key.startsWith('__reactProps$'))
			)
		},
		selector,
		{ timeout: 15_000 },
	)
}

/**
 * Press the focused set control, and wait for the write that press makes.
 *
 * **Every tap on the runner is a write** (ADR 0064 §1), and the circle answers
 * optimistically — so the screen shows the new count before the server has
 * agreed, and a test that pressed again on the strength of that would be
 * pressing mid-flight, which is not something a thumb can do. Waiting for the
 * POST keeps the sequence the athlete's rather than the network's.
 *
 * **Answered, not accepted** — any status counts. A refusal is an answer too,
 * and the circle puts the previous value back on one, so waiting only for a
 * success would hang on exactly the case worth seeing.
 */
async function pressAndSettle(page: Page, key: 'Enter' | 'Space') {
	const [answer] = await Promise.all([
		page.waitForResponse((response) => response.request().method() === 'POST'),
		page.keyboard.press(key),
	])
	return answer
}

/** Which element the browser has focus on, named the way a reader would. */
async function focusedName(page: Page): Promise<string> {
	return page.evaluate(() => {
		const el = document.activeElement
		if (!el) return '(none)'
		return (
			el.getAttribute('aria-label') ??
			(el as HTMLElement).innerText?.trim().split('\n')[0] ??
			el.tagName.toLowerCase()
		)
	})
}

/** Tab until `locator` has focus, so "reachable by keyboard" is a walk from the
 * top of the document rather than a `.focus()` call the athlete cannot make. */
async function tabTo(page: Page, locator: Locator, limit = 60) {
	for (let step = 0; step < limit; step++) {
		if (await locator.evaluate((el) => el === document.activeElement)) return
		await page.keyboard.press('Tab')
	}
	throw new Error(
		`never reached the control by tabbing; focus stopped on ${await focusedName(page)}`,
	)
}

// ——— Fixtures ————————————————————————————————————————————————————————————
//
// The programs themselves are corpus content shipped by
// `20260818120000_ship_the_exercise_corpus_and_the_three_programs`, so nothing
// here authors a program. What the athlete brings is a gym, a bodyweight and a
// run — and the run is started and opened through the same server functions the
// routes call, so the session under test is the session the app would have made.

/** A rack that can make the numbers this spec asks for, so the plate line and
 * the warm-up ramp are present rather than absent. Both are real readings on
 * the runner and both are missing without a described gym. */
const A_REAL_RACK = {
	bars: [{ label: 'Olympic', weightKg: 20 }],
	plates: [
		{ weightKg: 20, count: 4 },
		{ weightKg: 15, count: 2 },
		{ weightKg: 10, count: 2 },
		{ weightKg: 5, count: 2 },
		{ weightKg: 2.5, count: 2 },
		{ weightKg: 1.25, count: 2 },
	],
	fixedDumbbellsKg: null,
}

async function strongLifts(): Promise<ProgramSummary> {
	const programs = await listPrograms()
	const program = programs.find((p) => p.key === 'stronglifts-5x5')
	if (!program)
		throw new Error(
			'StrongLifts 5×5 is missing — the corpus migration did not run',
		)
	return program
}

/** An athlete with a bodyweight and a rack, which is what the plate line, the
 * ramp and every bodyweight-relative load resolve against. */
async function seedAthlete(userId: string) {
	await prisma.athleteProfile.upsert({
		where: { userId },
		create: { userId, weightKg: 82, timezone: 'UTC' },
		update: { weightKg: 82, timezone: 'UTC' },
	})
	const saved = await saveGymProfile({
		userId,
		name: 'Iron Works',
		inventory: A_REAL_RACK,
	})
	expect(saved.ok, 'the gym fixture failed to save').toBe(true)
}

/**
 * A running StrongLifts instance with today's session opened.
 *
 * The starting weights are deliberately **not** the program's empty-bar
 * defaults: at 20 kg there is nothing to warm up to, so the ramp — and with it
 * the warm-up chips this ticket has to cover — would be legitimately absent.
 */
async function startRun(userId: string, program: ProgramSummary) {
	const started = await startProgram({
		userId,
		programId: program.id,
		startedOn: new Date(),
		startingWeights: program.lifts.map((lift) => ({
			exerciseId: lift.exerciseId,
			equipment: lift.equipment,
			weightKg: lift.exerciseId === 'ex_bb_back_squat' ? 82.5 : 60,
		})),
	})
	if (!started.ok) throw new Error(`the run fixture failed: ${started.reason}`)
	const opened = await openNextProgramSession({
		userId,
		instanceId: started.instanceId,
	})
	if (!opened) throw new Error('the run opened no session')
	return { instanceId: started.instanceId, ...opened }
}

/**
 * Run `sessions` sessions of the program to completion, every working set made.
 *
 * Written through `saveLoggedSet` and `finishStrengthSession` — the runner's own
 * two writes — so the history the lift-over-time screen reads is history the app
 * produced, with a working weight that moved for the reason the program says it
 * moved.
 */
async function runSessions(
	userId: string,
	instanceId: string,
	sessions: number,
) {
	for (let index = 0; index < sessions; index++) {
		const opened = await openNextProgramSession({ userId, instanceId })
		if (!opened) throw new Error(`session ${index + 1} would not open`)
		const view = await prisma.workoutSession.findUniqueOrThrow({
			where: { id: opened.sessionId },
			select: {
				workout: {
					select: {
						blocks: {
							select: {
								steps: {
									select: {
										id: true,
										sets: { select: { reps: true, load: true } },
									},
								},
							},
						},
					},
				},
			},
		})
		const steps = view.workout?.blocks.flatMap((b) => b.steps) ?? []
		for (const step of steps) {
			for (const [orderIndex, set] of step.sets.entries()) {
				const load: unknown = set.load ? JSON.parse(set.load) : null
				const kg =
					typeof load === 'object' &&
					load != null &&
					'kg' in load &&
					typeof load.kg === 'number'
						? load.kg
						: null
				if (kg == null) continue
				await saveLoggedSet({
					athleteId: userId,
					sessionId: opened.sessionId,
					stepId: step.id,
					orderIndex,
					role: 'working',
					outcome: 'completed',
					toFailure: false,
					load: { kind: 'external', kg },
					reps: set.reps ?? 5,
					repsLeft: null,
					durationSec: null,
					rir: null,
					restTakenSec: null,
				})
			}
		}
		const finished = await finishStrengthSession({
			userId,
			sessionId: opened.sessionId,
		})
		expect(finished.ok, `session ${index + 1} would not finish`).toBe(true)
	}
}

// ——— The programs list ———————————————————————————————————————————————————

test('the programs list states each program in its own numbers, and holds 390px', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	await login()

	await navigate('/training/programs')

	// The screen's primary state, read the way the athlete reads it: the title,
	// and a card per published program saying what it actually is.
	await expect(
		page.getByRole('heading', { name: 'Strength programs' }),
	).toBeVisible()
	await expect(
		page.getByText('Each one runs on the last weight you lifted'),
	).toBeVisible()
	// A real card, with the two things it exists to state: the lift's scheme
	// tonight, and what the program does to the weight over weeks.
	await expect(page.getByText('StrongLifts 5×5', { exact: true })).toBeVisible()
	await expect(page.getByText('Back Squat').first()).toBeVisible()
	await expect(page.getByText('5×5').first()).toBeVisible()
	await expect(page.getByText(/after 3 stalls/).first()).toBeVisible()
	// The one action a program that is not running offers.
	await expect(
		page.getByRole('link', { name: 'Start StrongLifts 5×5' }),
	).toBeVisible()

	await expectNoHorizontalOverflow(page)
})

test('a running program says so, and offers the run rather than the start', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedAthlete(user.id)
	await startRun(user.id, await strongLifts())

	await navigate('/training/programs')

	await expect(page.getByText('Running', { exact: true })).toBeVisible()
	await expect(
		page.getByRole('button', { name: 'Open your run' }),
	).toBeVisible()
	// And the start link for that program is gone — two ways to begin the same
	// program is the surface offering to start something already running.
	await expect(
		page.getByRole('link', { name: 'Start StrongLifts 5×5' }),
	).toHaveCount(0)

	await expectNoHorizontalOverflow(page)
})

test.fail(
	'every control on the programs list is 44px to a thumb',
	async ({ page, navigate, login }) => {
		test.setTimeout(120_000)
		const user = await login()
		await seedAthlete(user.id)
		// With a run going, so the card's *other* control — the overview link — is
		// on the screen being measured rather than one state away from it.
		await startRun(user.id, await strongLifts())
		await navigate('/training/programs')
		await expect(
			page.getByRole('heading', { name: 'Strength programs' }),
		).toBeVisible()
		await expect(
			page.getByRole('button', { name: 'Open your run' }),
		).toBeVisible()

		// **This one fails against the product, and is marked rather than
		// softened.** Two controls on this screen are below the standard, and
		// neither carries the `after:` extension ADR 0028 pillar 2 keeps for
		// exactly the controls that cannot be 44px tall:
		//
		// - the `Source` disclosure `<summary>` on every program card — 60×28;
		// - `Correct a weight or end this program`, the bare underlined link under
		//   a running program.
		//
		// Fixing them is not this ticket's business (#489 adds the coverage); the
		// day they are fixed this test goes red and says so.
		await expectEveryControlTappable(page.getByRole('main'))
	},
)

// ——— Starting weights ————————————————————————————————————————————————————

test('starting weights asks one number per lift, pre-filled and accounted for', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	await login()
	const program = await strongLifts()

	await page.goto(`/training/programs/${program.id}/start`)

	await expect(
		page.getByRole('heading', { name: 'Starting weights' }),
	).toBeVisible()
	// The program name as an eyebrow over the screen's own title, so the athlete
	// can see *which* program they are committing to. (It is uppercased in CSS,
	// so the text itself is the program's own name.)
	await expect(page.getByText('StrongLifts 5×5', { exact: true })).toBeVisible()
	await expect(
		page.getByText('One number per lift. After this the program decides'),
	).toBeVisible()

	// One field per lift, carrying the program's own published default and the
	// sentence saying where that number came from.
	const squat = page.getByLabel(/Back Squat/)
	await expect(squat).toHaveValue('20')
	await expect(
		page.getByText(/publishes 20 kg here — the empty bar/).first(),
	).toBeVisible()
	// The unit is the field's, never the athlete's to type.
	await expect(page.getByText('kg').first()).toBeVisible()

	await expect(
		page.getByRole('button', { name: 'Start StrongLifts 5×5' }),
	).toBeVisible()
	await expectNoHorizontalOverflow(page)
})

test('starting weights refuses a number it cannot use, in words, on the screen', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	await login()
	const program = await strongLifts()
	await page.goto(`/training/programs/${program.id}/start`)
	await expect(
		page.getByRole('heading', { name: 'Starting weights' }),
	).toBeVisible()
	// The refusal comes back through a fetcher, so it is a sentence only once
	// the form is React's.
	await waitForHydration(page, 'input[name^="weight::"]')

	// `noValidate` is on the form for exactly this: the refusal has to be a
	// sentence on the screen, never a swallowed submit.
	await page.getByLabel(/Back Squat/).fill('-5')
	await page.getByRole('button', { name: 'Start StrongLifts 5×5' }).click()

	await expect(page.getByRole('alert')).toHaveText(
		'A starting weight has to be a positive number of kilos.',
	)
	await expectNoHorizontalOverflow(page)
})

test('every control on starting weights is 44px to a thumb', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	await login()
	const program = await strongLifts()
	await page.goto(`/training/programs/${program.id}/start`)
	await expect(
		page.getByRole('heading', { name: 'Starting weights' }),
	).toBeVisible()

	await expectEveryControlTappable(page.getByRole('main'))
})

// ——— The runner ——————————————————————————————————————————————————————————

test('the runner opens on the weight the program resolved, with its ramp and its circles', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedAthlete(user.id)
	const run = await startRun(user.id, await strongLifts())

	await page.goto(`/training/sessions/${run.sessionId}/log`)

	await expect(
		page.getByRole('heading', { name: 'Run your workout', level: 1 }),
	).toBeVisible()
	// Which session of the run this is — only a run can number a session.
	await expect(page.getByText('Session 1')).toBeVisible()

	// The lift, and the weight the program decided, on the face of the card.
	const squat = page.getByRole('heading', { name: 'Back Squat', level: 2 })
	await expect(squat).toBeVisible()
	await expect(page.getByText('5×5 · 82.5 kg')).toBeVisible()

	// The generated ramp, and the working sets with what is left of them.
	await expect(page.getByText('Warm-up').first()).toBeVisible()
	await expect(page.getByText('Working sets').first()).toBeVisible()
	await expect(page.getByText('0 of 5 logged').first()).toBeVisible()
	// Five circles, each showing its target rather than a bare number nobody
	// asked for.
	const circles = page.getByRole('button', {
		name: /^Log set \d of Back Squat$/,
	})
	await expect(circles).toHaveCount(5)
	await expect(circles.first()).toHaveText('5')

	// The plate line, solved against the rack the athlete described.
	await expect(page.locator('[data-plate-line]').first()).toBeVisible()

	// And the one control that is not a set.
	await expect(
		page.getByRole('button', { name: 'Finish workout' }),
	).toBeVisible()
	await expect(
		page.getByText('Every set was saved as you tapped it'),
	).toBeVisible()

	await expectNoHorizontalOverflow(page)
})

test('a set circle logs and counts the reps down — from the keyboard', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedAthlete(user.id)
	const run = await startRun(user.id, await strongLifts())

	await page.goto(`/training/sessions/${run.sessionId}/log`)
	await waitForHydration(page, '[data-set-circle]')
	const first = page.getByRole('button', { name: 'Log set 1 of Back Squat' })
	await expect(first).toBeVisible()

	// **Reachable**: tabbing from the top of the document arrives on the circle.
	await page.keyboard.press('Tab')
	await tabTo(page, first)

	// **Operable**: Enter logs the full target, and the screen says so in the
	// athlete's own words rather than in a data attribute.
	await pressAndSettle(page, 'Enter')
	const logged = page.getByRole('button', {
		name: 'Logged set 1 of Back Squat',
	})
	await expect(logged).toBeVisible()
	await expect(logged).toHaveText('5')
	await expect(page.getByText('1 of 5 logged').first()).toBeVisible()

	// A second press counts the reps down, and a set under its target renders
	// destructive — the program will read it as a miss and the athlete sees that
	// without arithmetic.
	await tabTo(page, logged)
	await pressAndSettle(page, 'Space')
	await expect(logged).toHaveText('4')
	await expect(logged).toHaveAttribute('data-state', 'short')

	// And on down, one press per rep, each one a write of its own.
	const circle = page.locator('[data-set-circle="0"]').first()
	for (const count of ['3', '2', '1']) {
		await tabTo(page, circle)
		await pressAndSettle(page, 'Space')
		await expect(circle).toHaveText(count)
	}
	// Still one logged set: counting down restates the set, it does not undo it.
	await expect(page.getByText('1 of 5 logged').first()).toBeVisible()
})

test.fail(
	'a set counted down to zero clears, and the circle goes back to its target',
	async ({ page, login }) => {
		test.setTimeout(120_000)
		const user = await login()
		await seedAthlete(user.id)
		const run = await startRun(user.id, await strongLifts())

		await page.goto(`/training/sessions/${run.sessionId}/log`)
		await waitForHydration(page, '[data-set-circle]')
		const first = page.getByRole('button', { name: 'Log set 1 of Back Squat' })
		await expect(first).toBeVisible()
		await tabTo(page, first)

		// ADR 0064 §1's tap cycle, stated in full: *"each further tap counts the
		// reps down — target → target−1 → … → 0 … A tap past zero clears the
		// set."*
		const circle = page.locator('[data-set-circle="0"]').first()
		await pressAndSettle(page, 'Enter')
		for (const count of ['4', '3', '2', '1', '0']) {
			await tabTo(page, circle)
			const answer = await pressAndSettle(page, 'Space')
			// **The server's answer, not the optimistic face.** The circle shows
			// the new count before the write is answered, so reading only the
			// circle let this test pass on a thumb fast enough to tap again inside
			// that window (S9 saw it "pass unexpectedly"; at #505 S16 it passed
			// every run). At a human pace the refusal lands first and puts `1`
			// back, so the write itself is what the rung is checked by.
			expect(answer.ok(), `the write of ${count} was refused`).toBe(true)
			await expect(circle).toHaveText(count)
		}
		await tabTo(page, circle)
		await pressAndSettle(page, 'Space')
		await expect(first).toBeVisible()
		await expect(page.getByText('0 of 5 logged').first()).toBeVisible()

		// **This one fails against the product, and is marked rather than
		// softened.** The tap that would make it `0` is refused by the write seam:
		// `statesWhatWasPerformed` requires a completed working set to state a
		// positive count, so the save comes back `no-count`, the circle is put back
		// to `1` and the card prints *"That set recorded no count."*
		//
		// The consequence is bigger than the missing rung. **A working set logged
		// on the runner cannot be cleared at all** — the clear is only reachable
		// through zero (`nextSetReps`), and zero is unreachable — so ADR 0064 §1's
		// last sentence describes a behaviour the athlete has no way to perform.
		// Fixing it is not this ticket's business (#489 adds the coverage); the day
		// it is fixed this test goes red and says so.
	},
)

test('the rest bar starts on a logged set, adjusts and dismisses from the keyboard', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedAthlete(user.id)
	const run = await startRun(user.id, await strongLifts())

	await page.goto(`/training/sessions/${run.sessionId}/log`)
	await waitForHydration(page, '[data-set-circle]')
	const first = page.getByRole('button', { name: 'Log set 1 of Back Squat' })
	await expect(first).toBeVisible()
	await first.click()

	// It starts on its own — a timer you have to start is a timer you forget —
	// and it says *why* it is this long.
	const bar = page.getByRole('status', { name: 'Rest timer' })
	await expect(bar).toBeVisible()
	await expect(bar.getByText('rest', { exact: true })).toBeVisible()
	const clock = page.getByTestId('rest-clock')
	await expect(clock).toHaveText(/^[0-9]:[0-9]{2}$/)

	// **It never blocks the next set.** Every circle is still enabled while it
	// runs, which is the whole reason it is a bar and not a screen.
	await expect(
		page.getByRole('button', { name: 'Log set 2 of Back Squat' }),
	).toBeEnabled()

	// −15s moves the deadline, from the keyboard.
	const before = await clock.textContent()
	const minus = page.getByRole('button', { name: '−15s' })
	await tabTo(page, minus)
	await page.keyboard.press('Enter')
	await expect(clock).not.toHaveText(before ?? '')

	// And dismissing takes the bar away entirely.
	const dismiss = page.getByRole('button', { name: 'Dismiss the rest timer' })
	await tabTo(page, dismiss)
	await page.keyboard.press('Enter')
	await expect(bar).toHaveCount(0)
})

test('a warm-up chip toggles from the keyboard and says which rung it is', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedAthlete(user.id)
	const run = await startRun(user.id, await strongLifts())

	await page.goto(`/training/sessions/${run.sessionId}/log`)
	await waitForHydration(page, '[data-set-circle]')
	await expect(page.getByText('Warm-up').first()).toBeVisible()

	const chip = page.locator('[data-warmup-chip]').first()
	await expect(chip).toHaveAttribute('aria-pressed', 'false')
	// The rung carries its own weight and reps in its face — it is walked past,
	// not looked up.
	await expect(chip).toHaveText(/^\d+(\.\d+)? × \d+$/)

	await tabTo(page, chip)
	await pressAndSettle(page, 'Space')
	await expect(chip).toHaveAttribute('aria-pressed', 'true')
	await expect(chip).toHaveAccessibleName(/^Logged warm-up 1 of Back Squat/)

	// A rung is not a working set: ticking one changes nothing about `n of m`.
	await expect(page.getByText('0 of 5 logged').first()).toBeVisible()

	// Pressing it again takes it back.
	await pressAndSettle(page, 'Space')
	await expect(chip).toHaveAttribute('aria-pressed', 'false')
})

test('the help panel is one tap behind the lift name and accounts for the weight', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedAthlete(user.id)
	const run = await startRun(user.id, await strongLifts())

	await page.goto(`/training/sessions/${run.sessionId}/log`)
	await waitForHydration(page, '[data-set-circle]')
	const toggle = page.getByRole('button', { name: 'About Back Squat' })
	await expect(toggle).toBeVisible()

	// **Collapsed by default** — this screen's rule is no prose on the logging
	// surface, so the account exists and costs one tap to ask for.
	await expect(toggle).toHaveAttribute('aria-expanded', 'false')
	await expect(page.locator('[data-lift-help-panel]')).toHaveCount(0)

	await toggle.click()
	await expect(toggle).toHaveAttribute('aria-expanded', 'true')
	const panel = page.locator('[data-lift-help-panel]').first()
	await expect(panel).toBeVisible()

	// The four things it says, in the athlete's own numbers: where the weight
	// came from, which rack the plate line is solved against, what the timer
	// survives, and the way to this lift over time.
	await expect(panel).toContainText('82.5 kg is your working weight')
	await expect(panel).toContainText('Iron Works')
	await expect(panel).toContainText(
		'The rest timer survives a locked phone, but not a closed tab.',
	)
	await expect(panel.getByRole('link')).toHaveAttribute(
		'href',
		/\/training\/exercises\//,
	)

	await expectNoHorizontalOverflow(page)
})

test('every control on the runner is 44px to a thumb, rest bar included', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedAthlete(user.id)
	const run = await startRun(user.id, await strongLifts())

	await page.goto(`/training/sessions/${run.sessionId}/log`)
	await waitForHydration(page, '[data-set-circle]')
	await expect(
		page.getByRole('button', { name: 'Log set 1 of Back Squat' }),
	).toBeVisible()
	// The rest bar only exists once a set has been logged, and it is part of
	// this screen — so it is measured on the same pass rather than exempted.
	await page.getByRole('button', { name: 'Log set 1 of Back Squat' }).click()
	await expect(page.getByRole('status', { name: 'Rest timer' })).toBeVisible()

	// Every control on the busiest strength surface, including the three that
	// only exist while a rest runs. The rest bar's ±15s and dismiss are drawn at
	// 40px and reach 44px through the button primitive's own `after:` extension,
	// which is the shape ADR 0028 pillar 2 sanctions — so this measures the
	// effective target rather than the border box, and passes on the ADR's terms.
	await expectEveryControlTappable(page.getByRole('main'))
})

// ——— Lift over time ——————————————————————————————————————————————————————

test('lift over time reads the working weight, the records and the history', async ({
	page,
	login,
}) => {
	test.setTimeout(180_000)
	const user = await login()
	await seedAthlete(user.id)
	const run = await startRun(user.id, await strongLifts())
	// Four made sessions, so the weight has actually moved and the chart has a
	// curve rather than a single bar.
	await runSessions(user.id, run.instanceId, 4)

	await page.goto('/training/exercises/ex_bb_back_squat')

	await expect(
		page.getByRole('heading', { name: /Back Squat/, level: 1 }),
	).toBeVisible()

	// What the athlete came for: what goes on the bar. The weight moved by the
	// program's own increment across four made sessions — 82.5 → 92.5 kg.
	await expect(page.getByText('Working weight')).toBeVisible()
	await expect(page.getByText('92.5 kg', { exact: true })).toBeVisible()

	// The rep-max record, read straight off the set rows and never stored.
	await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible()
	await expect(page.getByText('Best 5-rep set')).toBeVisible()
	await expect(page.getByText('90 kg', { exact: true }).first()).toBeVisible()

	// **And no estimated 1RM, with the reason on the screen.** This is ADR 0064
	// §2's cost in the flesh rather than a gap in the fixture: the runner posts
	// neither `toFailure` nor `rir`, so nothing logged through it can license an
	// estimate, and the app says so instead of borrowing a curve.
	await expect(page.getByText('Est. 1RM')).toHaveCount(0)
	await expect(
		page.getByText(
			/No estimated 1RM: None of your sets here says how close to failure it was/,
		),
	).toBeVisible()

	// And never the handoff's third record row: ADR 0058 §3 declines session
	// tonnage and ADR 0063 records that the design does not override it.
	await expect(page.getByRole('main')).not.toContainText(/tonnage/i)

	// The chart is static and takes one `role="img"` name. ADR 0066 (#490) moved
	// it onto the Chart Primitive and shortened the name, because the equivalent
	// is no longer the visible session list — that runs newest-first against the
	// bars' oldest-first — but a visually-hidden table of its own.
	await expect(
		page.getByRole('img', {
			name: /Back Squat: top set across 4 sessions, oldest first/,
		}),
	).toBeVisible()
	await expect(
		page.getByRole('heading', { name: 'Every session on this lift' }),
	).toBeVisible()
	await expect(page.getByText(/5 working sets/).first()).toBeVisible()

	await expectNoHorizontalOverflow(page)
})

test('a lift with no working sets says so rather than drawing an empty frame', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedAthlete(user.id)

	await page.goto('/training/exercises/ex_bb_deadlift')

	await expect(
		page.getByText(
			'No working sets logged on this lift yet, so there is nothing to read.',
		),
	).toBeVisible()
	// No program has priced this lift, so there is no working weight — and a
	// `0 kg` header would claim one (ADR 0063 §2).
	await expect(page.getByText('Working weight')).toHaveCount(0)
	await expect(
		page.getByText('Log a working set and this page fills in.'),
	).toBeVisible()

	await expectNoHorizontalOverflow(page)
})

test('every control on lift over time is 44px to a thumb', async ({
	page,
	login,
}) => {
	test.setTimeout(180_000)
	const user = await login()
	await seedAthlete(user.id)
	const run = await startRun(user.id, await strongLifts())
	await runSessions(user.id, run.instanceId, 2)

	await page.goto('/training/exercises/ex_bb_back_squat')
	await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible()

	// The controls an athlete can actually reach here: the header's back arrow
	// and the link to this lift's anchors. **The variant tabs are not among
	// them** — they render only for a lift with two logged realizations, which a
	// barbell-only program never produces — and they are `px-3 py-1` pills with
	// no `after:` extension, so they are a latent violation this measurement
	// cannot reach. Naming them here rather than fabricating a second variant to
	// catch them: the fixture would be a lift nobody logged.
	await expectEveryControlTappable(page.getByRole('main'))
})

// ——— The quick log on I dag (#505 stories 83–84) ——————————————————————————

const SHOTS = process.env.STRENGTH_SHOTS

/** A screenshot for review, when `STRENGTH_SHOTS=<dir>` is set, with the
 * subject scrolled into I dag's own scroll box and on screen. */
async function shot(page: Page, name: string, subject: Locator) {
	if (!SHOTS) return
	await subject.scrollIntoViewIfNeeded()
	await expect(subject).toBeInViewport()
	await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

/**
 * The athlete's day and its week, `YYYY-MM-DD` in UTC — the athlete's zone —
 * read off one instant, so the seed and the assertions agree about which day
 * and week it is.
 */
function weekOf(now: Date) {
	const today = now.toISOString().slice(0, 10)
	const monday = new Date(now)
	monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7))
	return { today, monday: monday.toISOString().slice(0, 10) }
}

/**
 * An open-ended plan with a strength track of 12 sets a week, and this
 * morning's gym day: three squats of five at 60 kg. The day is today, so the
 * row sits in the open current week whatever weekday it runs.
 */
async function seedGymDay(
	userId: string,
	{ today, monday }: ReturnType<typeof weekOf>,
) {
	await prisma.planOutline.create({
		data: {
			athleteId: userId,
			startWeekKey: monday,
			phases: {
				create: [
					{ orderIndex: 0, name: 'Oppbygging', weeks: 8, rhythm: '3:1' },
				],
			},
			tracks: {
				create: [
					{
						discipline: 'strength',
						currency: 'sets',
						anchors: { create: [{ fromWeekKey: monday, value: 12 }] },
						segments: {
							create: [
								{
									kind: 'strength',
									startWeekKey: monday,
									weeks: 8,
									goal: 'hypertrophy',
									sessionsPerWeek: 2,
								},
							],
						},
					},
				],
			},
		},
	})
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Styrke A',
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
									exerciseId: 'ex_bb_back_squat',
									sets: {
										create: [0, 1, 2].map((orderIndex) => ({
											orderIndex,
											kind: 'reps',
											reps: 5,
											load: JSON.stringify({ kind: 'absolute', kg: 60 }),
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
	return prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId,
			workoutId: workout.id,
			// The day's first instant: today whatever time the test runs, and
			// already begun, so the quick log is offered.
			scheduledAt: new Date(`${today}T00:00:00.000Z`),
			source: 'authored',
		},
	})
}

test('a gym day is logged som planlagt from I dag in one tap, and the week counts its sets', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const errors: string[] = []
	page.on('pageerror', (error) => {
		if (!/websocket/i.test(error.message)) errors.push(error.message)
	})
	const user = await login()
	await seedAthlete(user.id)
	const week = weekOf(new Date())
	const gym = await seedGymDay(user.id, week)
	const { monday } = week

	await navigate('/')
	const log = page.getByRole('region', { name: 'Logg Styrke A' })
	await expect(log).toBeVisible()
	// Pre-filled from the plan, in the athlete's words.
	await expect(log.getByText('Back Squat')).toBeVisible()
	await expect(log.getByText('· 3×5 · 60 kg')).toBeVisible()
	const track = page.locator(
		`[data-timeline-week="${monday}"] [data-week-track]`,
	)
	await expect(track).toContainText('Styrke')
	await expect(track).toContainText('planlagt 3')
	await expect(track).toContainText('0 / 12 sett')
	await expect(track.getByRole('meter', { name: /gjort 0,/ })).toBeVisible()
	await shot(page, 'quick-log-1-offered', log)

	await log.getByRole('button', { name: 'Logg Styrke A som planlagt' }).click()

	// The row is the confirmation: done, every set counted, the log gone.
	await expect(log).toHaveCount(0)
	await expect(track.getByRole('meter', { name: /gjort 3,/ })).toBeVisible()
	await expect(
		page.getByRole('link', { name: /Styrke A/ }).getByText(/3 \/ 3/),
	).toBeVisible()
	await expect(page.getByText(/3 sett logget/)).toBeVisible()
	const sets = await prisma.exerciseSetLog.findMany({
		where: { sessionId: gym.id },
		select: { reps: true, effectiveKg: true },
	})
	expect(sets).toEqual([
		{ reps: 5, effectiveKg: 60 },
		{ reps: 5, effectiveKg: 60 },
		{ reps: 5, effectiveKg: 60 },
	])
	await shot(page, 'quick-log-2-logged', track)
	await expectNoHorizontalOverflow(page)
	expect(errors).toEqual([])
})

test('Endre logs the set that went differently, at the planned weight', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedAthlete(user.id)
	const week = weekOf(new Date())
	const gym = await seedGymDay(user.id, week)
	const { monday } = week

	await navigate('/')
	const log = page.getByRole('region', { name: 'Logg Styrke A' })
	await expect(log.getByText('Back Squat')).toBeVisible()
	await log.getByRole('button', { name: 'Endre' }).click()

	// One field per set, pre-filled; no weight field — ADR 0064 §2, said here.
	const third = log.getByRole('spinbutton', {
		name: 'Sett 3 av Back Squat, reps',
	})
	await expect(third).toHaveValue('5')
	await expect(log.getByText(/Vekta står som planlagt/)).toBeVisible()
	await expectEveryControlTappable(log)
	await log
		.getByRole('spinbutton', { name: 'Sett 2 av Back Squat, reps' })
		.fill('3')
	await third.fill('')
	await shot(page, 'quick-log-3-edit', log)
	await log.getByRole('button', { name: 'Lagre' }).click()

	await expect(log).toHaveCount(0)
	await expect(
		page
			.locator(`[data-timeline-week="${monday}"] [data-week-track]`)
			.getByRole('meter', { name: /gjort 2,/ }),
	).toBeVisible()
	const sets = await prisma.exerciseSetLog.findMany({
		where: { sessionId: gym.id },
		orderBy: { orderIndex: 'asc' },
		select: { orderIndex: true, reps: true, effectiveKg: true },
	})
	expect(sets).toEqual([
		{ orderIndex: 0, reps: 5, effectiveKg: 60 },
		{ orderIndex: 1, reps: 3, effectiveKg: 60 },
	])
})

// ——— Correctness: rounds, kilos typed with a comma, notes ————————————————————

/** A `5 ×` circuit — one authored set per lift, five rounds — scheduled today.
 * The seed's "Strength Circuit" has this shape; the runner used to show one
 * circle per lift, so four rounds of five could not be logged at all. */
async function seedCircuit(userId: string, setsPerRound = 1) {
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Circuit',
			discipline: 'strength',
			intent: 'strength',
			ownerId: userId,
			blocks: {
				create: [
					{
						orderIndex: 0,
						repeatCount: 5,
						steps: {
							create: ['ex_bb_back_squat', 'ex_bb_bench_press'].map(
								(exerciseId, orderIndex) => ({
									orderIndex,
									kind: 'strength',
									exerciseId,
									sets: {
										create: Array.from({ length: setsPerRound }, (_, i) => ({
											orderIndex: i,
											kind: 'reps',
											reps: 8,
											load: JSON.stringify({ kind: 'absolute', kg: 40 }),
											weightKg: 40,
										})),
									},
								}),
							),
						},
					},
				],
			},
		},
	})
	return prisma.workoutSession.create({
		select: { id: true },
		data: { userId, scheduledAt: new Date(), workoutId: workout.id },
	})
}

test('a repeated circuit is one circle per round, and round 2 logs as its own set', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedAthlete(user.id)
	const session = await seedCircuit(user.id)

	await page.goto(`/training/sessions/${session.id}/log`)
	await waitForHydration(page, '[data-set-circle]')

	// Five rounds, five circles per lift.
	const squatCircles = page.getByRole('button', {
		name: /^Log set \d of Back Squat$/,
	})
	await expect(squatCircles).toHaveCount(5)
	await expect(
		page.getByRole('button', { name: /^Log set \d of Bench Press$/ }),
	).toHaveCount(5)

	// Round 2 of the squat.
	const roundTwo = page.getByRole('button', { name: 'Log set 2 of Back Squat' })
	await tabTo(page, roundTwo)
	await pressAndSettle(page, 'Enter')
	await expect(
		page.getByRole('button', { name: 'Logged set 2 of Back Squat' }),
	).toHaveText('8')
	await expect(page.getByText('1 of 5 logged').first()).toBeVisible()

	// It is stored as round 2 — its own row, answering the one authored set — and
	// it survives a reload.
	const stored = await prisma.exerciseSetLog.findMany({
		where: { sessionId: session.id },
		select: { orderIndex: true, reps: true, exerciseSetId: true },
	})
	expect(stored).toEqual([
		{ orderIndex: 1, reps: 8, exerciseSetId: expect.any(String) },
	])
	await page.reload()
	await expect(
		page.getByRole('button', { name: 'Logged set 2 of Back Squat' }),
	).toBeVisible()
	await expectNoHorizontalOverflow(page)
})

test('fifteen circles — three sets, five rounds — wrap into rows a thumb can still hit', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await seedAthlete(user.id)
	const session = await seedCircuit(user.id, 3)

	await page.goto(`/training/sessions/${session.id}/log`)
	const circles = page.getByRole('button', {
		name: /^Log set \d+ of Back Squat$/,
	})
	await expect(circles).toHaveCount(15)
	for (const box of await circles.evaluateAll((els) =>
		els.map((el) => el.getBoundingClientRect().width),
	)) {
		expect(box).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET)
	}
	await expect(page.getByText('0 of 15 logged').first()).toBeVisible()
	await expectNoHorizontalOverflow(page)
})

test('a starting weight typed with a decimal comma starts at that weight, not ten times it', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	const program = await strongLifts()
	await page.goto(`/training/programs/${program.id}/start`)
	await waitForHydration(page, 'input[name^="weight::"]')

	// Typed key by key, the way a Norwegian keyboard sends it. On the old
	// `type=number` field Chromium posted `625`.
	const squat = page.getByLabel(/Back Squat/)
	await squat.clear()
	await squat.pressSequentially('62,5')
	await expect(squat).toHaveValue('62,5')
	await page.getByRole('button', { name: 'Start StrongLifts 5×5' }).click()

	await expect(page).toHaveURL(/\/training\/programs\/run\//)
	const lift = await prisma.programLiftState.findFirstOrThrow({
		where: {
			exerciseId: 'ex_bb_back_squat',
			instance: { userId: user.id },
		},
		select: { currentWorkingWeightKg: true },
	})
	expect(lift.currentWorkingWeightKg).toBe(62.5)

	// The overview's own weight field reads the comma the same way.
	await waitForHydration(page, 'input[name="weightKg"]')
	const field = page.getByLabel('Working weight for Back Squat in kg')
	await field.clear()
	await field.pressSequentially('67,5')
	await page
		.locator('form')
		.filter({ has: field })
		.getByRole('button', { name: 'Save weight' })
		.click()
	await expect(page.getByText('Working weight set.')).toBeVisible()
	await expect
		.poll(async () => {
			const updated = await prisma.programLiftState.findFirstOrThrow({
				where: {
					exerciseId: 'ex_bb_back_squat',
					instance: { userId: user.id },
				},
				select: { currentWorkingWeightKg: true },
			})
			return updated.currentWorkingWeightKg
		})
		.toBe(67.5)
	await expectNoHorizontalOverflow(page)
})

test('a session note is shown whole on a phone and wraps, never cut with "…"', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	const note =
		'Steady aerobic, nose-breathing pace; walk the hills if the heart rate drifts'
	const workout = await prisma.workout.create({
		select: { id: true },
		data: {
			title: 'Long note run',
			discipline: 'run',
			intent: 'endurance',
			ownerId: user.id,
			blocks: {
				create: [
					{
						orderIndex: 0,
						steps: {
							create: [
								{
									orderIndex: 0,
									kind: 'cardio',
									durationSec: 2400,
									notes: note,
								},
							],
						},
					},
				],
			},
		},
	})
	// Completed, so the detail view renders the read-only stanza.
	const session = await prisma.workoutSession.create({
		select: { id: true },
		data: {
			userId: user.id,
			scheduledAt: new Date(),
			status: 'completed',
			workoutId: workout.id,
		},
	})

	await page.goto(`/training/sessions/${session.id}`)
	const token = page.locator('[data-score-stanza] [data-token-type="notes"]')
	await expect(token).toHaveText(`“${note}”`)
	const box = await token.evaluate((el) => {
		const style = getComputedStyle(el)
		return {
			clipped: el.scrollWidth > el.clientWidth + 1,
			ellipsis: style.textOverflow === 'ellipsis',
			lines: Math.round(
				el.getBoundingClientRect().height / parseFloat(style.lineHeight),
			),
		}
	})
	// Not clipped, no ellipsis, and at 390px a note this long takes more than one
	// line — which is what "wraps" looks like.
	expect(box).toMatchObject({ clipped: false, ellipsis: false })
	expect(box.lines).toBeGreaterThan(1)
	await expectNoHorizontalOverflow(page)
})
