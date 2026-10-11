import { faker } from '@faker-js/faker/locale/en'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

test('Users can add 2FA to their account and use it when logging in', async ({
	page,
	navigate,
	login,
}) => {
	// Several pages in one test, and on the dev server each first visit pays
	// its cold Vite transform.
	test.setTimeout(60_000)
	const password = faker.internet.password()
	const user = await login({ password })
	await navigate('/settings/profile')

	await page.getByRole('link', { name: /^totrinnsbekreftelse/i }).click()

	await expect(page).toHaveURL(`/settings/profile/two-factor`)
	const main = page.getByRole('main')
	await main
		.getByRole('button', { name: /slå på totrinnsbekreftelse/i })
		.click()
	const otpUriString = await main.getByLabel(/engangspassord-uri/i).innerText()

	const otpUri = new URL(otpUriString)
	const options = Object.fromEntries(otpUri.searchParams)

	await main.getByRole('textbox', { name: /kode/i }).fill(
		(
			await generateTOTP({
				...options,
				// the algorithm will be "SHA1" but we need to generate the OTP with "SHA-1"
				algorithm: 'SHA-1',
			})
		).otp,
	)
	await main.getByRole('button', { name: /bekreft/i }).click()

	await expect(main).toHaveText(/totrinnsbekreftelse er på\./i)
	await expect(
		main.getByRole('link', { name: /slå av totrinnsbekreftelse/i }),
	).toBeVisible()

	// With the avatar dropdown gone (#178), logout lives on the Settings
	// profile page itself.
	await navigate('/settings/profile')
	await page.getByRole('button', { name: /^logg ut$/i }).click()
	await expect(page).toHaveURL(`/`)

	await navigate('/login')
	await expect(page).toHaveURL(`/login`)
	await page.getByRole('textbox', { name: /username/i }).fill(user.username)
	await page.getByLabel(/^password$/i).fill(password)
	await page.getByRole('button', { name: /log in/i }).click()

	await page.getByRole('textbox', { name: /code/i }).fill(
		(
			await generateTOTP({
				...options,
				// the algorithm will be "SHA1" but we need to generate the OTP with "SHA-1"
				algorithm: 'SHA-1',
			})
		).otp,
	)

	await page.getByRole('button', { name: /submit/i }).click()

	// The tab bar (and its Meg tab) only renders for authenticated
	// users, so it doubles as the logged-in proof (#178).
	await expect(
		page
			.getByRole('navigation', { name: 'Hovedmeny' })
			.getByRole('link', { name: 'Meg' }),
	).toBeVisible()
})
