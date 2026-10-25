import { type Locator, type Page } from '@playwright/test'
import { expect, test } from '#tests/playwright-utils.ts'

/**
 * An auth form holds still while the athlete types. Each field and the form
 * keep one error line's height whether an error shows or not, so an error
 * that appears on submit, or clears as a field is fixed mid-typing, never
 * moves the fields or the submit button under a thumb (review of #638).
 */
test.use({ viewport: { width: 390, height: 844 } })

async function top(locator: Locator) {
	const box = await locator.boundingBox()
	if (!box) throw new Error('not laid out')
	return Math.round(box.y)
}

/** The tops of the watched controls, read at once. */
async function tops(page: Page, controls: Locator[]) {
	return Promise.all(controls.map(top))
}

async function waitForHydration(page: Page) {
	// The form only validates on the client once React has hydrated.
	await page.waitForFunction(
		() =>
			document.querySelector('form[noValidate]') !== null &&
			// React attaches its props to the element it hydrated.
			Object.keys(document.querySelector('form[noValidate]')!).some((key) =>
				key.startsWith('__reactProps'),
			),
	)
}

test('the login form holds still as errors appear and clear', async ({
	page,
	navigate,
}) => {
	test.setTimeout(120_000)
	await navigate('/login')
	await waitForHydration(page)

	const main = page.getByRole('main')
	const username = main.getByRole('textbox', { name: /^username/i })
	const password = main.getByLabel(/^password/i)
	const submit = main.getByRole('button', { name: /^log in$/i })
	const watched = [password, submit]
	const still = await tops(page, watched)

	// Submitting empty shows an error under each field.
	await submit.click()
	await expect(main.getByText('Username is required')).toBeVisible()
	await expect(main.getByText('Password is required')).toBeVisible()
	expect(await tops(page, watched)).toEqual(still)

	// Fixing the username clears its error mid-typing.
	await username.pressSequentially('kody_nobody')
	await expect(main.getByText(/^Username is/)).toHaveCount(0)
	expect(await tops(page, watched)).toEqual(still)

	// The server's answer is the form's error, above the button.
	await password.fill('not-the-password')
	await submit.click()
	await expect(main.getByText('Invalid username or password')).toBeVisible()
	expect(await tops(page, watched)).toEqual(still)

	// Retyping clears it, and the button stays where the thumb is.
	await password.pressSequentially('x')
	await expect(main.getByText('Invalid username or password')).toHaveCount(0)
	expect(await tops(page, watched)).toEqual(still)
})

for (const { path, field, button, error, fix } of [
	{
		path: '/signup',
		field: /^email/i,
		button: /^submit$/i,
		error: 'Email is required',
		fix: 'athlete@example.com',
	},
	{
		path: '/forgot-password',
		field: /^username or email/i,
		button: /^recover password$/i,
		error: 'Invalid input',
		fix: 'kody',
	},
] as const) {
	test(`the ${path} form holds still as its error appears and clears`, async ({
		page,
	}) => {
		test.setTimeout(120_000)
		await page.goto(path)
		await waitForHydration(page)

		const main = page.getByRole('main')
		const submit = main.getByRole('button', { name: button })
		const still = await top(submit)

		await submit.click()
		await expect(main.getByText(error)).toBeVisible()
		expect(await top(submit)).toBe(still)

		await main.getByRole('textbox', { name: field }).pressSequentially(fix)
		await expect(main.getByText(error)).toHaveCount(0)
		expect(await top(submit)).toBe(still)
	})
}
