import { faker } from '@faker-js/faker/locale/en'
import { prisma } from '#app/utils/db.server.ts'
import { expect, test, untilHydrated } from '#tests/playwright-utils.ts'

/**
 * The generated season (#456), end to end, in Norwegian on the design system
 * (#505 round 2; ADR 0081, ADR 0085): the shape step's «Bygg sesongen for meg»
 * opens a season already built, the athlete answers the one question it asks,
 * states the anchor their history could not, picks another shape, and adds the
 * season to the calendar — and nothing lands until they do.
 *
 * At 390×844, the phone the creation flow is built for (ADR 0028), with the
 * no-overflow gate checked on the page itself.
 */
test.use({ viewport: { width: 390, height: 844 } })

test('athlete builds a season from the catalogue, answers its question, and adds it', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(180_000)
	const user = await login()

	// Seventeen weeks out: every shape lands near it, and nothing is planned yet.
	const eventName = `Vårløpet ${faker.string.alphanumeric(6)}`
	const event = await prisma.event.create({
		data: {
			athleteId: user.id,
			name: eventName,
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + 17 * 7 * 24 * 60 * 60 * 1000),
			disciplines: JSON.stringify(['run']),
		},
	})

	// The way in: the shape step's quiet section.
	await navigate('/training/plan/new/:eventId', { eventId: event.id })
	await page.getByRole('link', { name: 'Bygg sesongen for meg' }).click()
	await expect(page).toHaveURL(`/training/plan/generate/${event.id}`)
	await expect(
		page.getByRole('heading', { name: 'Sesongen din, klar til å se over' }),
	).toBeVisible()
	await expect(page.getByText(eventName)).toBeVisible()
	// Back leads to laying it out by hand.
	await expect(
		page.getByRole('link', { name: /legg den opp selv/i }),
	).toBeVisible()

	// This athlete has trained nothing, so the anchor is theirs to state and
	// every week reads "—" until they do — never a number nobody typed.
	await expect(
		page.getByText(/Ingenting i treningen din de siste ukene/),
	).toBeVisible()
	await expect(page.getByText('Løping —').first()).toBeVisible()

	// Nothing reaches the calendar without a size: the approval says why.
	const approve = page.getByRole('button', {
		name: /^Legg (disse \d+ øktene|denne økta) i kalenderen$/,
	})
	await untilHydrated(approve)
	await approve.click()
	await expect(page.getByRole('alert')).toContainText(
		'Oppgi hvor hver idrett starter',
	)
	await expect(page).toHaveURL(`/training/plan/generate/${event.id}`)

	// The one question, and the anchor.
	await page
		.getByRole('radio', { name: 'Dette er min første strukturerte sesong' })
		.click()
	await page.getByLabel(/^Startvolum per uke i løping/).fill('40')
	await page.getByRole('button', { name: 'Bygg sesongen på nytt' }).click()
	await expect(page).toHaveURL(/you=first-season/)
	await expect(page).toHaveURL(/anchor-run=40/)
	await expect(
		page.getByRole('radio', {
			name: 'Dette er min første strukturerte sesong',
		}),
	).toBeChecked()
	await expect(page.getByText(/^Løping \d/).first()).toBeVisible()
	await expect(page.getByText(/Ditt eget tall/)).toBeVisible()

	// The shape is pre-selected and says so; another is one tap away.
	const shapeRow = page.getByRole('button', {
		name: /valgt fordi den lander nærmest løpet/,
	})
	await untilHydrated(shapeRow)
	await shapeRow.click()
	const shapes = page.getByRole('radiogroup', { name: 'Formen på sesongen' })
	const other = shapes.getByRole('radio', { checked: false }).first()
	// The radio is named by its card's title alone (`ChoiceCard`).
	const otherName = await other.evaluate(
		(radio) =>
			document.getElementById(radio.getAttribute('aria-labelledby') ?? '')
				?.textContent ?? '',
	)
	expect(otherName).not.toBe('')
	await other.click()
	await page.getByRole('button', { name: 'Bygg sesongen på nytt' }).click()
	await expect(page).toHaveURL(/shape=/)
	// The row now names the athlete's own choice, and does not claim it fits.
	await expect(
		page.getByRole('button', {
			name: new RegExp(`${otherName}.*valgt av deg`),
		}),
	).toBeVisible()

	// Everything on the page reads in Norwegian: none of the English that this
	// page shipped with is left.
	await expect(
		page.getByText(
			/Your season|Where are you right now|Rebuild the season|Add these|The season|Source:/,
		),
	).toHaveCount(0)

	// The no-overflow gate at 390 px (ADR 0028).
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth -
			document.documentElement.clientWidth,
	)
	expect(overflow).toBeLessThanOrEqual(0)

	// Add it: Sesong opens on the season just written.
	await approve.click()
	await expect(page).toHaveURL(`/training/plan?event=${event.id}`)
	await expect(page.getByRole('heading', { name: eventName })).toBeVisible()
	const outline = await prisma.planOutline.findFirst({
		where: { athleteId: user.id, eventId: event.id },
		select: { id: true },
	})
	expect(outline).not.toBeNull()
})
