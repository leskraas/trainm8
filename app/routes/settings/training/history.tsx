import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import { getThresholdHistory } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatDate, formatPaceClock } from '#app/utils/format.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import {
	DISCIPLINE_LABELS,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/history.ts'

export const handle: SEOHandle = { getSitemapEntries: () => null }

const KIND_LABELS: Record<string, string> = {
	maxHr: 'Max HR',
	lthr: 'LTHR',
	ftp: 'FTP',
	thresholdPace: 'Threshold Pace',
	css: 'CSS',
	weight: 'Weight',
}

const KIND_UNITS: Record<string, string> = {
	maxHr: 'bpm',
	lthr: 'bpm',
	ftp: 'W',
	thresholdPace: '/km',
	css: '/100m',
	weight: 'kg',
}

/**
 * A threshold event value in display form. Paces render as the `mm:ss` clock
 * athletes read (`4:05` + `/km`), matching the Training Settings form and
 * `formatPace`/`formatSwimPace`; everything else stays the raw number with its
 * unit. Exported for tests.
 */
export function thresholdValueDisplay(
	kind: string,
	valueNumeric: number,
): { value: string; unit: string | undefined } {
	if (kind === 'thresholdPace' || kind === 'css') {
		return { value: formatPaceClock(valueNumeric), unit: KIND_UNITS[kind] }
	}
	return { value: String(valueNumeric), unit: KIND_UNITS[kind] }
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const events = await getThresholdHistory(userId)
	return { events }
}

export default function ThresholdHistoryPage({
	loaderData,
}: Route.ComponentProps) {
	const { events } = loaderData
	const timeZone = useAthleteTimezone()

	const grouped = events.reduce<Record<string, typeof events>>((acc, event) => {
		if (!acc[event.discipline]) acc[event.discipline] = []
		acc[event.discipline]!.push(event)
		return acc
	}, {})

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h1 className="text-h1">Threshold History</h1>
				<p className="text-body-md text-muted-foreground mt-2">
					Every threshold change, newest first.
				</p>
				<div className="mt-2">
					<Link
						to="/settings/training"
						className="text-body-sm text-muted-foreground hover:text-foreground underline"
					>
						← Back to training settings
					</Link>
				</div>
			</div>

			{events.length === 0 && (
				<p className="text-muted-foreground text-body-sm">
					No threshold changes recorded yet.
				</p>
			)}

			{Object.entries(grouped).map(([discipline, disciplineEvents]) => (
				<section key={discipline}>
					<h2 className="text-h4 mb-3">
						{DISCIPLINE_LABELS[discipline as Discipline] ?? discipline}
					</h2>
					<div className="flex flex-col gap-2">
						{disciplineEvents.map((event) => {
							const display = thresholdValueDisplay(
								event.kind,
								event.valueNumeric,
							)
							return (
								<div
									key={event.id}
									className="bg-background flex items-center justify-between rounded-lg px-4 py-3 text-sm"
								>
									<div className="flex items-center gap-3">
										<span className="text-muted-foreground w-32 font-medium">
											{KIND_LABELS[event.kind] ?? event.kind}
										</span>
										<span className="font-mono">
											{display.value}{' '}
											<span className="text-muted-foreground text-xs">
												{display.unit}
											</span>
										</span>
									</div>
									<div className="text-muted-foreground flex items-center gap-4 text-xs">
										<span>{event.source}</span>
										<time dateTime={event.effectiveAt.toISOString()}>
											{formatDate(event.effectiveAt, timeZone)}
										</time>
									</div>
								</div>
							)
						})}
					</div>
				</section>
			))}
		</div>
	)
}
