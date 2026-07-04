import { redirect } from 'react-router'

/**
 * Friendly redirect for the guessed URL (#178): the settings root has no
 * surface of its own — the avatar links straight to `/settings/profile` — so
 * `/settings` forwards there instead of a 404.
 */
export function loader() {
	return redirect('/settings/profile')
}
