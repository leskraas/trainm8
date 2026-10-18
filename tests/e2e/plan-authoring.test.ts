import { HOME_TIMELINE_HREF } from '#app/utils/app-tabs.ts'
import {
	expect,
	openPlanAdvanced,
	test,
	untilHydrated,
} from '#tests/playwright-utils.ts'

/**
 * Plan authoring end-to-end (#399, ADR 0039/0043/0044): the whole manual
 * planning surface driven the way an athlete meets it, since **Plan Generation**
 * is retired and every one of these acts is now something they perform.
 *
 * The journey is the one the spec's stories are written as, in order: say what
 * you are building toward, pick a **periodization preset**, say what you are
 * starting from (the first **Season Anchor**), give a block its **Quality
 * Session Mix**, and say what a typical week looks like (the **Week Pattern**),
 * from which the weeks up to the horizon fill themselves (decision 14). It ends
 * on the Dashboard, because a plan the home surface does not know about is a
 * plan the athlete never got.
 *
 * Deliberately one desktop pass and no 390px repeat: the surface's mobile
 * contract is the no-overflow gate, and `mobile-overflow.test.ts` runs
 * `/training/plan` at 390×844 with a seeded plan rather than re-driving the
 * whole authoring flow twice.
 */

test('athlete plans a season from a goal, and its weeks fill from the typical week', async ({
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
	// Plan is the way in (ADR 0083, ADR 0101): with no season there is no season plan to
	// open, so the tab lands on authoring one. The first tap after a load can race
	// hydration, so retry until it lands.
	await expect(async () => {
		await page
			.getByRole('navigation', { name: 'Hovedmeny' })
			.getByRole('link', { name: 'Plan' })
			.click()
		await expect(page).toHaveURL('/training/plan/new', { timeout: 5000 })
	}).toPass()

	// Nothing on the calendar yet, so the way forward is the dated goal — which
	// visibly creates a `fitness-goal` Event rather than writing one behind the
	// athlete's back (ADR 0039).
	await page.getByRole('textbox', { name: 'Mål' }).fill(goalName)
	await page.getByLabel('Dato', { exact: true }).fill(goalDate)
	await page.getByRole('button', { name: /lag målet og gå videre/i }).click()

	// ---------------------------------------------------------------------
	// Story 3–4: the shape of the season, and what it is derived from
	// ---------------------------------------------------------------------

	await expect(page).toHaveURL(
		/\/training\/plan\/new\/[a-z0-9]+\?created=goal$/i,
	)
	await expect(
		page.getByRole('heading', { name: 'Legg opp sesongen' }),
	).toBeVisible()
	// The Event it just wrote, named — the athlete sees what was created, not
	// only its effect.
	await expect(page.getByText(goalName).first()).toBeVisible()
	await expect(page.getByText('Mål laget')).toBeVisible()

	// A shape carries the blocks, the ramps and the mixes with it. The 21-week
	// pyramidal one is *not* the default here, so checking it is an authored
	// choice and its "Big base" block is the proof it landed. The gallery leads
	// with the shapes nearest the Event, so a longer one is behind the other
	// lengths.
	// The other lengths open on a collapsible, which answers once React has it.
	const more = page.getByRole('button', { name: /lengder til/i })
	await untilHydrated(more)
	await more.click()
	await page.getByRole('radio', { name: 'Stor base', exact: true }).check()

	// This athlete has trained nothing, so there is no history to read a unit
	// from and the currency is honestly theirs to pick (ADR 0043 §2).
	// The select is drawn by the client and opens nothing until React has it,
	// which on a cold dev server can be after the page shows.
	const unit = page.getByRole('combobox', {
		name: /hvilken enhet planlegger du/i,
	})
	await untilHydrated(unit)
	await unit.click()
	await page.getByRole('option', { name: 'Kilometer i uka' }).click()
	await page.getByLabel(/startvolum per uke/i).fill('40')

	await page.getByRole('button', { name: 'Lag planen' }).click()

	// ---------------------------------------------------------------------
	// Sesong, opened on the season just authored (ADR 0090)
	// ---------------------------------------------------------------------

	await expect(page).toHaveURL(/\/training\/plan\?event=[a-z0-9]+$/i)
	// The lead names the race the plan builds toward (ADR 0101 §2).
	await expect(
		page.getByRole('link', { name: goalName, exact: true }),
	).toBeVisible()
	// Every Sesong editor is behind Plan's closed Avansert (ADR 0101 §2).
	await openPlanAdvanced(page)
	// The season picture leads: I dag's curve and table, in ISO weeks, the
	// lead track in its own unit.
	const picture = page.getByRole('region', { name: 'Sesongen', exact: true })
	await expect(picture).toBeVisible()
	await expect(
		picture.getByRole('table', { name: 'Sesongtabell' }),
	).toContainText('Løping')
	// The picked shape's blocks, the philosophy it is a length of, and the
	// anchor typed a moment ago read back in the track's own currency.
	await expect(page.getByRole('list', { name: 'Faser' })).toContainText(
		'Stor base',
	)
	await expect(
		page.getByRole('region', { name: 'Filosofi' }).getByText('Planen følger'),
	).toContainText('Stor base')
	await expect(page.getByRole('list', { name: 'Treningsspor' })).toContainText(
		/Løping\s*·\si\skm\/uke\s·\sstarter\spå\s40\skm\/uke/,
	)
	// A plan from a shape already climbs, so what is left is the typical week.
	await expect(page.getByText('1 ting igjen')).toBeVisible()

	// ---------------------------------------------------------------------
	// Story 6: the Quality Session Mix on a block
	// ---------------------------------------------------------------------

	// The current block's card opens by default; the others are closed. Inside it
	// the controls sit behind their own line, so the reading is what an opened
	// block says first and the eleven controls are one tap further in.
	const currentBlock = page
		.getByRole('article')
		.filter({ hasText: 'Stor base' })
	await expect(currentBlock.getByText('Nå', { exact: true })).toBeVisible()
	await expect(currentBlock).toContainText('med 1 kvalitetsøkt i uka')
	await currentBlock.getByRole('button', { name: /^Avansert/ }).click()
	await currentBlock.getByLabel('Sone 4 terskel, økter i uka').fill('2')
	await currentBlock
		.getByRole('button', { name: /lagre kvalitetsøkter/i })
		.click()

	// Both readings are derived off the saved mix and nothing else (ADR 0042 §5):
	// the emphasis label and the count follow the boxes, and neither is typed.
	await expect(currentBlock).toContainText('1× tempo + 2× terskel')
	await expect(currentBlock).toContainText('3 kvalitetsøkter i uka')

	// ---------------------------------------------------------------------
	// Story 8–9: a typical week — and the weeks fill themselves from it
	// ---------------------------------------------------------------------

	await page
		.getByRole('navigation', { name: 'Visning' })
		.getByRole('link', { name: 'Uker' })
		.click()
	await expect(page).toHaveURL(/[?&]tab=weeks/)

	// With no pattern the section opens on its offer, and the starter week is
	// built from what the app already knows — every day of it a share, so it is
	// honest at 40 km and at 90 (ADR 0044 §7).
	await page.getByRole('button', { name: /lag en typisk uke for meg/i }).click()
	await expect(
		page.getByRole('button', { name: /^Den typiske uka di/ }),
	).toContainText('Typical week')

	// Stamping is no longer the athlete's step (decision 14): the typical week
	// lays the weeks up to the Planning Horizon at once, and the checklist gives
	// way to one quiet line saying how much of the season is on the calendar.
	await expect(page.locator('[data-plan-filled]')).toContainText(
		/[1-9]\d* av 21 uker har økter i kalenderen/,
	)

	// ---------------------------------------------------------------------
	// The payoff: real sessions, and a home surface that knows about the plan
	// ---------------------------------------------------------------------

	await navigate(HOME_TIMELINE_HREF)
	// Home now knows about the plan: the top line says where in it today falls
	// and counts down to the race the season is for (ADR 0086), the strip runs
	// out to the plan's taper, and the line saying there is no plan is gone.
	// Both live in the list's own header below 1024px (the season pane carries
	// them from there up, ADR 0087), and the plan's position needs the room a
	// tablet gives it — a phone's line is the goal's alone.
	await page.setViewportSize({ width: 768, height: 1024 })
	const top = page.getByTestId('timeline-top')
	await expect(top.getByText(/uke \d+ av 21/i)).toBeVisible()
	await expect(top.getByText(/^om \d+ uker$/)).toBeVisible()
	await expect(page.getByText(/ingen (sesong)?plan ennå/i)).toHaveCount(0)
	await expect(top.getByText('Ingen plan')).toHaveCount(0)
	await expect(
		page.getByTestId('week-strip').getByRole('button').last(),
	).toHaveAccessibleName(/Nedtrapping/)

	// The laid sessions are ordinary sessions on the athlete's week, in the
	// stream: the starter pattern's four days, its long day weighted double.
	// Which week that is depends on the weekday the test runs — the fill starts
	// at the first week not yet begun (ADR 0079 S14), whose target has climbed
	// from 40 km on any day but a Monday — so the shape is asserted, not the
	// figures. Bare sessions are titled by what they are (ADR 0091 §2:
	// `Langtur · Løping`, `Terskeløkt · Løping`), and the distance is the row's.
	const stream = page.getByTestId('timeline-stream')
	await expect(stream).toContainText('Langtur · Løping')
	const text = (await stream.textContent()) ?? ''
	const figure = (raw: string) => Number(raw.replace(',', '.'))
	const long = /Langtur · Løping\s*([\d,]+)\s*km/.exec(text)?.[1]
	const others = [
		...text.matchAll(
			/(?:Rolig økt|Tempoøkt|Terskeløkt|Intervalløkt) · Løping\s*([\d,]+)\s*km/g,
		),
	].map((match) => figure(match[1]!))
	expect(long).toBeTruthy()
	expect(others).toHaveLength(3)
	for (const other of others) {
		expect(figure(long!)).toBeCloseTo(other * 2, 1)
	}
})
