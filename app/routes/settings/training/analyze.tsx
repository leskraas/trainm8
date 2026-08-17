import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, Form, Link } from 'react-router'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { setDisciplineThresholds } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatPaceClock } from '#app/utils/format.ts'
import {
	acceptancePlan,
	analyseProfile,
	findEstimate,
	type ProfileAnalysis,
} from '#app/utils/profile-analysis/analyze.server.ts'
import {
	type EstimateConfidence,
	type EstimateRefusal,
	type ThresholdConstruct,
	THRESHOLD_CONSTRUCTS,
	type ThresholdEstimate,
	type ThresholdProtocol,
} from '#app/utils/profile-analysis/types.ts'
import {
	CARDIO_DISCIPLINES,
	type CardioDiscipline,
	DISCIPLINE_LABELS,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/analyze.ts'

/**
 * **What your history says** — the first surface that reads an athlete's own
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
 */

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: 'What your history says',
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
		return data({ error: 'Unknown estimate.' as const }, { status: 400 })
	}

	// Re-run the analysis server-side rather than trusting the value the browser
	// posted back — the rule `approveSeason` already holds for a generated season
	// (ADR 0053 §2). The engine is deterministic over the same history, so
	// re-deriving is exact, and an athlete cannot accept a number the app never
	// produced.
	const analysis = await analyseProfile(userId)
	const estimate = findEstimate(analysis, discipline, construct)
	if (!estimate) {
		return data(
			{ error: 'That reading is no longer available.' as const },
			{ status: 409 },
		)
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

const CONSTRUCT_LABELS: Record<ThresholdConstruct, string> = {
	maxHr: 'Max heart rate',
	lthr: 'Threshold heart rate',
	ftp: 'FTP',
	cp: 'Critical power',
	thresholdPace: 'Threshold pace',
	criticalSpeed: 'Critical speed',
	css: 'Critical swim speed',
	runPower: 'Running power threshold',
}

/**
 * The caveat that **sits on the number**, in a phrase.
 *
 * `cp` and `criticalSpeed` are the two that earn one: neither is the thing the
 * column it lands in is named after, and the head-to-head gap is wide enough
 * (CP 256 ± 50 W vs FTP 249 ± 44 W, limits of agreement −19 to +33 W) that
 * silence would be a claim. The full argument is in the derivation, not here.
 */
const CONSTRUCT_CAVEATS: Partial<Record<ThresholdConstruct, string>> = {
	cp: 'A critical power — usually a little above FTP.',
	criticalSpeed:
		'A critical speed — usually a little quicker than threshold pace.',
}

const PROTOCOL_LABELS: Record<ThresholdProtocol, string> = {
	manual: 'you typed it',
	tt60: '60-minute test',
	ftp20: '20-minute test',
	ramp: 'ramp test',
	'cp-fit': 'fitted to your best efforts',
	'race-equivalence': 'from a race result',
	observed: 'the hardest you have been recorded going',
	tanaka: 'estimated from your age',
	provider: 'from a connected account',
}

/** One short sentence per refusal. Visible, never behind a disclosure. */
const REFUSAL_LINES: Record<EstimateRefusal, string> = {
	'no-birthdate':
		'Add your date of birth in your profile and we can estimate it.',
	'no-data': 'Nothing in the last 90 days carried the data this needs.',
	resolution:
		'Your activities are stored at too coarse a resolution to read short efforts from.',
	'insufficient-efforts':
		'Not enough hard efforts of different lengths to fit a curve to.',
	'insufficient-spread':
		'Your hard efforts are all about the same length, so a curve would be guesswork.',
	'implausible-fit': 'The fit came out outside anything physiological.',
	unbuilt: 'Not something we can read from your data yet.',
}

const CONFIDENCE_VARIANT: Record<
	EstimateConfidence,
	'default' | 'secondary' | 'outline'
> = { high: 'default', medium: 'secondary', low: 'outline' }

/** A value in the unit its construct implies. */
function displayValue(construct: ThresholdConstruct, value: number) {
	switch (construct) {
		case 'maxHr':
		case 'lthr':
			return { value: String(value), unit: 'bpm' }
		case 'ftp':
		case 'cp':
		case 'runPower':
			return { value: String(value), unit: 'W' }
		case 'thresholdPace':
		case 'criticalSpeed':
			return { value: formatPaceClock(value), unit: '/km' }
		case 'css':
			return { value: formatPaceClock(value), unit: '/100m' }
	}
}

export default function AnalyzeProfileRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { analysis } = loaderData

	return (
		<div className="flex flex-col gap-8">
			<p className="text-body-md text-muted-foreground">
				Read from {analysis.activitiesRead}{' '}
				{analysis.activitiesRead === 1 ? 'activity' : 'activities'} in the last{' '}
				{analysis.windowDays} days. Nothing is saved until you accept it.
			</p>

			{actionData?.error ? (
				<p className="text-destructive text-sm" role="alert">
					{actionData.error}
				</p>
			) : null}

			{analysis.activitiesRead === 0 ? (
				<div className="border-border/70 bg-muted/40 space-y-3 rounded-2xl border p-4">
					<p className="text-body-sm">
						No imported activities yet, so there is nothing to read.
					</p>
					<Link
						to="/settings/integrations"
						className={buttonVariants({ variant: 'outline', size: 'sm' })}
					>
						Connect an account
					</Link>
				</div>
			) : null}

			{CARDIO_DISCIPLINES.map((discipline) => (
				<DisciplineSection
					key={discipline}
					discipline={discipline}
					analysis={analysis}
				/>
			))}

			<p className="text-muted-foreground text-body-xs">
				Accepted readings are yours to edit afterwards on{' '}
				<Link to="/settings/training" className="underline">
					Training Settings
				</Link>
				, and they never change on their own.
			</p>
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
		<section aria-labelledby={`reading-${discipline}`}>
			<h2 id={`reading-${discipline}`} className="mb-3 text-lg font-semibold">
				{DISCIPLINE_LABELS[discipline]}
			</h2>
			<ul className="flex flex-col gap-2">
				{rows.map((estimate) => (
					<li key={`${estimate.discipline}-${estimate.construct}`}>
						<EstimateRow estimate={estimate} analysis={analysis} />
					</li>
				))}
			</ul>
		</section>
	)
}

function EstimateRow({
	estimate,
	analysis,
}: {
	estimate: ThresholdEstimate
	analysis: ProfileAnalysis
}) {
	const label = CONSTRUCT_LABELS[estimate.construct]

	if (estimate.kind === 'refusal') {
		// An **Unavailable Metric**: stated in place, never omitted and never
		// deferred behind a tap (#437). The reason is one sentence.
		return (
			<div className="bg-background rounded-lg px-4 py-3">
				<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<span className="text-body-sm font-medium">{label}</span>
					<span className="text-muted-foreground text-body-sm">
						Unavailable
					</span>
				</div>
				<p className="text-muted-foreground text-body-xs mt-1">
					{REFUSAL_LINES[estimate.refusal]}
				</p>
			</div>
		)
	}

	const display = displayValue(estimate.construct, estimate.value)
	const caveat = CONSTRUCT_CAVEATS[estimate.construct]
	const stored = analysis.stored[estimate.discipline]
	const current = storedValueFor(stored, estimate.construct)

	return (
		<div className="bg-background rounded-lg px-4 py-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className="text-body-sm font-medium">{label}</span>
				<span className="font-mono text-base">
					{display.value}{' '}
					<span className="text-muted-foreground text-xs">{display.unit}</span>
				</span>
			</div>

			<div className="mt-1 flex flex-wrap items-center gap-2">
				<Badge variant={CONFIDENCE_VARIANT[estimate.confidence]}>
					{estimate.confidence} confidence
				</Badge>
				<span className="text-muted-foreground text-body-xs">
					{PROTOCOL_LABELS[estimate.protocol]}
				</span>
			</div>

			{caveat ? (
				<p className="text-muted-foreground text-body-xs mt-1">{caveat}</p>
			) : null}

			{current != null ? (
				<p className="text-muted-foreground text-body-xs mt-1">
					You have {formatStored(estimate.construct, current)} saved.
				</p>
			) : null}

			<details className="mt-2">
				<summary className="text-body-xs text-muted-foreground cursor-pointer">
					How we got this
				</summary>
				<Derivation estimate={estimate} />
			</details>

			<Form method="POST" className="mt-3">
				<input type="hidden" name="discipline" value={estimate.discipline} />
				<input type="hidden" name="construct" value={estimate.construct} />
				<Button type="submit" variant="outline" size="sm">
					{current == null ? 'Use this' : 'Replace what I have'}
				</Button>
			</Form>
		</div>
	)
}

/** The derivation, behind the tap: what was read, what was refused, how well it fit. */
function Derivation({
	estimate,
}: {
	estimate: Extract<ThresholdEstimate, { kind: 'estimate' }>
}) {
	const { basis } = estimate
	return (
		<dl className="text-body-xs text-muted-foreground mt-2 space-y-1">
			<Fact
				term="Read from"
				detail={`${basis.contributingCount} of ${basis.activityCount} activities`}
			/>
			{basis.durationsUsedSec.length > 0 ? (
				<Fact
					term="Efforts used"
					detail={basis.durationsUsedSec.map(minutes).join(', ')}
				/>
			) : null}
			{basis.durationsRefusedSec.length > 0 ? (
				<Fact
					term="Too coarse to read"
					detail={`${basis.durationsRefusedSec.map(minutes).join(', ')} — your activities are stored downsampled, so short efforts are averaged away rather than measured`}
				/>
			) : null}
			{basis.rSquared != null ? (
				<Fact term="Fit" detail={`r² ${basis.rSquared.toFixed(2)}`} />
			) : null}
			{estimate.companion ? (
				<Fact
					term={estimate.companion.label}
					detail={`${estimate.companion.value} — read alongside, not offered: the short efforts it depends on were refused above`}
				/>
			) : null}
			{estimate.protocol === 'tanaka' ? (
				<Fact
					term="Note"
					detail="An age formula describes a population, not you. It stays low confidence however much you train, and a measured maximum always beats it."
				/>
			) : null}
		</dl>
	)
}

function Fact({ term, detail }: { term: string; detail: string }) {
	return (
		<div className="flex flex-wrap gap-x-2">
			<dt className="font-medium">{term}:</dt>
			<dd className="min-w-0 flex-1">{detail}</dd>
		</div>
	)
}

function minutes(seconds: number): string {
	return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}min`
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
