import { redirect } from 'react-router'
import { serializeChosenVariant } from '#app/lab/variant.server.ts'
import { isLabVariantKey, labVariant } from '#app/lab/variants.ts'
import { type Route } from './+types/lab-app.ts'

/**
 * Chooses an App Lab app (ADR 0125): remembers it in the cookie and opens its
 * home. `?app=<key>` on a GET does the same, so a link can switch apps.
 */
async function choose(value: unknown) {
	if (!isLabVariantKey(value)) {
		throw new Response('Unknown app', { status: 400 })
	}
	return redirect(labVariant(value).home, {
		headers: { 'Set-Cookie': await serializeChosenVariant(value) },
	})
}

export async function action({ request }: Route.ActionArgs) {
	const form = await request.formData()
	return choose(form.get('app'))
}

export async function loader({ request }: Route.LoaderArgs) {
	return choose(new URL(request.url).searchParams.get('app'))
}
