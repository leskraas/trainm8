import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, Form, Link } from 'react-router'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { setDisciplineThresholds } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatPaceClock } from '#app/utils/format.ts'
import {
	MEG_ANALYZE_LABELS,
	MEG_COMMON_LABELS,
	MEG_CONFIDENCE_LABELS,
	MEG_CONSTRUCT_CAVEATS,
	MEG_CONSTRUCT_LABELS,
	MEG_ESTIMATE_REFUSAL_LABELS,
	MEG_PAGE_TITLES,
	MEG_THRESHOLD_PROTOCOL_LABELS,
	MEG_UNIT_SUFFIX,
	NB_DISCIPLINE_LABELS,
} from '#app/utils/labels.ts'
import {
	acceptancePlan,
	analyseProfile,
	findEstimate,
	type ProfileAnalysis,
} from '#app/utils/profile-analysis/analyze.server.ts'
import {
	type EstimateConfidence,
	type ThresholdConstruct,
	THRESHOLD_CONSTRUCTS,
	type ThresholdEstimate,
} from '#app/utils/profile-analysis/types.ts'
import {
	CARDIO_DISCIPLINES,
	type CardioDiscipline,
} from '#app/utils/workout-schema.ts'
import { nbDecimal, nbSeconds } from '../__meg-text.ts'
import { MegNote, MegSection } from '../__meg-ui.tsx'
import { type Route } from './+types/analyze.ts'

/**
 * **Det historikken din sier** — the first surface that reads an athlete's own
 * imported training and tells them something about themselves.
 *
 * Every row is a **proposal**. Nothing on this screen writes a threshold until
 * the athlete accepts one, which is ADR 0050's derived-then-authored rule (set
 * for **Weekly Capacity**) applied to the numbers that matter most. What the app
 * asserts on its own is that it *read* something; what it never asserts is that
 * this is the athlete's number.
 *
 * The copy budget is deliberate. Each row is one line and one caveat; the
 * derivation waits behind a tap (#437's rule — a source may wait behind a tap,
 * an absence may not). A refusal is never hidden, because that is the absence.
 * Norwegian and on cards since round 2 (ADR 0081/0085); the action is unchanged.
 */

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.analyze,
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	return { analysis: await analyseProfile(userId) }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const discipline = String(formData.get('discipline') ?? '')
	const construct = String(formData.get('construct') ?? '')

	if (!isCardio(discipline) || !isConstruct(construct)) {
		return data({ error: MEG_ANALYZE_LABELS.unknown }, { status: 400 })
	}

	// Re-run the analysis server-side rather than trusting the value the browser
	// posted back — the rule `approveSeason` already holds for a generated season
	// (ADR 0053 §2). The engine is deterministic over the same history, so
	// re-deriving is exact, and an athlete cannot accept a number the app never
	// produced.
	const analysis = await analyseProfile(userId)
	const estimate = findEstimate(analysis, discipline, construct)
	if (!estimate) {
		return data({ error: MEG_ANALYZE_LABELS.gone }, { status: 409 })
	}

	const plan = acceptancePlan(estimate)
	await setDisciplineThresholds(
		userId,
		discipline,
		{ [plan.column]: plan.value },
		{
			construct: plan.construct,
			protocol: plan.protocol,
			confidence: plan.confidence,
		},
	)
	return { error: null }
}

function isCardio(value: string): value is CardioDiscipline {
	return (CARDIO_DISCIPLINES as readonly string[]).includes(value)
}

function isConstruct(value: string): value is ThresholdConstruct {
	return (THRESHOLD_CONSTRUCTS as readonly string[]).includes(value)
}

const CONFIDENCE_VARIANT: Record<
	EstimateConfidence,
	'default' | 'secondary' | 'outline'
> = { high: 'default', medium: 'secondary', low: 'outline' }

/** A value in the unit its construct implies. */
function displayValue(construct: ThresholdConstruct, value: number) {
	const U = MEG_UNIT_SUFFIX
	switch (construct) {
		case 'maxHr':
		case 'lthr':
			return { value: String(value), unit: U.bpm }
		case 'ftp':
		case 'cp':
		case 'runPower':
			return { value: String(value), unit: U.watt }
		case 'thresholdPace':
		case 'criticalSpeed':
			return { value: formatPaceClock(value), unit: U.perKm }
		case 'css':
			return { value: formatPaceClock(value), unit: U.per100m }
	}
}

export default function AnalyzeProfileRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { analysis } = loaderData
	const L = MEG_ANALYZE_LABELS

	return (
		<div className="flex flex-col gap-8">
			<p className="text-body">
				{L.intro(analysis.activitiesRead, analysis.windowDays)}
			</p>

			{actionData?.error ? (
				<p className="text-footnote text-destructive" role="alert">
					{actionData.error}
				</p>
			) : null}

			{analysis.activitiesRead === 0 ? (
				<Card size="sm">
					<CardContent className="flex flex-col items-start gap-3">
						<p className="text-body">{L.noActivities}</p>
						<Link
							to="/settings/integrations"
							className={buttonVariants({ variant: 'outline' })}
						>
							{L.connect}
						</Link>
					</CardContent>
				</Card>
			) : null}

			{CARDIO_DISCIPLINES.map((discipline) => (
				<DisciplineSection
					key={discipline}
					discipline={discipline}
					analysis={analysis}
				/>
			))}

			<MegNote>
				{L.footer}
				<Link
					to="/settings/training"
					className="text-foreground underline underline-offset-4"
				>
					{L.footerLink}
				</Link>
				{L.footerEnd}
			</MegNote>
		</div>
	)
}

function DisciplineSection({
	discipline,
	analysis,
}: {
	discipline: CardioDiscipline
	analysis: ProfileAnalysis
}) {
	const rows = analysis.estimates.filter(
		(estimate) => estimate.discipline === discipline,
	)
	if (rows.length === 0) return null

	return (
		<MegSection
			id={`reading-${discipline}`}
			title={NB_DISCIPLINE_LABELS[discipline]}
		>
			<ul className="flex flex-col gap-3">
				{rows.map((estimate) => (
					<li key={`${estimate.discipline}-${estimate.construct}`}>
						<EstimateRow estimate={estimate} analysis={analysis} />
					</li>
				))}
			</ul>
		</MegSection>
	)
}

/** The row's name and figure on one line; the figure never truncates. */
function RowHead({
	label,
	figure,
}: {
	label: string
	figure: React.ReactNode
}) {
	return (
		<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
			<span className="text-callout min-w-0 font-semibold">{label}</span>
			<span className="shrink-0">{figure}</span>
		</div>
	)
}

function EstimateRow({
	estimate,
	analysis,
}: {
	estimate: ThresholdEstimate
	analysis: ProfileAnalysis
}) {
	const L = MEG_ANALYZE_LABELS
	const label = MEG_CONSTRUCT_LABELS[estimate.construct]

	if (estimate.kind === 'refusal') {
		// An **Unavailable Metric**: stated in place, never omitted and never
		// deferred behind a tap (#437). The reason is one sentence.
		return (
			<Card size="sm">
				<CardContent className="flex flex-col gap-1">
					<RowHead
						label={label}
						figure={
							<span className="text-footnote text-muted-foreground">
								{MEG_COMMON_LABELS.unavailable}
							</span>
						}
					/>
					<MegNote>{MEG_ESTIMATE_REFUSAL_LABELS[estimate.refusal]}</MegNote>
				</CardContent>
			</Card>
		)
	}

	const display = displayValue(estimate.construct, estimate.value)
	const caveat = MEG_CONSTRUCT_CAVEATS[estimate.construct]
	const stored = analysis.stored[estimate.discipline]
	const current = storedValueFor(stored, estimate.construct)

	return (
		<Card size="sm">
			<CardContent className="flex flex-col gap-2">
				<RowHead
					label={label}
					figure={
						<span className="text-heading tabular-nums">
							{display.value}{' '}
							<span className="text-footnote text-muted-foreground font-normal">
								{display.unit}
							</span>
						</span>
					}
				/>

				<div className="flex flex-wrap items-center gap-2">
					<Badge variant={CONFIDENCE_VARIANT[estimate.confidence]}>
						{MEG_CONFIDENCE_LABELS[estimate.confidence]}
					</Badge>
					<span className="text-footnote text-muted-foreground">
						{MEG_THRESHOLD_PROTOCOL_LABELS[estimate.protocol]}
					</span>
				</div>

				{caveat ? <MegNote>{caveat}</MegNote> : null}

				{current != null ? (
					<MegNote className="tabular-nums">
						{L.saved(formatStored(estimate.construct, current))}
					</MegNote>
				) : null}

				<Collapsible>
					<CollapsibleTrigger className="text-footnote text-muted-foreground group/how -ml-1 flex min-h-11 items-center gap-1 rounded-2xl px-1">
						<Icon
							name="chevron-right"
							size="sm"
							className="duration-collapse transition-transform ease-out group-data-[panel-open]/how:rotate-90 motion-reduce:transition-none"
							aria-hidden="true"
						/>
						{L.how}
					</CollapsibleTrigger>
					<CollapsibleContent>
						<Derivation estimate={estimate} />
					</CollapsibleContent>
				</Collapsible>

				<Form method="POST">
					<input type="hidden" name="discipline" value={estimate.discipline} />
					<input type="hidden" name="construct" value={estimate.construct} />
					<Button type="submit" variant="outline" className="w-full sm:w-auto">
						{current == null ? L.use : L.replace}
					</Button>
				</Form>
			</CardContent>
		</Card>
	)
}

/** The derivation, behind the tap: what was read, what was refused, how well it fit. */
function Derivation({
	estimate,
}: {
	estimate: Extract<ThresholdEstimate, { kind: 'estimate' }>
}) {
	const L = MEG_ANALYZE_LABELS
	const { basis } = estimate
	return (
		<dl className="text-footnote text-muted-foreground space-y-1 pt-1 pb-2">
			<Fact
				term={L.readFrom}
				detail={L.readFromDetail(basis.contributingCount, basis.activityCount)}
			/>
			{basis.durationsUsedSec.length > 0 ? (
				<Fact
					term={L.effortsUsed}
					detail={basis.durationsUsedSec.map(nbSeconds).join(', ')}
				/>
			) : null}
			{basis.durationsRefusedSec.length > 0 ? (
				<Fact
					term={L.tooCoarse}
					detail={L.tooCoarseDetail(
						basis.durationsRefusedSec.map(nbSeconds).join(', '),
					)}
				/>
			) : null}
			{basis.rSquared != null ? (
				<Fact term={L.fit} detail={`r² ${nbDecimal(basis.rSquared, 2)}`} />
			) : null}
			{estimate.companion ? (
				<Fact
					term={estimate.companion.label}
					detail={L.companionDetail(String(estimate.companion.value))}
				/>
			) : null}
			{estimate.protocol === 'tanaka' ? (
				<Fact term={L.note} detail={L.tanakaNote} />
			) : null}
		</dl>
	)
}

function Fact({ term, detail }: { term: string; detail: string }) {
	return (
		<div className="flex flex-wrap gap-x-2">
			<dt className="font-medium">{term}:</dt>
			<dd className="min-w-0 flex-1 tabular-nums">{detail}</dd>
		</div>
	)
}

function storedValueFor(
	stored: ProfileAnalysis['stored'][CardioDiscipline],
	construct: ThresholdConstruct,
): number | null {
	switch (construct) {
		case 'maxHr':
			return stored.maxHr
		case 'lthr':
			return stored.lthr
		case 'ftp':
		case 'cp':
			return stored.ftp
		case 'runPower':
			return stored.runPowerThresholdW
		case 'thresholdPace':
		case 'criticalSpeed':
			return stored.thresholdPaceSecPerKm
		case 'css':
			return stored.cssSecPer100m
	}
}

function formatStored(construct: ThresholdConstruct, value: number): string {
	const display = displayValue(construct, value)
	return `${display.value} ${display.unit}`
}
