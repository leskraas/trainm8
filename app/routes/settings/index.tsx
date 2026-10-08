import { redirect } from 'react-router'

/**
 * Friendly redirect for the guessed URL (#178): the settings root has no
 * surface of its own. Meg is where settings live now (ADR 0083), so `/settings`
 * forwards there instead of a 404.
 */
export function loader() {
	return redirect('/me')
}
