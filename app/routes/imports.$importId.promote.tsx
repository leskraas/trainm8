import { invariantResponse } from '@epic-web/invariant'
import { data, Form, Link, redirect, useActionData } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '#app/components/ui/card.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	promoteToExistingSession,
	promoteToNewSession,
	unlinkImport,
} from '#app/utils/activity-import.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import {
	formatDuration,
	formatDistance,
} from '#app/utils/workout-formatting.ts'
import { type Route } from './+types/imports.$importId.promote.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Promote Activity | Trainm8' },
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.importId, 'Import ID required', { status: 400 })

	const imported = await prisma.activityImport.findFirst({
		where: { id: params.importId, athleteId: userId },
		select: {
			id: true,
			discipline: true,
			startedAt: true,
			endedAt: true,
			durationSec: true,
			distanceM: true,
			promotedSessionId: true,
		},
	})
	invariantResponse(imported, 'Import not found', { status: 404 })

	// Find candidate sessions: same day (UTC), no recording yet, no recording-only
	const startOfDay = new Date(imported.startedAt)
	startOfDay.setUTCHours(0, 0, 0, 0)
	const endOfDay = new Date(imported.startedAt)
	endOfDay.setUTCHours(23, 59, 59, 999)

	const candidateSessions = await prisma.workoutSession.findMany({
		where: {
			userId,
			recordingId: null,
			workoutId: { not: null },
			scheduledAt: { gte: startOfDay, lte: endOfDay },
		},
		select: {
			id: true,
			scheduledAt: true,
			workout: { select: { title: true, discipline: true } },
		},
		orderBy: { scheduledAt: 'asc' },
	})

	return { imported, candidateSessions }
}

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	invariantResponse(params.importId, 'Import ID required', { status: 400 })

	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'promote-existing') {
		const sessionId = formData.get('sessionId')
		invariantResponse(typeof sessionId === 'string', 'Session ID required', {
			status: 400,
		})
		try {
			await promoteToExistingSession(userId, params.importId, sessionId)
		} catch {
			return data({ error: 'Could not link to session.' }, { status: 400 })
		}
		return redirect('/imports')
	}

	if (intent === 'promote-new') {
		try {
			await promoteToNewSession(userId, params.importId)
		} catch {
			return data(
				{ error: 'Could not create recording-only session.' },
				{ status: 400 },
			)
		}
		return redirect('/training/upcoming')
	}

	if (intent === 'unlink') {
		await unlinkImport(userId, params.importId)
		return redirect('/imports')
	}

	return data({ error: 'Unknown intent.' }, { status: 400 })
}

export default function PromoteRoute({ loaderData }: Route.ComponentProps) {
	const { imported, candidateSessions } = loaderData
	const actionData = useActionData<typeof action>()

	const startedAt = new Date(imported.startedAt)
	const isPromoted = imported.promotedSessionId != null

	return (
		<main className="container max-w-lg py-10">
			<div className="mb-6 flex items-center gap-3">
				<Link
					to="/imports"
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Back to inbox
				</Link>
			</div>

			<Card className="mb-4">
				<CardHeader>
					<CardTitle>
						{getDisciplineLabel(imported.discipline)} —{' '}
						<time dateTime={startedAt.toISOString()}>
							{startedAt.toLocaleDateString(undefined, {
								weekday: 'short',
								month: 'short',
								day: 'numeric',
							})}
						</time>
					</CardTitle>
					<CardDescription>
						{formatDuration(imported.durationSec)}
						{imported.distanceM != null
							? ` · ${formatDistance(imported.distanceM)}`
							: null}
					</CardDescription>
				</CardHeader>
			</Card>

			{actionData?.error ? (
				<p className="text-destructive mb-4 text-sm">{actionData.error}</p>
			) : null}

			{isPromoted ? (
				<Card className="mb-4">
					<CardHeader>
						<CardTitle className="text-base">Already promoted</CardTitle>
						<CardDescription>
							This import is linked to a session.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Form method="POST">
							<input type="hidden" name="intent" value="unlink" />
							<Button type="submit" variant="destructive" size="sm">
								Unlink
							</Button>
						</Form>
					</CardContent>
				</Card>
			) : (
				<>
					{candidateSessions.length > 0 ? (
						<Card className="mb-4">
							<CardHeader>
								<CardTitle className="text-base">
									Link to a planned session
								</CardTitle>
								<CardDescription>
									Sessions scheduled on the same day as this import.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-2">
								{candidateSessions.map((s) => (
									<Form key={s.id} method="POST">
										<input
											type="hidden"
											name="intent"
											value="promote-existing"
										/>
										<input type="hidden" name="sessionId" value={s.id} />
										<Button
											type="submit"
											variant="outline"
											size="sm"
											className="w-full justify-start"
										>
											{s.workout!.title} —{' '}
											{new Date(s.scheduledAt).toLocaleTimeString(undefined, {
												hour: 'numeric',
												minute: '2-digit',
											})}
											{' ('}
											{getDisciplineLabel(s.workout!.discipline)}
											{')'}
										</Button>
									</Form>
								))}
							</CardContent>
						</Card>
					) : null}

					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								Create a recording-only session
							</CardTitle>
							<CardDescription>
								Adds this activity directly to the Tape without linking to a
								planned session.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Form method="POST">
								<input type="hidden" name="intent" value="promote-new" />
								<Button type="submit" size="sm">
									Create recording-only session
								</Button>
							</Form>
						</CardContent>
					</Card>
				</>
			)}
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
