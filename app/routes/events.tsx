import { redirect } from 'react-router'

/**
 * Friendly redirect for the guessed URL (#178): with no menu carrying an
 * "Events" entry, `/events` is a natural guess — send it to the real Events
 * surface instead of a 404.
 */
export function loader() {
	return redirect('/training/events')
}
