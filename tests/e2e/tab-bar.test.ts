import { faker } from '@faker-js/faker'
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

// The dev server's React Router devtools trigger floats over the bottom-right
// corner, which on a phone is the Meg tab. It is a dev-only overlay (the CI
// server runs the production build), so it is hidden rather than clicked round.
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		document.addEventListener('DOMContentLoaded', () => {
			const style = document.createElement('style')
			style.textContent =
				'[data-testid="react-router-devtools-trigger"]{display:none!important}'
			document.head.append(style)
		})
	})
})

function tabBar(page: Page) {
	return page.getByRole('navigation', { name: 'Hovedmeny' })
}

async function expectCurrentTab(page: Page, name: string) {
	const bar = tabBar(page)
	await expect(bar.getByRole('link', { name })).toHaveAttribute(
		'aria-current',
		'page',
	)
	// Exactly one tab is current.
	await expect(bar.locator('[aria-current="page"]')).toHaveCount(1)
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
	await expect(page.getByRole('heading', { name: 'Øvelser' })).toBeVisible()
	await expectCurrentTab(page, 'Bibliotek')
	if (SCREENSHOTS)
		await page.screenshot({ path: `${SCREENSHOTS}/tab-bibliotek.png` })

	// Meg: profile, settings, intervals.icu and the file upload.
	await tapTab(page, 'Meg', '/me')
	await expect(
		page.getByRole('heading', { name: 'Meg', level: 1 }),
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
	await expectCurrentTab(page, 'Sesong')
	await page.getByRole('link', { name: new RegExp(eventName) }).click()
	await expect(page).toHaveURL(`/training/events/${event.id}`)
	await expectCurrentTab(page, 'Sesong')
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
	await expectCurrentTab(page, 'Bibliotek')
	await page.getByRole('link', { name: /back to bibliotek/i }).click()
	await expect(page).toHaveURL('/library')

	// Settings live under Meg, and back out to it.
	await navigate('/settings/profile')
	await expectCurrentTab(page, 'Meg')
	await page.getByRole('link', { name: /back to meg/i }).click()
	await expect(page).toHaveURL('/me')
})
