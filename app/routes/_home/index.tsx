import { useLoaderData } from 'react-router'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { getUserId } from '#app/utils/auth.server.ts'
import { SUSTAINED_WEEKS, sustainedAdherence } from '#app/utils/load/coach.ts'
import {
	getCurrentLoad,
	getLoadSnapshots,
	getTsbTrust,
} from '#app/utils/load/snapshot.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { getRecentSessionLogs } from '#app/utils/session-log.server.ts'
import {
	getActivePlan,
	getRecentWeeklyAdherence,
	getSessionLedger,
	getWeeklyAdherence,
} from '#app/utils/training.server.ts'
import { logos } from './+logos/logos.ts'
import { type Route } from './+types/index.ts'
import { Cockpit } from './cockpit/cockpit.tsx'

export const meta: Route.MetaFunction = () => [{ title: 'Trainm8' }]

// How many trailing weeks the home "build" chart spans. The same series feeds
// sustained-adherence detection (which walks back from the current week, so a
// longer window is a strict superset of the SUSTAINED_WEEKS the coach needs).
const BUILD_WEEKS = Math.max(8, SUSTAINED_WEEKS)

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await getUserId(request)
	if (!userId) {
		return { isAuthenticated: false as const }
	}
	const [
		recentLogs,
		ledger,
		currentLoad,
		snapshots,
		tsbTrust,
		activePlan,
		weeklyAdherence,
		weeklyBuild,
	] = await Promise.all([
		getRecentSessionLogs(userId),
		getSessionLedger(userId),
		getCurrentLoad(userId),
		getLoadSnapshots(userId, 90),
		getTsbTrust(userId),
		getActivePlan(userId),
		getWeeklyAdherence(userId),
		getRecentWeeklyAdherence(userId, BUILD_WEEKS),
	])
	return {
		isAuthenticated: true as const,
		now: new Date(),
		recentLogs,
		ledger,
		current: currentLoad
			? { ctl: currentLoad.ctl, atl: currentLoad.atl, tsb: currentLoad.tsb }
			: null,
		snapshots: snapshots.map((s) => ({
			date: s.date,
			ctl: s.ctl,
			atl: s.atl,
			tsb: s.tsb,
		})),
		tsbTrust,
		activePlan,
		weeklyAdherence,
		weeklyBuild,
		sustained: sustainedAdherence(weeklyBuild),
	}
}

export default function Index() {
	const data = useLoaderData<typeof loader>()

	if (!data.isAuthenticated) {
		return <MarketingLanding />
	}

	return <Cockpit data={data} />
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
