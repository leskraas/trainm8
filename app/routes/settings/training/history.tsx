import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { getThresholdHistory } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatNbDate, formatPaceClock } from '#app/utils/format.ts'
import {
	MEG_CONFIDENCE_LABELS,
	MEG_HISTORY_CONSTRUCT_LABELS,
	MEG_HISTORY_LABELS,
	MEG_PAGE_TITLES,
	MEG_THRESHOLD_KIND_LABELS,
	MEG_THRESHOLD_PROTOCOL_LABELS,
	MEG_UNIT_SUFFIX,
	nbDisciplineLabel,
} from '#app/utils/labels.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { nbDecimal } from '../__meg-text.ts'
import { MegNote, MegRows, MegSection } from '../__meg-ui.tsx'
import { type Route } from './+types/history.ts'

/**
 * **Terskelhistorikk** — every threshold change, newest first, each saying how
 * the number got here. Norwegian and on the design system since round 2.
 */
export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.history,
	getSitemapEntries: () => null,
}

const KIND_UNITS: Record<string, string> = {
	maxHr: MEG_UNIT_SUFFIX.bpm,
	lthr: MEG_UNIT_SUFFIX.bpm,
	ftp: MEG_UNIT_SUFFIX.watt,
	runPower: MEG_UNIT_SUFFIX.watt,
	thresholdPace: MEG_UNIT_SUFFIX.perKm,
	css: MEG_UNIT_SUFFIX.per100m,
	weight: MEG_UNIT_SUFFIX.kg,
}

/**
 * How the number got here, in the athlete's words rather than the enum's.
 *
 * `protocol` is the axis that actually varies (ADR 0005 as amended): an FTP from
 * a 20-minute test and an FTP from a curve fit are different numbers, and the
 * old `source` column could not tell them apart. `observed` reads shorter here
 * than on the readings page: a history line has no room for the sentence.
 */
function protocolLabel(protocol: string | null): string | null {
	if (protocol == null) return MEG_THRESHOLD_PROTOCOL_LABELS.manual
	if (protocol === 'observed') return MEG_HISTORY_LABELS.observed
	return (
		(MEG_THRESHOLD_PROTOCOL_LABELS as Record<string, string>)[protocol] ?? null
	)
}

/**
 * A threshold event value in display form. Paces render as the `mm:ss` clock
 * athletes read (`4:05` + `/km`), matching the training settings form;
 * everything else is the number with its unit, with a decimal comma where it
 * has decimals. Exported for tests.
 */
export function thresholdValueDisplay(
	kind: string,
	valueNumeric: number,
): { value: string; unit: string | undefined } {
	if (kind === 'thresholdPace' || kind === 'css') {
		return { value: formatPaceClock(valueNumeric), unit: KIND_UNITS[kind] }
	}
	return { value: nbDecimal(valueNumeric), unit: KIND_UNITS[kind] }
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
			<p className="text-body">{MEG_HISTORY_LABELS.intro}</p>

			{events.length === 0 && <MegNote>{MEG_HISTORY_LABELS.none}</MegNote>}

			{Object.entries(grouped).map(([discipline, disciplineEvents]) => (
				<MegSection
					key={discipline}
					id={`history-${discipline}`}
					title={nbDisciplineLabel(discipline)}
				>
					<MegRows>
						{disciplineEvents.map((event) => {
							const display = thresholdValueDisplay(
								event.kind,
								event.valueNumeric,
							)
							const how = protocolLabel(event.protocol) ?? event.source
							// Construct first, and only where it disagrees with the
							// column it landed in — silence here would let a critical
							// power read as an FTP nobody tested for. A grade only where
							// the app derived the number: a figure the athlete stated
							// about themselves is not graded.
							const facts = [
								event.construct
									? MEG_HISTORY_CONSTRUCT_LABELS[event.construct]
									: null,
								how,
								event.confidence
									? ((MEG_CONFIDENCE_LABELS as Record<string, string>)[
											event.confidence
										] ?? event.confidence)
									: null,
							].filter(Boolean)
							return (
								<li
									key={event.id}
									className="flex min-h-11 items-start justify-between gap-3 py-3"
								>
									<div className="min-w-0">
										<p className="text-callout">
											{MEG_THRESHOLD_KIND_LABELS[event.kind] ?? event.kind}
										</p>
										<p className="text-footnote text-muted-foreground">
											{facts.join(' · ')}
										</p>
									</div>
									<div className="shrink-0 text-right">
										<p className="text-callout tabular-nums">
											{display.value}{' '}
											<span className="text-footnote text-muted-foreground">
												{display.unit}
											</span>
										</p>
										<time
											dateTime={event.effectiveAt.toISOString()}
											className="text-footnote text-muted-foreground tabular-nums"
										>
											{formatNbDate(event.effectiveAt, timeZone)}
										</time>
									</div>
								</li>
							)
						})}
					</MegRows>
				</MegSection>
			))}
		</div>
	)
}
