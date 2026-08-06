import { faker } from '@faker-js/faker'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

// Embedded navigation (#178): every destination is reached through page
// elements — no floating pill bar. The wordmark row replaces the old mobile
// bar, so the whole walk runs at 390px.
test.use({ viewport: { width: 390, height: 844 } })

test('walks home → Event → back → Settings via page elements only', async ({
	page,
	navigate,
	login,
}) => {
	const user = await login()

	// An Event without a Plan Outline: no active plan, so the Dashboard's Plan
	// Generation call-to-action slot carries the Events entry.
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

	// No floating/sticky top nav bar — the pill nav is gone for good.
	await expect(
		page.getByRole('navigation', { name: /main navigation/i }),
	).toHaveCount(0)

	// The wordmark row carries no Inbox chip: imports auto-save onto The Tape, so
	// there is no queue to open (ADR 0049).
	await expect(page.getByRole('link', { name: /inbox/i })).toHaveCount(0)

	// Home → Events via the Plan Generation call-to-action slot (no active
	// plan), then into the Event detail. The first interaction after the initial
	// page load can race client hydration (the pointer-down node is swapped
	// mid-render and the click is lost), so retry until the navigation lands.
	await expect(async () => {
		await page.getByRole('link', { name: /^events$/i }).click()
		await expect(page).toHaveURL('/training/events', { timeout: 2000 })
	}).toPass()
	await page.getByRole('link', { name: new RegExp(eventName, 'i') }).click()
	await expect(page).toHaveURL(/\/training\/events\/[a-z0-9]+$/i)
	await expect(page.getByText(eventName).first()).toBeVisible()

	// Event → back to the Events list via the PageHeader back button → and the
	// list's own PageHeader back up to Home (the "← Home" link is gone; #291).
	await page.getByRole('link', { name: /back to events/i }).click()
	await expect(page).toHaveURL('/training/events')
	await page.getByRole('link', { name: /back to home/i }).click()
	await expect(page).toHaveURL('/')

	// Home → Settings via the avatar.
	await page.getByRole('link', { name: /^settings$/i }).click()
	await expect(page).toHaveURL('/settings/profile')
})
