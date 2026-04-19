import { invariantResponse } from '@epic-web/invariant'
import { Img } from 'openimg/react'
import {
	type LoaderFunctionArgs,
	Form,
	Link,
	useLoaderData,
} from 'react-router'
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
import { Icon } from '#app/components/ui/icon.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { getUpcomingSessions } from '#app/utils/training.server.ts'
import {
	formatSessionTime,
	getStatusLabel,
	getStatusVariant,
} from '#app/utils/training.ts'
import { useOptionalUser } from '#app/utils/user.ts'
import { type Route } from './+types/index.ts'

const UPCOMING_SUMMARY_LIMIT = 3

export async function loader({ params, request }: LoaderFunctionArgs) {
	const user = await prisma.user.findFirst({
		select: {
			id: true,
			name: true,
			username: true,
			createdAt: true,
			image: { select: { id: true, objectKey: true } },
		},
		where: {
			username: params.username,
		},
	})

	invariantResponse(user, 'User not found', { status: 404 })

	const loggedInUserId = await getUserId(request)
	const upcomingSessions =
		loggedInUserId === user.id ? await getUpcomingSessions(user.id) : []

	return {
		user,
		userJoinedDisplay: user.createdAt.toLocaleDateString(),
		upcomingSessions,
	}
}

export default function ProfileRoute() {
	const data = useLoaderData<typeof loader>()
	const user = data.user
	const userDisplayName = user.name ?? user.username
	const loggedInUser = useOptionalUser()
	const isLoggedInUser = user.id === loggedInUser?.id
	const upcomingSummary = data.upcomingSessions.slice(0, UPCOMING_SUMMARY_LIMIT)

	return (
		<div className="container mt-36 mb-48 flex flex-col items-center justify-center">
			<Card className="bg-muted container mt-4 flex flex-col items-center rounded-3xl p-12">
				<div className="relative w-52">
					<div className="absolute -top-40">
						<div className="relative">
							<Img
								src={getUserImgSrc(data.user.image?.objectKey)}
								alt={userDisplayName}
								className="size-52 rounded-full object-cover"
								width={832}
								height={832}
							/>
						</div>
					</div>
				</div>

				<CardContent className="mt-20 px-0">
					<div className="flex flex-col items-center">
						<div className="flex flex-wrap items-center justify-center gap-4">
							<h1 className="text-h2 text-center">{userDisplayName}</h1>
						</div>
						<p className="text-muted-foreground mt-2 text-center">
							Joined {data.userJoinedDisplay}
						</p>
						{isLoggedInUser ? (
							<Form action="/logout" method="POST" className="mt-3">
								<Button type="submit" variant="link">
									<Icon name="exit" className="scale-125 max-md:scale-150">
										Logout
									</Icon>
								</Button>
							</Form>
						) : null}
						<div className="mt-10 flex gap-4">
							{isLoggedInUser ? (
								<>
									<Link
										className={buttonVariants({
											variant: 'default',
											size: 'lg',
										})}
										to="notes"
										prefetch="intent"
									>
										My notes
									</Link>
									<Link
										className={buttonVariants({
											variant: 'default',
											size: 'lg',
										})}
										to="/training/upcoming"
										prefetch="intent"
									>
										Training
									</Link>
									<Link
										className={buttonVariants({
											variant: 'default',
											size: 'lg',
										})}
										to="/settings/profile"
										prefetch="intent"
									>
										Edit profile
									</Link>
								</>
							) : (
								<Link
									className={buttonVariants({ variant: 'default', size: 'lg' })}
									to="notes"
									prefetch="intent"
								>
									{userDisplayName}'s notes
								</Link>
							)}
						</div>
					</div>
				</CardContent>
			</Card>
			{isLoggedInUser ? (
				<Card className="container mt-6 max-w-4xl rounded-3xl">
					<CardHeader>
						<CardTitle>Upcoming workouts</CardTitle>
						<CardDescription>
							Your next sessions from the 14-day training window.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{upcomingSummary.length > 0 ? (
							<ul className="space-y-3">
								{upcomingSummary.map((session) => (
									<li
										key={session.id}
										className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
									>
										<div>
											<p className="font-medium">{session.workout.title}</p>
											<p className="text-muted-foreground text-sm">
												{formatSessionTime(session.scheduledAt)}
											</p>
										</div>
										<Badge variant={getStatusVariant(session.status)}>
											{getStatusLabel(session.status)}
										</Badge>
									</li>
								))}
							</ul>
						) : (
							<p className="text-muted-foreground text-sm">
								No upcoming sessions scheduled.
							</p>
						)}
						<Link
							className={buttonVariants({ variant: 'outline' })}
							to="/training/upcoming"
							prefetch="intent"
						>
							View full upcoming plan
						</Link>
					</CardContent>
				</Card>
			) : null}
		</div>
	)
}

export const meta: Route.MetaFunction = ({ data, params }) => {
	const displayName = data?.user.name ?? params.username
	return [
		{ title: `${displayName} | Epic Notes` },
		{
			name: 'description',
			content: `Profile of ${displayName} on Epic Notes`,
		},
	]
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: ({ params }) => (
					<p>No user with the username "{params.username}" exists</p>
				),
			}}
		/>
	)
}
