import { invariant } from '@epic-web/invariant'
import { faker } from '@faker-js/faker/locale/en'
import { verifyUserPassword } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { readEmail } from '#tests/mocks/utils.ts'
import { expect, test, createUser, waitFor } from '#tests/playwright-utils.ts'

// The change-email code mail is Norwegian (MEG_EMAIL_LABELS.codeLine).
const CODE_REGEX = /Her er koden din: (?<code>[\d\w]+)/

test('Users can update their basic info', async ({ page, navigate, login }) => {
	await login()
	await navigate('/settings/profile')

	const newUserData = createUser()

	await page.getByRole('textbox', { name: /^navn/i }).fill(newUserData.name)
	await page
		.getByRole('textbox', { name: /^brukernavn/i })
		.fill(newUserData.username)

	await page.getByRole('button', { name: /^lagre kontoen/i }).click()
})

test('Users can update their password', async ({ page, navigate, login }) => {
	const oldPassword = faker.internet.password()
	const newPassword = faker.internet.password()
	const user = await login({ password: oldPassword })
	await navigate('/settings/profile')

	await page.getByRole('link', { name: /^passord/i }).click()

	await page
		.getByRole('textbox', { name: /^nåværende passord/i })
		.fill(oldPassword)
	await page.getByRole('textbox', { name: /^nytt passord/i }).fill(newPassword)
	await page
		.getByRole('textbox', { name: /^gjenta det nye passordet/i })
		.fill(newPassword)

	await page.getByRole('button', { name: /^bytt passord/i }).click()

	await expect(page).toHaveURL(`/settings/profile`)

	const { username } = user
	expect(
		await verifyUserPassword({ username }, oldPassword),
		'Old password still works',
	).toBeNull()
	expect(
		await verifyUserPassword({ username }, newPassword),
		'New password does not work',
	).toEqual({ id: user.id })
})

test('Users can update their profile photo', async ({
	page,
	navigate,
	login,
}) => {
	const user = await login()
	await navigate('/settings/profile')

	const beforeSrc = await page
		.getByRole('main')
		.getByRole('img', { name: user.name ?? user.username })
		.getAttribute('src')

	await page.getByRole('link', { name: /bytt profilbilde/i }).click()

	await expect(page).toHaveURL(`/settings/profile/photo`)

	await page
		.locator('input[type="file"][name="photoFile"]')
		.setInputFiles('./tests/fixtures/images/user/kody.png')

	await page.getByRole('button', { name: /lagre bildet/i }).click()

	await expect(
		page,
		'Was not redirected after saving the profile photo',
	).toHaveURL(`/settings/profile`)

	const afterSrc = await page
		.getByRole('main')
		.getByRole('img', { name: user.name ?? user.username })
		.getAttribute('src')

	// not sure how to get the before/after src with getAttribute inline
	// eslint-disable-next-line playwright/prefer-web-first-assertions
	expect(beforeSrc).not.toEqual(afterSrc)
})

test('Users can change their email address', async ({
	page,
	navigate,
	login,
}) => {
	const preUpdateUser = await login()
	const newEmailAddress = faker.internet.email().toLowerCase()
	expect(preUpdateUser.email).not.toEqual(newEmailAddress)
	await navigate('/settings/profile')
	await page.getByRole('link', { name: /^e-post/i }).click()
	await page
		.getByRole('textbox', { name: /ny e-postadresse/i })
		.fill(newEmailAddress)
	await page.getByRole('button', { name: /send kode/i }).click()
	await expect(page).toHaveURL(/\/verify/)
	const email = await waitFor(() => readEmail(newEmailAddress), {
		errorMessage: 'Confirmation email was not sent',
	})
	invariant(email, 'Email was not sent')
	const codeMatch = email.text.match(CODE_REGEX)
	const code = codeMatch?.groups?.code
	invariant(code, 'Onboarding code not found')
	await page.getByRole('textbox', { name: /code/i }).fill(code)
	await page.getByRole('button', { name: /submit/i }).click()
	await expect(page.getByText(/e-posten er byttet/i)).toBeVisible()

	const updatedUser = await prisma.user.findUnique({
		where: { id: preUpdateUser.id },
		select: { email: true },
	})
	invariant(updatedUser, 'Updated user not found')
	expect(updatedUser.email).toBe(newEmailAddress)
	const noticeEmail = await waitFor(() => readEmail(preUpdateUser.email), {
		errorMessage: 'Notice email was not sent',
	})
	expect(noticeEmail.subject).toContain('byttet')
})
