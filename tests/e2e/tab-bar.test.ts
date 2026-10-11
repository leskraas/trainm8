import { faker } from '@faker-js/faker/locale/en'
import { type Page } from '@playwright/test'
import { weekMonday } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	createFitnessGoalEvent,
	createPlanOutline,
} from '#app/utils/plan-outline/authoring.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * The four tabs (spec #505 stories 56–59, ADR 0083 — superseding #178's
 * embedded navigation). On a phone they are a bottom tab bar; every tab lands
 * where it says and marks itself as the current page, and a page that moved
 * into a tab keeps its URL and lights its tab when deep-linked.
 */
const VIEWPORT = { width: 390, height: 844 }
test.use({ viewport: VIEWPORT })

const SCREENSHOTS = process.env.TAB_BAR_SCREENSHOTS

function tabBar(page: Page) {
	return page.getByRole('navigation', { name: 'Hovedmeny' })
}

/**
 * The tab a page lives under is current: `page` on the tab's own landing page,
 * `true` on a page deeper in it. Exactly one tab is ever current.
 */
async function expectCurrentTab(
	page: Page,
	name: string,
	current: 'page' | 'true' = 'page',
) {
	const bar = tabBar(page)
	await expect(bar.getByRole('link', { name })).toHaveAttribute(
		'aria-current',
		current,
	)
	await expect(bar.locator('[aria-current]')).toHaveCount(1)
}

async function tapTab(page: Page, name: string, url: string | RegExp) {
	// The first tap after a load can race hydration (the pointer-down node is
	// swapped mid-render and the click is lost), so retry until it lands.
	await expect(async () => {
		await tabBar(page).getByRole('link', { name }).click()
		await expect(page).toHaveURL(url, { timeout: 20_000 })
	}).toPass()
}

test('every tab navigates and marks itself current on a phone', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	const user = await login()

	// A season with its Event, so Sesong opens on the plan and lists the Event.
	const eventName = `Race ${faker.string.alphanumeric(8)}`
	const goal = await createFitnessGoalEvent(user.id, {
		name: eventName,
		startDate: new Date(Date.now() + 140 * 24 * 60 * 60 * 1000),
		disciplines: ['run'],
	})
	const timezone = await getAthleteTimezone(user.id)
	const created = await createPlanOutline(user.id, {
		eventId: goal.id,
		startWeekKey: weekMonday(new Date(), timezone),
		structure: { presetKey: 'classic-linear' },
		tracks: [{ discipline: 'run', currency: 'km', anchorValue: 55 }],
	})
	expect(created.ok, 'the plan fixture failed to author').toBe(true)

	await navigate('/')

	// The bar is the phone's bottom edge: fixed there, full width, and its four
	// tabs in the spec's order.
	const bar = tabBar(page)
	await expect(bar).toBeVisible()
	const box = await bar.boundingBox()
	expect(box, 'the tab bar has no box').not.toBeNull()
	expect(Math.round(box!.y + box!.height)).toBe(VIEWPORT.height)
	expect(Math.round(box!.width)).toBe(VIEWPORT.width)
	await expect(bar.getByRole('link')).toHaveText([
		'I dag',
		'Sesong',
		'Bibliotek',
		'Meg',
	])
	await expectCurrentTab(page, 'I dag')
	if (SCREENSHOTS)
		await page.screenshot({ path: `${SCREENSHOTS}/tab-i-dag.png` })

	// Sesong: the season plan, with the Events it is planned around and the way
	// to plan another.
	await tapTab(page, 'Sesong', '/training/plan')
	await expect(
		page.getByRole('heading', { name: 'Sesong', level: 1 }),
	).toBeVisible()
	const events = page.getByRole('region', { name: 'Løp og arrangementer' })
	await expect(
		events.getByRole('link', { name: new RegExp(eventName) }),
	).toBeVisible()
	await expect(events.getByRole('link', { name: 'Alle løp' })).toBeVisible()
	await expect(
		events.getByRole('link', { name: 'Planlegg en ny sesong' }),
	).toHaveAttribute('href', '/training/plan/new')
	await expectCurrentTab(page, 'Sesong')
	if (SCREENSHOTS)
		await page.screenshot({ path: `${SCREENSHOTS}/tab-sesong.png` })

	// Bibliotek: the hub for the catalogue, programs and exercises.
	await tapTab(page, 'Bibliotek', '/library')
	await expect(
		page.getByRole('heading', { name: 'Bibliotek', level: 1 }),
	).toBeVisible()
	await expect(page.getByRole('link', { name: /katalog/i })).toHaveAttribute(
		'href',
		'/training/catalogue',
	)
	await expect(
		page.getByRole('link', { name: /styrkeprogrammer/i }),
	).toHaveAttribute('href', '/training/programs')
	await expect(
		page.getByRole('link', { name: /alle øvelser/i }),
	).toHaveAttribute('href', '/library/exercises')
	await expect(page.getByRole('heading', { name: 'Dine løft' })).toBeVisible()
	await expectCurrentTab(page, 'Bibliotek')
	if (SCREENSHOTS)
		await page.screenshot({ path: `${SCREENSHOTS}/tab-bibliotek.png` })

	// Meg: profile, settings, intervals.icu and the file upload.
	await tapTab(page, 'Meg', '/me')
	await expect(
		page.getByRole('heading', { name: 'Meg', level: 1 }),
	).toBeVisible()
	// Form and Rekorder, handed over by the home hero (#505), above the account
	// sections.
	await expect(
		page.getByRole('heading', { name: 'Form', level: 2 }),
	).toBeVisible()
	await expect(
		page.getByRole('heading', { name: 'Rekorder', level: 2 }),
	).toBeVisible()
	await expect(
		page.getByRole('link', { name: /trening og terskler/i }),
	).toHaveAttribute('href', '/settings/training')
	await expect(
		page.getByRole('link', { name: /intervals\.icu/i }),
	).toHaveAttribute('href', '/settings/integrations')
	await expect(
		page.getByRole('link', { name: /last opp en aktivitetsfil/i }),
	).toHaveAttribute('href', '/imports/upload')
	await expectCurrentTab(page, 'Meg')
	if (SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}/tab-meg.png` })

	// And back to I dag.
	await tapTab(page, 'I dag', '/')
	await expectCurrentTab(page, 'I dag')
})

test('a page that moved into a tab keeps its URL and lights its tab', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	const eventName = `Race ${faker.string.alphanumeric(8)}`
	const event = await prisma.event.create({
		data: {
			athleteId: user.id,
			name: eventName,
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			disciplines: JSON.stringify(['run']),
		},
	})

	// Events live under Sesong; their old URLs still open them.
	await navigate('/training/events')
	await expectCurrentTab(page, 'Sesong', 'true')
	await page.getByRole('link', { name: new RegExp(eventName) }).click()
	await expect(page).toHaveURL(`/training/events/${event.id}`)
	await expectCurrentTab(page, 'Sesong', 'true')
	// The guessed `/events` still forwards to the real list.
	await page.goto('/events')
	await expect(page).toHaveURL('/training/events')
	// The settings root and the retired inbox both land on Meg.
	await page.goto('/settings')
	await expect(page).toHaveURL('/me')
	await page.goto('/imports')
	await expect(page).toHaveURL('/me')

	// The catalogue lives under Bibliotek, and backs out to it.
	await navigate('/training/catalogue')
	await expectCurrentTab(page, 'Bibliotek', 'true')
	await page.getByRole('link', { name: /tilbake til bibliotek/i }).click()
	await expect(page).toHaveURL('/library')

	// Settings live under Meg, and back out to it.
	await navigate('/settings/profile')
	await expectCurrentTab(page, 'Meg', 'true')
	await page.getByRole('link', { name: /tilbake til meg/i }).click()
	await expect(page).toHaveURL('/me')
})

test('Bibliotek lists every exercise, searchable, for an athlete with no lifts yet', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	await login()

	await navigate('/library')
	await expect(page.getByText(/løftene du legger inn i en økt/i)).toBeVisible()
	await page.getByRole('link', { name: /alle øvelser/i }).click()
	await expect(page).toHaveURL('/library/exercises')
	await expectCurrentTab(page, 'Bibliotek', 'true')
	await expect(
		page.getByRole('heading', { name: 'Alle øvelser', level: 1 }),
	).toBeVisible()

	// The seeded bank has a squat; the search narrows to it and opens its history.
	await page.getByRole('searchbox', { name: 'Søk etter øvelse' }).fill('squat')
	await page.getByRole('button', { name: 'Søk' }).click()
	await expect(page).toHaveURL(/\/library\/exercises\?q=squat/)
	const squat = page.getByRole('link', { name: /squat/i }).first()
	await expect(squat).toBeVisible()
	await squat.click()
	await expect(page).toHaveURL(/\/training\/exercises\/[\w-]+$/)

	// A search that finds nothing says so in words.
	await page.goto('/library/exercises?q=zzzz')
	await expect(
		page.getByText('Ingen øvelse heter noe med «zzzz».'),
	).toBeVisible()

	// A Norwegian name finds the lift it names (owner decision 9), first.
	await page.goto('/library/exercises?q=knebøy')
	const firstHit = page.getByRole('main').getByRole('listitem').first()
	await expect(firstHit).toContainText('Back Squat')
	await expect(firstHit).toContainText('«knebøy»')
})

test('the first run carries no tab bar', async ({ page, navigate, login }) => {
	test.setTimeout(120_000)
	await login()
	await navigate('/start')
	await expect(page.getByRole('main')).toBeVisible()
	await expect(tabBar(page)).toHaveCount(0)
})
