import { type Page } from '@playwright/test'
import { expect, test, untilHydrated } from '#tests/playwright-utils.ts'

/**
 * Session authoring end-to-end (#176, ADR 0027 R5; workout-editor spec §0): the
 * full editor is the Token Sentence editor — the sole deep authoring surface
 * now that the nested-fieldset form is deleted (§12). From I dag it is reached
 * through the session composer (owner decision 1, ADR 0088): _Ny økt_, then
 * _Gjør grundigere_, then _Åpne hele editoren_ — the composer's way to what
 * no line says. A new session opens on the
 * honest-empty composition; picking the "Easy session" seed materializes a
 * one-step stanza whose values are tappable tokens. A 40-minute easy run
 * authored by nudging the duration token lands on home's timeline. The same flow
 * runs at desktop and at 390px (#171: the PWA is a real mobile experience).
 */
async function createEasyRun({
	page,
	navigate,
}: {
	page: Page
	navigate: (to: '/') => Promise<unknown>
}) {
	await navigate('/')

	// Creation starts at the top line's one control (owner decision 6), which
	// opens the composer on today — a Drawer on a phone, the day pane on a
	// large screen. The sport chosen there travels to the full editor.
	const create = page
		.getByTestId('timeline-top')
		.getByRole('button', { name: 'Ny økt' })
	await untilHydrated(create)
	await create.click()
	const composer = page.locator('[data-composer]').filter({ visible: true })
	await expect(composer).toBeVisible()
	await composer.getByRole('button', { name: 'Løping' }).click()
	await composer.getByRole('button', { name: 'Gjør grundigere' }).click()
	await composer.getByRole('link', { name: 'Åpne hele editoren' }).click()
	await expect(page).toHaveURL(/\/training\/sessions\/new\?.*discipline=run/)

	// The Token Sentence editor is the sole authoring surface now (§0). A new
	// session is honestly empty (spec §11, #260): it opens on the empty
	// composition — archetype seeds, no stanza chrome anchored to nothing — so
	// the way in is an explicit choice. Pick the "Easy session" seed to
	// materialize the real one-cardio-step stanza (`45 min @ easy`).
	await expect(page.locator('[data-token-sentence-editor]')).toBeVisible()
	await page.locator('[data-seed="easy"]').click()
	const durationToken = page.getByRole('button', { name: /min duration/ })
	await expect(durationToken).toBeVisible()

	// The seed lands as a 45-min easy run; the whole flow from here is: title,
	// tap the duration token and nudge it to 40 min through its popover,
	// submit. The sport arrived with the link from the composer (#501, ADR
	// 0065 §5: never a hardcoded `run`), so it is not asked again.
	await page.getByLabel('Tittel').fill('Easy Run')
	await durationToken.click()
	await page.locator('[data-slot="token-popover"] input').first().fill('40 min')
	await page.keyboard.press('Escape')
	await expect(
		page.getByRole('button', { name: /40 min duration/ }),
	).toBeVisible()
	await page.getByRole('button', { name: 'Lag økta' }).click()

	// Persisted as a real Workout Session and shown on its detail view.
	await expect(page).toHaveURL(/\/training\/sessions\/[a-z0-9]+$/i)
	await expect(page.getByText('Easy Run').first()).toBeVisible()

	// Back on home, the session shows up as a row in the stream — the one place
	// sessions live now that home is a single timeline.
	await navigate('/')
	const stream = page.getByTestId('timeline-stream')
	await expect(stream).toBeVisible()
	await expect(stream.getByText('Easy Run').first()).toBeVisible()
}

test('athlete creates a 40-minute easy run and sees it on the timeline', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	await login()
	await createEasyRun({ page, navigate })
})

test.describe('at 390px (mobile PWA)', () => {
	test.use({ viewport: { width: 390, height: 844 } })

	test('the same authoring flow works end to end', async ({
		page,
		navigate,
		login,
	}) => {
		test.setTimeout(120_000)
		await login()
		await createEasyRun({ page, navigate })
	})
})
