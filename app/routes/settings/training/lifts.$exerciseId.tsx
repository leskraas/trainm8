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
import { Input } from '#app/components/ui/input.tsx'
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
import { formatDate } from '#app/utils/format.ts'
import { formatKg } from '#app/utils/strength/program.constants.ts'
import {
	type StoredAnchor,
	getAnchorContext,
	listExerciseAnchors,
	listExercisePrescriptions,
	recordStatedAnchor,
} from '#app/utils/strength-anchors.server.ts'
import { type AnchorProtocol } from '#app/utils/strength-log.ts'
import {
	formatSetsSummary,
	normalizeSetKind,
} from '#app/utils/workout-notation.ts'
import { type Route } from './+types/lifts.$exerciseId.ts'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: 'Your numbers for this lift',
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
const AddAnchorSchema = z.object({
	construct: z.enum(['oneRm', 'repMax']),
	valueKg: z.coerce.number().finite().positive(),
	reps: z
		.string()
		.optional()
		.transform((v) => (v == null || v.trim() === '' ? null : Number(v)))
		.refine(
			(v) => v == null || (Number.isInteger(v) && v >= 1),
			'Reps must be a whole number.',
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
		return data<AddAnchorResult>({ ok: false, error: 'Unknown action.' }, 400)
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
				error: FIELD_ERRORS[field] ?? 'That number did not make sense.',
			},
			400,
		)
	}
	const input = parsed.data
	if (input.construct === 'repMax' && input.reps == null) {
		return data<AddAnchorResult>(
			{ ok: false, error: 'A rep max needs the rep count it is at.' },
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
			{ ok: false, error: 'That date is not a date.' },
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
		message: 'Saved. Your prescriptions read against it from now on.',
	}
}

const FIELD_ERRORS: Record<string, string> = {
	valueKg: 'A weight has to be a positive number of kilos.',
	reps: 'A rep count has to be a whole number, one or more.',
}

const ADD_ANCHOR_ERRORS = {
	'no-profile':
		'Your athlete profile is missing, so there is nothing to attach this to.',
	'unknown-exercise': 'That lift no longer exists.',
	invalid: 'A weight has to be a positive number of kilos.',
	duplicate: 'You already saved a number for that lift at that moment.',
} as const

const PROTOCOL_LABELS: Record<AnchorProtocol, string> = {
	tested: 'you tested it',
	epley: 'Epley/Welday',
	brzycki: 'Brzycki',
	mayhew: 'Mayhew',
	wathen: 'Wathen',
	lombardi: 'Lombardi',
	lander: 'Lander',
	adams: 'Adams',
	'rep-max-observed': 'you hit it for exactly those reps',
	'athlete-stated': 'you typed it',
	provider: 'from a connected account',
}

/** The anchor as a lifter would say it out loud. */
export function anchorHeadline(anchor: StoredAnchor): string {
	const kg = formatKg(anchor.valueKg)
	switch (anchor.construct) {
		case 'oneRm':
			return `${kg} kg 1RM`
		case 'estimatedOneRm':
			return `${kg} kg estimated 1RM`
		case 'repMax':
			return `${kg} kg ${anchor.reps ?? '?'}RM`
	}
}

export default function ExerciseAnchorsRoute({
	loaderData,
}: Route.ComponentProps) {
	const { exerciseName, anchors, prescriptions, timezone, exerciseId, today } =
		loaderData
	const current = anchors[0] ?? null

	return (
		<div className="flex flex-col gap-8">
			<div>
				<h2 className="text-lg font-semibold">{exerciseName}</h2>
				<p className="text-body-sm text-muted-foreground mt-1">
					{current
						? `Percentages and rep-max references for this lift read against your ${anchorHeadline(current)}.`
						: 'Nothing on file yet, so a percentage prescription for this lift shows as written and resolves to no kilos.'}
				</p>
			</div>

			<AddAnchorForm exerciseName={exerciseName} today={today} />

			<section aria-labelledby="anchor-history">
				<h3 id="anchor-history" className="mb-3 text-base font-semibold">
					What you have on file
				</h3>
				{anchors.length === 0 ? (
					<p className="text-body-sm text-muted-foreground">
						No anchors yet.{' '}
						<Link
							to={`/settings/training/lifts/${exerciseId}/propose`}
							className="underline"
						>
							Read one from a set you already logged
						</Link>
						.
					</p>
				) : (
					<>
						<ul className="flex flex-col gap-2">
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
						<p className="text-muted-foreground text-body-xs mt-3">
							Nothing here is overwritten: a newer number is a new line, and an
							older session keeps reading against the number it was written
							with.{' '}
							<Link
								to={`/settings/training/lifts/${exerciseId}/propose`}
								className="underline"
							>
								Read one from a set you already logged
							</Link>
							.
						</p>
					</>
				)}
			</section>

			<section aria-labelledby="prescriptions">
				<h3 id="prescriptions" className="mb-3 text-base font-semibold">
					Where this lift is prescribed
				</h3>
				{prescriptions.length === 0 ? (
					<p className="text-body-sm text-muted-foreground">
						No session in your plan prescribes this lift yet.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{prescriptions.map((prescription) => (
							<li
								key={prescription.sessionId}
								className="bg-background rounded-lg px-4 py-3"
							>
								<div className="flex flex-wrap items-baseline justify-between gap-x-3">
									<Link
										to={`/training/sessions/${prescription.sessionId}`}
										className="text-body-sm font-medium underline"
									>
										{prescription.sessionTitle}
									</Link>
									<span className="text-muted-foreground text-body-xs">
										{formatDate(prescription.scheduledAtISO, timezone)}
									</span>
								</div>
								<p className="text-body-sm mt-1 font-mono">
									{prescription.summary ?? 'no sets authored'}
								</p>
							</li>
						))}
					</ul>
				)}
			</section>
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
	return (
		<div className="bg-background rounded-lg px-4 py-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className="font-mono text-base">{anchorHeadline(anchor)}</span>
				<span className="text-muted-foreground text-body-xs">
					from {formatDate(anchor.effectiveAtISO, timezone)}
				</span>
			</div>
			<div className="mt-1 flex flex-wrap items-center gap-2">
				{/* A protocol names how the number was arrived at, and on a reading taken
				    off a logged set that name is a promise the app can show the set. Once
				    the set is gone the promise cannot be kept — the anchor stands (it was
				    the athlete's own number the moment they accepted it, and
				    `sourceSetLogId` is `SET NULL` for exactly that reason), but naming
				    the equation as though it could be re-run would assert a derivation
				    that no longer exists. So the row says what it can: the reading, and
				    that its set is no longer on file. */}
				<span className="text-muted-foreground text-body-xs">
					{anchor.derivation.kind === 'source-gone'
						? `${PROTOCOL_LABELS[anchor.protocol]} — read from a set that is no longer on file, so the derivation cannot be shown`
						: PROTOCOL_LABELS[anchor.protocol]}
				</span>
				{/* A grade is shown only where there is one. An `athlete-stated` number
				    carries none, and an empty badge would imply the app looked. */}
				{anchor.confidence ? (
					<Badge variant="secondary">{anchor.confidence} confidence</Badge>
				) : (
					<span className="text-muted-foreground text-body-xs">not graded</span>
				)}
				{superseded ? (
					<span className="text-muted-foreground text-body-xs">superseded</span>
				) : null}
			</div>
		</div>
	)
}

const CONSTRUCT_LABELS: Record<'oneRm' | 'repMax', string> = {
	oneRm: 'One-rep max',
	repMax: 'Rep max',
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

	useEffect(() => {
		if (result?.ok) formRef.current?.reset()
	}, [result])

	return (
		/* **`noValidate`.** The browser's own refusal is a silent one: it blocks the
		   submit and, for a programmatically submitted form, says nothing at all —
		   the athlete taps *Save this number* and nothing happens. Everything else
		   this form can refuse comes back from the action as a sentence in the alert
		   below, so constraint failures take that same path. */
		<fetcher.Form
			method="POST"
			noValidate
			ref={formRef}
			className="border-border/70 bg-muted/40 flex flex-col gap-3 rounded-2xl border p-4"
			aria-label={`Add a number for ${exerciseName}`}
		>
			<input type="hidden" name="intent" value="add-anchor" />
			<input type="hidden" name="construct" value={construct} />
			<h3 className="text-base font-semibold">Enter a number yourself</h3>

			<div className="flex flex-wrap gap-3">
				<div className="flex flex-col gap-1">
					<Label htmlFor="construct">What it is</Label>
					<Select
						value={construct}
						onValueChange={(value) => setConstruct(value as 'oneRm' | 'repMax')}
					>
						<SelectTrigger id="construct" className="w-48">
							{/* Base UI's `Select.Value` renders the *value* unless it is
							    told how to read a label off it — so a bare `<SelectValue />`
							    showed the athlete `oneRm`. The render function is the
							    app's own convention (`SelectField` in `forms.tsx`). */}
							<SelectValue>
								{(value) => CONSTRUCT_LABELS[value as 'oneRm' | 'repMax']}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="oneRm">{CONSTRUCT_LABELS.oneRm}</SelectItem>
							<SelectItem value="repMax">{CONSTRUCT_LABELS.repMax}</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1">
					<Label htmlFor="valueKg">kg</Label>
					{/* **No step.** `step="0.5"` rejected 61.25 kg, on an athlete whose
					    gym owns 1.25 kg plates — a precision the app has no standing to
					    impose, since what can be loaded is a fact about a rack it may
					    know nothing about. Loadability is stated where it is known (the
					    plate line, the engine's rounding note), never enforced here as a
					    false rule. */}
					<Input
						id="valueKg"
						name="valueKg"
						type="number"
						inputMode="decimal"
						step="any"
						min="0"
						className="w-24"
						required
					/>
				</div>

				{construct === 'repMax' ? (
					<div className="flex flex-col gap-1">
						<Label htmlFor="reps">at reps</Label>
						<Input
							id="reps"
							name="reps"
							type="number"
							inputMode="numeric"
							step="1"
							min="1"
							className="w-24"
							required
						/>
					</div>
				) : null}

				<div className="flex flex-col gap-1">
					<Label htmlFor="effectiveOn">From</Label>
					<Input
						id="effectiveOn"
						name="effectiveOn"
						type="date"
						defaultValue={today}
						className="w-44"
					/>
				</div>
			</div>

			<p className="text-muted-foreground text-body-xs">
				{construct === 'repMax'
					? 'The heaviest load you can lift for exactly that many reps. It is never converted from another rep count — an 8RM read off a 5RM would be a ±10 % guess applied twice.'
					: 'A number you typed is stored as yours and is not graded — the app does not grade a figure you stated about yourself.'}
			</p>

			{result && !result.ok ? (
				<p className="text-destructive text-body-sm" role="alert">
					{result.error}
				</p>
			) : null}
			{result?.ok ? (
				<p className="text-body-sm" role="status">
					{result.message}
				</p>
			) : null}

			<div>
				<Button type="submit" variant="outline" size="sm">
					Save this number
				</Button>
			</div>
		</fetcher.Form>
	)
}
