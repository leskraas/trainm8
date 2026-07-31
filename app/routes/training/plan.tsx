/**
 * The manual planning surface: the season the athlete authored, read back — and,
 * per phase, the progression they author into it.
 *
 * Two readings of one object (spec #399 story 67) — **Blocks** shapes the season
 * and **Weeks** audits it — selected by a `?tab=` search param rather than nested
 * routes — the same URL-state rule the **Discipline Query** follows — because they
 * are two views and not two pages. **Blocks** is where progressive overload becomes
 * authorable: each endurance segment's **Volume Ramp**, its **Block Boundary Step**
 * and how deep its recovery week and taper cut. The structure itself — adding,
 * resizing and reordering phases — and the **Quality Session Mix** land with their
 * own tickets.
 *
 * Every number here is **derived** on read from the **Season Anchor** and the
 * phases (ADR 0040 §1) — nothing on this page is stored per week, so no reading
 * can go stale when the structure above it changes. Where a track's rule cannot
 * price a week the surface says **Unavailable** with its reason, and never a
 * fabricated figure.
 *
 * Two rules this page's copy is bound by:
 *
 * - **An unset cut reads as the convention**, visibly distinct from an authored
 *   number of the same size, so a convention that moves later cannot look like an
 *   edit to the athlete's plan (ADR 0044 §4).
 * - **The ramp guard is a convention and never an injury claim.** The 10% rule has
 *   a failed RCT behind it, so the warning says "steeper than the convention" and
 *   stops there (ADR 0040 §13). It warns; nothing here refuses a save.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Alert, AlertDescription } from '#app/components/ui/alert.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	formatDate,
	formatSignedPercent,
	formatVolumeTotal,
	formatWeeklyVolume,
} from '#app/utils/format.ts'
import {
	DISCIPLINE_LABELS,
	RHYTHM_LABELS,
	VOLUME_CURRENCY_UNITS,
	WEEK_ROLE_LABELS,
} from '#app/utils/labels.ts'
import { EnduranceSegmentSetSchema } from '#app/utils/plan-outline/authoring-schema.ts'
import { setEnduranceSegment } from '#app/utils/plan-outline/authoring.server.ts'
import {
	DEFAULT_RECOVERY_CUT,
	DEFAULT_TAPER_CUT,
} from '#app/utils/plan-outline/derive.ts'
import {
	RAMP_GUARD_MAX,
	type RampWarning,
} from '#app/utils/plan-outline/ramp-guard.ts'
import {
	getActiveSeason,
	getSeasonForEvent,
} from '#app/utils/training.server.ts'
import { type Route } from './+types/plan.ts'

export const meta: Route.MetaFunction = () => [{ title: 'Plan | Trainm8' }]

const TABS = ['blocks', 'weeks'] as const
type Tab = (typeof TABS)[number]

/**
 * The two readings' own names. Not a domain enum — **Block** is a UI word only
 * (CONTEXT.md, Plan Outline phase) and these label a view, so they live beside
 * the view rather than in `labels.ts`.
 */
const TAB_LABELS: Record<Tab, string> = { blocks: 'Blocks', weeks: 'Weeks' }

function tabFrom(request: Request): Tab {
	const raw = new URL(request.url).searchParams.get('tab')
	return TABS.includes(raw as Tab) ? (raw as Tab) : 'blocks'
}

/**
 * One rate as the athlete types it: a **whole percent**, or blank.
 *
 * Blank is `null` and `null` is a *choice* — "no ramp", "no step", "follow the
 * documented convention" — so it travels as a value rather than as an omitted
 * field. Storage keeps fractions (ADR 0040 §10), and the division happens here at
 * the form boundary rather than anywhere the derivation can see it.
 */
const RateField = z
	.string()
	.trim()
	.transform((raw, ctx) => {
		if (raw === '') return null
		const percent = Number(raw)
		if (!Number.isFinite(percent)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Type a percentage, or leave it blank',
			})
			return z.NEVER
		}
		return percent / 100
	})

/**
 * The progression form. The four rates are optional *fields* and required
 * *values*: an absent input reads as blank, which is the athlete clearing a rate
 * back to the convention rather than a field the form forgot.
 */
const SegmentFormSchema = z.object({
	segmentId: z.string().min(1),
	ramp: RateField.default(''),
	boundaryStep: RateField.default(''),
	recoveryCut: RateField.default(''),
	taperCut: RateField.default(''),
})

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	// `?event=` addresses one Event's season — the plan just authored, or the one
	// an Event linked to. Without it the surface shows the active plan: the nearest
	// upcoming outlined Event (ADR 0018), which is the plan the athlete is living
	// in but not necessarily the one they just asked for.
	const eventId = new URL(request.url).searchParams.get('event')
	const season = eventId
		? await getSeasonForEvent(userId, eventId)
		: await getActiveSeason(userId)
	// An Event with no plan of its own falls back to the active plan rather than
	// dead-ending; with no plan at all, the flow's first question is the honest
	// destination — not a hollow page.
	if (!season) throw redirect(eventId ? '/training/plan' : '/training/plan/new')

	return {
		eventQuery: eventId,
		tab: tabFrom(request),
		season: {
			...season,
			/**
			 * Each week's Monday as the instant of local midnight, so the display layer
			 * formats the calendar day the athlete's week actually opens on.
			 */
			weeks: season.weeks.map((week) => ({
				...week,
				startsAt: dayBoundsUTC(week.weekKey, season.timezone).start,
			})),
			phases: season.phases.map((phase) => ({
				...phase,
				startsAt: dayBoundsUTC(phase.fromWeekKey, season.timezone).start,
			})),
		},
	}
}

/**
 * Author one endurance segment's progression.
 *
 * The reply carries the `segmentId` it belongs to, so a rejected save reports on the
 * card it was typed into and leaves the other phases' forms alone. Success needs no
 * redirect: the loader re-runs, and every figure on the page — the derived weeks,
 * the **Season Span**, the guard — is recomputed from the rows that just changed.
 */
export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const submission = parseWithZod(formData, { schema: SegmentFormSchema })
	if (submission.status !== 'success') {
		return data(
			{
				segmentId: String(formData.get('segmentId') ?? ''),
				result: submission.reply(),
			},
			{ status: 400 },
		)
	}

	// The service's own gate, applied here first so a rate outside the storable
	// range reports as a form error rather than throwing (ADR 0044 §8: the routes
	// parse against the same schema the service re-parses).
	const authored = EnduranceSegmentSetSchema.safeParse(submission.value)
	if (!authored.success) {
		return data(
			{
				segmentId: submission.value.segmentId,
				result: submission.reply({
					formErrors: authored.error.issues.map((issue) => issue.message),
				}),
			},
			{ status: 400 },
		)
	}

	const saved = await setEnduranceSegment(userId, authored.data)
	if (!saved.ok) {
		return data(
			{
				segmentId: submission.value.segmentId,
				result: submission.reply({
					formErrors: ['That block is no longer part of your plan.'],
				}),
			},
			{ status: 400 },
		)
	}

	return { segmentId: submission.value.segmentId, result: submission.reply() }
}

export default function PlanRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { season, tab, eventQuery } = loaderData
	const timezone = season.timezone
	const totalWeeks = season.weeks.length
	// The **Season Span** headline, for a single-track plan. Several tracks means
	// several spans — one per commensurability group, never one fabricated total
	// (ADR 0043 §5) — and that grouping is a later ticket's, so a multi-track plan
	// reads its tracks below and no headline at all rather than a wrong one.
	const soleTrack = season.tracks.length === 1 ? season.tracks[0]! : null

	// The tab is URL state, and it must not drop the season the athlete is looking
	// at: both params travel together, with the default tab kept out of the URL.
	function readingHref(name: Tab): string {
		const params = new URLSearchParams()
		if (eventQuery) params.set('event', eventQuery)
		if (name !== 'blocks') params.set('tab', name)
		const search = params.toString()
		return search ? `/training/plan?${search}` : '/training/plan'
	}

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="Season plan"
				back={{ to: '/', label: 'Home' }}
				className="mb-4"
			/>

			<div className="mb-8 space-y-3">
				<div className="space-y-1">
					<p className="font-medium">
						<Link
							to={`/training/events/${season.eventId}`}
							className="hover:underline"
						>
							{season.eventName}
						</Link>
					</p>
					{/* The Event's date is a calendar day anchor, formatted in UTC like
					    every other Event date in the app (ADR 0023). */}
					<p className="text-muted-foreground text-sm">
						{formatDate(season.eventDate, 'UTC')} ·{' '}
						{totalWeeks === 1 ? '1 week' : `${totalWeeks} weeks`} from{' '}
						{formatDate(season.phases[0]!.startsAt, timezone)}
					</p>
				</div>
				{soleTrack?.span ? (
					<SeasonSpanHeadline track={soleTrack} weeks={season.weeks} />
				) : null}
				<p className="text-sm">{fitSentence(season.fit)}</p>
				<ul className="space-y-1">
					{season.tracks.map((track) => (
						<li key={track.discipline} className="text-sm">
							<span className="font-medium">
								{DISCIPLINE_LABELS[track.discipline]}
							</span>{' '}
							<span className="text-muted-foreground">
								· authored in {VOLUME_CURRENCY_UNITS[track.currency]} · starts
								at {formatWeeklyVolume(track.anchors[0]!.value, track.currency)}
							</span>
						</li>
					))}
				</ul>
			</div>

			<nav aria-label="Season views" className="mb-4 flex gap-2">
				{TABS.map((name) => (
					<Link
						key={name}
						to={readingHref(name)}
						aria-current={tab === name ? 'page' : undefined}
						className={buttonVariants({
							variant: tab === name ? 'default' : 'outline',
							size: 'sm',
						})}
					>
						{TAB_LABELS[name]}
					</Link>
				))}
			</nav>

			{tab === 'blocks' ? (
				<BlocksReading season={season} actionData={actionData} />
			) : (
				<WeeksReading season={season} />
			)}
		</main>
	)
}

type SeasonData = Route.ComponentProps['loaderData']['season']

type SeasonTrack = SeasonData['tracks'][number]
type SeasonPhaseData = SeasonData['phases'][number]
type SegmentData = SeasonTrack['segments'][number]
type SegmentActionData = Route.ComponentProps['actionData']

/**
 * The **Season Span**: `55 → 78 km/wk`, the anchor and the peak loading week.
 *
 * A span and not a season total, because a total conflates how big a plan is with
 * how long it is and hides the **Volume Ramp** that is half of what the athlete
 * authored (ADR 0043). The total is available underneath as a **secondary** figure,
 * which is exactly where it belongs.
 *
 * Both figures are read from the authored guideline level — the anchor and the
 * ramps, through the same derivation the weeks use — and never summed from
 * materialized **Workout Sessions**, so neither changes character with how far into
 * the season the athlete is.
 */
function SeasonSpanHeadline({
	track,
	weeks,
}: {
	track: SeasonTrack
	weeks: SeasonData['weeks']
}) {
	const span = track.span!
	const peakWeek = weeks[span.peakWeekIndex]

	return (
		<div className="space-y-1">
			<p className="text-2xl font-semibold tabular-nums">
				{formatWeeklyVolume(span.anchor, track.currency)} →{' '}
				{formatWeeklyVolume(span.peak, track.currency)}
			</p>
			<p className="text-muted-foreground text-sm">
				Where you start to your peak loading week
				{peakWeek ? `, week ${peakWeek.weekInPlan}` : null} · read from your
				anchor and your ramps, never added up from sessions
				{track.total == null
					? null
					: ` · ${formatVolumeTotal(track.total, track.currency)} across the season`}
			</p>
		</div>
	)
}

/**
 * The **ramp guard**, worded (ADR 0040 §12–13).
 *
 * Three things this copy must do and does. It names the threshold as a
 * **convention** and makes **no injury claim** — the 10% rule's own RCT found no
 * difference (Buist 2008), so "steeper than usual" is the whole of what can
 * honestly be said. It says the numbers are saved, because the guard warns and never
 * blocks. And it speaks about the ramp and the step the athlete *authored*, never
 * about a week-over-week difference, so it stays silent on a recovery week's rebound
 * and on a taper.
 */
function RampGuardNotice({
	warnings,
	phases,
}: {
	warnings: RampWarning[]
	phases: SeasonPhaseData[]
}) {
	return (
		<Alert className="mb-4">
			<AlertDescription className="space-y-2">
				<ul className="space-y-1">
					{warnings.map((warning) => (
						<li key={`${warning.phaseIndex}-${warning.subject}`}>
							<span className="font-medium">
								{phases[warning.phaseIndex]?.name ?? 'A block'}
							</span>{' '}
							{warning.subject === 'ramp'
								? `ramps ${formatSignedPercent(warning.authored)} a loading week`
								: `steps ${formatSignedPercent(warning.authored)} at its opening`}
							.
						</li>
					))}
				</ul>
				<p>
					The convention is up to {formatSignedPercent(RAMP_GUARD_MAX)} a
					loading week. Steeper than that is unusual rather than unsafe — no
					volume rule has been shown to prevent injury — so this is a note, not
					a limit. Your numbers are saved exactly as you authored them.
				</p>
			</AlertDescription>
		</Alert>
	)
}

/**
 * The Blocks reading: the phases in authored order, each with the progression its
 * endurance segments author.
 *
 * A phase still carries a name, a span and a rhythm and nothing about volume
 * (ADR 0041) — the ramp and the cuts belong to the **Training Track segment**
 * measured over it, which is why they are inside the card and not part of the
 * phase's own line.
 */
function BlocksReading({
	season,
	actionData,
}: {
	season: SeasonData
	actionData: SegmentActionData
}) {
	// A track with no phase-bound segment authors no progression here: a strength
	// track's segments are dated and float free of the phases (ADR 0047 §6).
	const enduranceTracks = season.tracks.filter(
		(track) => track.segments.length > 0,
	)
	const warnings = enduranceTracks.flatMap((track) => track.warnings)

	return (
		<>
			{warnings.length > 0 ? (
				<RampGuardNotice warnings={warnings} phases={season.phases} />
			) : null}
			<ol aria-label="Phases" className="space-y-3">
				{season.phases.map((phase, phaseIndex) => (
					// Keyed by the week the phase opens on, which is unique across a season
					// by construction (phases are contiguous, ADR 0044 §3) — an array index
					// would reuse the wrong card once phases can be reordered.
					<li key={phase.fromWeekKey}>
						<Card>
							<CardHeader className="gap-1">
								<CardTitle className="flex flex-wrap items-center gap-2 text-base">
									{phase.name}
									{phase.tapers ? (
										<Badge variant="secondary">Tapers</Badge>
									) : null}
								</CardTitle>
								<p className="text-muted-foreground text-sm">
									{phase.fromWeekInPlan === phase.toWeekInPlan
										? `Week ${phase.fromWeekInPlan}`
										: `Weeks ${phase.fromWeekInPlan}–${phase.toWeekInPlan}`}{' '}
									· from {formatDate(phase.startsAt, season.timezone)}
								</p>
							</CardHeader>
							<CardContent className="space-y-6">
								<p className="text-muted-foreground text-sm">
									{RHYTHM_LABELS[phase.rhythm]}
								</p>
								{enduranceTracks.map((track) => {
									const segment = track.segments.find(
										(candidate) => candidate.phaseIndex === phaseIndex,
									)
									return segment ? (
										<SegmentProgressionForm
											key={track.discipline}
											segment={segment}
											phase={phase}
											// The step applies where a boundary is *crossed*, and the
											// season's opening block crosses none (ADR 0040 §3).
											opensTheSeason={phaseIndex === 0}
											// Named only where there is more than one track to tell
											// apart; one runner reads one form, unlabelled.
											trackLabel={
												enduranceTracks.length > 1
													? DISCIPLINE_LABELS[track.discipline]
													: null
											}
											actionData={actionData}
										/>
									) : null
								})}
							</CardContent>
						</Card>
					</li>
				))}
			</ol>
		</>
	)
}

/** A stored fraction as the whole percent the form field carries. `null` is blank. */
function percentValue(fraction: number | null): string {
	return fraction == null ? '' : String(Math.round(fraction * 100))
}

/**
 * One endurance segment's progression, authored.
 *
 * The fields **are** the reading: a rate the athlete authored shows as the number
 * they typed, and one they have not shows as **blank** with what blank means said
 * underneath. That is the distinction ADR 0044 §4 requires — an unset cut is
 * "follows the documented convention" and never the convention's number in the box,
 * so a convention that moves later cannot look like an edit to the athlete's plan.
 *
 * Every rate is written on every save (`EnduranceSegmentSetSchema` takes all four),
 * so a rate this phase has no field for travels as a **hidden input** carrying what
 * is stored. Without that, opening a non-tapering block would silently clear the
 * taper cut of a block that does taper.
 */
function SegmentProgressionForm({
	segment,
	phase,
	opensTheSeason,
	trackLabel,
	actionData,
}: {
	segment: SegmentData
	phase: SeasonPhaseData
	opensTheSeason: boolean
	trackLabel: string | null
	actionData: SegmentActionData
}) {
	// Recovery weeks come from the phase's rhythm, and a tapering phase tapers
	// throughout instead of recovering (ADR 0044 §4) — so a cut with no week to
	// apply to gets no field, rather than a control that changes nothing.
	const hasRecoveryWeeks = phase.rhythm !== 'none' && !phase.tapers
	const [form, fields] = useForm({
		id: `segment-${segment.segmentId}`,
		// Only the form that was submitted reads the reply: a rejected save must
		// report on the card it was typed into and leave its siblings untouched.
		lastResult:
			actionData?.segmentId === segment.segmentId
				? actionData.result
				: undefined,
		defaultValue: {
			ramp: percentValue(segment.ramp),
			boundaryStep: percentValue(segment.boundaryStep),
			recoveryCut: percentValue(segment.recoveryCut),
			taperCut: percentValue(segment.taperCut),
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SegmentFormSchema })
		},
	})

	return (
		<Form method="POST" {...getFormProps(form)} className="space-y-4">
			<input type="hidden" name="segmentId" value={segment.segmentId} />
			{trackLabel ? (
				<p className="text-sm font-medium">{trackLabel} progression</p>
			) : null}

			<div className="grid gap-4 sm:grid-cols-2">
				<div>
					<Field
						labelProps={{ children: 'Volume ramp, % a loading week' }}
						inputProps={{
							...getInputProps(fields.ramp, { type: 'number' }),
							step: 'any',
							inputMode: 'decimal',
						}}
						errors={fields.ramp.errors as string[] | undefined}
					/>
					<p className="text-muted-foreground mt-1 text-sm">
						{segment.ramp == null
							? 'Blank — volume holds level through this block.'
							: `${formatSignedPercent(segment.ramp)} on every loading week. Recovery weeks and tapers do not step.`}
					</p>
				</div>

				{opensTheSeason ? (
					// The season's first block opens on the Season Anchor itself, so there
					// is nothing for a step to step from. Said out loud rather than shown as
					// a field that would do nothing (ADR 0044 §8's rule against dead
					// controls).
					<>
						<input
							type="hidden"
							name={fields.boundaryStep.name}
							value={percentValue(segment.boundaryStep)}
						/>
						<p className="text-muted-foreground self-end text-sm">
							Your season opens here, so there is no boundary to step at.
						</p>
					</>
				) : (
					<div>
						<Field
							labelProps={{
								children: 'Boundary step at this block’s opening, %',
							}}
							inputProps={{
								...getInputProps(fields.boundaryStep, { type: 'number' }),
								step: 'any',
								inputMode: 'decimal',
							}}
							errors={fields.boundaryStep.errors as string[] | undefined}
						/>
						<p className="text-muted-foreground mt-1 text-sm">
							{segment.boundaryStep == null
								? 'Blank — this block opens continuous with the week before it.'
								: `${formatSignedPercent(segment.boundaryStep)} once, at the opening. A deliberate drop into an intensity block belongs here rather than in the ramp.`}
						</p>
					</div>
				)}

				{hasRecoveryWeeks ? (
					<div>
						<Field
							labelProps={{ children: 'Recovery week cut, %' }}
							inputProps={{
								...getInputProps(fields.recoveryCut, { type: 'number' }),
								step: 'any',
								min: 0,
								inputMode: 'decimal',
							}}
							errors={fields.recoveryCut.errors as string[] | undefined}
						/>
						<p className="text-muted-foreground mt-1 text-sm">
							{segment.recoveryCut == null
								? `Blank — follows the documented convention, ${formatSignedPercent(-DEFAULT_RECOVERY_CUT)} off your last loading week. Leave it blank and it moves if the convention does.`
								: `Yours: ${formatSignedPercent(-segment.recoveryCut)} off your last loading week.`}
						</p>
					</div>
				) : (
					<input
						type="hidden"
						name={fields.recoveryCut.name}
						value={percentValue(segment.recoveryCut)}
					/>
				)}

				{phase.tapers ? (
					<div>
						<Field
							labelProps={{ children: 'Taper cut by the event, %' }}
							inputProps={{
								...getInputProps(fields.taperCut, { type: 'number' }),
								step: 'any',
								min: 0,
								inputMode: 'decimal',
							}}
							errors={fields.taperCut.errors as string[] | undefined}
						/>
						<p className="text-muted-foreground mt-1 text-sm">
							{segment.taperCut == null
								? `Blank — follows the documented convention, ${formatSignedPercent(-DEFAULT_TAPER_CUT)} by your event. Leave it blank and it moves if the convention does.`
								: `Yours: ${formatSignedPercent(-segment.taperCut)} by your event.`}{' '}
							The taper descends across the block rather than dropping in its
							last week.
						</p>
					</div>
				) : (
					<input
						type="hidden"
						name={fields.taperCut.name}
						value={percentValue(segment.taperCut)}
					/>
				)}
			</div>

			<ErrorList errors={form.errors as string[] | undefined} />

			<Button type="submit" variant="outline" size="sm">
				Save {trackLabel ? `${trackLabel} ` : ''}progression
			</Button>
		</Form>
	)
}

/**
 * The Weeks reading: every Training Week with its role and its derived target per
 * track. One column per track in **that track's** own currency — never a total
 * across them, which would need an exchange rate the app refuses to invent
 * (ADR 0043 §5).
 */
function WeeksReading({ season }: { season: SeasonData }) {
	// A track whose every week reads Unavailable gets its reason said once, rather
	// than a column of dashes the athlete has to interpret (Unavailable Metric).
	const unpricedTracks = season.tracks.filter((track) =>
		season.weeks.every(
			(week) =>
				week.targets.find((target) => target.discipline === track.discipline)
					?.value == null,
		),
	)

	return (
		<>
			<ul aria-label="Training weeks" className="divide-border divide-y">
				{season.weeks.map((week) => (
					<li
						key={week.weekKey}
						className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
					>
						<div className="text-sm">
							<span className="font-medium">Week {week.weekInPlan}</span>{' '}
							<span className="text-muted-foreground">
								· {formatDate(week.startsAt, season.timezone)} ·{' '}
								{season.phases[week.phaseIndex]?.name} ·{' '}
								{WEEK_ROLE_LABELS[week.role]}
							</span>
						</div>
						<dl className="flex flex-wrap gap-x-4 text-sm">
							{week.targets.map((target) => (
								<div key={target.discipline} className="flex gap-1.5">
									<dt className="text-muted-foreground">
										{DISCIPLINE_LABELS[target.discipline]}
									</dt>
									<dd className="font-medium tabular-nums">
										{target.value == null ? (
											<span className="text-muted-foreground font-normal">
												Unavailable
											</span>
										) : (
											formatWeeklyVolume(target.value, target.currency)
										)}
									</dd>
								</div>
							))}
						</dl>
					</li>
				))}
			</ul>
			{unpricedTracks.map((track) => (
				<p
					key={track.discipline}
					className="text-muted-foreground mt-3 text-sm"
				>
					{DISCIPLINE_LABELS[track.discipline]} weeks read Unavailable — a
					strength track&rsquo;s weekly sets are not derived yet.
				</p>
			))}
		</>
	)
}

/**
 * Where the season ends against the Event, said plainly. The plan is never
 * stretched to meet the Event: the athlete decides whether to add weeks (ADR 0044
 * §3, spec #399 story 4).
 */
function fitSentence(fit: SeasonData['fit']): string {
	const weeks = fit.kind === 'ends-on-event-week' ? 0 : fit.weeks
	const plural = weeks === 1 ? 'week' : 'weeks'
	if (fit.kind === 'ends-on-event-week') {
		return 'Your plan ends on your event’s week.'
	}
	return fit.kind === 'ends-before'
		? `Your plan ends ${weeks} ${plural} before your event’s week. Add weeks if you want it to reach the event.`
		: `Your plan runs ${weeks} ${plural} past your event’s week.`
}

export { GeneralErrorBoundary as ErrorBoundary }
