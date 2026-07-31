/**
 * The manual planning surface: the season the athlete authored, where they reshape
 * it, and where they author the progression into it.
 *
 * Two readings of one object (spec #399 story 67) — **Blocks** shapes the season
 * and **Weeks** audits it — selected by a `?tab=` search param rather than nested
 * routes — the same URL-state rule the **Discipline Query** follows — because they
 * are two views and not two pages.
 *
 * **Blocks is the write surface.** Two kinds of edit meet on it, and they stay
 * separate acts. The **structure** (#402) — add, rename, resize, move, remove — is
 * one action per phase and never a whole-season save; the phases stay contiguous
 * because a phase stores a position and a week count and no dates at all (ADR 0044
 * §3), and the **Plan Start Week** never moves because it is authored on the Outline
 * rather than counted back from the Event. The **progression** (#403) is each
 * endurance segment's **Volume Ramp**, its **Block Boundary Step** and how deep its
 * recovery week and taper cut. The **Quality Session Mix** lands with its own ticket.
 *
 * Every number here is **derived** on read from the **Season Anchor** and the
 * phases (ADR 0040 §1) — nothing on this page is stored per week, so every target
 * and every week role is recomputed by the next read after a structural edit and
 * none of them can go stale. Where a track's rule cannot price a week the surface
 * says **Unavailable** with its reason, and never a fabricated figure.
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
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	formatDate,
	formatRateField,
	formatSignedPercent,
	formatVolumeTotal,
	formatWeeklyVolume,
} from '#app/utils/format.ts'
import {
	DISCIPLINE_LABELS,
	VOLUME_CURRENCY_UNITS,
	WEEK_ROLE_LABELS,
} from '#app/utils/labels.ts'
import {
	EnduranceSegmentSetSchema,
	PhaseNameSchema,
	PhaseWeeksSchema,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	addPhase,
	deletePlanOutline,
	movePhase,
	removePhase,
	renamePhase,
	resizePhase,
	setEnduranceSegment,
	setPhaseRhythm,
	type PhaseEditRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import {
	DEFAULT_RECOVERY_CUT,
	DEFAULT_TAPER_CUT,
	RHYTHMS,
} from '#app/utils/plan-outline/derive.ts'
import {
	RAMP_GUARD_MAX,
	type RampWarning,
} from '#app/utils/plan-outline/ramp-guard.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	getActiveSeason,
	getSeasonForEvent,
} from '#app/utils/training.server.ts'
import { type Route } from './+types/plan.ts'
import {
	AddPhaseForm,
	DeletePlanSection,
	PhaseCard,
} from './__phase-editor.tsx'

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
const RatePercentSchema = z
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
	ramp: RatePercentSchema.default(''),
	boundaryStep: RatePercentSchema.default(''),
	recoveryCut: RatePercentSchema.default(''),
	taperCut: RatePercentSchema.default(''),
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
 * What the phase forms submit, per field.
 *
 * A form body is strings, and these coerce them into the shapes the authoring
 * schemas take. The service re-parses everything it is handed, so no write reaches
 * the database without passing the same rules twice; what these add is *wording* —
 * an athlete who clears the weeks box reads a sentence rather than "expected
 * number, received nan".
 */
const WeeksField = z.preprocess(
	// A cleared box arrives as `''`, and `Number('')` is 0 — which would read back as
	// "a phase runs at least one week" when what happened is that nothing was typed.
	(value) =>
		value == null || (typeof value === 'string' && value.trim() === '')
			? undefined
			: value,
	z.coerce
		.number({ errorMap: () => ({ message: 'How many weeks is this phase?' }) })
		// The bounds and their wording are the authoring schema's, piped rather than
		// restated, so a rule cannot move on one side of the form only.
		.pipe(PhaseWeeksSchema),
)
const NameField = z.preprocess((value) => value ?? '', PhaseNameSchema)
const AtIndexField = z.coerce.number().int().min(0)
/**
 * The rhythm as submitted. **Not** defaulted: a body missing its rhythm is refused
 * rather than written as `3:1`, which would record a convention as though the
 * athlete had chosen it — and would overwrite the `none` they had chosen before
 * (ADR 0044 §4, the rule `authoring-schema.ts` states).
 */
const RhythmField = z.enum(RHYTHMS, {
	errorMap: () => ({ message: 'Pick how this phase recovers' }),
})
const IdField = z.string().min(1)

/** A checkbox that is absent from the body when unchecked, as HTML has it. */
function checked(formData: FormData, name: string): boolean {
	return formData.get(name) === 'on'
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	const phaseId = IdField.safeParse(formData.get('phaseId'))
	const outlineId = IdField.safeParse(formData.get('outlineId'))

	switch (intent) {
		case 'add-phase': {
			const name = NameField.safeParse(formData.get('name'))
			const weeks = WeeksField.safeParse(formData.get('weeks'))
			const atIndex = AtIndexField.safeParse(formData.get('atIndex'))
			const rhythm = RhythmField.safeParse(formData.get('rhythm'))
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			if (!name.success) return refuse(firstIssue(name.error))
			if (!weeks.success) return refuse(firstIssue(weeks.error))
			// A garbled position is refused rather than clamped to 0: falling back to
			// "at the start" would put the phase in the most disruptive place in the
			// season, which is nowhere the athlete pointed at.
			if (!atIndex.success) return refuse(POSITION_UNREADABLE)
			if (!rhythm.success) return refuse(firstIssue(rhythm.error))
			return report(
				await addPhase(userId, {
					outlineId: outlineId.data,
					atIndex: atIndex.data,
					name: name.data,
					weeks: weeks.data,
					rhythm: rhythm.data,
					tapers: checked(formData, 'tapers'),
				}),
			)
		}
		case 'rename-phase': {
			const name = NameField.safeParse(formData.get('name'))
			if (!phaseId.success) return refuse(PHASE_GONE)
			if (!name.success) return refuse(firstIssue(name.error))
			return report(
				await renamePhase(userId, { phaseId: phaseId.data, name: name.data }),
			)
		}
		case 'resize-phase': {
			const weeks = WeeksField.safeParse(formData.get('weeks'))
			if (!phaseId.success) return refuse(PHASE_GONE)
			if (!weeks.success) return refuse(firstIssue(weeks.error))
			return report(
				await resizePhase(userId, { phaseId: phaseId.data, weeks: weeks.data }),
			)
		}
		case 'set-phase-rhythm': {
			const rhythm = RhythmField.safeParse(formData.get('rhythm'))
			if (!phaseId.success) return refuse(PHASE_GONE)
			if (!rhythm.success) return refuse(firstIssue(rhythm.error))
			return report(
				await setPhaseRhythm(userId, {
					phaseId: phaseId.data,
					rhythm: rhythm.data,
					tapers: checked(formData, 'tapers'),
				}),
			)
		}
		case 'move-phase': {
			if (!phaseId.success) return refuse(PHASE_GONE)
			return report(
				await movePhase(userId, {
					phaseId: phaseId.data,
					direction:
						formData.get('direction') === 'later' ? 'later' : 'earlier',
				}),
			)
		}
		case 'remove-phase': {
			if (!phaseId.success) return refuse(PHASE_GONE)
			return report(await removePhase(userId, { phaseId: phaseId.data }))
		}
		case 'set-segment-rates':
			return authorSegmentRates(userId, formData)
		case 'delete-plan': {
			if (!outlineId.success) return refuse(OUTLINE_GONE)
			const deleted = await deletePlanOutline(userId, {
				outlineId: outlineId.data,
			})
			if (!deleted.ok) return report(deleted)
			// Home, not back here: this athlete may have no plan left to render, and the
			// Plan card is where the absence reads honestly.
			return redirectWithToast('/', {
				type: 'success',
				title: 'Plan deleted',
				description: 'Your event and your trained sessions are untouched.',
			})
		}
	}

	return refuse('That is not something this page can do.')
}

const PHASE_GONE = 'That phase is no longer part of this plan.'
const OUTLINE_GONE = 'That plan is not available to edit.'
const POSITION_UNREADABLE = 'Choose where the new phase goes.'

/** A refusal the athlete reads, at the top of the reading that produced it. */
function refuse(error: string) {
	return data({ error }, { status: 400 })
}

function firstIssue(error: z.ZodError): string {
	return error.issues[0]?.message ?? 'That is not a value this phase can take.'
}

/**
 * One service result, worded. Every refusal is a state the athlete can act on, so
 * each is a sentence and none is an exception; typing the map to the union makes a
 * refusal added later a compile error here rather than a silent catch-all.
 */
function report(
	result: { ok: true } | { ok: false; reason: PhaseEditRefusal },
) {
	if (result.ok) return { ok: true as const }
	return refuse(refusalMessage(result.reason))
}

function refusalMessage(reason: PhaseEditRefusal): string {
	switch (reason) {
		case 'outline-not-found':
			return OUTLINE_GONE
		case 'phase-not-found':
			return PHASE_GONE
		case 'plan-too-long':
			return 'That would run your plan past two years. Shorten a phase first.'
		case 'last-phase':
			return 'A plan keeps at least one phase. Delete the plan itself if that is what you want.'
		case 'at-the-edge':
			// Either end, since one message serves both directions: naming "start" for a
			// Move later would be the wrong word half the time.
			return 'That phase is already at that end of your season.'
	}
}

/**
 * Author one endurance segment's progression.
 *
 * The reply carries the `segmentId` it belongs to, so a rejected save reports on the
 * card it was typed into and leaves the other phases' forms alone. Success needs no
 * redirect: the loader re-runs, and every figure on the page — the derived weeks,
 * the **Season Span**, the guard — is recomputed from the rows that just changed.
 *
 * This one reports through Conform because it is four numeric fields with per-field
 * errors; the structural edits report a sentence, because a rename has one thing to
 * say. Both are reached through `intent`, so the dispatch reads the same either way.
 */
async function authorSegmentRates(userId: string, formData: FormData) {
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
	const error =
		actionData && 'error' in actionData ? actionData.error : undefined
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
					<SeasonSpanHeadline
						span={soleTrack.span}
						currency={soleTrack.currency}
						total={soleTrack.total}
						weeks={season.weeks}
					/>
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
				<BlocksReading
					season={season}
					error={error}
					actionData={actionData}
				/>
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
	// Taken as a non-null span rather than as the track, so the caller's guard is
	// the only guard: there is no second place that could disagree about whether a
	// span exists.
	span,
	currency,
	total,
	weeks,
}: {
	span: NonNullable<SeasonTrack['span']>
	currency: SeasonTrack['currency']
	total: SeasonTrack['total']
	weeks: SeasonData['weeks']
}) {
	const peakWeek = weeks[span.peakWeekIndex]

	return (
		<div className="space-y-1">
			<p className="text-2xl font-semibold tabular-nums">
				{formatWeeklyVolume(span.anchor, currency)} →{' '}
				{formatWeeklyVolume(span.peak, currency)}
			</p>
			<p className="text-muted-foreground text-sm">
				Where you start to your peak loading week
				{peakWeek ? `, week ${peakWeek.weekInPlan}` : null} · read from your
				anchor and your ramps, never added up from sessions
				{total == null
					? null
					: ` · ${formatVolumeTotal(total, currency)} across the season`}
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
 *
 * The two subjects are worded separately because they are different quantities. A
 * ramp is a rate *per loading week*; a boundary step happens **once**, at a
 * segment's opening. `RAMP_GUARD_MAX` is one constant measured against both — which
 * is what #403 asks for — so the copy must not describe the step with the ramp's
 * "a week", or it would state a per-week rule about a one-time number.
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
					The convention is {formatSignedPercent(RAMP_GUARD_MAX)} — per loading
					week for a ramp, and in one go for a step at an opening. Bigger than
					that is unusual rather than unsafe: no volume rule has been shown to
					prevent injury, so this is a note and not a limit. Your numbers are
					saved exactly as you authored them.
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
	error,
	actionData,
}: {
	season: SeasonData
	/** A refused *structural* edit, said once above the phases it was aimed at. */
	error?: string
	actionData: SegmentActionData
}) {
	// A track with no phase-bound segment authors no progression here: a strength
	// track's segments are dated and float free of the phases (ADR 0047 §6).
	const enduranceTracks = season.tracks.filter(
		(track) => track.segments.length > 0,
	)
	const warnings = enduranceTracks.flatMap((track) => track.warnings)

	return (
		<div className="space-y-8">
			{error ? (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			) : null}
			{warnings.length > 0 ? (
				<RampGuardNotice warnings={warnings} phases={season.phases} />
			) : null}

			<ol aria-label="Phases" className="space-y-3">
				{season.phases.map((phase, position) => (
					// Keyed by the phase's own id: position orders the season and identity
					// edits it, and an index key would carry a card's local state onto its
					// neighbour the moment two phases swap places.
					<li key={phase.id}>
						{/* The structure and the progression are two acts on one card: the
						    phase's own controls come from the editor module, and each
						    endurance track's rates are nested inside it. */}
						<PhaseCard
							phase={phase}
							position={position}
							phaseCount={season.phases.length}
							// Compared by *position*, so a season with two phases named "Base"
							// lights up one of them rather than both (ADR 0044 §2).
							isCurrent={position === season.currentPhaseIndex}
							timezone={season.timezone}
						>
							{enduranceTracks.map((track) => {
								const segment = track.segments.find(
									(candidate) => candidate.phaseIndex === position,
								)
								return segment ? (
									<SegmentProgressionForm
										key={track.discipline}
										segment={segment}
										phase={phase}
										// The step applies where a boundary is *crossed*, and the
										// season's opening block crosses none (ADR 0040 §3).
										opensTheSeason={position === 0}
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
						</PhaseCard>
					</li>
				))}
			</ol>

			<AddPhaseForm outlineId={season.outlineId} phases={season.phases} />
			<DeletePlanSection
				outlineId={season.outlineId}
				eventName={season.eventName}
			/>
		</div>
	)
}

/** One field of the progression form, and the Conform metadata behind it. */
type RateMeta = ReturnType<
	typeof useForm<RateFormValue>
>[1][keyof RateFormValue]
type RateFormValue = z.input<typeof SegmentFormSchema>

/**
 * One authored rate: a percent field, and underneath it what the field currently
 * *means* — either the athlete's own number read back, or what blank falls through
 * to.
 *
 * That pairing is the whole point and is why every rate goes through one component:
 * an unset rate must read as blank **plus** a stated convention, never as the
 * convention's number sitting in the box (ADR 0044 §4).
 */
function RateField({
	meta,
	label,
	meaning,
	nonNegative = false,
}: {
	meta: RateMeta
	label: string
	meaning: string
	/** Cuts are a depth and never a direction, so they take no negative. */
	nonNegative?: boolean
}) {
	return (
		<div>
			<Field
				labelProps={{ children: label }}
				inputProps={{
					...getInputProps(meta, { type: 'number' }),
					step: 'any',
					...(nonNegative ? { min: 0 } : {}),
					inputMode: 'decimal',
				}}
				errors={meta.errors as string[] | undefined}
			/>
			<p className="text-muted-foreground mt-1 text-sm">{meaning}</p>
		</div>
	)
}

/**
 * A rate this phase shows no field for, carried through the save anyway.
 *
 * `EnduranceSegmentSetSchema` writes all four rates every time — it has to, or
 * clearing one back to the convention would be unexpressible — so a missing input
 * would read as blank and silently wipe what is stored. A block that does not taper
 * must not clear the taper cut of one that does.
 */
function CarriedRate({
	meta,
	fraction,
}: {
	meta: RateMeta
	fraction: number | null
}) {
	return (
		<input type="hidden" name={meta.name} value={formatRateField(fraction)} />
	)
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
		// report on the card it was typed into and leave its siblings untouched. The
		// narrowing is on `segmentId` because the action answers the structural edits
		// too, and those replies carry a sentence rather than a submission.
		lastResult:
			actionData && 'segmentId' in actionData &&
			actionData.segmentId === segment.segmentId
				? actionData.result
				: undefined,
		defaultValue: {
			ramp: formatRateField(segment.ramp),
			boundaryStep: formatRateField(segment.boundaryStep),
			recoveryCut: formatRateField(segment.recoveryCut),
			taperCut: formatRateField(segment.taperCut),
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SegmentFormSchema })
		},
	})

	return (
		<Form method="POST" {...getFormProps(form)} className="space-y-4">
			{/* Named, because this page's action dispatches on `intent`: the structural
			    edits and this progression save land on the same route. */}
			<input type="hidden" name="intent" value="set-segment-rates" />
			<input type="hidden" name="segmentId" value={segment.segmentId} />
			{trackLabel ? (
				<p className="text-sm font-medium">{trackLabel} progression</p>
			) : null}

			<div className="grid gap-4 sm:grid-cols-2">
				<RateField
					meta={fields.ramp}
					label="Volume ramp, % a loading week"
					meaning={
						segment.ramp == null
							? 'Blank — volume holds level through this block.'
							: `${formatSignedPercent(segment.ramp)} on every loading week. Recovery weeks and tapers do not step.`
					}
				/>

				{opensTheSeason ? (
					// The season's first block opens on the Season Anchor itself, so there
					// is nothing for a step to step from. Said out loud rather than shown as
					// a field that would do nothing (ADR 0044 §8's rule against dead
					// controls).
					<>
						<CarriedRate
							meta={fields.boundaryStep}
							fraction={segment.boundaryStep}
						/>
						<p className="text-muted-foreground self-end text-sm">
							Your season opens here, so there is no boundary to step at.
						</p>
					</>
				) : (
					<RateField
						meta={fields.boundaryStep}
						label="Boundary step at this block’s opening, %"
						meaning={
							segment.boundaryStep == null
								? 'Blank — this block opens continuous with the week before it.'
								: `${formatSignedPercent(segment.boundaryStep)} once, at the opening. A deliberate drop into an intensity block belongs here rather than in the ramp.`
						}
					/>
				)}

				{hasRecoveryWeeks ? (
					<RateField
						meta={fields.recoveryCut}
						label="Recovery week cut, %"
						nonNegative
						meaning={
							segment.recoveryCut == null
								? `Blank — follows the documented convention, ${formatSignedPercent(-DEFAULT_RECOVERY_CUT)} off your last loading week. Leave it blank and it moves if the convention does.`
								: `Yours: ${formatSignedPercent(-segment.recoveryCut)} off your last loading week.`
						}
					/>
				) : (
					<CarriedRate
						meta={fields.recoveryCut}
						fraction={segment.recoveryCut}
					/>
				)}

				{phase.tapers ? (
					<RateField
						meta={fields.taperCut}
						label="Taper cut by the event, %"
						nonNegative
						meaning={`${
							segment.taperCut == null
								? `Blank — follows the documented convention, ${formatSignedPercent(-DEFAULT_TAPER_CUT)} by your event. Leave it blank and it moves if the convention does.`
								: `Yours: ${formatSignedPercent(-segment.taperCut)} by your event.`
						} The taper descends across the block rather than dropping in its last week.`}
					/>
				) : (
					<CarriedRate meta={fields.taperCut} fraction={segment.taperCut} />
				)}
			</div>

			<ErrorList errors={form.errors as string[] | undefined} />

			{/* Full-width on phones, inline from `sm` (ui-conventions §1.8), and no
			    `size` override: a route file does not set control heights (§2.1). */}
			<Button type="submit" variant="outline" className="w-full sm:w-auto">
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
