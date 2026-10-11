import { data, redirect } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { createEvent } from '#app/utils/event.server.ts'
import { EVENTS_LABELS } from '#app/utils/labels.ts'
import { type Route } from './+types/events.new.ts'
import { EventForm, readEventForm } from './__event-form.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: EVENTS_LABELS.newMetaTitle },
]

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	const today = new Date().toISOString().slice(0, 10)
	return { defaultDate: today }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const read = readEventForm(await request.formData())
	if (!read.ok) return data({ result: read.reply }, { status: 400 })

	const event = await createEvent(userId, read.input)
	throw redirect(`/training/events/${event.id}`)
}

export default function NewEventRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={EVENTS_LABELS.newTitle}
				back={{ to: '/training/events', label: EVENTS_LABELS.title }}
				className="mb-6"
			/>
			<EventForm
				id="new-event"
				lastResult={actionData?.result}
				submitLabel={EVENTS_LABELS.create}
				defaults={{
					name: '',
					kind: 'race',
					priority: 'A',
					startDate: loaderData.defaultDate,
					endDate: '',
					disciplines: [],
					location: '',
					notes: '',
					targetKind: '',
					targetTime: '',
					targetPace: '',
					targetDistance: '',
					targetPlacement: '',
					targetDescription: '',
				}}
			/>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
