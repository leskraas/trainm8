/**
 * One endurance segment's two forms on a phase card (`plan.tsx`, #533): its
 * progression — the Volume Ramp, the Block Boundary Step and the cuts — and its
 * Quality Session Mix, with the form schemas the action parses them with
 * (`__segment-editor.server.ts`).
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v3'
import { Form } from 'react-router'
import { z } from 'zod/v3'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	formatNbEmphasisLabel,
	formatNbSignedPercent,
	formatRateField,
} from '#app/utils/format.ts'
import {
	NB_BOUNDARY_STEP_OUT_OF_FORCE_LABELS,
	NB_QUALITY_ZONE_LABELS,
	SESONG_SEGMENT_LABELS,
	type BoundaryStepOutOfForce,
} from '#app/utils/labels.ts'
import { MAX_QUALITY_SESSIONS_PER_WEEK } from '#app/utils/plan-outline/authoring-schema.ts'
import {
	boundaryStepInForce,
	DEFAULT_RECOVERY_CUT,
	DEFAULT_TAPER_CUT,
	type AnchorPlacement,
} from '#app/utils/plan-outline/derive.ts'
import {
	emphasisTerms,
	QUALITY_ZONES,
	qualitySessionCount,
	type QualityZone,
} from '#app/utils/plan-outline/quality-mix.ts'
import {
	type SeasonPhaseData,
	type SegmentData,
	type SegmentActionData,
} from './__plan-season.ts'

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
				message: SESONG_SEGMENT_LABELS.typeRate,
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
export const SegmentFormSchema = z.object({
	segmentId: z.string().min(1),
	ramp: RatePercentSchema.default(''),
	boundaryStep: RatePercentSchema.default(''),
	recoveryCut: RatePercentSchema.default(''),
	taperCut: RatePercentSchema.default(''),
})

/**
 * One zone's field name in the **Quality Session Mix** form, from the zone itself.
 *
 * The form has exactly one field per member of `QUALITY_ZONES`, and both the schema
 * and the inputs are generated from that constant through this function — so the
 * offerable vocabulary has a single source, and the two rules ADR 0042 draws are
 * **structural** rather than validated:
 *
 * - a zone **cannot be submitted twice**, because there is one box per zone (the
 *   duplicate-zone refusal in `QualitySessionMixSetSchema` is a second line of
 *   defence against a hand-made request, not this form's rule);
 * - there is nowhere for a **speed / neuromuscular** field to appear, and none for
 *   zones 1–2 either. Neuromuscular work has no position on the metabolic zone axis
 *   at all (ADR 0042 §7) and zones 1–2 are not quality sessions (§3), so neither is
 *   a field this page hides — it is a field this page cannot have.
 */
export function mixFieldName(zone: QualityZone): `zone${QualityZone}` {
	return `zone${zone}`
}

/**
 * One zone's session count as the athlete types it: a whole number, `0`, or blank.
 *
 * **Blank and `0` both mean "this zone is not in the mix."** That is the opposite of
 * what blank means in `RatePercentSchema` above, where it is "follow the documented
 * convention" (ADR 0044 §4) — a mix has no convention to fall back on, and an empty
 * mix is the positive statement that the segment has no quality sessions rather than
 * an unknown one (ADR 0042 §6). The surface says which blank it is where the athlete
 * reads it; here the shapes just have to differ.
 *
 * The upper bound is the storage schema's own typo guard, restated at the form
 * boundary so `70` meant as `7` reads as a sentence rather than as a thrown parse.
 */
const MixCountSchema = z
	.string()
	.trim()
	.transform((raw, ctx) => {
		if (raw === '') return null
		const count = Number(raw)
		if (!Number.isInteger(count)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: SESONG_SEGMENT_LABELS.wholeSessions,
			})
			return z.NEVER
		}
		if (count < 0 || count > MAX_QUALITY_SESSIONS_PER_WEEK) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: SESONG_SEGMENT_LABELS.sessionRange(
					MAX_QUALITY_SESSIONS_PER_WEEK,
				),
			})
			return z.NEVER
		}
		return count
	})

const MixCountField = MixCountSchema.default('')

/**
 * The mix form: `segmentId` and one count per quality zone, always all of them.
 *
 * Every zone travels on every save, so the whole multiset is replaced in one write
 * and clearing a zone is expressible — which is why the mix needs no `CarriedRate`
 * equivalent. A field left out of the body reads as blank, and blank *is* a value
 * here: the zone leaving the mix.
 */
export const MixFormSchema = z.object({
	segmentId: z.string().min(1),
	...(Object.fromEntries(
		QUALITY_ZONES.map((zone) => [mixFieldName(zone), MixCountField]),
	) as Record<`zone${QualityZone}`, typeof MixCountField>),
})

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
 * Whether a phase may present its **Block Boundary Step** as a live field — and
 * where it may not, the reason the athlete is owed in its place.
 *
 * A union rather than a boolean plus a reason, because a reason is only ever a
 * reason for *not* offering the field: the shape makes "in force, and here is why
 * not" unstateable rather than merely unwritten.
 *
 * The member is the **token** and not the sentence, so the wording stays in
 * `labels.ts` where `__strength-segment-editor.tsx` reads the same three
 * ({@link BOUNDARY_STEP_OUT_OF_FORCE_LABELS}) — one athlete-facing string, one
 * place, whichever surface is asking.
 */
type BoundaryStepStanding =
	| { inForce: true }
	| { inForce: false; reason: BoundaryStepOutOfForce }

/**
 * That question answered for one phase, off the same rule the arithmetic uses.
 *
 * **The decision is `boundaryStepInForce`'s and is read from it**, never restated
 * here: `derivedWeekTarget` skips the step of the phase the **Season Anchor** in
 * force restarted in (ADR 0040 §5), and a field offered there is a control the
 * athlete can change that changes nothing (ADR 0044 §8). This used to ask
 * `position === 0`, which knew about the season's opening and nothing about
 * anchors — so re-anchoring into a later phase left that phase's step field
 * claiming "−10% once, at the opening" over a derivation that ignored it.
 *
 * **Three ways to be out of force, and the athlete gets the one that applies.** A
 * single sentence would have to be vague enough to cover a season opening, a plan
 * with no anchor over this phase yet, and a re-anchor landing on this phase's first
 * week — three different states of the athlete's own plan, with three different
 * edits that would change them (Unavailable Metric: the reason is the point). Two of
 * the three are situations `__strength-segment-editor.tsx` reaches as well, so all
 * three are worded once in `labels.ts` and named here by token: one situation said
 * two ways is two situations to the person reading.
 *
 * The "no anchor yet" test is an **existence** check and not a second copy of the
 * selection rule: which anchor is in force decides nothing about the wording, only
 * whether there is one at all, and whether the field renders was already decided
 * above.
 */
export function boundaryStepStanding(
	phases: SeasonPhaseData[],
	anchors: AnchorPlacement[],
	position: number,
): BoundaryStepStanding {
	if (boundaryStepInForce(phases, anchors, position)) return { inForce: true }
	if (position === 0) return { inForce: false, reason: 'season-opens' }
	const opensAtWeekIndex = (phases[position]?.fromWeekInPlan ?? 1) - 1
	if (!anchors.some((anchor) => anchor.fromWeekIndex <= opensAtWeekIndex)) {
		return { inForce: false, reason: 'no-anchor-yet' }
	}
	return { inForce: false, reason: 'anchor-opens-here' }
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
export function SegmentProgressionForm({
	segment,
	phase,
	boundaryStep,
	trackLabel,
	actionData,
}: {
	segment: SegmentData
	phase: SeasonPhaseData
	/** Whether the step is a step the walk applies — {@link boundaryStepStanding}. */
	boundaryStep: BoundaryStepStanding
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
		// narrowing is on the `intent` *and* the `segmentId`, because the action answers
		// the structural edits too — those carry a sentence rather than a submission —
		// and this segment's own mix form, whose reply applied here would blank the
		// rates it says nothing about.
		lastResult:
			actionData &&
			'segmentId' in actionData &&
			actionData.intent === 'set-segment-rates' &&
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
				<p className="text-sm font-medium">
					{SESONG_SEGMENT_LABELS.progression(trackLabel)}
				</p>
			) : null}

			<div className="grid gap-4 sm:grid-cols-2">
				<RateField
					meta={fields.ramp}
					label={SESONG_SEGMENT_LABELS.ramp}
					meaning={
						segment.ramp == null
							? SESONG_SEGMENT_LABELS.rampBlank
							: SESONG_SEGMENT_LABELS.rampSet(
									formatNbSignedPercent(segment.ramp),
								)
					}
				/>

				{boundaryStep.inForce ? (
					<RateField
						meta={fields.boundaryStep}
						label={SESONG_SEGMENT_LABELS.step}
						meaning={
							segment.boundaryStep == null
								? SESONG_SEGMENT_LABELS.stepBlank
								: SESONG_SEGMENT_LABELS.stepSet(
										formatNbSignedPercent(segment.boundaryStep),
									)
						}
					/>
				) : (
					// A step the walk does not apply is the dead control ADR 0044 §8 rules
					// out, so the field goes and the reason takes its place. The stored rate
					// still travels: `EnduranceSegmentSetSchema` writes all four every time,
					// and a missing box would clear a step the athlete authored the moment
					// they saved anything else on the card — which must not happen while the
					// anchor sits on this block's opening week, ready to be moved off it.
					// The same treatment `__strength-segment-editor.tsx` gives a dated block.
					<>
						<CarriedRate
							meta={fields.boundaryStep}
							fraction={segment.boundaryStep}
						/>
						<p className="text-muted-foreground self-end text-sm">
							{NB_BOUNDARY_STEP_OUT_OF_FORCE_LABELS[boundaryStep.reason]}
						</p>
					</>
				)}

				{hasRecoveryWeeks ? (
					<RateField
						meta={fields.recoveryCut}
						label={SESONG_SEGMENT_LABELS.recoveryCut}
						nonNegative
						meaning={
							segment.recoveryCut == null
								? SESONG_SEGMENT_LABELS.recoveryBlank(
										formatNbSignedPercent(-DEFAULT_RECOVERY_CUT),
									)
								: SESONG_SEGMENT_LABELS.recoverySet(
										formatNbSignedPercent(-segment.recoveryCut),
									)
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
						label={SESONG_SEGMENT_LABELS.taperCut}
						nonNegative
						meaning={`${
							segment.taperCut == null
								? SESONG_SEGMENT_LABELS.taperBlank(
										formatNbSignedPercent(-DEFAULT_TAPER_CUT),
									)
								: SESONG_SEGMENT_LABELS.taperSet(
										formatNbSignedPercent(-segment.taperCut),
									)
						}${SESONG_SEGMENT_LABELS.taperNote}`}
					/>
				) : (
					<CarriedRate meta={fields.taperCut} fraction={segment.taperCut} />
				)}
			</div>

			<ErrorList errors={form.errors as string[] | undefined} />

			{/* Full-width on phones, inline from `sm` (ui-conventions §1.8), and no
			    `size` override: a route file does not set control heights (§2.1). */}
			<Button type="submit" variant="outline" className="w-full sm:w-auto">
				{SESONG_SEGMENT_LABELS.saveProgression(trackLabel)}
			</Button>
		</Form>
	)
}

/**
 * One endurance segment's **Quality Session Mix**, authored — and the two readings
 * taken off it, shown as readings.
 *
 * **The shape of this form is the domain rule.** There is one integer field per member
 * of `QUALITY_ZONES` and no way to add a fourth, which makes three of ADR 0042's
 * decisions structural instead of validated:
 *
 * - a zone **cannot appear twice**, because it has exactly one box;
 * - there is **no speed / neuromuscular field and nowhere for one to go**.
 *   Neuromuscular work is high *mechanical* intensity at low metabolic strain, and the
 *   zone scale orders metabolic strain — so `speed` has no position on this axis at
 *   all and is authored as an Intensity Target on a step instead (ADR 0042 §7);
 * - zones **1 and 2 are not offerable** either: a quality session is an intensive one,
 *   and admitting easy sessions would change what the count means without anything
 *   changing in the training (§3).
 *
 * **Blank or `0` means the zone is not in the mix**, and the help text says so,
 * because the same empty box means the *opposite* thing a few fields up: an empty rate
 * is "follow the documented convention" (ADR 0044 §4). A mix has no convention to fall
 * back on — an empty mix is the positive statement "no quality sessions", never
 * "unknown" (ADR 0042 §6) — which is why these are plain number fields rather than
 * `RateField`/`CarriedRate`, and why every zone travels on every save.
 */
export function SegmentMixForm({
	segment,
	trackLabel,
	actionData,
}: {
	segment: SegmentData
	trackLabel: string | null
	actionData: SegmentActionData
}) {
	const [form, fields] = useForm({
		id: `mix-${segment.segmentId}`,
		// Keyed by intent and segment, so this reply lands on this form only — see
		// `authorQualityMix`. A rates reply read here would blank the mix.
		lastResult:
			actionData &&
			'segmentId' in actionData &&
			actionData.intent === 'set-quality-mix' &&
			actionData.segmentId === segment.segmentId
				? actionData.result
				: undefined,
		defaultValue: Object.fromEntries(
			QUALITY_ZONES.map((zone) => [
				mixFieldName(zone),
				// A zone that is not in the mix reads back **blank** rather than `0`: the
				// row does not exist, and a typed 0 would be a number the athlete never
				// entered sitting in a box.
				String(
					segment.mix.find((entry) => entry.zone === zone)?.sessionsPerWeek ??
						'',
				),
			]),
		),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: MixFormSchema })
		},
	})

	// Both figures are read off the **mix** and nothing else — never off materialized
	// **Workout Sessions**, even for weeks that have them. That is automatic here
	// because `segment.mix` is the only input, and it must stay that way: sourcing the
	// label from sessions where they exist would make a segment's name change character
	// with how far into the season it sits (ADR 0042 §9).
	const emphasis = formatNbEmphasisLabel(emphasisTerms(segment.mix))
	const count = qualitySessionCount(segment.mix)

	return (
		<Form method="POST" {...getFormProps(form)} className="space-y-4">
			<input type="hidden" name="intent" value="set-quality-mix" />
			<input type="hidden" name="segmentId" value={segment.segmentId} />
			<p className="text-sm font-medium">
				{SESONG_SEGMENT_LABELS.mix(trackLabel)}
			</p>
			<p className="text-muted-foreground text-sm">
				{SESONG_SEGMENT_LABELS.mixIntro}
			</p>

			{/* One field per quality zone, generated from `QUALITY_ZONES` — so zones 3–5
			    are the whole vocabulary and there is no fourth box to fill. */}
			<div className="grid gap-4 sm:grid-cols-3">
				{QUALITY_ZONES.map((zone) => {
					// Non-null because the field list *is* `QUALITY_ZONES`: the schema and
					// the inputs are generated from the same constant, so a zone without a
					// field is unrepresentable rather than merely unlikely.
					const meta = fields[mixFieldName(zone)]!
					return (
						<Field
							key={zone}
							labelProps={{
								// "Zone 4 threshold" — the zone number carries the ordering and the
								// shared label carries the word, so this route spells neither
								// itself (ADR 0023).
								children: SESONG_SEGMENT_LABELS.mixField(
									zone,
									NB_QUALITY_ZONE_LABELS[zone],
								),
							}}
							inputProps={{
								...getInputProps(meta, { type: 'number' }),
								min: 0,
								max: MAX_QUALITY_SESSIONS_PER_WEEK,
								step: 1,
								inputMode: 'numeric',
							}}
							errors={meta.errors as string[] | undefined}
						/>
					)
				})}
			</div>

			{/* The two derived readings, as text and never as controls: there is no input
			    for either, because nobody can name a block for work it does not contain
			    (ADR 0042 §5) and nobody can hand-set a sum. Marked in the words rather
			    than in new chrome — the same way the Season Span says where it is read
			    from. */}
			<dl className="text-sm">
				<div className="flex flex-wrap gap-x-2">
					<dt className="text-muted-foreground">
						{SESONG_SEGMENT_LABELS.emphasis}
					</dt>
					<dd className="font-medium">{emphasis}</dd>
				</div>
				<div className="flex flex-wrap gap-x-2">
					<dt className="text-muted-foreground">
						{SESONG_SEGMENT_LABELS.count}
					</dt>
					<dd className="font-medium tabular-nums">{count}</dd>
				</div>
			</dl>
			<p className="text-muted-foreground text-sm">
				{SESONG_SEGMENT_LABELS.derivedNote}
			</p>

			<ErrorList errors={form.errors as string[] | undefined} />

			<Button type="submit" variant="outline" className="w-full sm:w-auto">
				{SESONG_SEGMENT_LABELS.saveMix(trackLabel)}
			</Button>
		</Form>
	)
}
