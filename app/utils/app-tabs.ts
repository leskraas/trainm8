/**
 * The four tabs (spec #505 stories 56–59, ADR 0083): I dag, Sesong, Bibliotek
 * and Meg. This module owns **which** tabs there are, where each one lands and
 * which URLs belong to which; `labels.ts` owns how each is worded and
 * `components/tab-bar.tsx` owns how they are drawn.
 *
 * A tab is a home for a set of URLs, not a URL of its own. The pages that moved
 * into a tab kept their addresses (`/training/events`, `/settings/profile`, …)
 * so no deep link breaks; the bar marks the tab a page now lives under.
 */

export const APP_TABS = ['today', 'season', 'library', 'me'] as const
export type AppTab = (typeof APP_TABS)[number]

/** Where tapping each tab lands. */
export const APP_TAB_HREFS: Record<AppTab, string> = {
	today: '/',
	season: '/training/plan',
	library: '/library',
	me: '/me',
}

/**
 * The URL prefixes each tab is home to, beyond its own landing page. Matched on
 * whole path segments, so `/training/plan` never claims `/training/planner`.
 *
 * - **Sesong**: the season plan and plan creation (`/training/plan/…`) and the
 *   Events it builds toward.
 * - **Bibliotek**: the catalogue, programs and exercises.
 * - **Meg**: settings, integrations and the file upload — imports have no page
 *   of their own (spec #505, Navigation).
 *
 * Anything else — a session, a log, an admin screen — is reached from a page
 * and belongs to no tab, so the bar marks none rather than guessing.
 */
const TAB_PREFIXES: Record<AppTab, readonly string[]> = {
	today: [],
	season: ['/training/plan', '/training/events', '/events'],
	library: [
		'/library',
		'/training/catalogue',
		'/training/programs',
		'/training/exercises',
	],
	me: ['/me', '/settings', '/integrations', '/imports'],
}

function underPrefix(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** The tab a page lives under, or `null` for a page that belongs to none. */
export function appTabFor(pathname: string): AppTab | null {
	const path =
		pathname.length > 1 && pathname.endsWith('/')
			? pathname.slice(0, -1)
			: pathname
	if (path === '/') return 'today'
	for (const tab of APP_TABS) {
		if (TAB_PREFIXES[tab].some((prefix) => underPrefix(path, prefix))) {
			return tab
		}
	}
	return null
}
