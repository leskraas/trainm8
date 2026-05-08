import { searchUsers } from '@prisma/client/sql'
import { Img } from 'openimg/react'
import { redirect, Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList } from '#app/components/forms.tsx'
import { SearchBar } from '#app/components/search-bar.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { cn, getUserImgSrc, useDelayedIsPending } from '#app/utils/misc.tsx'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const searchTerm = new URL(request.url).searchParams.get('search')
	if (searchTerm === '') {
		return redirect('/users')
	}

	const like = `%${searchTerm ?? ''}%`
	const users = await prisma.$queryRawTyped(searchUsers(like))
	return { status: 'idle', users } as const
}

export default function UsersRoute({ loaderData }: Route.ComponentProps) {
	const isPending = useDelayedIsPending({
		formMethod: 'GET',
		formAction: '/users',
	})

	return (
		<div className="container mt-36 mb-48 flex flex-col items-center justify-center gap-6">
			<h1 className="text-h1">Trainm8 Users</h1>
			<div className="w-full max-w-[700px]">
				<SearchBar status={loaderData.status} autoFocus autoSubmit />
			</div>
			<main>
				{loaderData.status === 'idle' ? (
					loaderData.users.length ? (
						<ul
							className={cn(
								'flex w-full flex-wrap items-center justify-center gap-4 delay-200',
								{ 'opacity-50': isPending },
							)}
						>
							{loaderData.users.map((user) => (
								<li key={user.id}>
									<Link
										to={user.username}
										className="block"
										aria-label={`${user.name || user.username} profile`}
									>
										<Card
											size="sm"
											className="bg-muted h-36 w-44 items-center justify-center rounded-lg px-5 py-3"
										>
											<CardContent className="flex w-full flex-col items-center justify-center gap-1 px-0">
												<Img
													alt={user.name ?? user.username}
													src={getUserImgSrc(user.imageObjectKey)}
													className="size-16 rounded-full"
													width={256}
													height={256}
												/>
												{user.name ? (
													<span className="text-body-md w-full truncate text-center">
														{user.name}
													</span>
												) : null}
												<span className="text-body-sm text-muted-foreground w-full truncate text-center">
													{user.username}
												</span>
											</CardContent>
										</Card>
									</Link>
								</li>
							))}
						</ul>
					) : (
						<p>No users found</p>
					)
				) : loaderData.status === 'error' ? (
					<ErrorList errors={['There was an error parsing the results']} />
				) : null}
			</main>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
