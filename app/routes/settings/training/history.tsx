import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { getThresholdHistory } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatDate, formatPaceClock } from '#app/utils/format.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import {
	DISCIPLINE_LABELS,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/history.ts'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: 'Threshold History',
	getSitemapEntries: () => null,
}

const KIND_LABELS: Record<string, string> = {
	maxHr: 'Max HR',
	lthr: 'LTHR',
	ftp: 'FTP',
	runPower: 'Run power',
	thresholdPace: 'Threshold Pace',
	css: 'CSS',
	weight: 'Weight',
}

const KIND_UNITS: Record<string, string> = {
	maxHr: 'bpm',
	lthr: 'bpm',
	ftp: 'W',
	runPower: 'W',
	thresholdPace: '/km',
	css: '/100m',
	weight: 'kg',
}

/**
 * How the number got here, in the athlete's words rather than the enum's.
 *
 * `protocol` is the axis that actually varies (ADR 0005 as amended): an FTP from
 * a 20-minute test and an FTP from a curve fit are different numbers, and the
 * old `source` column could not tell them apart.
 */
const PROTOCOL_LABELS: Record<string, string> = {
	manual: 'you typed it',
	tt60: '60-minute test',
	ftp20: '20-minute test',
	ramp: 'ramp test',
	'cp-fit': 'fitted to your best efforts',
	'race-equivalence': 'from a race result',
	observed: 'observed',
	tanaka: 'estimated from your age',
	provider: 'from a connected account',
}

/**
 * The construct, shown **only where it differs from the column it landed in**.
 *
 * The one live case is a **critical power** filed under `ftp`: the two are
 * different quantities (CP 256 ± 50 W vs FTP 249 ± 44 W, limits of agreement −19
 * to +33 W), and the whole reason the column exists is so this row can say which
 * it is instead of the history quietly claiming an FTP nobody tested for.
 */
const CONSTRUCT_LABELS: Record<string, string> = {
	cp: 'critical power',
	criticalSpeed: 'critical speed',
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
			<p className="text-body-md text-muted-foreground">
				Every threshold change, newest first.
			</p>

			{events.length === 0 && (
				<p className="text-muted-foreground text-body-sm">
					No threshold changes recorded yet.
				</p>
			)}

			{Object.entries(grouped).map(([discipline, disciplineEvents]) => (
				<section key={discipline}>
					<h2 className="mb-3 text-lg font-semibold">
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
									<div className="text-muted-foreground flex items-center gap-3 text-xs">
										{/* Construct first, and only where it disagrees with the
										    column it landed in — silence here would let a critical
										    power read as an FTP nobody tested for. */}
										{event.construct &&
										CONSTRUCT_LABELS[event.construct] != null ? (
											<span>{CONSTRUCT_LABELS[event.construct]}</span>
										) : null}
										<span>
											{PROTOCOL_LABELS[event.protocol ?? 'manual'] ??
												event.protocol ??
												event.source}
										</span>
										{/* A grade only where the app derived the number: a figure
										    the athlete stated about themselves is not graded. */}
										{event.confidence ? <span>{event.confidence}</span> : null}
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
