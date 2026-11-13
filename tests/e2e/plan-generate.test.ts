import { faker } from '@faker-js/faker/locale/en'
import { type Page } from '@playwright/test'
import { prisma } from '#app/utils/db.server.ts'
import { previewSeason } from '#app/utils/plan-generation/generate.server.ts'
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
	// The first week's run row: its target, and what its sessions plan (#472).
	const runRow = page
		.getByRole('list', { name: 'Mål og planlagt per idrett' })
		.first()
		.getByRole('listitem')
		.first()
	await expect(runRow).toHaveText(/^Løping\s*mål —\s*·\s*planlagt\s/)

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
	await expect(runRow).toHaveText(/^Løping\s*mål \d+\s*km\s*·\s*planlagt\s/)
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
	await expect(
		page.getByRole('link', { name: eventName, exact: true }),
	).toBeVisible()
	const outline = await prisma.planOutline.findFirst({
		where: { athleteId: user.id, eventId: event.id },
		select: { id: true },
	})
	expect(outline).not.toBeNull()
})

/**
 * The Weekly Capacity on the preview (#473, ADR 0110 §2): an athlete whose
 * anchor would outrun the hours they have sees the season scaled to fit, and
 * the preview says so in one line, with the heaviest week before and after.
 * Checked at 320 px, the narrowest phone, for the no-overflow gate.
 */
test('a season over the athlete’s weekly hours is scaled to fit, and says so', async ({
	page,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	await prisma.athleteProfile.create({
		data: {
			userId: user.id,
			weeklyCapacityHours: 4,
			// 5:00/km at threshold: enough to read a km week in hours.
			disciplineProfiles: {
				create: { discipline: 'run', thresholdPaceSecPerKm: 300 },
			},
		},
	})
	const event = await prisma.event.create({
		data: {
			athleteId: user.id,
			name: `Høstløpet ${faker.string.alphanumeric(6)}`,
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + 17 * 7 * 24 * 60 * 60 * 1000),
			disciplines: JSON.stringify(['run']),
		},
	})

	await page.setViewportSize({ width: 320, height: 720 })
	// 80 km a week is far more than four hours at 5:00/km.
	await page.goto(`/training/plan/generate/${event.id}?anchor-run=80`)
	const notice = page.getByText(/^Skalert ned til kapasiteten din/)
	await expect(notice).toHaveText(
		/^Skalert ned til kapasiteten din på 4 t\/uke: den tyngste uka er nå ≈ \d+(,\d)? t\/uke, ned fra ≈ \d+(,\d)? t\/uke\.$/,
	)
	// The anchor box keeps the athlete's own figure; the weeks below are lowered.
	await expect(page.getByLabel(/^Startvolum per uke i løping/)).toHaveValue(
		'80',
	)

	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth -
			document.documentElement.clientWidth,
	)
	expect(overflow).toBeLessThanOrEqual(0)
})

/**
 * **Placed Hours** over the Weekly Capacity (#473, ADR 0110 §4, ADR 0116):
 * where a week's placed sessions alone take longer than the athlete has, its
 * card says so, a line under the season heading names the weeks, and the
 * «N uker til» row names the ones behind it — all on load, nothing behind a
 * tap, and nothing placed changes.
 */
async function createAthleteWithThresholds(
	userId: string,
	weeklyCapacityHours: number,
) {
	await prisma.athleteProfile.create({
		data: {
			userId,
			weeklyCapacityHours,
			disciplineProfiles: {
				create: [
					{ discipline: 'run', thresholdPaceSecPerKm: 270 },
					{ discipline: 'swim', cssSecPer100m: 105 },
					{ discipline: 'bike', ftp: 230 },
				],
			},
		},
	})
}

async function createRace(
	athleteId: string,
	name: string,
	disciplines: string[],
) {
	return prisma.event.create({
		data: {
			athleteId,
			name,
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + 20 * 7 * 24 * 60 * 60 * 1000),
			disciplines: JSON.stringify(disciplines),
		},
	})
}

/** No element of the page's content reaches past the viewport. */
async function contentOverflow(page: Page) {
	return page.evaluate(() => {
		const width = document.documentElement.clientWidth
		let right = 0
		for (const element of document.querySelectorAll('main *')) {
			right = Math.max(right, element.getBoundingClientRect().right)
		}
		return Math.ceil(right - width)
	})
}

test('the season line and the «N uker til» row name the weeks whose placed sessions outrun the capacity, with the section closed', async ({
	page,
	login,
}) => {
	test.setTimeout(180_000)
	const user = await login()
	await createAthleteWithThresholds(user.id, 100)
	const event = await createRace(
		user.id,
		`Vårmila ${faker.string.alphanumeric(6)}`,
		['run'],
	)

	// Read the placed hours the server will state, and set a capacity that the
	// heaviest hidden week outruns and the lightest week does not.
	const roomy = await previewSeason(user.id, event.id, {})
	if (!roomy.ok || roomy.preview.season.placed.kind !== 'read') {
		throw new Error('the preview read no Placed Hours')
	}
	const hours = roomy.preview.season.placed.weeks.map((week) => week?.hours)
	const timed = hours.filter((h): h is number => h != null)
	const hidden = hours.slice(4).filter((h): h is number => h != null)
	const capacity = Math.round(Math.max(...hidden) * 10) / 10 - 0.1
	expect(Math.min(...timed)).toBeLessThan(capacity)
	await prisma.athleteProfile.update({
		where: { userId: user.id },
		data: { weeklyCapacityHours: capacity },
	})

	await page.goto(`/training/plan/generate/${event.id}`)
	// Visible as the page loads: the season line, and the row's own line.
	await expect(page.locator('[data-placed="season"]')).toBeVisible()
	await expect(page.locator('[data-placed="season"]')).toContainText(
		'Øktene alene tar mer tid enn du har.',
	)
	const trigger = page.getByRole('button', { name: /uker til/ })
	await expect(trigger).toHaveAttribute('aria-expanded', 'false')
	await expect(trigger.locator('[data-placed="remaining"]')).toBeVisible()
	await expect(trigger.locator('[data-placed="remaining"]')).toHaveText(
		/(ligger her, og øktene der tar mer tid enn du har\.|av ukene her tar mer tid enn du har)$/,
	)

	// Nothing placed changed because of it: the same sessions as without it.
	const tight = await previewSeason(user.id, event.id, {})
	if (!tight.ok) throw new Error(tight.reason)
	expect(tight.preview.season.sessions).toEqual(roomy.preview.season.sessions)
})

test('the worst-case season wraps without overflow at 320 px and 390 px with 200 % text', async ({
	page,
	login,
}) => {
	test.setTimeout(240_000)
	const user = await login()
	// Every week breaches: a triathlete with half an hour a week.
	await createAthleteWithThresholds(user.id, 0.5)
	const event = await createRace(
		user.id,
		`Norseman Xtreme Triathlon – Eidfjord til Gaustatoppen ${faker.string.alphanumeric(6)}`,
		['swim', 'bike', 'run'],
	)

	for (const width of [320, 390]) {
		await page.setViewportSize({ width, height: 900 })
		await page.goto(
			`/training/plan/generate/${event.id}?anchor-swim=6.2&anchor-bike=180&anchor-run=40`,
		)
		await page.addStyleTag({ content: 'html { font-size: 200%; }' })
		await expect(page.locator('[data-placed="season"]')).toContainText(
			'Hver uke i sesongen',
		)
		const trigger = page.getByRole('button', { name: /uker til/ })
		await untilHydrated(trigger)
		await trigger.click()
		await expect(trigger).toHaveAttribute('aria-expanded', 'true')
		// Three tracks with a swim target, a taper badge, a breach on every card.
		const cards = page.getByRole('article')
		await expect(cards.getByText(/^Svømming$/).first()).toBeVisible()
		await expect(cards.getByText(/^nedtrapping$/i).first()).toBeVisible()
		const breaching = page.locator('[data-placed="over"]')
		await expect(breaching).toHaveCount(await cards.count())
		expect(
			await contentOverflow(page),
			`overflow at ${width} px`,
		).toBeLessThanOrEqual(0)
	}
})
