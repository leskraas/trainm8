/**
 * Meg's Form and Rekorder sections — the markup for the readings
 * `__me-form-records-presenter.ts` builds. They were the home hero's Form and
 * Records panes until the hero went (#505); on Meg they are cards in the
 * page's reading order instead of panes in a carousel, so they lose the
 * kicker-and-pager dress and keep the content.
 *
 * Figures are `tabular-nums` and on the type scale's steps (ADR 0085 §3). The
 * one figure with a range — how far the cold-start gate has come — is a
 * `Progress`, because it is a task getting done; nothing else here has a range
 * the app can stand behind (Form has bands, not bounds).
 */
import { LoadLegendLabel } from '#app/components/load-legend.tsx'
import { SourceCredits } from '#app/components/source-credits.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import {
	Progress,
	ProgressLabel,
	ProgressValue,
} from '#app/components/ui/progress.tsx'
import { ME_FORM_LABELS, ME_RECORD_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	type FormReading,
	type RecordLine,
} from './__me-form-records-presenter.ts'

/** The heading every Meg section wears, so the page reads as one list. */
export function MeSectionHeading({
	id,
	children,
}: {
	id: string
	children: React.ReactNode
}) {
	return (
		<h2 id={id} className="text-overline text-muted-foreground mb-2 uppercase">
			{children}
		</h2>
	)
}

export function FormSection({
	reading,
	credits = [],
}: {
	reading: FormReading
	credits?: string[]
}) {
	return (
		<section aria-labelledby="me-form" className="mt-8">
			<MeSectionHeading id="me-form">{ME_FORM_LABELS.title}</MeSectionHeading>
			<Card size="sm">
				<CardContent className="flex flex-col gap-4">
					<dl className="grid grid-cols-3 gap-3">
						{reading.stats.map((stat) => (
							// `dt` before `dd` in the markup, reversed in the layout: the
							// number reads first and the term explains it, but a definition
							// list says what it is defining before it defines it.
							<div
								key={stat.key}
								data-testid={`me-form-${stat.key}`}
								className="flex min-w-0 flex-col-reverse gap-1"
							>
								<dt className="text-caption text-muted-foreground">
									{/* The plain word is what is written (`Kondisjon`, never
									    `Kond`); the trigger's accessible name is the term with
									    its abbreviation (#181), and a tap opens what it means. */}
									<LoadLegendLabel legend={stat.legend} />
								</dt>
								<dd
									className={cn(
										stat.value != null
											? 'text-title tabular-nums'
											: // Same line box as a figure, so a missing number
												// does not pull the row of terms up out of line.
												'text-callout text-muted-foreground flex h-[30px] items-end',
									)}
								>
									{stat.value ?? ME_FORM_LABELS.notMeasured}
								</dd>
							</div>
						))}
					</dl>

					{reading.state || reading.trust ? (
						<p className="text-footnote text-muted-foreground tabular-nums">
							{reading.state ? (
								<span className="text-foreground font-medium">
									{reading.state}
								</span>
							) : null}
							{reading.state && reading.trust ? ' · ' : null}
							{reading.trust}
						</p>
					) : null}

					{reading.unmeasured ? (
						<p
							data-testid="me-form-unmeasured"
							className="text-footnote text-foreground/80"
						>
							{reading.unmeasured}
						</p>
					) : null}

					{reading.baseline ? (
						<Progress
							value={reading.baseline.day}
							max={reading.baseline.required}
							getAriaValueText={() => reading.baseline!.label}
							className="gap-2"
						>
							<ProgressLabel className="text-footnote font-medium">
								{ME_FORM_LABELS.baseline}
							</ProgressLabel>
							<ProgressValue className="text-footnote">
								{() => reading.baseline!.label}
							</ProgressValue>
						</Progress>
					) : null}

					{reading.trend ? (
						<p className="text-footnote text-muted-foreground tabular-nums">
							{reading.trend}
						</p>
					) : null}

					<SourceCredits credits={credits} />
				</CardContent>
			</Card>
		</section>
	)
}

export function RecordsSection({
	records,
	credits = [],
}: {
	records: RecordLine[]
	credits?: string[]
}) {
	return (
		<section aria-labelledby="me-records" className="mt-8">
			<MeSectionHeading id="me-records">
				{ME_RECORD_LABELS.title}
			</MeSectionHeading>
			<Card size="sm">
				<CardContent>
					{records.length === 0 ? (
						// Never a zero and never an empty card: what will make one.
						<p className="text-footnote text-muted-foreground">
							{ME_RECORD_LABELS.none}
						</p>
					) : (
						<>
							<ul className="divide-border/60 flex flex-col divide-y">
								{records.map((record) => (
									<li
										key={`${record.discipline}-${record.label}`}
										// The gain and the date wrap under the record on a
										// narrow phone rather than squeezing its name to two
										// lines (`Lengste` / `løpetur` at 320px).
										className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0"
									>
										<span className="flex min-w-0 flex-col gap-0.5">
											<span className="text-footnote text-muted-foreground">
												{record.label}
											</span>
											<span className="text-heading tabular-nums">
												{record.value}
											</span>
										</span>
										<span className="text-footnote text-muted-foreground ml-auto flex min-w-0 flex-col items-end gap-0.5 text-right tabular-nums">
											<span className="text-foreground">{record.gain}</span>
											<span>{record.setOn}</span>
										</span>
									</li>
								))}
							</ul>
							<p className="text-caption text-muted-foreground mt-3">
								{ME_RECORD_LABELS.source}
							</p>
							<SourceCredits credits={credits} className="mt-1" />
						</>
					)}
				</CardContent>
			</Card>
		</section>
	)
}
