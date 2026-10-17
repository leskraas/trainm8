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
 * The full Home Timeline's own address, _Se hele sesongen_ (spec #558 story
 * 102, #562): today's whole timeline — strip, list, writing line and panes —
 * which the calm I dag links to. It is a page deeper in I dag, so the bar keeps
 * I dag current there.
 */
export const HOME_TIMELINE_HREF = '/season'

/**
 * The URL prefixes each tab is home to, beyond its own landing page. Matched on
 * whole path segments, so `/training/plan` never claims `/training/planner`.
 *
 * - **I dag**: the full Home Timeline (`/season`, _Se hele sesongen_).
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
	today: [HOME_TIMELINE_HREF],
	season: ['/training/plan', '/training/events'],
	library: [
		'/library',
		'/training/catalogue',
		'/training/programs',
		'/training/exercises',
	],
	me: ['/me', '/settings', '/integrations', '/imports'],
}

/**
 * The URLs that are a tab's **landing page**: its own address, plus Sesong's
 * plan creation, which is where Sesong lands while there is no plan (the plan
 * page redirects there). A landing page is the tab itself
 * (`aria-current="page"`); a page deeper in the tab is only inside it
 * (`aria-current="true"`).
 */
const TAB_LANDINGS: Record<AppTab, readonly string[]> = {
	today: ['/'],
	season: ['/training/plan', '/training/plan/new'],
	library: ['/library'],
	me: ['/me'],
}

/**
 * Pages that carry no tab bar at all: the first run (`/start…`) is a flow with
 * one way forward, and four ways out of it would be four ways to abandon it.
 */
const BARLESS_PREFIXES = ['/start'] as const

function underPrefix(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function normalized(pathname: string): string {
	return pathname.length > 1 && pathname.endsWith('/')
		? pathname.slice(0, -1)
		: pathname
}

/** Whether a page shows the tab bar at all. */
export function showsTabBar(pathname: string): boolean {
	const path = normalized(pathname)
	return !BARLESS_PREFIXES.some((prefix) => underPrefix(path, prefix))
}

/**
 * How a page stands to the tabs: the tab it lives under, and whether it is that
 * tab's landing page. `null` for a page that belongs to no tab.
 */
export function appTabPlace(
	pathname: string,
): { tab: AppTab; landing: boolean } | null {
	const path = normalized(pathname)
	const tab = appTabFor(path)
	if (tab == null) return null
	return { tab, landing: TAB_LANDINGS[tab].includes(path) }
}

/** The tab a page lives under, or `null` for a page that belongs to none. */
export function appTabFor(pathname: string): AppTab | null {
	const path = normalized(pathname)
	if (path === '/') return 'today'
	for (const tab of APP_TABS) {
		if (TAB_PREFIXES[tab].some((prefix) => underPrefix(path, prefix))) {
			return tab
		}
	}
	return null
}
