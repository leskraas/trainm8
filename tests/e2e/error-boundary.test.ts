import { expect, test } from '#tests/playwright-utils.ts'

test('Test root error boundary caught', async ({ page, navigate }) => {
	const pageUrl = '/does-not-exist'
	const res = await navigate(pageUrl as any)

	expect(res?.status()).toBe(404)

	await expect(page).toHaveURL(new RegExp(`${pageUrl}$`))

	// Accept common 404 variants instead of one exact sentence
	await expect(
		page.getByRole('heading', { name: /not found|404|can't find/i }),
	).toBeVisible()
})
