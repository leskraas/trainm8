import {
	getFormProps,
	getInputProps,
	useForm,
	type FieldMetadata,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, Form, Link, useNavigation } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field, SelectField } from '#app/components/forms.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	DisciplineThresholdSchema,
	recipeBelongsToDiscipline,
} from '#app/utils/athlete-schema.ts'
import {
	getOrCreateAthleteProfile,
	setDisciplineThresholds,
} from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatPaceClock, parsePace } from '#app/utils/format.ts'
import {
	DISCIPLINE_LABELS,
	DISCIPLINES,
	isCardioDiscipline,
	type CardioDiscipline,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import {
	anchorLabel,
	defaultRecipeIdFor,
	getRecipe,
	listRecipesForDiscipline,
	type ZoneAnchor,
	type ZoneRecipeSource,
} from '#app/utils/zones/index.ts'
import { type Route } from './+types/index.ts'

export const handle: SEOHandle = { getSitemapEntries: () => null }

/**
 * Form-boundary pace entry: athletes type `mm:ss` (a `/km` or `/100m` suffix is
 * tolerated), we store canonical integer seconds per unit. The range bounds are
 * read off the canonical schema so form validation can never drift from it, but
 * the error copy speaks `mm:ss`, never raw seconds.
 */
function paceEntrySchema(
	canonical: z.ZodOptional<z.ZodNumber>,
	unit: '/km' | '/100m',
	example: string,
) {
	const inner = canonical.unwrap()
	const min = inner.minValue ?? 0
	const max = inner.maxValue ?? Number.MAX_SAFE_INTEGER
	return z
		.string()
		.transform((value, ctx) => {
			const seconds = parsePace(value)
			if (seconds == null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Enter a pace as mm:ss, e.g. ${example}`,
				})
				return z.NEVER
			}
			if (seconds < min || seconds > max) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `Pace must be between ${formatPaceClock(min)} and ${formatPaceClock(max)} ${unit}`,
				})
				return z.NEVER
			}
			return seconds
		})
		.optional()
}

const TrainingFormSchema = z.object({
	discipline: z.enum(DISCIPLINES),
	...DisciplineThresholdSchema.shape,
	// Pace thresholds are entered as `mm:ss`, not raw seconds (#177). They
	// override the canonical numeric fields but still emit canonical seconds.
	thresholdPaceSecPerKm: paceEntrySchema(
		DisciplineThresholdSchema.shape.thresholdPaceSecPerKm,
		'/km',
		'4:00',
	),
	cssSecPer100m: paceEntrySchema(
		DisciplineThresholdSchema.shape.cssSecPer100m,
		'/100m',
		'1:35',
	),
})

/**
 * The form schema plus the one check the canonical schema cannot make: a **Zone
 * Recipe** belongs to exactly one **Discipline** (ADR 0006), and only this form
 * carries both. Kept beside `TrainingFormSchema` rather than replacing it
 * because `getZodConstraint` wants the plain object.
 */
const TrainingSubmitSchema = TrainingFormSchema.superRefine((value, ctx) => {
	if (
		value.zoneSystem &&
		!recipeBelongsToDiscipline(value.zoneSystem, value.discipline)
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['zoneSystem'],
			message: `That zone recipe is not a ${DISCIPLINE_LABELS[value.discipline].toLowerCase()} one`,
		})
	}
})

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const athleteProfile = await getOrCreateAthleteProfile(userId)
	return { athleteProfile }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const submission = parseWithZod(formData, { schema: TrainingSubmitSchema })
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { discipline, ...thresholds } = submission.value
	await setDisciplineThresholds(userId, discipline, thresholds)

	return { result: submission.reply() }
}

export default function TrainingSettingsIndex({
	loaderData,
}: Route.ComponentProps) {
	const navigation = useNavigation()
	const isPending = navigation.state !== 'idle'

	return (
		<div className="space-y-8">
			<div>
				<p className="text-body-md text-muted-foreground mt-2">
					Set your discipline-specific thresholds. These feed into TSS
					calculations and zone resolution.
				</p>
				{/* The ticket's whole distinction, said once at the top (#454): a Zone
				    Recipe is a *shape* the app may choose, a threshold is a *number*
				    about this athlete and only ever theirs. */}
				<p className="text-body-sm text-muted-foreground mt-2">
					Every discipline starts on a zone recipe we picked — it only sets
					which ladder your numbers are read on. A threshold is a number about
					you, so we never fill one in on our own: without it, targets stay as
					zone labels rather than becoming a figure nobody measured.
				</p>
				{/* The proposal path (#434 follow-up). It does not weaken the sentence
				    above — an estimate fitted to the athlete's *own* efforts is not a
				    number nobody measured, and it still lands only when they accept it
				    (ADR 0050's derived-then-authored rule). */}
				<Link
					to="analyze"
					className={
						buttonVariants({ variant: 'outline', size: 'sm' }) + ' mt-4'
					}
				>
					Read these from my history
				</Link>
				<Link
					to="history"
					className="text-body-sm text-muted-foreground hover:text-foreground mt-2 inline-flex min-h-11 items-center underline"
				>
					View threshold history
				</Link>
				{/* The gym is not a threshold: it is what the athlete's rack can make, and
				    without it the weight input has no honest plate line to draw. */}
				<Link
					to="gym"
					className="text-body-sm text-muted-foreground hover:text-foreground mt-2 ml-4 inline-flex min-h-11 items-center underline"
				>
					Your gym’s bars and plates
				</Link>
			</div>

			{DISCIPLINES.filter((d) => d !== 'strength').map((discipline) => {
				const existing = loaderData.athleteProfile.disciplineProfiles.find(
					(p) => p.discipline === discipline,
				)

				return (
					<DisciplineThresholdForm
						key={discipline}
						discipline={discipline}
						existing={existing ?? null}
						isPending={isPending}
					/>
				)
			})}
		</div>
	)
}

/** The stored Discipline Profile columns this screen reads back. */
type StoredDisciplineProfile = {
	maxHr: number | null
	lthr: number | null
	ftp: number | null
	runPowerThresholdW: number | null
	thresholdPaceSecPerKm: number | null
	cssSecPer100m: number | null
	zoneSystem: string | null
	zoneSystemSource: string | null
	enabled: boolean
}

function DisciplineThresholdForm({
	discipline,
	existing,
	isPending,
}: {
	discipline: Discipline
	existing: StoredDisciplineProfile | null
	isPending: boolean
}) {
	// Every cardio profile carries a recipe now, but the form is rendered from a
	// row that may not exist yet — so it falls back to the same default the app
	// would stamp, and says so with the same words.
	const recipeId = existing?.zoneSystem ?? defaultRecipeIdFor(discipline)
	const recipeSource: ZoneRecipeSource =
		existing?.zoneSystemSource === 'athlete' ? 'athlete' : 'default'
	const [form, fields] = useForm({
		id: `thresholds-${discipline}`,
		constraint: getZodConstraint(TrainingFormSchema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: TrainingSubmitSchema })
		},
		defaultValue: {
			discipline,
			maxHr: existing?.maxHr ?? '',
			lthr: existing?.lthr ?? '',
			ftp: existing?.ftp ?? '',
			runPowerThresholdW: existing?.runPowerThresholdW ?? '',
			// Stored canonical seconds display back in the humane mm:ss form the
			// athlete typed (#177).
			thresholdPaceSecPerKm:
				existing?.thresholdPaceSecPerKm != null
					? formatPaceClock(existing.thresholdPaceSecPerKm)
					: '',
			cssSecPer100m:
				existing?.cssSecPer100m != null
					? formatPaceClock(existing.cssSecPer100m)
					: '',
			zoneSystem: recipeId ?? '',
		},
	})

	return (
		<section>
			<h2 className="mb-4 text-lg font-semibold">
				{DISCIPLINE_LABELS[discipline]}
			</h2>
			<Form method="POST" {...getFormProps(form)}>
				<input type="hidden" name="discipline" value={discipline} />
				{isCardioDiscipline(discipline) && recipeId ? (
					<ZoneRecipeField
						discipline={discipline}
						meta={fields.zoneSystem}
						recipeId={recipeId}
						source={recipeSource}
						existing={existing}
					/>
				) : null}
				{/* Single column on phones (§1.5); gap-x only + per-field pb-4 avoids
				    the conform second-submit break from a space-y/gap-y field wrapper
				    (map #277 Notes). */}
				<div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
					<Field
						className="pb-4"
						labelProps={{ htmlFor: fields.maxHr.id, children: 'Max HR (bpm)' }}
						inputProps={getInputProps(fields.maxHr, { type: 'number' })}
						errors={fields.maxHr.errors}
					/>
					<Field
						className="pb-4"
						labelProps={{ htmlFor: fields.lthr.id, children: 'LTHR (bpm)' }}
						inputProps={getInputProps(fields.lthr, { type: 'number' })}
						errors={fields.lthr.errors}
					/>
					{discipline === 'bike' && (
						<Field
							className="pb-4"
							labelProps={{ htmlFor: fields.ftp.id, children: 'FTP (W)' }}
							inputProps={getInputProps(fields.ftp, { type: 'number' })}
							errors={fields.ftp.errors}
						/>
					)}
					{discipline === 'run' && (
						<>
							<Field
								className="pb-4"
								labelProps={{
									htmlFor: fields.thresholdPaceSecPerKm.id,
									children: 'Threshold pace (mm:ss /km)',
								}}
								inputProps={{
									...getInputProps(fields.thresholdPaceSecPerKm, {
										type: 'text',
									}),
									placeholder: '4:00',
								}}
								errors={fields.thresholdPaceSecPerKm.errors}
							/>
							<Field
								className="pb-4"
								labelProps={{
									htmlFor: fields.runPowerThresholdW.id,
									children: 'Critical running power (W)',
								}}
								inputProps={getInputProps(fields.runPowerThresholdW, {
									type: 'number',
								})}
								errors={fields.runPowerThresholdW.errors}
							/>
						</>
					)}
					{discipline === 'swim' && (
						<Field
							className="pb-4"
							labelProps={{
								htmlFor: fields.cssSecPer100m.id,
								children: 'CSS (mm:ss /100m)',
							}}
							inputProps={{
								...getInputProps(fields.cssSecPer100m, {
									type: 'text',
								}),
								placeholder: '1:35',
							}}
							errors={fields.cssSecPer100m.errors}
						/>
					)}
				</div>

				<ErrorList errors={form.errors} id={form.errorId} />

				<div className="pt-2">
					<Button
						type="submit"
						disabled={isPending}
						className="w-full sm:w-auto"
					>
						Save {DISCIPLINE_LABELS[discipline]}
					</Button>
				</div>
			</Form>
		</section>
	)
}

/** The stored threshold a recipe's anchor reads, formatted, or null when unset. */
function anchorReading(
	anchor: ZoneAnchor,
	existing: StoredDisciplineProfile | null,
): string | null {
	if (!existing) return null
	switch (anchor) {
		case 'ftp':
			return existing.ftp == null ? null : `${existing.ftp} W`
		case 'runPower':
			return existing.runPowerThresholdW == null
				? null
				: `${existing.runPowerThresholdW} W`
		case 'lthr':
			return existing.lthr == null ? null : `${existing.lthr} bpm`
		case 'maxHr':
			return existing.maxHr == null ? null : `${existing.maxHr} bpm`
		case 'thresholdPace':
			return existing.thresholdPaceSecPerKm == null
				? null
				: `${formatPaceClock(existing.thresholdPaceSecPerKm)} /km`
		case 'css':
			return existing.cssSecPer100m == null
				? null
				: `${formatPaceClock(existing.cssSecPer100m)} /100m`
		case 'rpe':
			return null
	}
}

/**
 * The **Zone Recipe** picker (#454) — the one control on this screen that is not
 * a threshold, and the only value here the app is allowed to have filled in.
 *
 * It **says which of those two it is**. A recipe the app chose wears a `Default`
 * badge and the sentence explaining what was and was not chosen; a recipe the
 * athlete picked says `Your choice` and claims nothing. That distinction is
 * read off the stored `zoneSystemSource`, never off "does the id happen to equal
 * the default" — an athlete who deliberately picks the recipe that is also the
 * default has still picked it.
 *
 * Below it, the recipe's **anchor**: the one **Threshold** it is a ratio table
 * over, with the athlete's own figure when they have given one and an honest
 * absence when they have not. That absence is the degradation ladder said out
 * loud — no threshold means zone labels, never an invented pace or wattage.
 */
function ZoneRecipeField({
	discipline,
	meta,
	recipeId,
	source,
	existing,
}: {
	discipline: CardioDiscipline
	meta: FieldMetadata<string | undefined>
	recipeId: string
	source: ZoneRecipeSource
	existing: StoredDisciplineProfile | null
}) {
	const recipe = getRecipe(recipeId)
	const anchor = recipe?.anchor
	const reading = anchor ? anchorReading(anchor, existing) : null

	return (
		<div className="pb-4">
			<SelectField
				meta={meta as FieldMetadata<string>}
				labelProps={{ children: 'Zone recipe' }}
				items={listRecipesForDiscipline(discipline).map((r) => ({
					value: r.id,
					label: r.name,
				}))}
			/>
			<p className="text-body-sm text-muted-foreground mt-2">
				{source === 'default' ? (
					<>
						<Badge variant="secondary" className="mr-2 align-middle">
							Default
						</Badge>
						We chose this one for {DISCIPLINE_LABELS[discipline].toLowerCase()}{' '}
						— you have not picked a zone model. It decides which ladder your
						numbers are read on and invents none of them.
					</>
				) : (
					<>
						<Badge variant="outline" className="mr-2 align-middle">
							Your choice
						</Badge>
						You picked this one.
					</>
				)}
			</p>
			{anchor ? (
				<p className="text-body-sm text-muted-foreground mt-1">
					{reading ? (
						<>
							Read against your {anchorLabel(anchor)}, {reading}. Changing the
							recipe re-reads every session you have logged, not only the ones
							ahead.
						</>
					) : (
						<>
							Read against your {anchorLabel(anchor)}, which you have not set —
							so targets in this discipline stay as zone labels rather than
							becoming a number nobody measured.
						</>
					)}
				</p>
			) : null}
		</div>
	)
}
