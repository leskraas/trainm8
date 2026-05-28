import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	getInboxImports,
	unlinkImport,
	type InboxImport,
} from '#app/utils/activity-import.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import {
	formatDuration,
	formatDistance,
} from '#app/utils/workout-formatting.ts'
import { type Route } from './+types/imports._index.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Activity Inbox | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const imports = await getInboxImports(userId)
	return { imports }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	const importId = formData.get('importId')

	if (intent === 'unlink' && typeof importId === 'string') {
		await unlinkImport(userId, importId)
	}

	return null
}

export default function ImportsIndexRoute({
	loaderData,
}: Route.ComponentProps) {
	const { imports } = loaderData

	return (
		<main className="container py-10">
			<div className="mb-6 flex items-center justify-between gap-3">
				<div>
					<h1 className="text-h3">Activity Inbox</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						Imported activities waiting to be linked to a planned session.
					</p>
				</div>
				<Link
					to="/imports/upload"
					className={buttonVariants({ variant: 'default' })}
				>
					Upload activity
				</Link>
			</div>

			{imports.length === 0 ? (
				<Card>
					<CardContent className="py-12 text-center">
						<p className="text-muted-foreground">
							No activities in the inbox.{' '}
							<Link to="/imports/upload" className="underline">
								Upload a GPX or FIT file
							</Link>{' '}
							to get started.
						</p>
					</CardContent>
				</Card>
			) : (
				<ul className="space-y-3">
					{imports.map((item) => (
						<ImportRow key={item.id} item={item} />
					))}
				</ul>
			)}
		</main>
	)
}

function ImportRow({ item }: { item: InboxImport }) {
	const startedAt = new Date(item.startedAt)
	const disciplineLabel = getDisciplineLabel(item.discipline)

	return (
		<li>
			<Card>
				<CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
					<div className="space-y-0.5">
						<CardTitle className="text-base">
							{disciplineLabel} —{' '}
							<time dateTime={startedAt.toISOString()}>
								{startedAt.toLocaleDateString(undefined, {
									weekday: 'short',
									month: 'short',
									day: 'numeric',
								})}
							</time>
						</CardTitle>
						<CardDescription>
							{startedAt.toLocaleTimeString(undefined, {
								hour: 'numeric',
								minute: '2-digit',
							})}
							{' · '}
							{formatDuration(item.durationSec)}
							{item.distanceM != null
								? ` · ${formatDistance(item.distanceM)}`
								: null}
						</CardDescription>
					</div>
					<Badge variant="secondary" className="capitalize">
						{item.externalProvider}
					</Badge>
				</CardHeader>
				<CardContent>
					<div className="flex gap-2">
						<Link
							to={`/imports/${item.id}/promote`}
							className={buttonVariants({ variant: 'default', size: 'sm' })}
						>
							Promote
						</Link>
					</div>
				</CardContent>
			</Card>
		</li>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
