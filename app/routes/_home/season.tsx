import { useLoaderData } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { useRevalidateOnImportEvent } from '#app/utils/imports-events.ts'
import { HOME_TIMELINE_FULL_VIEW_LABELS } from '#app/utils/labels.ts'
import { type Route } from './+types/season.ts'
import { homeTimelineAction, readHomeTimeline } from './home-timeline.server.ts'
import { HomeTimeline } from './timeline/home-timeline.tsx'

/**
 * **Se hele sesongen** (spec #558 story 102, #562): today's full Home Timeline
 * — the Week Strip, the Stream, the Writing Line and its composer, the Season
 * Pane, the Day Pane and the Ukeskiftet card — at its own address, so the calm
 * I dag can link here and nothing the athlete could do before is lost.
 *
 * It is the same timeline I dag renders, read and written through the same
 * server module (`home-timeline.server.ts`), and it lands the same way: on
 * today, before the first paint (ADR 0086 §4), never at the top of the half
 * year behind it. On a large screen it is the three panes (ADR 0087).
 *
 * Signed out it is the login, not the marketing page `/` shows: only the
 * athlete's own link leads here.
 */
export const meta: Route.MetaFunction = () => [
	{ title: `${HOME_TIMELINE_FULL_VIEW_LABELS.title} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	return readHomeTimeline(userId)
}

export async function action({ request }: Route.ActionArgs) {
	return homeTimelineAction({ request })
}

export default function HomeTimelineFullView() {
	const data = useLoaderData<typeof loader>()
	// A new import becomes a row on this list as on I dag (ADR 0049, #75).
	useRevalidateOnImportEvent()
	return <HomeTimeline data={data} />
}

/** As I dag's: a failed read stays one screen, inside the app. */
export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => <p>{HOME_TIMELINE_FULL_VIEW_LABELS.notFound}</p>,
			}}
		/>
	)
}
