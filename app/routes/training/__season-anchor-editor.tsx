/**
 * The **Blocks** reading's anchor section: a Training Track's **Season Anchor**
 * segments, authored and re-authored (#407, ADR 0040 §5).
 *
 * Split out of `plan.tsx` for the reason `__phase-editor.tsx`,
 * `__week-pattern-editor.tsx` and `__strength-segment-editor.tsx` are — the route
 * owns the loader, the action and the two readings; this module owns the controls
 * one of those readings is built from.
 *
 * **Why the anchor is a list and not a number.** Seasons do not go to plan. An
 * illness, a lost month, a fitness level that turned out optimistic: the athlete
 * has to be able to say "from this week on, I am starting from here" without
 * rewriting the weeks they already lived. That is why an anchor is an ordered list
 * of **dated** segments — the chart must never draw a past that did not happen —
 * and it is the whole reason this section exists rather than a single box at the
 * top of the page.
 *
 * **Three rules this module's copy is bound by**, each an ADR decision made visible
 * rather than merely obeyed:
 *
 * - **A re-anchor is a fresh start, not a discount.** The **Volume Ramp** restarts
 *   from it: the loading-week index begins again at the re-anchor's own week
 *   (ADR 0040 §5). Saying so is the difference between the athlete expecting their
 *   old progression continued from a lower number and getting what the app
 *   actually does.
 * - **It carries no unit.** The unit is the track's **Volume Currency**, fixed for
 *   the track's life, so a re-anchor changes the value only — and re-anchoring is
 *   *not* the way to change what a track is measured in, which stays re-authoring
 *   (ADR 0043, ADR 0044 §8). There is nowhere on this section for a unit to be
 *   submitted; it is not a field that is validated away.
 * - **Hand-set weeks survive.** A **Week Volume Override** outranks the rule and is
 *   never folded (ADR 0044 §5), so re-anchoring leaves every week the athlete
 *   hand-set exactly as they left it — marked, and still revertible on the Weeks
 *   reading.
 *
 * And the fourth, which is the section's shape rather than its copy: the **earliest
 * segment stays**. Every week from the season's opening to the next re-anchor is
 * derived from it, so it is rendered without a remove control and the service
 * refuses one anyway.
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
	formatWeeklyVolume,
	formatWeeklyVolumeField,
	formatWeekSpan,
	volumeFieldStep,
} from '#app/utils/format.ts'
import { DISCIPLINE_LABELS, VOLUME_CURRENCY_UNITS } from '#app/utils/labels.ts'
import { type VolumeCurrency } from '#app/utils/plan-outline/derive.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'

/**
 * One stored **Season Anchor** segment as this module edits it: the week it takes
 * effect from, the value, and the two things the surface cannot work out for itself.
 *
 * `weekInPlan` is `null` for a segment whose week is no longer one of the plan's — a
 * structural edit can shorten a season under a dated row, and nothing cascades.
 * Shown rather than hidden, exactly as a stranded lifting block is: a segment the
 * athlete cannot see is one they cannot take back.
 *
 * `earliest` is computed where the list is, not here: "is this the first one" is a
 * question about the siblings, and a component that answered it by comparing week
 * keys would be a second reading of the rule the authoring service enforces.
 */
export type EditableAnchor = {
	fromWeekKey: string
	weekInPlan: number | null
	value: number
	earliest: boolean
}

/** A Training Track and the anchor segments authored on it, earliest first. */
export type EditableAnchorTrack = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
	anchors: EditableAnchor[]
}

/** One of the plan's Training Weeks, as the from-week picker offers it. */
export type AnchorWeekOption = {
	weekKey: string
	weekInPlan: number
	startsAt: Date
}

/**
 * A weekly volume as the athlete types it: a number in the track's own **Volume
 * Currency**, and never blank.
 *
 * Blank is refused rather than read as `0`, because `Number('')` is 0 and an anchor
 * of zero would take the whole season to nothing — the derivation is multiplicative
 * (ADR 0040 §3). That is the opposite of what blank means in a **Week Volume
 * Override**'s field, where it hands the week back to the rule: an anchor has no
 * rule underneath it to fall back to.
 *
 * The floor itself is *not* restated here. `SeasonAnchorSetSchema.positive()` owns
 * it and the route re-parses through that schema, so "an anchor is more than zero"
 * is worded once (ADR 0044 §8).
 */
const AnchorValueField = z
	.string()
	.trim()
	.transform((raw, ctx) => {
		if (raw === '') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'How much a week are you starting from?',
			})
			return z.NEVER
		}
		const value = Number(raw)
		if (!Number.isFinite(value)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Type a weekly volume, e.g. 45',
			})
			return z.NEVER
		}
		return value
	})
	.default('')

/**
 * What an anchor form submits: the week it takes effect from, and the value.
 *
 * **Two fields, and no unit anywhere** — the whole of what a segment carries
 * (ADR 0043). `fromWeekKey` is checked for presence only; whether it is a Monday
 * and whether it is one of the plan's weeks are the authoring schema's and the
 * service's rules, and the action re-parses through both so a violation reads as a
 * sentence on this form rather than as a throw (ADR 0044 §8).
 *
 * One schema for adding and for editing, because they are one act on one pair: the
 * write is keyed on `(trackId, fromWeekKey)`, so submitting a week that already
 * carries a segment edits it and submitting a new one adds a segment. The edit form
 * simply carries its week as a hidden field instead of a picker.
 */
export const SeasonAnchorFormSchema = z.object({
	fromWeekKey: z.string().min(1, 'Which week does this anchor start from?'),
	value: AnchorValueField,
})

/**
 * What this section reads off the action, the same three shapes
 * `StrengthActionData` describes and for the same reason: a Conform reply keyed to
 * a row, a refusal sentence, or a bare success. No index signature, because one
 * would make every property access legal and force the `result` back through a cast.
 */
export type AnchorActionData =
	| {
			intent: string
			trackId?: string
			/** The row an edit answers. Absent — `''` — on the add form's reply. */
			fromWeekKey?: string
			result: SubmissionResult<string[]>
	  }
	| { error: string }
	| { ok: true }
	/**
	 * A stamp waiting on the athlete's confirmation (#412). Nothing in this module
	 * reads it — it is here because this type is *the union the route returns*, and
	 * a member left out is a lie the compiler would enforce.
	 */
	| { stamp: unknown }
	/**
	 * A week copy waiting on the athlete's confirmation (#415). Here for the same
	 * reason `stamp` is: this type is the route's return union, not a subset of it.
	 */
	| { copy: unknown }
	| undefined

/**
 * The reply for one form, or nothing — keyed by the intent **and** the row.
 *
 * Both handles, because this section renders one form per anchor per track plus an
 * add form apiece: a reply read by the wrong one would blank a box the athlete
 * never touched. A structural refusal carries no submission at all and is said at
 * the top of the reading instead.
 */
function replyFor(
	actionData: AnchorActionData,
	intent: string,
	row: { trackId: string; fromWeekKey?: string },
): SubmissionResult<string[]> | undefined {
	if (!actionData || !('intent' in actionData)) return undefined
	if (actionData.intent !== intent) return undefined
	if (actionData.trackId !== row.trackId) return undefined
	if (row.fromWeekKey != null && actionData.fromWeekKey !== row.fromWeekKey) {
		return undefined
	}
	return actionData.result
}

/**
 * The anchor section: every track's **Season Anchor** segments in order, each
 * editable, with one form to re-anchor from a later week.
 *
 * Rendered above the phase cards because the anchor is the level their ramps
 * multiply: reading the number first and the progression second is the order the
 * formula has (ADR 0040 §3).
 */
export function SeasonAnchorSection({
	tracks,
	weeks,
	timezone,
	actionData,
}: {
	tracks: EditableAnchorTrack[]
	weeks: AnchorWeekOption[]
	timezone: string
	actionData: AnchorActionData
}) {
	if (tracks.length === 0) return null

	return (
		<section aria-labelledby="season-anchors" className="space-y-4">
			{/* The section's name lives on the `Disclosure` summary that opens it, so
			    this heading is the accessible name only — dropping it would leave the
			    region unnamed, and showing it would print the name twice. */}
			<h2 id="season-anchors" className="sr-only">
				Season anchors
			</h2>
			<p className="text-muted-foreground text-sm">
				Your anchor is the weekly volume your season is derived from. It is a{' '}
				<strong>list of dated segments</strong>, not one number: when a season
				stops going to plan you can say{' '}
				<em>from this week on, I am starting from here</em>, and the weeks you
				already lived are left exactly as they were.
			</p>
			<p className="text-muted-foreground text-sm">
				A re-anchor is a <strong>fresh start, not a discount</strong>. Your ramp
				begins again from the week you pick, so the weeks after it climb from
				your new number rather than carrying on from the old one. Weeks you{' '}
				<strong>hand-set</strong> stay hand-set, and stay revertible.
			</p>
			{tracks.map((track) => (
				<AnchorTrack
					key={track.trackId}
					track={track}
					weeks={weeks}
					timezone={timezone}
					actionData={actionData}
				/>
			))}
		</section>
	)
}

function AnchorTrack({
	track,
	weeks,
	timezone,
	actionData,
}: {
	track: EditableAnchorTrack
	weeks: AnchorWeekOption[]
	timezone: string
	actionData: AnchorActionData
}) {
	// The weeks still on offer. A week that already carries a segment is not
	// offered, so "two anchors in the same week" is a state this form cannot reach
	// — the unique index behind it is the structural backstop, not the first line.
	const taken = new Set(track.anchors.map((anchor) => anchor.fromWeekKey))
	const free = weeks.filter((week) => !taken.has(week.weekKey))
	// Weeks before the earliest segment have no anchor in force, so nothing can
	// price them: said once here rather than as a column of dashes on the Weeks
	// reading (the Unavailable Metric, ADR 0008).
	const openingWeek = track.anchors.find(
		(anchor) => anchor.earliest,
	)?.weekInPlan
	const unpricedOpening = openingWeek != null && openingWeek > 1

	return (
		<div className="space-y-4">
			<h3 className="text-base font-medium">
				{DISCIPLINE_LABELS[track.discipline]}
			</h3>
			<p className="text-muted-foreground text-sm">
				Your anchor is in{' '}
				<strong>{VOLUME_CURRENCY_UNITS[track.currency]}</strong> — the unit this
				track keeps for its whole life. Re-anchoring changes the number and
				never the unit; measuring this track in something else is a new track,
				not an edit.
			</p>
			{/* Named for its own track, because a hybrid plan renders one of these per
			    track and two lists called "Season anchors" would be two things with one
			    name to anyone reading by role. */}
			<ol
				aria-label={`${DISCIPLINE_LABELS[track.discipline]} season anchors`}
				className="space-y-3"
			>
				{track.anchors.map((anchor) => (
					<li key={anchor.fromWeekKey}>
						<AnchorCard
							track={track}
							anchor={anchor}
							timezone={timezone}
							weekStartsAt={
								weeks.find((week) => week.weekKey === anchor.fromWeekKey)
									?.startsAt ?? null
							}
							actionData={actionData}
						/>
					</li>
				))}
			</ol>
			{unpricedOpening ? (
				<p className="text-muted-foreground text-sm">
					{formatWeekSpan(1, openingWeek - 1)} of your plan read{' '}
					<strong>Unavailable</strong>: no anchor covers them, and the app will
					not make a number up for a week it cannot derive.
				</p>
			) : null}
			<ReAnchorForm
				track={track}
				weeks={free}
				timezone={timezone}
				actionData={actionData}
			/>
		</div>
	)
}

/**
 * One anchor segment, read and edited.
 *
 * The header states **when** it takes effect and **what** it says, so the list
 * answers "have I re-anchored, and when" before any control is touched. The
 * earliest one is badged as the season's opening and carries no remove control:
 * removing it would leave the whole stretch before the next segment with nothing to
 * derive from, and the service refuses it in any case.
 */
function AnchorCard({
	track,
	anchor,
	weekStartsAt,
	timezone,
	actionData,
}: {
	track: EditableAnchorTrack
	anchor: EditableAnchor
	/** That week's Monday as an instant, or null for a week outside the plan. */
	weekStartsAt: Date | null
	timezone: string
	actionData: AnchorActionData
}) {
	const row = { trackId: track.trackId, fromWeekKey: anchor.fromWeekKey }
	const [form, fields] = useForm({
		id: `season-anchor-${track.trackId}-${anchor.fromWeekKey}`,
		lastResult: replyFor(actionData, 'set-season-anchor', row),
		defaultValue: {
			value: formatWeeklyVolumeField(anchor.value, track.currency),
		},
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SeasonAnchorFormSchema })
		},
	})
	const fieldId = `anchor-value-${track.trackId}-${anchor.fromWeekKey}`
	const where =
		anchor.weekInPlan == null
			? 'Outside your plan’s weeks'
			: `From week ${anchor.weekInPlan}`

	return (
		<Card>
			<CardHeader className="gap-1">
				<CardTitle className="flex flex-wrap items-center gap-2 text-base">
					{where}
					<Badge variant={anchor.earliest ? 'outline' : 'secondary'}>
						{anchor.earliest ? 'Season opening' : 'Re-anchored'}
					</Badge>
				</CardTitle>
				<p className="text-muted-foreground text-sm">
					{anchor.weekInPlan == null
						? 'This anchor takes effect from a week your plan no longer covers — a segment is dated, so shortening your season leaves it where it was. Remove it, or add weeks to your plan.'
						: `${formatWeeklyVolume(anchor.value, track.currency)}${
								weekStartsAt ? ` · ${formatDate(weekStartsAt, timezone)}` : ''
							}`}
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Stacked rather than laid beside the field: at 390 px a label, a number
				    box and a button have no second column to share (ADR 0028). */}
				<Form method="POST" {...getFormProps(form)} className="space-y-3">
					{/* Named, because this page's action dispatches on `intent`; the track
					    and the week are the row this write addresses. The week travels
					    hidden rather than as a control: a segment *is* the week it takes
					    effect from, so moving one is a remove and an add. */}
					<input type="hidden" name="intent" value="set-season-anchor" />
					<input type="hidden" name="trackId" value={track.trackId} />
					<input type="hidden" name="fromWeekKey" value={anchor.fromWeekKey} />
					<Field
						labelProps={{
							htmlFor: fieldId,
							children: `Weekly volume, ${VOLUME_CURRENCY_UNITS[track.currency]}`,
						}}
						inputProps={{
							...getInputProps(fields.value, { type: 'number' }),
							id: fieldId,
							min: 0,
							step: volumeFieldStep(track.currency),
							inputMode: 'decimal',
						}}
						errors={fields.value.errors as string[] | undefined}
					/>
					<Button type="submit" variant="outline" className="w-full sm:w-auto">
						Save
					</Button>
				</Form>
				<ErrorList errors={form.errors as string[] | undefined} />
				{anchor.earliest ? (
					<p className="text-muted-foreground text-sm">
						Your season keeps this one: every week up to your next re-anchor is
						derived from it. Change the number here rather than removing it.
					</p>
				) : (
					// Its own form, because a submit carries one name/value pair and
					// taking a re-anchor back is a different act from editing its value.
					<Form method="POST">
						<input type="hidden" name="intent" value="remove-season-anchor" />
						<input type="hidden" name="trackId" value={track.trackId} />
						<input
							type="hidden"
							name="fromWeekKey"
							value={anchor.fromWeekKey}
						/>
						<Button
							type="submit"
							variant="ghost"
							size="sm"
							className="w-full sm:w-auto"
						>
							Remove this re-anchor
						</Button>
					</Form>
				)}
			</CardContent>
		</Card>
	)
}

/** Add a segment: the week it takes effect from, and the number to start from. */
function ReAnchorForm({
	track,
	weeks,
	timezone,
	actionData,
}: {
	track: EditableAnchorTrack
	/** The plan's weeks that carry no segment yet — see `AnchorTrack`. */
	weeks: AnchorWeekOption[]
	timezone: string
	actionData: AnchorActionData
}) {
	const [form, fields] = useForm({
		id: `add-season-anchor-${track.trackId}`,
		lastResult: replyFor(actionData, 'add-season-anchor', {
			trackId: track.trackId,
		}),
		defaultValue: { fromWeekKey: '', value: '' },
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SeasonAnchorFormSchema })
		},
	})
	const valueId = `re-anchor-value-${track.trackId}`

	if (weeks.length === 0) {
		return (
			<p className="text-sm">
				Every week of this plan already carries an anchor, so there is no week
				left to re-anchor from.
			</p>
		)
	}

	return (
		<Form method="POST" {...getFormProps(form)} className="space-y-4">
			<input type="hidden" name="intent" value="add-season-anchor" />
			<input type="hidden" name="trackId" value={track.trackId} />
			<h4 className="text-base font-medium">Re-anchor from a week</h4>
			<SelectField
				meta={fields.fromWeekKey}
				labelProps={{ children: 'From week' }}
				placeholder="Pick a week"
				items={weeks.map((week) => ({
					value: week.weekKey,
					label: `Week ${week.weekInPlan} · ${formatDate(week.startsAt, timezone)}`,
				}))}
				errors={fields.fromWeekKey.errors as string[] | undefined}
			/>
			<Field
				labelProps={{
					htmlFor: valueId,
					children: `Starting from, ${VOLUME_CURRENCY_UNITS[track.currency]}`,
				}}
				inputProps={{
					...getInputProps(fields.value, { type: 'number' }),
					id: valueId,
					min: 0,
					step: volumeFieldStep(track.currency),
					inputMode: 'decimal',
				}}
				errors={fields.value.errors as string[] | undefined}
			/>
			<p className="text-muted-foreground text-sm">
				Your ramp restarts here: the week you pick <em>is</em> this number, and
				the loading weeks after it climb from it. Everything before it is
				untouched.
			</p>
			<ErrorList errors={form.errors as string[] | undefined} />
			<Button type="submit" className="w-full sm:w-auto">
				Re-anchor
			</Button>
		</Form>
	)
}
