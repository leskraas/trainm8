import { useLoaderData } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { useRevalidateOnImportEvent } from '#app/utils/imports-events.ts'
import { HOME_TIMELINE_FULL_VIEW_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { logos } from './+logos/logos.ts'
import { type Route } from './+types/index.ts'
import { CalmToday } from './__calm-today-view.tsx'
import { homeTimelineAction, readHomeTimeline } from './home-timeline.server.ts'

export const meta: Route.MetaFunction = () => [{ title: 'Trainm8' }]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await getUserId(request)
	if (!userId) {
		return { isAuthenticated: false as const }
	}
	return { isAuthenticated: true as const, ...(await readHomeTimeline(userId)) }
}

export async function action({ request }: Route.ActionArgs) {
	return homeTimelineAction({ request })
}

export default function Index() {
	const data = useLoaderData<typeof loader>()

	if (!data.isAuthenticated) {
		return <MarketingLanding />
	}

	return <AuthenticatedHome data={data} />
}

/**
 * The athlete's home surface, split out so the Live Imports Stream only opens
 * for a signed-in athlete (the SSE resource route requires auth, and hooks
 * can't sit behind the `isAuthenticated` branch above).
 *
 * I dag opens on its calm default view (spec #558 S4, ADR 0101 §3): today's
 * card and this week. The full Home Timeline is _Se hele sesongen_
 * (`/season`), which reads and writes through the same server module — so
 * this route keeps the timeline's whole loader and action, and every write
 * the default view makes (_Gjort_, the composer, its undo) lands here.
 */
function AuthenticatedHome({
	data,
}: {
	data: Extract<Awaited<ReturnType<typeof loader>>, { isAuthenticated: true }>
}) {
	// The Live Imports Stream lands here now that imports auto-save (ADR 0049):
	// a new activity becomes a Workout Session on The Tape, so this surface — not
	// a queue of things to link — is what refreshes when one arrives (#75).
	useRevalidateOnImportEvent()

	return <CalmToday data={data} />
}

const columnClasses: Record<(typeof logos)[number]['column'], string> = {
	1: 'xl:col-start-1',
	2: 'xl:col-start-2',
	3: 'xl:col-start-3',
	4: 'xl:col-start-4',
	5: 'xl:col-start-5',
}
const rowClasses: Record<(typeof logos)[number]['row'], string> = {
	1: 'xl:row-start-1',
	2: 'xl:row-start-2',
	3: 'xl:row-start-3',
	4: 'xl:row-start-4',
	5: 'xl:row-start-5',
	6: 'xl:row-start-6',
}

function MarketingLanding() {
	return (
		<main className="font-poppins grid h-full place-items-center">
			<div className="grid place-items-center px-4 py-16 xl:grid-cols-2 xl:gap-24">
				<div className="flex max-w-md flex-col items-center text-center xl:order-2 xl:items-start xl:text-left">
					<a
						href="https://www.epicweb.dev/stack"
						className="animate-slide-top xl:animate-slide-left [animation-fill-mode:backwards] xl:[animation-delay:0.5s] xl:[animation-fill-mode:backwards]"
					>
						<svg
							className="text-foreground size-20 xl:-mt-4"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 65 65"
						>
							<path
								fill="currentColor"
								d="M39.445 25.555 37 17.163 65 0 47.821 28l-8.376-2.445Zm-13.89 0L28 17.163 0 0l17.179 28 8.376-2.445Zm13.89 13.89L37 47.837 65 65 47.821 37l-8.376 2.445Zm-13.89 0L28 47.837 0 65l17.179-28 8.376 2.445Z"
							></path>
						</svg>
					</a>
					<h1
						data-heading
						className="animate-slide-top text-foreground xl:animate-slide-left mt-8 text-4xl font-medium [animation-delay:0.3s] [animation-fill-mode:backwards] md:text-5xl xl:mt-4 xl:text-6xl xl:[animation-delay:0.8s] xl:[animation-fill-mode:backwards]"
					>
						<a href="https://www.epicweb.dev/stack">The Epic Stack</a>
					</h1>
					<p
						data-paragraph
						className="animate-slide-top text-muted-foreground xl:animate-slide-left mt-6 text-xl/7 [animation-delay:0.8s] [animation-fill-mode:backwards] xl:mt-8 xl:text-xl/6 xl:leading-10 xl:[animation-delay:1s] xl:[animation-fill-mode:backwards]"
					>
						Check the{' '}
						<a
							className="underline hover:no-underline"
							href="https://github.com/epicweb-dev/epic-stack/blob/main/docs/getting-started.md"
						>
							Getting Started guide
						</a>{' '}
						file for how to get your project off the ground!
					</p>
				</div>
				<ul className="mt-16 flex max-w-3xl flex-wrap justify-center gap-2 sm:gap-4 xl:mt-0 xl:grid xl:grid-flow-col xl:grid-cols-5 xl:grid-rows-6">
					<TooltipProvider>
						{logos.map((logo, i) => (
							<li
								key={logo.href}
								className={cn(
									columnClasses[logo.column],
									rowClasses[logo.row],
									'animate-roll-reveal [animation-fill-mode:backwards]',
								)}
								style={{ animationDelay: `${i * 0.07}s` }}
							>
								<Tooltip>
									<TooltipTrigger
										render={
											<a
												href={logo.href}
												className="grid size-20 place-items-center rounded-2xl bg-violet-600/10 p-4 transition hover:-rotate-6 hover:bg-violet-600/15 sm:size-24 dark:bg-violet-200 dark:hover:bg-violet-100"
											>
												<img src={logo.src} alt="" />
											</a>
										}
									/>
									<TooltipContent>{logo.alt}</TooltipContent>
								</Tooltip>
							</li>
						))}
					</TooltipProvider>
				</ul>
			</div>
		</main>
	)
}

/**
 * Home is the default post-login destination and its loader is the widest in the
 * app — a 182-day session ledger, load snapshots, adherence, personal records
 * and a strength count — so it is also the route with the most ways to fail.
 * Without a boundary of its own every one of them fell through to the root, and
 * a failed query cost the athlete the wordmark row and the way back to anything
 * else. Caught here, the failure stays the size it is: one screen, inside the
 * app.
 *
 * The 404 handler is not decoration. `GeneralErrorBoundary`'s default prints the
 * status and the server's own string, which reads the same whether the athlete's
 * training could not be found or something broke — one of those is a state they
 * can act on and the other is a bug, and they should not sound alike.
 */
export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => <p>{HOME_TIMELINE_FULL_VIEW_LABELS.notFound}</p>,
			}}
		/>
	)
}
