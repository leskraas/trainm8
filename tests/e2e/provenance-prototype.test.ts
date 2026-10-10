import { expect, test } from '#tests/playwright-utils.ts'

/**
 * The provenance prototype (#437) shipped to production: no loader gate, HTTP
 * 200 with stub data, under the Sesong tab (Sesong audit, round 2, B1). Its own
 * header said to delete it once the design was folded into the real review
 * surface, and `plan.generate.$eventId.tsx` folded it in (#434 review §6), so it
 * is deleted rather than gated. This keeps it gone: the path is the app's 404,
 * for a logged-in athlete too, so no auth redirect can stand in for a 404.
 */
test('the provenance prototype is not a page', async ({ page, login }) => {
	await login()

	const res = await page.goto('/training/plan/provenance-prototype')

	expect(res?.status()).toBe(404)
	await expect(
		page.getByRole('heading', { name: /can't find this page/i }),
	).toBeVisible()
})
