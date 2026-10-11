/**
 * **Your numbers for one lift** — the per-exercise anchors a `% 1RM` or an
 * `8RM` prescription resolves against.
 *
 * The screen is a *history*, not a field. `ExerciseThreshold` is append-only, so
 * an edit here writes a new row and the old one stays readable: a session from
 * March keeps reading against the anchor it was prescribed from, and "why did my
 * squat percentages move?" has an answer on the screen rather than in a support
 * thread.
 *
 * Each anchor states its own provenance in place — what was measured, how it was
 * arrived at, what grade it carries and from when — because those four are the
 * difference between a tested 140 kg and a formula's 140 kg, and an app that
 * shows only the number is claiming they are the same thing.
 *
 * A hand-typed anchor is **`athlete-stated` with no grade**, always. ADR 0054's
 * rule: the app does not grade a figure somebody stated about themselves. A
 * graded anchor comes from the proposal screen, where a logged set is the
 * evidence.
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useEffect, useRef, useState } from 'react'
import { Link, data, useFetcher } from 'react-router'
import { z } from 'zod'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { localDate } from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatNbDate, formatNbKg } from '#app/utils/format.ts'
import {
	MEG_ANCHOR_PROTOCOL_LABELS,
	MEG_COMMON_LABELS,
	MEG_CONFIDENCE_LABELS,
	MEG_LIFT_CONSTRUCT_LABELS,
	MEG_LIFT_LABELS,
	MEG_PAGE_TITLES,
} from '#app/utils/labels.ts'
import { kiloField } from '#app/utils/strength/kilo-input.ts'
import {
	type StoredAnchor,
	getAnchorContext,
	listExerciseAnchors,
	listExercisePrescriptions,
	recordStatedAnchor,
} from '#app/utils/strength-anchors.server.ts'
import {
	formatSetsSummary,
	normalizeSetKind,
} from '#app/utils/workout-notation.ts'
import { MegField, MegNote, MegResult, MegSection } from '../__meg-ui.tsx'
import { type Route } from './+types/lifts.$exerciseId.ts'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.lift,
	getSitemapEntries: () => null,
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const exerciseId = params.exerciseId
	const exercise = await prisma.exercise.findUnique({
		where: { id: exerciseId },
		select: { id: true, name: true },
	})
	if (!exercise) throw new Response('Not found', { status: 404 })

	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true, weightKg: true },
	})
	const timezone = profile?.timezone ?? 'UTC'

	const [anchors, prescriptions] = await Promise.all([
		listExerciseAnchors(userId, exerciseId),
		listExercisePrescriptions(userId, exerciseId),
	])

	// Each prescription resolves **as of its own day**, not today: that is the
	// entire reason the anchors are effective-dated, and reading a March session
	// against April's re-test would quietly restate history.
	const resolved = await Promise.all(
		prescriptions.map(async (prescription) => {
			const ctx = await getAnchorContext(
				userId,
				exerciseId,
				new Date(prescription.scheduledAtISO),
			)
			return {
				sessionId: prescription.sessionId,
				sessionTitle: prescription.sessionTitle,
				scheduledAtISO: prescription.scheduledAtISO,
				summary: formatSetsSummary(
					prescription.sets.map((set) => ({
						kind: normalizeSetKind(set.kind),
						reps: set.reps,
						durationSec: set.durationSec,
						load: set.load,
						weightKg: set.weightKg,
						pct1RM: set.pct1RM,
					})),
					ctx,
				),
			}
		}),
	)

	return {
		exerciseId: exercise.id,
		exerciseName: exercise.name,
		timezone,
		// The day the "From" field opens on. A native date input with no value
		// renders the *browser's* empty pattern — `mm/dd/yyyy` on a US-locale
		// browser, in an app whose every rendered date is day-month-year
		// (`formatDate`) and whose every weight is a kilo. Handing it today's date
		// in the athlete's own timezone is the same thing the other date field in
		// the app does (`catalogue.place`), and it is also the right default: a
		// number you type about yourself is a number you have today.
		today: localDate(new Date(), timezone),
		bodyweightKg: profile?.weightKg ?? null,
		anchors,
		prescriptions: resolved,
	}
}

/**
 * The write, in the log grid's idiom rather than the authoring schema's: a plain
 * zod parse over the posted fields. The Conform-backed `WorkoutAuthoringSchema`
 * round trip drops `load`, `effortCap` and `tempo`, which is why nothing on the
 * strength side goes through it.
 */
export const AddAnchorSchema = z.object({
	construct: z.enum(['oneRm', 'repMax']),
	// `62,5` and `62.5` are the same kilo; anything else is refused, and the
	// field's own sentence below says so (`FIELD_ERRORS.valueKg`).
	valueKg: kiloField('A weight has to be a positive number of kilos.'),
	reps: z
		.string()
		.optional()
		.transform((v) => (v == null || v.trim() === '' ? null : Number(v)))
		.refine(
			(v) => v == null || (Number.isInteger(v) && v >= 1),
			MEG_LIFT_LABELS.repsInvalid,
		),
	effectiveOn: z.string().optional(),
})

export type AddAnchorResult =
	| { ok: true; message: string }
	| { ok: false; error: string }

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = String(formData.get('intent') ?? '')
	if (intent !== 'add-anchor') {
		return data<AddAnchorResult>(
			{ ok: false, error: MEG_COMMON_LABELS.unknownAction },
			400,
		)
	}

	const parsed = AddAnchorSchema.safeParse(Object.fromEntries(formData))
	if (!parsed.success) {
		// Which field, in the athlete's words. "That number did not make sense" for
		// a blank kg field or a fractional rep count names neither the field nor the
		// rule, and this is the only message they get.
		const field = String(parsed.error.issues[0]?.path[0] ?? '')
		return data<AddAnchorResult>(
			{
				ok: false,
				error: FIELD_ERRORS[field] ?? MEG_LIFT_LABELS.numberInvalid,
			},
			400,
		)
	}
	const input = parsed.data
	if (input.construct === 'repMax' && input.reps == null) {
		return data<AddAnchorResult>(
			{ ok: false, error: MEG_LIFT_LABELS.repMaxNeedsReps },
			400,
		)
	}

	// A date the athlete typed is a **day**, and a day means noon UTC here rather
	// than midnight, so a timezone west of UTC cannot silently file a re-test on
	// the day before it happened.
	const effectiveAt = input.effectiveOn
		? new Date(`${input.effectiveOn}T12:00:00.000Z`)
		: new Date()
	if (Number.isNaN(effectiveAt.getTime())) {
		return data<AddAnchorResult>(
			{ ok: false, error: MEG_LIFT_LABELS.dateInvalid },
			400,
		)
	}

	const result = await recordStatedAnchor({
		userId,
		exerciseId: params.exerciseId,
		construct: input.construct,
		valueKg: input.valueKg,
		reps: input.reps,
		effectiveAt,
	})
	if (!result.ok) {
		return data<AddAnchorResult>(
			{ ok: false, error: ADD_ANCHOR_ERRORS[result.reason] },
			result.reason === 'unknown-exercise' ? 404 : 400,
		)
	}
	return {
		ok: true as const,
		message: MEG_LIFT_LABELS.saved,
	}
}

const FIELD_ERRORS: Record<string, string> = {
	valueKg: MEG_LIFT_LABELS.weightInvalid,
	reps: MEG_LIFT_LABELS.repsInvalid,
}

const ADD_ANCHOR_ERRORS = {
	'no-profile': MEG_COMMON_LABELS.noProfile,
	'unknown-exercise': MEG_COMMON_LABELS.liftGone,
	invalid: MEG_LIFT_LABELS.weightInvalid,
	duplicate: MEG_LIFT_LABELS.duplicate,
} as const

/** The anchor as a lifter would say it out loud, kilos with a decimal comma. */
export function anchorHeadline(anchor: StoredAnchor): string {
	const kg = formatNbKg(anchor.valueKg)
	switch (anchor.construct) {
		case 'oneRm':
			return MEG_LIFT_LABELS.headlineOneRm(kg)
		case 'estimatedOneRm':
			return MEG_LIFT_LABELS.headlineEstimated(kg)
		case 'repMax':
			return MEG_LIFT_LABELS.headlineRepMax(kg, String(anchor.reps ?? '?'))
	}
}

export default function ExerciseAnchorsRoute({
	loaderData,
}: Route.ComponentProps) {
	const { exerciseName, anchors, prescriptions, timezone, exerciseId, today } =
		loaderData
	const current = anchors[0] ?? null
	const L = MEG_LIFT_LABELS
	const proposeLink = (
		<Link
			to={`/settings/training/lifts/${exerciseId}/propose`}
			className="text-foreground text-callout -mx-2 flex min-h-11 items-center gap-2 rounded-2xl px-2 underline underline-offset-4"
		>
			<Icon name="bar-chart" size="sm" aria-hidden="true" />
			{L.readFromSet}
		</Link>
	)

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-col gap-1">
				<h2 className="text-heading [overflow-wrap:anywhere]">
					{exerciseName}
				</h2>
				<MegNote className="tabular-nums">
					{current ? L.readsAgainst(anchorHeadline(current)) : L.nothingOnFile}
				</MegNote>
			</div>

			<AddAnchorForm exerciseName={exerciseName} today={today} />

			<MegSection id="anchor-history" title={L.onFile}>
				{anchors.length === 0 ? (
					<div className="flex flex-col gap-1">
						<MegNote>{L.noAnchors}</MegNote>
						{proposeLink}
					</div>
				) : (
					<div className="flex flex-col gap-3">
						<ul className="flex flex-col gap-3">
							{anchors.map((anchor, index) => (
								<li key={anchor.id}>
									<AnchorRow
										anchor={anchor}
										timezone={timezone}
										superseded={
											index > 0 &&
											anchors[0]?.construct === anchor.construct &&
											anchors[0]?.reps === anchor.reps
										}
									/>
								</li>
							))}
						</ul>
						<MegNote>{L.appendOnly}</MegNote>
						{proposeLink}
					</div>
				)}
			</MegSection>

			<MegSection id="prescriptions" title={L.prescribed}>
				{prescriptions.length === 0 ? (
					<MegNote>{L.notPrescribed}</MegNote>
				) : (
					<ul className="bg-card ring-foreground/5 dark:ring-foreground/10 divide-border/70 divide-y rounded-4xl px-4 shadow-xs ring-1">
						{prescriptions.map((prescription) => (
							<li key={prescription.sessionId}>
								<Link
									to={`/training/sessions/${prescription.sessionId}`}
									className="active:bg-muted/60 duration-press -mx-2 flex min-h-11 flex-col gap-0.5 rounded-2xl px-2 py-3 transition-colors ease-out"
								>
									<span className="flex items-baseline justify-between gap-3">
										<span className="text-callout min-w-0 [overflow-wrap:anywhere]">
											{prescription.sessionTitle}
										</span>
										<span className="text-footnote text-muted-foreground shrink-0 tabular-nums">
											{formatNbDate(prescription.scheduledAtISO, timezone)}
										</span>
									</span>
									<span className="text-footnote text-muted-foreground tabular-nums">
										{prescription.summary ?? L.noSets}
									</span>
								</Link>
							</li>
						))}
					</ul>
				)}
			</MegSection>
		</div>
	)
}

function AnchorRow({
	anchor,
	timezone,
	superseded,
}: {
	anchor: StoredAnchor
	timezone: string
	superseded: boolean
}) {
	const L = MEG_LIFT_LABELS
	const protocol = MEG_ANCHOR_PROTOCOL_LABELS[anchor.protocol]
	return (
		<Card size="sm">
			<CardContent className="flex flex-col gap-2">
				<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<span className="text-heading tabular-nums">
						{anchorHeadline(anchor)}
					</span>
					<span className="text-footnote text-muted-foreground tabular-nums">
						{L.from_(formatNbDate(anchor.effectiveAtISO, timezone))}
					</span>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{/* A protocol names how the number was arrived at, and on a reading
					    taken off a logged set that name is a promise the app can show the
					    set. Once the set is gone the promise cannot be kept — the anchor
					    stands (it was the athlete's own number the moment they accepted
					    it, and `sourceSetLogId` is `SET NULL` for exactly that reason),
					    but naming the equation as though it could be re-run would assert
					    a derivation that no longer exists. So the row says what it can:
					    the reading, and that its set is no longer on file. */}
					<span className="text-footnote text-muted-foreground">
						{anchor.derivation.kind === 'source-gone'
							? L.sourceGone(protocol)
							: protocol}
					</span>
					{/* A grade is shown only where there is one. An `athlete-stated`
					    number carries none, and an empty badge would imply the app
					    looked. */}
					{anchor.confidence ? (
						<Badge variant="secondary">
							{(MEG_CONFIDENCE_LABELS as Record<string, string>)[
								anchor.confidence
							] ?? anchor.confidence}
						</Badge>
					) : (
						<span className="text-footnote text-muted-foreground">
							{MEG_COMMON_LABELS.notGraded}
						</span>
					)}
					{superseded ? <Badge variant="outline">{L.superseded}</Badge> : null}
				</div>
			</CardContent>
		</Card>
	)
}

function AddAnchorForm({
	exerciseName,
	today,
}: {
	exerciseName: string
	today: string
}) {
	const fetcher = useFetcher<AddAnchorResult>()
	const [construct, setConstruct] = useState<'oneRm' | 'repMax'>('oneRm')
	const formRef = useRef<HTMLFormElement>(null)
	const result = fetcher.data
	const L = MEG_LIFT_LABELS

	useEffect(() => {
		if (result?.ok) formRef.current?.reset()
	}, [result])

	return (
		<Card size="sm">
			<CardContent>
				{/* **`noValidate`.** The browser's own refusal is a silent one: it
				    blocks the submit and, for a programmatically submitted form, says
				    nothing at all — the athlete taps *Lagre tallet* and nothing
				    happens. Everything else this form can refuse comes back from the
				    action as a sentence in the alert below, so constraint failures
				    take that same path. */}
				<fetcher.Form
					method="POST"
					noValidate
					ref={formRef}
					className="flex flex-col gap-4"
					aria-label={L.addFormName(exerciseName)}
				>
					<input type="hidden" name="intent" value="add-anchor" />
					<input type="hidden" name="construct" value={construct} />
					<h3 className="text-callout font-semibold">{L.addTitle}</h3>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="construct" className="text-footnote font-medium">
							{L.construct}
						</Label>
						<Select
							items={[
								{ value: 'oneRm', label: MEG_LIFT_CONSTRUCT_LABELS.oneRm },
								{ value: 'repMax', label: MEG_LIFT_CONSTRUCT_LABELS.repMax },
							]}
							value={construct}
							onValueChange={(value) =>
								setConstruct(value as 'oneRm' | 'repMax')
							}
						>
							<SelectTrigger id="construct" className="w-full md:text-base">
								{/* Base UI's `Select.Value` renders the *value* unless it is
								    told how to read a label off it — so a bare
								    `<SelectValue />` showed the athlete `oneRm`. */}
								<SelectValue>
									{(value) =>
										MEG_LIFT_CONSTRUCT_LABELS[value as 'oneRm' | 'repMax']
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="oneRm">
									{MEG_LIFT_CONSTRUCT_LABELS.oneRm}
								</SelectItem>
								<SelectItem value="repMax">
									{MEG_LIFT_CONSTRUCT_LABELS.repMax}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{/* **No step.** `step="0.5"` rejected 61.25 kg, on an athlete whose
						    gym owns 1.25 kg plates — a precision the app has no standing
						    to impose, since what can be loaded is a fact about a rack it
						    may know nothing about. Loadability is stated where it is known
						    (the plate line, the engine's rounding note), never enforced
						    here as a false rule. And text with a decimal keypad, never
						    `type="number"`: Chromium in English read a typed `62,5` as `625`. */}
						<MegField
							label={L.kg}
							inputProps={{
								id: 'valueKg',
								name: 'valueKg',
								type: 'text',
								inputMode: 'decimal',
								autoComplete: 'off',
								required: true,
								enterKeyHint: construct === 'repMax' ? 'next' : 'done',
							}}
						/>
						{construct === 'repMax' ? (
							<MegField
								label={L.reps}
								inputProps={{
									id: 'reps',
									name: 'reps',
									type: 'number',
									inputMode: 'numeric',
									step: '1',
									min: '1',
									required: true,
									enterKeyHint: 'done',
								}}
							/>
						) : null}
						<MegField
							className="col-span-2 sm:col-span-1"
							label={L.from}
							inputProps={{
								id: 'effectiveOn',
								name: 'effectiveOn',
								type: 'date',
								defaultValue: today,
							}}
						/>
					</div>

					<MegNote>
						{construct === 'repMax' ? L.repMaxHint : L.statedHint}
					</MegNote>

					<MegResult result={result} />

					<Button type="submit" className="w-full sm:w-auto sm:self-start">
						{L.save}
					</Button>
				</fetcher.Form>
			</CardContent>
		</Card>
	)
}
