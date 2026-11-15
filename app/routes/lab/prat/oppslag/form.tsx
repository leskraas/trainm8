import { useLoaderData } from 'react-router'
import {
	type PlanOutput,
	type ProgressOutput,
} from '#app/lab/engine/reads.types.ts'
import { run } from '../__data.server.ts'
import {
	FormCard,
	RecordedRows,
	RoadCard,
	VolumeCard,
	WeeksCard,
	formHeadline,
	roadHeadline,
} from '../__progress.tsx'
import { type Route } from './+types/form.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const [p, plan] = await Promise.all([
		run<ProgressOutput>(request, 'progress', { weeks: 12 }),
		run<PlanOutput>(request, 'plan', {}),
	])
	return {
		progress: p.ok ? p.value : null,
		error: p.ok ? null : p.message,
		plan: plan.ok ? plan.value : null,
	}
}

export default function OppslagForm() {
	const { progress: p, error, plan } = useLoaderData<typeof loader>()
	if (!p) return <p className="prat-err">{error}</p>
	const last = p.weekly[p.weekly.length - 1]
	return (
		<>
			<h2 className="prat-h2">Form og fremgang</h2>
			<p style={{ margin: 0 }}>{formHeadline(p)}</p>
			<FormCard p={p} />
			{last ? <VolumeCard sports={last.sports} /> : null}
			<RecordedRows p={p} />
			<WeeksCard p={p} />
			<p style={{ margin: 0 }}>{roadHeadline(p, plan)}</p>
			<RoadCard p={p} plan={plan} />
		</>
	)
}
