import { Link, useLoaderData } from 'react-router'
import {
	type PlanOutput,
	type ProgressOutput,
	type TodayOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { type Route } from './+types/status.ts'
import { BASE } from './__api.ts'
import { athleteOrStart, statusSessions } from './__load.server.ts'
import { BackDown, usePullBack } from './__nav.tsx'
import { StatusView } from './__status.tsx'

export const meta = () => [{ title: 'Status · Tommel' }]

export async function loader({ request }: Route.LoaderArgs) {
	await athleteOrStart(request)
	const weeks = Math.min(
		26,
		Math.max(4, Number(new URL(request.url).searchParams.get('uker')) || 4),
	)
	const today = await runCapability(request, 'today', {})
	if (!today.ok) throw new Response(today.message, { status: 500 })
	const t = today.value as TodayOutput
	const [progress, plan, sessions] = await Promise.all([
		runCapability(request, 'progress', { weeks: 12 }),
		runCapability(request, 'plan', {}),
		statusSessions(request, t.date, weeks),
	])
	return {
		today: t,
		progress: progress.ok ? (progress.value as ProgressOutput) : null,
		plan: plan.ok ? (plan.value as PlanOutput) : null,
		sessions,
		weeks,
	}
}

export default function Status() {
	const { today, progress, plan, sessions, weeks } =
		useLoaderData<typeof loader>()
	usePullBack()
	return (
		<main className="tm-page" aria-label="Status">
			<BackDown />
			<StatusView
				progress={progress}
				plan={plan}
				today={today}
				sessions={sessions}
				more={
					weeks < 26 ? (
						<div
							style={{
								marginTop: 18,
								display: 'flex',
								justifyContent: 'center',
							}}
						>
							<Link
								to={`${BASE}/status?uker=${weeks + 4}`}
								className="tm-pill"
								preventScrollReset
							>
								Vis fire uker til
							</Link>
						</div>
					) : null
				}
			/>
		</main>
	)
}
