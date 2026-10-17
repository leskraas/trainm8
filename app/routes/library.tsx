/**
 * Bibliotek's old address (spec #505 story 58), kept working (ADR 0101 §1, ADR
 * 0083 §4). Bibliotek is no longer a tab but a section of Plan, so this page is
 * a forward to that section, with the Plan tab marked: to the plan, or — while
 * there is no plan — to plan creation, which is where Plan lands then and which
 * carries the same section. It forwards straight there rather than through
 * `/training/plan`, whose own no-plan redirect would drop the anchor on the way.
 *
 * It is also where a page inside Bibliotek backs out to
 * (`LIBRARY_SECTION_HREF`), so the one rule for where the section is lives here.
 */
import { redirect } from 'react-router'
import { APP_TAB_HREFS, LIBRARY_SECTION_ID } from '#app/utils/app-tabs.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import { type Route } from './+types/library.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const active = await findActiveOutline(userId, new Date())
	const landing = active ? APP_TAB_HREFS.plan : '/training/plan/new'
	throw redirect(`${landing}#${LIBRARY_SECTION_ID}`)
}
