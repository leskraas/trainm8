/**
 * **What your sets say about your max** — a 1RM read off a set the athlete
 * already logged, with the derivation shown, which they may accept or ignore.
 *
 * Every word on this screen is a *proposal*. Loading it writes nothing: it is
 * ADR 0050's derived-then-authored rule and ADR 0054's proposal shape, applied
 * to the number a whole strength prescription hangs off. What the app asserts on
 * its own is that it **read** something; what it never asserts is that this is
 * the athlete's number.
 *
 * Three things it refuses to soften.
 *
 * **A refusal is a first-class answer**, shown in place with its own sentence —
 * *"we did not look"* and *"we looked and there is nothing"* are different
 * statements, and a screen that collapses them into a shrug is the failure the
 * four-member vocabulary exists to prevent.
 *
 * **The band is never dropped.** A point estimate alone claims a precision no
 * equation has: ±9–11 % is the honest width even inside the ten-rep gate, and it
 * sits beside the number rather than behind the tap.
 *
 * **Accepting re-derives.** The form posts which reading is being accepted and
 * the value it was shown, and the server re-runs the estimator; a number the
 * engine would not produce is refused and nothing is written. That holds with
 * the equation now a posted field: the server re-runs **the equation that was
 * posted**, so a value borrowed from a different one is refused as `stale`.
 *
 * And one it refuses to hide: **which equation, and on what basis.** All seven
 * implemented equations are selectable, none is presented as the better one, and
 * where the equation was never fitted to this movement the screen says so and
 * the grade is one step down.
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link, data, useFetcher } from 'react-router'
import { z } from 'zod/v3'
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
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatNbDate, formatNbKg } from '#app/utils/format.ts'
import {
	MEG_COMMON_LABELS,
	MEG_CONFIDENCE_LABELS,
	MEG_ESTIMATOR_EQUATION_LABELS,
	MEG_ONE_RM_REFUSAL_LABELS,
	MEG_PAGE_TITLES,
	MEG_PROPOSE_LABELS,
	MEG_REP_LOAD_BASIS_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	DEFAULT_ESTIMATOR,
	ESTIMATOR_MEAN_BIAS_PCT,
	estimatorSdPct,
	MAX_ESTIMATOR_REPS,
} from '#app/utils/strength/anchors.constants.ts'
import { formatKg } from '#app/utils/strength/program.constants.ts'
import {
	type AnchorProposal,
	acceptProposedExerciseOneRm,
	proposeExerciseOneRm,
} from '#app/utils/strength-anchors.server.ts'
import { ESTIMATOR_NAMES, type EstimatorName } from '#app/utils/strength-log.ts'
import { nbDecimal } from '../__meg-text.ts'
import { MegNote, MegResult } from '../__meg-ui.tsx'
import { type Route } from './+types/lifts.$exerciseId_.propose.ts'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.propose,
	getSitemapEntries: () => null,
}

/**
 * **Which equation to apply, from the query string.** A pick is a *navigation*,
 * not a submission: the derivation is re-shown from a fresh loader run and
 * nothing is written, which is ADR 0054's propose → show → accept shape kept
 * intact while the athlete shops between protocols.
 *
 * An unreadable value falls back to the default rather than erroring — the
 * screen's job is to show a reading, and a mangled link is not a reason to
 * withhold one. What it is never allowed to do is reach the estimator.
 */
function estimatorFromRequest(request: Request): EstimatorName | null {
	const raw = new URL(request.url).searchParams.get('estimator')
	const parsed = z.enum(ESTIMATOR_NAMES).safeParse(raw)
	return parsed.success ? parsed.data : null
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const estimator = estimatorFromRequest(request)
	// **A read, and only a read.** No branch of this loader writes: the athlete
	// arrives at a proposal, not at a number that has already been taken — and
	// changing the equation stays on this side of the line.
	const proposal = await proposeExerciseOneRm(userId, params.exerciseId, {
		now: new Date(),
		...(estimator ? { estimator } : {}),
	})
	if (!proposal) throw new Response('Not found', { status: 404 })
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	return {
		proposal,
		timezone: profile?.timezone ?? 'UTC',
		// Resolved here rather than in the component so the server module stays out
		// of the browser bundle; the sentence is the disclosure that this equation
		// was never fitted to this movement, and it travels with the reading.
		basisNote: MEG_REP_LOAD_BASIS_LABELS[proposal.repLoadBasis],
	}
}

const AcceptSchema = z.object({
	/** The value on screen, checked against a fresh derivation and never trusted
	 * as the thing to store. */
	valueKg: z.coerce.number().finite(),
	estimator: z.enum(ESTIMATOR_NAMES).optional(),
})

export type AcceptResult =
	| { ok: true; message: string }
	| { ok: false; error: string }

const ACCEPT_ERRORS = {
	'not-found': MEG_COMMON_LABELS.liftGone,
	'no-profile': MEG_COMMON_LABELS.noProfile,
	refused: MEG_PROPOSE_LABELS.refused,
	// The one worth spelling out: the history moved under the screen, so the
	// number shown is not the number the engine produces now. Storing it anyway
	// would store a figure no derivation supports.
	stale: MEG_PROPOSE_LABELS.staleError,
	duplicate: MEG_PROPOSE_LABELS.duplicate,
} as const

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = String(formData.get('intent') ?? '')
	if (intent !== 'accept-estimate') {
		return data<AcceptResult>(
			{ ok: false, error: MEG_COMMON_LABELS.unknownAction },
			400,
		)
	}
	const parsed = AcceptSchema.safeParse(Object.fromEntries(formData))
	if (!parsed.success) {
		return data<AcceptResult>(
			{ ok: false, error: MEG_PROPOSE_LABELS.invalid },
			400,
		)
	}

	const result = await acceptProposedExerciseOneRm({
		userId,
		exerciseId: params.exerciseId,
		postedValueKg: parsed.data.valueKg,
		...(parsed.data.estimator ? { estimator: parsed.data.estimator } : {}),
		now: new Date(),
	})
	if (!result.ok) {
		return data<AcceptResult>(
			{ ok: false, error: ACCEPT_ERRORS[result.reason] },
			result.reason === 'not-found' ? 404 : 400,
		)
	}
	return {
		ok: true as const,
		message: MEG_PROPOSE_LABELS.saved(formatNbKg(result.valueKg)),
	}
}

export default function ProposeAnchorRoute({
	loaderData,
}: Route.ComponentProps) {
	const { proposal, timezone, basisNote } = loaderData
	const L = MEG_PROPOSE_LABELS

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-heading [overflow-wrap:anywhere]">
					{proposal.exerciseName}
				</h2>
				<MegNote>{L.intro}</MegNote>
			</div>

			<Reading proposal={proposal} timezone={timezone} basisNote={basisNote} />

			<MegNote>
				{L.footer}
				<Link
					to={`/settings/training/lifts/${proposal.exerciseId}`}
					className="text-foreground underline underline-offset-4"
				>
					{L.footerLink}
				</Link>
				{L.footerEnd}
			</MegNote>
		</div>
	)
}

function Reading({
	proposal,
	timezone,
	basisNote,
}: {
	proposal: AnchorProposal
	timezone: string
	/** Said in place when the equation was not fitted to this movement. */
	basisNote: string | null
}) {
	const fetcher = useFetcher<AcceptResult>()
	const result = fetcher.data
	const { reading } = proposal
	const L = MEG_PROPOSE_LABELS

	if (reading.kind === 'refusal') {
		// Stated in place, never behind a disclosure and never as a low grade: a
		// grade communicates uncertainty *within* a valid fit (ADR 0054).
		return (
			<Card size="sm">
				<CardContent className="flex flex-col gap-1">
					<div className="flex flex-wrap items-baseline justify-between gap-x-3">
						<span className="text-callout font-semibold">{L.estimated}</span>
						<span className="text-footnote text-muted-foreground">
							{MEG_COMMON_LABELS.unavailable}
						</span>
					</div>
					<MegNote>
						{MEG_ONE_RM_REFUSAL_LABELS[reading.refusal](MAX_ESTIMATOR_REPS)}
					</MegNote>
				</CardContent>
			</Card>
		)
	}

	const source = reading.basis.source
	const tested = reading.construct === 'oneRm'
	const equation =
		reading.protocol === 'tested'
			? L.testedEquation
			: MEG_ESTIMATOR_EQUATION_LABELS[reading.protocol]

	return (
		<Card size="sm">
			<CardContent className="flex flex-col gap-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<span className="text-callout font-semibold">
						{tested ? L.tested : L.estimated}
					</span>
					<span className="text-title tabular-nums">
						{formatNbKg(reading.valueKg)}{' '}
						<span className="text-footnote text-muted-foreground font-normal">
							kg
						</span>
					</span>
				</div>

				{/* The band, in place. A point estimate on its own claims a precision
				    no equation here has. */}
				<MegNote className="tabular-nums">
					{L.band(
						formatNbKg(reading.band.lowKg),
						formatNbKg(reading.band.highKg),
						nbDecimal(reading.band.sdPct),
					)}
				</MegNote>

				{/* **Which basis this rests on, in place.** An equation applied to a
				    movement nobody fitted it to is a weaker claim than the same
				    equation on a bench press, and serving it silently would present a
				    borrowed curve as though it were the validated one. */}
				{!tested && basisNote ? <MegNote>{basisNote}</MegNote> : null}

				<div className="flex flex-wrap items-center gap-2">
					<Badge
						variant={reading.confidence === 'high' ? 'default' : 'secondary'}
					>
						{MEG_CONFIDENCE_LABELS[reading.confidence]}
					</Badge>
					{reading.basis.stale ? (
						<span className="text-footnote text-muted-foreground">
							{L.stale}
						</span>
					) : null}
				</div>

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
						<dl className="text-footnote text-muted-foreground space-y-1 pt-1 pb-2">
							<Fact term={L.setsRead} detail={`${reading.basis.setsRead}`} />
							{source ? (
								<Fact
									term={L.setUsed}
									detail={L.setUsedDetail(
										formatNbKg(source.loadKg),
										source.reps,
										formatNbDate(source.performedAtISO, timezone),
										source.toFailure
											? L.toFailure
											: source.rir != null
												? L.inReserve(source.rir)
												: '',
									)}
								/>
							) : null}
							<Fact term={L.equation} detail={equation} />
							{reading.band.meanBiasPct !== 0 ? (
								<Fact
									term={L.bias}
									detail={L.biasDetail(
										`${reading.band.meanBiasPct > 0 ? '+' : ''}${nbDecimal(reading.band.meanBiasPct)}`,
									)}
								/>
							) : null}
							{source?.rir != null && !source.toFailure ? (
								<Fact term={L.note} detail={L.rirNote} />
							) : null}
						</dl>
					</CollapsibleContent>
				</Collapsible>

				<MegResult result={result} />

				<fetcher.Form method="POST" className="flex flex-wrap gap-2 pt-1">
					<input type="hidden" name="intent" value="accept-estimate" />
					{/* **The number as the server reads it**, not the float behind it:
					    what the athlete accepts is what they read (`61,25` on screen is
					    `61.25` here). The server re-derives and compares through the same
					    `formatKg`, so the two can only agree. */}
					<input
						type="hidden"
						name="valueKg"
						value={formatKg(reading.valueKg)}
					/>
					{proposal.estimator ? (
						<input type="hidden" name="estimator" value={proposal.estimator} />
					) : null}
					<Button type="submit">
						{proposal.currentAnchors.length === 0 ? L.use : L.replace}
					</Button>
					<Link
						to={`/settings/training/lifts/${proposal.exerciseId}`}
						className={buttonVariants({ variant: 'ghost' })}
					>
						{L.noThanks}
					</Link>
				</fetcher.Form>

				{tested ? null : <EstimatorPicker current={proposal.estimator} />}
			</CardContent>
		</Card>
	)
}

/**
 * **The equation, as a choice rather than a hidden default.**
 *
 * Seven published equations are implemented and storable; before this, six of
 * them were unreachable. They are links, not a form: picking one is a
 * navigation, the loader re-derives, the derivation above is re-shown, and
 * **nothing is written** — the accept button is still the only write, which is
 * ADR 0054's propose → show → accept shape unchanged.
 *
 * Three rules the ordering and the copy have to hold.
 *
 * **No ranking.** ADR 0054: the formula name is a *protocol*, not a trust label.
 * They are listed in `ESTIMATOR_NAMES` order with no "recommended" mark, and the
 * only distinction drawn is which one is currently applied. Epley is first
 * because it is the default, and the default is defended on being what other
 * apps use — not on being the best.
 *
 * **Every band on screen.** Each option carries its own ± population SD
 * (Mayhew et al. 2008 Table 4, ≤ 10 reps, 103 women — the citation lives beside
 * each constant in `anchors.constants.ts`), so the choice is made against the
 * error bars rather than against the names. They span 9.1 % to 10.6 %: the
 * spread between equations is far smaller than the spread inside any of them.
 *
 * **Not offered where it would mean nothing.** A tested single is a measurement
 * with no equation in it, so the picker is not rendered there.
 */
function EstimatorPicker({ current }: { current: EstimatorName | null }) {
	const applied = current ?? DEFAULT_ESTIMATOR
	const L = MEG_PROPOSE_LABELS
	return (
		<nav aria-label={L.equationPicker} className="flex flex-col gap-2 pt-2">
			<MegNote>{L.equationIntro}</MegNote>
			<ul className="flex flex-wrap gap-2">
				{ESTIMATOR_NAMES.map((name) => {
					const isApplied = name === applied
					const bias = ESTIMATOR_MEAN_BIAS_PCT[name]
					return (
						<li key={name}>
							<Link
								to={`?estimator=${name}`}
								preventScrollReset
								aria-current={isApplied ? 'true' : undefined}
								className={cn(
									'text-footnote pressable inline-flex min-h-11 items-center gap-1 rounded-full border px-3.5',
									isApplied
										? 'border-primary bg-primary/10 text-primary font-medium'
										: 'border-border text-muted-foreground',
								)}
							>
								{ESTIMATOR_LABELS[name]}
								<span className="tabular-nums">
									±{nbDecimal(estimatorSdPct(name))} %
								</span>
								<span className="sr-only">
									{L.meanBias(`${bias > 0 ? '+' : ''}${nbDecimal(bias)}`)}
									{isApplied ? L.applied : ''}
								</span>
							</Link>
						</li>
					)
				})}
			</ul>
		</nav>
	)
}

/** The published name each equation is cited under, so a number an athlete
 * compares against another app can be matched to the same source. */
const ESTIMATOR_LABELS = {
	epley: 'Epley',
	brzycki: 'Brzycki',
	mayhew: 'Mayhew',
	wathen: 'Wathen',
	lombardi: 'Lombardi',
	lander: 'Lander',
	adams: 'Adams',
} as const satisfies Record<EstimatorName, string>

function Fact({ term, detail }: { term: string; detail: string }) {
	return (
		<div className="flex flex-wrap gap-x-2">
			<dt className="font-medium">{term}:</dt>
			<dd className="min-w-0 flex-1 tabular-nums">{detail}</dd>
		</div>
	)
}
