/**
 * The **Blocks** reading's lifting section: a strength **Training Track**'s dated
 * segments, authored (#409, ADR 0047).
 *
 * Split out of `plan.tsx` for the reason `__phase-editor.tsx` and
 * `__week-pattern-editor.tsx` are — the route owns the loader, the action and the
 * two readings; this module owns the controls one of those readings is built from.
 *
 * **Why this is a section and not a card on a phase.** A strength segment is
 * *dated*: it opens on a week the athlete picks and runs for a duration they
 * author, and it floats free of the **Plan Outline** phases (ADR 0047 §6). So there
 * is no phase card for it to sit on, it is laid out along the plan's own weeks
 * instead, and the weeks between two blocks are the authored **"no lifting these
 * weeks"** rather than a hole in the plan.
 *
 * **Three rules this module's copy is bound by**, each an ADR 0047 decision made
 * visible rather than merely obeyed:
 *
 * - **The `%1RM` band and the rep range are derived from the Strength Goal and
 *   cannot be typed** (§3). `DerivedPrescription` renders them as a reading with no
 *   input anywhere near them, and says out loud where they come from.
 * - **Nothing derives or displays sets per week from the goal** (§3). Weekly volume
 *   is the **Season Anchor**'s and the **Volume Ramp**'s, and a second source for
 *   that one number is exactly the conflict the ADR removed. ACSM's `≥10 sets/wk`
 *   is deliberately absent, here and everywhere else on this page.
 * - **No citable range attaches to `sets`** (ADR 0047 "Accepted costs"). `sets`
 *   means *total working sets per week*, systemic — nobody publishes a figure for
 *   that, so the section says so plainly rather than borrowing a per-muscle-group
 *   number and letting it read as one.
 *
 * And the trap `plan.tsx` warns about applies here too: **a blank rate box means
 * "follow the documented convention"** (ADR 0044 §4), which is why every one of
 * them reads back blank with the convention stated underneath, and never with the
 * convention's own number sitting in the box.
 */
import {
	getFormProps,
	getInputProps,
	useForm,
	type SubmissionResult,
} from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { Form } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field, SelectField } from '#app/components/forms.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import {
	formatDate,
	formatPct1RMBand,
	formatRateField,
	formatRepRange,
	formatSignedPercent,
	formatWeeks,
	formatWeekSpan,
	parseRateField,
} from '#app/utils/format.ts'
import {
	BOUNDARY_STEP_OUT_OF_FORCE_LABELS,
	DISCIPLINE_LABELS,
	STRENGTH_GOAL_LABELS,
	VOLUME_CURRENCY_UNITS,
	type BoundaryStepOutOfForce,
} from '#app/utils/labels.ts'
import {
	MAX_PLAN_WEEKS,
	MAX_QUALITY_SESSIONS_PER_WEEK,
} from '#app/utils/plan-outline/authoring-schema.ts'
import {
	DEFAULT_DELOAD_CUT,
	DEFAULT_DELOAD_WEEKS,
	STRENGTH_GOALS,
	strengthBoundaryStepInForce,
	type AnchorPlacement,
	type StrengthGoal,
	type StrengthWindow,
	type VolumeCurrency,
} from '#app/utils/plan-outline/derive.ts'
import { strengthPrescription } from '#app/utils/plan-outline/strength-goal.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'

/**
 * One stored strength segment as this module edits it: everything it authors, plus
 * the 1-based week its window opens on.
 *
 * `startWeekInPlan` is `null` for a segment whose opening week is no longer one of
 * the plan's — a structural edit can shorten a season under a dated block, and
 * nothing cascades to one that floats free of the phases. Shown rather than hidden,
 * because a block the athlete cannot see is a block they cannot move back in.
 */
export type EditableStrengthSegment = {
	segmentId: string
	startWeekKey: string
	startWeekInPlan: number | null
	weeks: number
	ramp: number | null
	boundaryStep: number | null
	goal: StrengthGoal
	sessionsPerWeek: number
	deloadCut: number | null
	deloadWeeks: number | null
}

/** A strength track and the blocks authored on it, in opening order. */
export type EditableStrengthTrack = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	segments: EditableStrengthSegment[]
	/**
	 * Where this track's **Season Anchor** segments take effect, as the 0-based week
	 * indices the derivation counts in (ADR 0040 §3) — not the 1-based week a row is
	 * *shown* as, because nothing here displays them. They are read for one question
	 * only: whether a block's **Block Boundary Step** is a step the walk applies, or
	 * one an anchor restarting at that block's opening already swallowed (§5).
	 *
	 * Required, because the one surface that builds this type reads them anyway. `[]`
	 * is the positive statement *this track has no anchor yet*, under which no step is
	 * in force because no week has a target at all — which is a different thing from
	 * a caller having nothing to say, a state this type no longer admits.
	 */
	anchors: AnchorPlacement[]
}

/** One of the plan's Training Weeks, as the start-week picker offers it. */
export type StrengthWeekOption = {
	weekKey: string
	weekInPlan: number
	startsAt: Date
}

/**
 * A rate as the athlete types it: a **whole percent**, or blank.
 *
 * The same shape as the endurance progression form's `RatePercentSchema`, and
 * deliberately the same *meaning*: blank is `null`, and `null` is a choice — "no
 * ramp", "no step", "follow the documented convention" — so it travels as a value
 * rather than as an omitted field. Storage keeps fractions (ADR 0040 §10), and the
 * division happens at this boundary rather than anywhere the derivation can see it.
 */
const RatePercentField = z
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
	.default('')

/**
 * A whole number the athlete must answer — how many weeks the block runs, and how
 * many sessions a week it asks for.
 *
 * Blank is refused rather than read as `0`, because `Number('')` is 0 and a zero
 * would come back as a bound the athlete broke ("a block with no sessions in it is
 * a block that is not there") when what happened is that nothing was typed. The
 * *bounds* are not restated here — they are the authoring schema's, re-parsed at
 * the route boundary — so a rule cannot move on one side of the form only.
 */
function requiredWholeNumber(blank: string, notWhole: string) {
	return z
		.string()
		.trim()
		.transform((raw, ctx) => {
			if (raw === '') {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: blank })
				return z.NEVER
			}
			const value = Number(raw)
			if (!Number.isInteger(value)) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: notWhole })
				return z.NEVER
			}
			return value
		})
		.default('')
}

/**
 * How many tail weeks deload: a whole number, `0`, or blank.
 *
 * **Three states, not two.** Blank is the documented convention; `0` is the athlete
 * positively saying this block has no deload; any other number is theirs. That is
 * why this is nullable-and-present rather than optional, and why `0` may not be
 * folded into blank (ADR 0044 §4, `DeloadWeeksSchema`).
 */
const DeloadWeeksField = z
	.string()
	.trim()
	.transform((raw, ctx) => {
		if (raw === '') return null
		const weeks = Number(raw)
		if (!Number.isInteger(weeks)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'A whole number of weeks, or blank for the convention',
			})
			return z.NEVER
		}
		return weeks
	})
	.default('')

/**
 * Everything a lifting block authors, as the form submits it — one schema for the
 * add and for the edit alike, mirroring `strengthSegmentFields` in
 * `authoring-schema.ts` so the two cannot drift on what a block *is*.
 *
 * The row's handle — a `trackId` when adding, a `segmentId` when editing — is
 * **not** here. It is a hidden input the action reads straight off the body, the
 * way every structural edit on this page reads its id, so one field set serves both
 * forms and neither carries a key the other has no use for.
 *
 * There is **no field for the `%1RM` band and none for the rep range**, and nowhere
 * for one to go: they are derived from `goal` (ADR 0047 §3). Not a control this
 * form hides — a control this form cannot have.
 */
export const StrengthSegmentFormSchema = z.object({
	startWeekKey: z.string().min(1, 'Pick the week this block opens'),
	weeks: requiredWholeNumber(
		'How many weeks does this block run?',
		'A block runs in whole weeks',
	),
	goal: z.enum(STRENGTH_GOALS, {
		errorMap: () => ({ message: 'Pick what this block is for' }),
	}),
	sessionsPerWeek: requiredWholeNumber(
		'How many lifting sessions a week?',
		'A session count is a whole number',
	),
	ramp: RatePercentField,
	boundaryStep: RatePercentField,
	deloadCut: RatePercentField,
	deloadWeeks: DeloadWeeksField,
})

type StrengthFormValue = z.input<typeof StrengthSegmentFormSchema>
type StrengthFields = ReturnType<typeof useForm<StrengthFormValue>>[1]

/**
 * What the action replies with, as this module reads it. Declared structurally
 * rather than imported from the route so the dependency runs one way — but as the
 * **union the route actually returns**, not an open bag: a submission keyed by its
 * row, a refusal sentence, or a bare success. No index signature, because one would
 * make every property access legal and force the `result` back through a cast,
 * throwing away exactly the typing the two endurance forms are careful about.
 */
export type StrengthActionData =
	| {
			intent: string
			/** One of the two handles, depending on which form was posted. */
			trackId?: string
			segmentId?: string
			result: SubmissionResult<string[]>
	  }
	| { error: string }
	| { ok: true }
	/**
	 * A stamp waiting on the athlete's confirmation (#412), and a week copy waiting
	 * on the same (#415). Nothing in this module reads either — they are here
	 * because this type is *the union the route returns*, and a member left out is a
	 * lie the compiler would enforce.
	 */
	| { stamp: unknown }
	| { copy: unknown }
	| undefined

/**
 * Whether a block may present its **Block Boundary Step** as a live field — and
 * where it may not, the reason the athlete is owed in its place.
 *
 * `plan.tsx`'s union for the phase side, said again here rather than imported: the
 * route imports this module, so reaching back for two lines of shape would be a
 * cycle, and the thing the two surfaces must not word twice is the *sentence* —
 * which is why the member is the token and the sentence is
 * {@link BOUNDARY_STEP_OUT_OF_FORCE_LABELS}'.
 */
type BoundaryStepStanding =
	| { inForce: true }
	| { inForce: false; reason: BoundaryStepOutOfForce }

/**
 * Which of a track's blocks may present the **Block Boundary Step** as a live
 * field — one entry per block, in `track.segments` order, and where it may not, why.
 *
 * The rule is `strengthBoundaryStepInForce`'s and is read from it rather than
 * restated here: the derivation skips the step of the block the anchor in force
 * restarted in (ADR 0040 §5), and a field offered there is a control the athlete can
 * change that changes nothing (ADR 0044 §8). One reading, so the surface and the
 * arithmetic cannot come to disagree about which steps count.
 *
 * **Two ways to be out of force, and the athlete gets the one that applies.** The
 * rule answers `false` both for a block an anchor restarts on and for a block no
 * anchor reaches at all, and those are opposite states of the plan: one opens at a
 * number the athlete typed, the other has no level whatsoever and reads Unavailable
 * in the week grid beside it. Telling a lifter their anchor takes effect on a week
 * their anchor does not reach is worse than saying nothing. There is no third
 * reason here — a lifting block is dated, so opening the season is not by itself a
 * state (ADR 0047 §6) — and the `no-anchor-yet` test is an **existence** check
 * rather than a second copy of the selection rule, exactly as `plan.tsx`'s is.
 *
 * Answered for the whole track at once because the question is about the track: the
 * rule places the anchor's week among *all* the blocks, not inside the one asking.
 *
 * **In force** wherever this module cannot tell — a block opening on a week the plan
 * no longer covers, which the derivation prices nowhere at all. A live field there is
 * the lesser fault: calling a control dead on evidence we do not have is the same
 * error inverted, and the card already says such a block sits outside the plan.
 */
function boundaryStepStandings(
	track: EditableStrengthTrack,
): BoundaryStepStanding[] {
	const anchors = track.anchors

	const windows = track.segments.map((segment) =>
		segment.startWeekInPlan == null
			? null
			: { startWeekIndex: segment.startWeekInPlan - 1, weeks: segment.weeks },
	)
	// The rule matches a block by identity, so the placed windows must be the very
	// objects it is asked about — a second `map` here would answer about copies.
	const placed = windows.filter(
		(window): window is StrengthWindow => window != null,
	)
	return windows.map((window) => {
		if (window == null) return { inForce: true }
		if (strengthBoundaryStepInForce(placed, anchors, window)) {
			return { inForce: true }
		}
		return anchors.some(
			(anchor) => anchor.fromWeekIndex <= window.startWeekIndex,
		)
			? { inForce: false, reason: 'anchor-opens-here' }
			: { inForce: false, reason: 'no-anchor-yet' }
	})
}

/** The reply for one form, or nothing — keyed by intent *and* by the row it is about. */
function replyFor(
	actionData: StrengthActionData,
	intent: string,
	key: 'trackId' | 'segmentId',
	id: string,
): SubmissionResult<string[]> | undefined {
	// Narrowed on the intent *and* the handle, the way `SegmentProgressionForm` and
	// `SegmentMixForm` narrow theirs: a structural refusal carries no submission at
	// all, and a reply meant for another row would blank fields it says nothing about.
	if (!actionData || !('intent' in actionData)) return undefined
	if (actionData.intent !== intent) return undefined
	return actionData[key] === id ? actionData.result : undefined
}

/**
 * The lifting section: every strength track's blocks, laid out along the plan's
 * weeks, with one form to add another.
 *
 * Rendered only where the plan has a strength track — a runner is not shown an
 * empty gym.
 */
export function StrengthBlocksSection({
	tracks,
	weeks,
	timezone,
	actionData,
}: {
	tracks: EditableStrengthTrack[]
	weeks: StrengthWeekOption[]
	timezone: string
	actionData: StrengthActionData
}) {
	if (tracks.length === 0) return null

	return (
		<section aria-labelledby="lifting-blocks" className="space-y-4">
			{/* The section's name lives on the `Disclosure` summary that opens it, so
			    this heading is the accessible name only — dropping it would leave the
			    region unnamed, and showing it would print the name twice. */}
			<h2 id="lifting-blocks" className="sr-only">
				Lifting blocks
			</h2>
			<p className="text-muted-foreground text-sm">
				A lifting block is <strong>dated</strong>: it opens on a week you pick
				and runs for as long as you say, so it can start and finish inside a
				phase rather than beside one. The weeks between two blocks are{' '}
				<strong>no lifting</strong> — something you said, not a gap in your
				plan.
			</p>
			{tracks.map((track) => {
				const standings = boundaryStepStandings(track)
				return (
					<div key={track.trackId} className="space-y-4">
						{tracks.length > 1 ? (
							<h3 className="text-base font-medium">
								{DISCIPLINE_LABELS[track.discipline]}
							</h3>
						) : null}
						<p className="text-muted-foreground text-sm">
							This track is planned in{' '}
							<strong>{VOLUME_CURRENCY_UNITS[track.currency]}</strong> — your
							week&rsquo;s <strong>total working sets</strong>, counted across
							your whole body rather than per muscle group or per movement.
							There is no published number to hold that against: nobody measures
							a weekly set count that way, so the figure to plan from is your
							own — your anchor comes from the sets you already log, and your
							ramp is how fast you grow it.
						</p>
						<ol aria-label="Lifting blocks" className="space-y-3">
							{track.segments.map((segment, index) => (
								<li key={segment.segmentId}>
									<StrengthSegmentCard
										segment={segment}
										boundaryStep={standings[index] ?? { inForce: true }}
										weeks={weeks}
										timezone={timezone}
										actionData={actionData}
									/>
								</li>
							))}
						</ol>
						{track.segments.length === 0 ? (
							<p className="text-sm">
								No lifting blocks yet, so every week of this plan reads{' '}
								<strong>no lifting</strong>. Add one below when you know which
								weeks you are in the gym.
							</p>
						) : null}
						<AddStrengthSegmentForm
							track={track}
							weeks={weeks}
							timezone={timezone}
							actionData={actionData}
						/>
					</div>
				)
			})}
		</section>
	)
}

/**
 * One lifting block, read and edited — the window, the progression, the goal and
 * the frequency in a single save.
 *
 * **Whole, every time.** `StrengthSegmentSetSchema` rewrites every column, because
 * a partial update would make "clear this back to the convention" the one edit the
 * surface could not perform (ADR 0044 §4), and because a moved block and a resized
 * one are the same action on start-plus-length (ADR 0047 §6).
 */
function StrengthSegmentCard({
	segment,
	boundaryStep,
	weeks,
	timezone,
	actionData,
}: {
	segment: EditableStrengthSegment
	/** Whether this block's step is one the walk applies — {@link boundaryStepStandings}. */
	boundaryStep: BoundaryStepStanding
	weeks: StrengthWeekOption[]
	timezone: string
	actionData: StrengthActionData
}) {
	const lastWeekInPlan =
		segment.startWeekInPlan == null
			? null
			: segment.startWeekInPlan + segment.weeks - 1

	return (
		<Card>
			<CardHeader className="gap-1">
				<CardTitle className="flex flex-wrap items-center gap-2 text-base">
					{segment.startWeekInPlan == null || lastWeekInPlan == null
						? 'Outside your plan’s weeks'
						: formatWeekSpan(segment.startWeekInPlan, lastWeekInPlan)}
					<Badge variant="secondary">
						{STRENGTH_GOAL_LABELS[segment.goal]}
					</Badge>
				</CardTitle>
				<p className="text-muted-foreground text-sm">
					{segment.startWeekInPlan == null
						? 'This block opens on a week your plan no longer covers — a block is dated, so shortening your season leaves it where it was. Pick a week below to bring it back in.'
						: `${formatWeeks(segment.weeks)} · ${segment.sessionsPerWeek}× a week`}
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<StrengthSegmentForm
					segment={segment}
					boundaryStep={boundaryStep}
					weeks={weeks}
					timezone={timezone}
					actionData={actionData}
				/>
				{/* Its own form, because a submit carries one name/value pair and this
				    one is not an edit of the fields above it. */}
				<Form method="POST">
					<input type="hidden" name="intent" value="remove-strength-segment" />
					<input type="hidden" name="segmentId" value={segment.segmentId} />
					<Button
						type="submit"
						variant="ghost"
						size="sm"
						className="w-full sm:w-auto"
					>
						Remove block
					</Button>
				</Form>
			</CardContent>
		</Card>
	)
}

function StrengthSegmentForm({
	segment,
	boundaryStep,
	weeks,
	timezone,
	actionData,
}: {
	segment: EditableStrengthSegment
	boundaryStep: BoundaryStepStanding
	weeks: StrengthWeekOption[]
	timezone: string
	actionData: StrengthActionData
}) {
	const [form, fields] = useForm({
		id: `strength-${segment.segmentId}`,
		// Narrowed on the intent *and* the row, so a refused save reports on the card
		// it was typed into and leaves every other block — and the add form below
		// them — untouched. The same rule the two endurance forms follow.
		lastResult: replyFor(
			actionData,
			'set-strength-segment',
			'segmentId',
			segment.segmentId,
		),
		defaultValue: {
			startWeekKey: segment.startWeekKey,
			weeks: String(segment.weeks),
			goal: segment.goal,
			sessionsPerWeek: String(segment.sessionsPerWeek),
			// An unset rate reads back **blank**, never the convention's number: a
			// convention that moves later must not look like an edit to the athlete's
			// plan (ADR 0044 §4). `formatRateField` is that rule in one place.
			ramp: formatRateField(segment.ramp),
			boundaryStep: formatRateField(segment.boundaryStep),
			deloadCut: formatRateField(segment.deloadCut),
			deloadWeeks:
				segment.deloadWeeks == null ? '' : String(segment.deloadWeeks),
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: StrengthSegmentFormSchema })
		},
	})

	return (
		<Form method="POST" {...getFormProps(form)} className="space-y-4">
			<input type="hidden" name="intent" value="set-strength-segment" />
			<input type="hidden" name="segmentId" value={segment.segmentId} />
			<StrengthSegmentFields
				fields={fields}
				boundaryStep={boundaryStep}
				weeks={weeks}
				timezone={timezone}
				idSuffix={segment.segmentId}
			/>
			<ErrorList errors={form.errors as string[] | undefined} />
			<Button type="submit" variant="outline" className="w-full sm:w-auto">
				Save block
			</Button>
		</Form>
	)
}

/**
 * Add a lifting block to a track.
 *
 * The window is the athlete's: nothing proposes a start week, a length or a goal,
 * and nothing proposes a higher opening volume than the block before it — ADR 0047
 * §7 refuses the upward ratchet outright, so the ramp box opens blank like every
 * other rate on this page.
 */
function AddStrengthSegmentForm({
	track,
	weeks,
	timezone,
	actionData,
}: {
	track: EditableStrengthTrack
	weeks: StrengthWeekOption[]
	timezone: string
	actionData: StrengthActionData
}) {
	const [form, fields] = useForm({
		id: `add-strength-${track.trackId}`,
		lastResult: replyFor(
			actionData,
			'add-strength-segment',
			'trackId',
			track.trackId,
		),
		defaultValue: {
			startWeekKey: '',
			weeks: '',
			goal: '',
			sessionsPerWeek: '',
			ramp: '',
			boundaryStep: '',
			deloadCut: '',
			deloadWeeks: '',
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: StrengthSegmentFormSchema })
		},
	})

	return (
		<Form method="POST" {...getFormProps(form)} className="space-y-4">
			<input type="hidden" name="intent" value="add-strength-segment" />
			<input type="hidden" name="trackId" value={track.trackId} />
			<h3 className="text-base font-medium">Add a lifting block</h3>
			<StrengthSegmentFields
				fields={fields}
				// A block that does not exist yet has no window and no place among the
				// others, so there is no anchor to place against it: the step is offered,
				// and `boundaryStepStandings` answers the moment the block is saved.
				boundaryStep={{ inForce: true }}
				weeks={weeks}
				timezone={timezone}
				idSuffix={`add-${track.trackId}`}
			/>
			<ErrorList errors={form.errors as string[] | undefined} />
			<Button type="submit" className="w-full sm:w-auto">
				Add block
			</Button>
		</Form>
	)
}

/**
 * The fields a block authors — eight, or seven where the step is out of force and
 * its reason takes the field's place — plus the two figures it derives.
 */
function StrengthSegmentFields({
	fields,
	boundaryStep: standing,
	weeks,
	timezone,
	idSuffix,
}: {
	fields: StrengthFields
	/** Out of force drops the step field and says why — {@link boundaryStepStandings}. */
	boundaryStep: BoundaryStepStanding
	weeks: StrengthWeekOption[]
	timezone: string
	idSuffix: string
}) {
	// Read live off the form rather than off the row, so the band below moves as the
	// athlete changes the goal — which is the derivation being visible rather than
	// merely true (ADR 0047 §3).
	const goal = STRENGTH_GOALS.find((option) => option === fields.goal.value)
	// The two rates as fractions, through the inverse of the formatter that filled
	// the boxes (ADR 0023 §6) — `null` for a blank box, which is the athlete choosing
	// the documented convention rather than a rate of nothing.
	const ramp = parseRateField(fields.ramp.value)
	const boundaryStep = parseRateField(fields.boundaryStep.value)

	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<SelectField
					meta={fields.startWeekKey}
					labelProps={{ children: 'Opens on' }}
					placeholder="Pick a week"
					items={weeks.map((week) => ({
						value: week.weekKey,
						label: `Week ${week.weekInPlan} · ${formatDate(week.startsAt, timezone)}`,
					}))}
					errors={fields.startWeekKey.errors as string[] | undefined}
				/>
				<Field
					labelProps={{ children: 'Weeks' }}
					inputProps={{
						...getInputProps(fields.weeks, { type: 'number' }),
						id: `weeks-${idSuffix}`,
						min: 1,
						max: MAX_PLAN_WEEKS,
						step: 1,
						inputMode: 'numeric',
					}}
					errors={fields.weeks.errors as string[] | undefined}
				/>
				<SelectField
					meta={fields.goal}
					labelProps={{ children: 'What this block is for' }}
					placeholder="Pick a goal"
					items={STRENGTH_GOALS.map((option) => ({
						value: option,
						label: STRENGTH_GOAL_LABELS[option],
					}))}
					errors={fields.goal.errors as string[] | undefined}
				/>
				<Field
					labelProps={{ children: 'Sessions a week' }}
					inputProps={{
						...getInputProps(fields.sessionsPerWeek, { type: 'number' }),
						id: `sessions-${idSuffix}`,
						min: 1,
						max: MAX_QUALITY_SESSIONS_PER_WEEK,
						step: 1,
						inputMode: 'numeric',
					}}
					errors={fields.sessionsPerWeek.errors as string[] | undefined}
				/>
			</div>

			<DerivedPrescription goal={goal} />

			<div className="grid gap-4 sm:grid-cols-2">
				<RateField
					meta={fields.ramp}
					id={`ramp-${idSuffix}`}
					label="Volume ramp, % a loading week"
					meaning={
						ramp == null
							? 'Blank — sets hold level through this block.'
							: `${formatSignedPercent(ramp)} on every loading week. Deload weeks do not step.`
					}
				/>
				{standing.inForce ? (
					<RateField
						meta={fields.boundaryStep}
						id={`step-${idSuffix}`}
						label="Boundary step at this block’s opening, %"
						meaning={
							boundaryStep == null
								? 'Blank — this block opens continuous with the week before it.'
								: `${formatSignedPercent(boundaryStep)} once, at the opening. A deliberate drop into a heavier block belongs here rather than in the ramp.`
						}
					/>
				) : (
					// A step the walk does not apply is the dead control ADR 0044 §8 rules
					// out, so the field goes and the reason takes its place — dropped rather
					// than disabled, the way the endurance form drops it. Which reason
					// depends on the plan: an anchor restarting on this block's opening week
					// already says what it opens at (ADR 0040 §5), while a block no anchor
					// reaches has no level at all, and the two must not be told the same
					// sentence.
					<>
						<CarriedRate meta={fields.boundaryStep} />
						<p className="text-muted-foreground self-end text-sm">
							{BOUNDARY_STEP_OUT_OF_FORCE_LABELS[standing.reason]}
						</p>
					</>
				)}
				<RateField
					meta={fields.deloadCut}
					id={`deload-cut-${idSuffix}`}
					label="Deload cut, %"
					nonNegative
					meaning={deloadCutMeaning(fields.deloadCut.value)}
				/>
				<Field
					labelProps={{ children: 'Deload weeks at the end' }}
					inputProps={{
						...getInputProps(fields.deloadWeeks, { type: 'number' }),
						id: `deload-weeks-${idSuffix}`,
						min: 0,
						step: 1,
						inputMode: 'numeric',
					}}
					errors={fields.deloadWeeks.errors as string[] | undefined}
				/>
			</div>
			<p className="text-muted-foreground text-sm">
				{deloadWeeksMeaning(fields.deloadWeeks.value)}
			</p>
		</div>
	)
}

/**
 * What the deload-cut box currently *means*, which is the whole reason a cut goes
 * through worded text rather than sitting alone in a box.
 *
 * **An unset cut reads as the convention and never as the convention's number**
 * (ADR 0044 §4, ADR 0047 §6): blank says −50%, and an authored 50 says the athlete
 * chose 50. Same depth, different status — one moves if the documented convention
 * moves and the other never does — so the two must not read alike. Exported because
 * that distinction is the AC, and an AC is worth a test of its own.
 */
export function deloadCutMeaning(typed: string | undefined): string {
	const cut = parseRateField(typed)
	if (cut == null) {
		return `Blank — follows the documented convention, ${formatSignedPercent(-DEFAULT_DELOAD_CUT)} for every deload week. Leave it blank and it moves if the convention does.`
	}
	return `Yours: ${formatSignedPercent(-cut)} for every deload week, held flat rather than descending.`
}

/** The same three-state reading for how many tail weeks deload. */
export function deloadWeeksMeaning(typed: string | undefined): string {
	if (!typed) {
		return `Blank — follows the documented convention, ${formatWeeks(DEFAULT_DELOAD_WEEKS)} at the end of the block. Leave it blank and it moves if the convention does.`
	}
	if (typed.trim() === '0') {
		return 'Yours: no deload — this block runs to its last week at full volume.'
	}
	return `Yours: the last ${formatWeeks(Number(typed))} of this block deload, at the cut beside it.`
}

/**
 * The two figures the **Strength Goal** derives: the `%1RM` band and the rep range
 * (ADR 0047 §3).
 *
 * **A reading, and there is no input here.** The band is derived and cannot be
 * typed — that is what makes `30 sets/wk at 90% 1RM` unauthorable rather than
 * merely guarded — so this component renders text and never a control, and the
 * words say where the numbers come from rather than leaving the athlete to guess
 * that they are not editing them.
 *
 * **And no sets figure is read off the goal**, here or anywhere. ACSM states
 * hypertrophy as `≥10 sets/wk`, and deriving that from the goal would give this
 * plan two sources for one number — the conflict ADR 0047 §1 removed. Volume is the
 * **Season Anchor**'s and the **Volume Ramp**'s, and it is authored above.
 */
export function DerivedPrescription({ goal }: { goal?: StrengthGoal }) {
	const prescription = goal ? strengthPrescription(goal) : null

	return (
		<div className="space-y-1">
			<dl className="text-sm">
				<div className="flex flex-wrap gap-x-2">
					<dt className="text-muted-foreground">Load band, derived</dt>
					<dd className="font-medium tabular-nums">
						{prescription ? formatPct1RMBand(prescription.band) : 'Pick a goal'}
					</dd>
				</div>
				<div className="flex flex-wrap gap-x-2">
					<dt className="text-muted-foreground">Reps, derived</dt>
					<dd className="font-medium tabular-nums">
						{prescription ? formatRepRange(prescription.reps) : 'Pick a goal'}
					</dd>
				</div>
			</dl>
			<p className="text-muted-foreground text-sm">
				Both come from the goal you picked above and there is nothing to type:
				change the goal and the band moves with it. How much lifting is a
				separate question and is not read off the goal — that is your anchor and
				your ramp, so this plan never has two sources for one number.
			</p>
		</div>
	)
}

/**
 * One authored rate: a percent field, and underneath it what the field currently
 * *means*. The endurance progression form's `RateField` in the same shape and for
 * the same reason — an unset rate must read as blank **plus** a stated convention.
 */
function RateField({
	meta,
	id,
	label,
	meaning,
	nonNegative = false,
}: {
	meta: StrengthFields[keyof StrengthFormValue]
	id: string
	label: string
	meaning: string
	/** A cut is a depth and never a direction, so it takes no negative. */
	nonNegative?: boolean
}) {
	return (
		<div>
			<Field
				labelProps={{ children: label }}
				inputProps={{
					...getInputProps(meta, { type: 'number' }),
					id,
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
 * A rate this block shows no field for, carried through the save anyway.
 *
 * `StrengthSegmentSetSchema` rewrites every column — *whole, every time*, above —
 * and `RatePercentField` reads a missing box as blank, so dropping the input would
 * clear an authored step the moment the athlete saved anything else on the card. A
 * block whose anchor currently swallows its step must not forget the step the day
 * the anchor moves off its opening week.
 *
 * The endurance progression form's `CarriedRate` in the same shape and for the same
 * reason. The value travels exactly as `formatRateField` wrote it into the form
 * (ADR 0023 §6), so nothing here re-renders a number in a second register.
 */
function CarriedRate({
	meta,
}: {
	meta: StrengthFields[keyof StrengthFormValue]
}) {
	return <input type="hidden" name={meta.name} value={meta.value ?? ''} />
}
