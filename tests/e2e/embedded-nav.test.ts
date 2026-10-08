import { faker } from '@faker-js/faker'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

// Navigation (ADR 0083, superseding #178's embedded navigation): the four tabs
// are the persistent chrome, and every other destination is still reached
// through page elements. The walk an athlete with no plan takes runs at 390px:
// Sesong is plan creation then, and the Events it builds toward are reached
// from there; Meg is where the account lives.
test.use({ viewport: { width: 390, height: 844 } })

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

test('walks Sesong → Events → back → Meg → profile with no plan', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()

	// An Event without a Plan Outline: no active plan, so Sesong opens on plan
	// creation, which lists it.
	const eventName = `Race ${faker.string.alphanumeric(8)}`
	await prisma.event.create({
		data: {
			athleteId: user.id,
			name: eventName,
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			disciplines: JSON.stringify(['run']),
		},
	})

	await navigate('/')
	const tabs = page.getByRole('navigation', { name: 'Hovedmeny' })

	// Exactly one persistent menu, and it is the tab bar: no pill bar, and no
	// Inbox chip — imports auto-save onto The Tape, so there is no queue to open
	// (ADR 0049).
	await expect(
		page.getByRole('navigation', { name: /main navigation/i }),
	).toHaveCount(0)
	await expect(tabs).toHaveCount(1)
	await expect(page.getByRole('link', { name: /inbox/i })).toHaveCount(0)

	// Sesong with no plan is plan creation. The first interaction after the
	// initial page load can race client hydration (the pointer-down node is
	// swapped mid-render and the click is lost), so retry until it lands.
	await expect(async () => {
		await tabs.getByRole('link', { name: 'Sesong' }).click()
		await expect(page).toHaveURL('/training/plan/new', { timeout: 5000 })
	}).toPass()
	await expect(tabs.getByRole('link', { name: 'Sesong' })).toHaveAttribute(
		'aria-current',
		'page',
	)
	await expect(page.getByText(eventName).first()).toBeVisible()

	// Sesong → the full Events list → the Event, all through page elements.
	await page.getByRole('link', { name: 'All events' }).click()
	await expect(page).toHaveURL('/training/events')
	await page.getByRole('link', { name: new RegExp(eventName, 'i') }).click()
	await expect(page).toHaveURL(/\/training\/events\/[a-z0-9]+$/i)
	await expect(page.getByText(eventName).first()).toBeVisible()

	// Event → back to the Events list → back up to Sesong, which is still plan
	// creation for this athlete.
	await page.getByRole('link', { name: /back to events/i }).click()
	await expect(page).toHaveURL('/training/events')
	await page.getByRole('link', { name: /back to sesong/i }).click()
	await expect(page).toHaveURL('/training/plan/new')

	// Meg → the profile, and back.
	await tabs.getByRole('link', { name: 'Meg' }).click()
	await expect(page).toHaveURL('/me')
	await page.getByRole('link', { name: /endre profil/i }).click()
	await expect(page).toHaveURL('/settings/profile')
	await page.getByRole('link', { name: /back to meg/i }).click()
	await expect(page).toHaveURL('/me')
})
