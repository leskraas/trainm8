import { invariantResponse } from '@epic-web/invariant'
import { data, redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	parseEventDisciplines,
	parseEventTarget,
} from '#app/utils/event-schema.ts'
import { getEventById, updateEvent } from '#app/utils/event.server.ts'
import { EVENTS_LABELS } from '#app/utils/labels.ts'
import { type Route } from './+types/events.$eventId.edit.ts'
import { EventForm, readEventForm } from './__event-form.tsx'
import { targetEntryOf } from './__event-target.ts'

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
	{
		title: loaderData?.event
			? EVENTS_LABELS.editMetaTitle(loaderData.event.name)
			: EVENTS_LABELS.metaTitle,
	},
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.eventId, EVENTS_LABELS.notFound, { status: 400 })

	const event = await getEventById(userId, params.eventId)
	invariantResponse(event, EVENTS_LABELS.notFound, { status: 404 })

	return { event }
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.eventId, EVENTS_LABELS.notFound, { status: 400 })

	const read = readEventForm(await request.formData())
	if (!read.ok) return data({ result: read.reply }, { status: 400 })

	const updated = await updateEvent(userId, params.eventId, read.input)
	invariantResponse(updated, EVENTS_LABELS.notFound, { status: 404 })

	throw redirect(`/training/events/${params.eventId}`)
}

/** A stored day (UTC midnight) as the date input's `YYYY-MM-DD`. */
function dayKeyOf(date: Date | string | null): string {
	return date ? new Date(date).toISOString().slice(0, 10) : ''
}

export default function EditEventRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { event } = loaderData

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={EVENTS_LABELS.editTitle}
				back={{ to: `/training/events/${event.id}`, label: event.name }}
				className="mb-6"
			/>
			<EventForm
				id="edit-event"
				lastResult={actionData?.result}
				submitLabel={EVENTS_LABELS.save}
				defaults={{
					name: event.name,
					kind: event.kind,
					priority: event.priority,
					startDate: dayKeyOf(event.startDate),
					endDate: dayKeyOf(event.endDate),
					disciplines: parseEventDisciplines(event.disciplines),
					location: event.location ?? '',
					notes: event.notes ?? '',
					...targetEntryOf(parseEventTarget(event.target)),
				}}
			/>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
