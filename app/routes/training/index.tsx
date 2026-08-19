import { redirect } from 'react-router'

/**
 * `/training` is a **URL namespace, not a destination.**
 *
 * Every training surface — the Season, Events, the Catalogue, Programs, a
 * session, a log — hangs off `/training/…`, so the bare prefix is a natural
 * guess and used to land on the catch-all 404. It does not get an index *page*:
 * the athlete's training hub already exists and is Home, which owns the three
 * zooms on their own data (Week, Trends, History) and the labelled entries to
 * every training destination. A second hub would be a menu of links duplicating
 * one that is already there — a page that exists only to stop a 404.
 *
 * So this is a redirect, on the same terms as `/events` → `/training/events`
 * (#178): a guessed URL is answered with the real surface rather than an error.
 */
export function loader() {
	return redirect('/')
}
