import { redirect } from 'react-router'

/**
 * `/imports` was the Activity Inbox until every import auto-saved (#432, ADR
 * 0049). Imports have no page of their own (spec #505, ADR 0083): what is left
 * to do with them — the intervals.icu connection and a file upload — is on Meg,
 * so an old bookmark lands there instead of a 404.
 */
export function loader() {
	return redirect('/me')
}
