import { type Locator, type Page } from '@playwright/test'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * Plan authoring end-to-end (#399, ADR 0039/0043/0044): the whole manual
 * planning surface driven the way an athlete meets it, since **Plan Generation**
 * is retired and every one of these acts is now something they perform.
 *
 * The journey is the one the spec's stories are written as, in order: say what
 * you are building toward, pick a **periodization preset**, say what you are
 * starting from (the first **Season Anchor**), give a block its **Quality
 * Session Mix**, say what a typical week looks like (the **Week Pattern**), and
 * stamp it — which is the only step that puts anything on the calendar. It ends
 * on the Dashboard, because a plan the home surface does not know about is a
 * plan the athlete never got.
 *
 * Deliberately one desktop pass and no 390px repeat: the surface's mobile
 * contract is the no-overflow gate, and `mobile-overflow.test.ts` runs
 * `/training/plan` at 390×844 with a seeded plan rather than re-driving the
 * whole authoring flow twice.
 */

/**
 * One of the surface's `<details>` sections, by the line on its summary row —
 * scoped, because a phase card carries sections of its own.
 *
 * A `<summary>` carries no ARIA role, so there is no role query for it — and a
 * section's own `sr-only` heading repeats the summary's words inside it, which is
 * what rules out matching on text alone.
 */
function section(scope: Page | Locator, name: string) {
	return scope.locator('summary').filter({ hasText: name })
}

test('athlete plans a season from a goal and stamps a week onto the calendar', async ({
	page,
	navigate,
	login,
}) => {
	// The longest journey in the suite, and the first navigation pays the dev
	// server's cold Vite transform cost.
	test.setTimeout(180_000)
	await login()

	const goalName = 'Sub-40 10k shape'
	// Seventeen weeks out to the day. A whole number of weeks keeps the weekday,
	// so the Event lands in the plan's 18th Training Week however the current week
	// falls — which makes the 18-week shape the closest fit and therefore the
	// form's default, and turns picking the 21-week one into a real choice.
	const goalDate = new Date(Date.now() + 17 * 7 * 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 10)

	// ---------------------------------------------------------------------
	// Story 1–2: what are you building toward?
	// ---------------------------------------------------------------------

	await navigate('/')
	// The header's plan slot is the way in while there is no plan (#178).
	await expect(page.getByText('No active plan')).toBeVisible()
	await page.getByRole('link', { name: 'Plan a season' }).click()
	await expect(page).toHaveURL('/training/plan/new')

	// Nothing on the calendar yet, so the way forward is the dated goal — which
	// visibly creates a `fitness-goal` Event rather than writing one behind the
	// athlete's back (ADR 0039).
	await page.getByRole('textbox', { name: 'Goal' }).fill(goalName)
	await page.getByLabel('Date', { exact: true }).fill(goalDate)
	await page.getByRole('button', { name: /create goal and continue/i }).click()

	// ---------------------------------------------------------------------
	// Story 3–4: the shape of the season, and what it is derived from
	// ---------------------------------------------------------------------

	await expect(page).toHaveURL(
		/\/training\/plan\/new\/[a-z0-9]+\?created=goal$/i,
	)
	await expect(
		page.getByRole('heading', { name: 'Lay out your season' }),
	).toBeVisible()
	// The Event it just wrote, named — the athlete sees what was created, not
	// only its effect.
	await expect(page.getByText(goalName).first()).toBeVisible()
	await expect(page.getByText('Goal created')).toBeVisible()

	// A shape carries the blocks, the ramps and the mixes with it. The 21-week
	// pyramidal one is *not* the default here, so checking it is an authored
	// choice and its "Big base" block is the proof it landed.
	await page.getByRole('radio', { name: /Big base \/ pyramidal/ }).check()

	// This athlete has trained nothing, so there is no history to read a unit
	// from and the currency is honestly theirs to pick (ADR 0043 §2).
	await page.getByRole('combobox', { name: /what do you plan/i }).click()
	await page.getByRole('option', { name: 'Kilometres per week' }).click()
	await page.getByLabel(/where you are starting from/i).fill('40')

	await page.getByRole('button', { name: 'Create plan' }).click()

	// ---------------------------------------------------------------------
	// The planning surface, opened on the season just authored
	// ---------------------------------------------------------------------

	await expect(page).toHaveURL(/\/training\/plan\?event=[a-z0-9]+$/i)
	await expect(page.getByRole('heading', { name: goalName })).toBeVisible()
	// The chart is the surface's primary object (#366), and its aside says what
	// the picture is of: one track, in the unit it was authored in.
	await expect(page.getByRole('heading', { name: 'Your season' })).toBeVisible()
	await expect(page.getByText('21 weeks · Run in km/wk')).toBeVisible()
	// The picked shape's blocks, and the anchor typed a moment ago read back in
	// the track's own currency on the closed section that edits it.
	await expect(page.getByRole('list', { name: 'Phases' })).toContainText(
		'Big base',
	)
	await expect(page.getByText('Run from 40.0 km/wk')).toBeVisible()
	// A plan from a shape already climbs, so what is left is the half a
	// first-time planner does not know is a half: a typical week, and the calendar.
	await expect(page.getByText('2 steps left')).toBeVisible()

	// ---------------------------------------------------------------------
	// Story 6: the Quality Session Mix on a block
	// ---------------------------------------------------------------------

	// The current block's card opens by default; the others are closed. Inside it
	// the controls sit behind their own line, so the reading is what an opened
	// block says first and the eleven controls are one tap further in.
	const currentBlock = page.getByRole('article').filter({ hasText: 'Big base' })
	await expect(currentBlock.getByText('Current')).toBeVisible()
	await expect(currentBlock).toContainText('with 1 quality session a week')
	await section(currentBlock, 'How this block progresses').click()
	await currentBlock.getByLabel('Zone 4 threshold, sessions a week').fill('2')
	await currentBlock.getByRole('button', { name: /save quality mix/i }).click()

	// Both readings are derived off the saved mix and nothing else (ADR 0042 §5):
	// the emphasis label and the count follow the boxes, and neither is typed.
	await expect(currentBlock).toContainText('1× tempo + 2× threshold')
	await expect(currentBlock).toContainText('3 quality sessions a week')

	// ---------------------------------------------------------------------
	// Story 8–9: a typical week, and putting it on the calendar
	// ---------------------------------------------------------------------

	await page
		.getByRole('navigation', { name: 'Season views' })
		.getByRole('link', { name: 'Weeks' })
		.click()
	await expect(page).toHaveURL(/[?&]tab=weeks/)

	// With no pattern the section opens on its offer, and the starter week is
	// built from what the app already knows — every day of it a share, so it is
	// honest at 40 km and at 90 (ADR 0044 §7).
	await page.getByRole('button', { name: /build me a typical week/i }).click()
	await expect(section(page, 'Your typical week')).toContainText('Typical week')

	// Nothing is scheduled until it is stamped, and stamping is the athlete's
	// choice of weeks — none is preselected for them.
	await section(page, 'Put it on your calendar').click()
	await page.getByRole('checkbox', { name: /^Week 1 / }).check()
	await page.getByRole('button', { name: 'Stamp these weeks' }).click()

	// Every step behind them, so the checklist gives way to the one quiet line.
	await expect(page.getByText('Your plan is set up')).toBeVisible()
	await expect(page.getByText('1 of 21')).toBeVisible()

	// ---------------------------------------------------------------------
	// The payoff: real sessions, and a home surface that knows about the plan
	// ---------------------------------------------------------------------

	await navigate('/')
	// The plan slot is no longer the call to author one: it is the arc chip for
	// this Event, beside the labelled way into the season it came from.
	await expect(
		page.getByRole('heading', { name: 'Road to race day' }),
	).toBeVisible()
	await expect(
		page.getByRole('link', { name: `Plan: ${goalName}` }),
	).toBeVisible()
	await expect(page.getByRole('link', { name: 'Season' })).toBeVisible()

	// The stamped sessions are ordinary sessions on the athlete's week: the
	// starter pattern's four days, its long day weighted double, against week
	// one's derived 40 km.
	const timeline = page.getByTestId('week-timeline')
	await expect(timeline).toContainText('16 km')
	await expect(timeline).toContainText('8 km')
})
