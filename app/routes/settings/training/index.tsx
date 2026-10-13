/**
 * **Trening og terskler** — the athlete's thresholds per discipline and the
 * Zone Recipe each is read on (#454), with the readings, history and gym one
 * tap away. Norwegian and on the design system since round 2 (ADR 0081/0085);
 * the schema and the action are unchanged.
 */
import {
	getFormProps,
	getInputProps,
	useForm,
	type FieldMetadata,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, useFetcher } from 'react-router'
import { z } from 'zod/v3'
import { Badge } from '#app/components/ui/badge.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
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
	MEG_TRAINING_LABELS,
	MEG_UNIT_SUFFIX,
	MEG_ZONE_ANCHOR_LABELS,
	MEG_ZONE_RECIPE_LABELS,
	NB_DISCIPLINE_LABELS,
} from '#app/utils/labels.ts'
import {
	DISCIPLINES,
	isCardioDiscipline,
	type CardioDiscipline,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import {
	defaultRecipeIdFor,
	getRecipe,
	listRecipesForDiscipline,
	type ZoneAnchor,
	type ZoneRecipeSource,
} from '#app/utils/zones/index.ts'
import { megZodErrorMap } from '../__meg-text.ts'
import {
	MegField,
	MegFormErrors,
	MegNote,
	MegRow,
	MegRows,
	MegSection,
	MegSelectField,
} from '../__meg-ui.tsx'
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
	const unitWords =
		unit === '/km' ? MEG_UNIT_SUFFIX.perKm : MEG_UNIT_SUFFIX.per100m
	return z
		.string()
		.transform((value, ctx) => {
			const seconds = parsePace(value)
			if (seconds == null) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: MEG_TRAINING_LABELS.paceFormat(example),
				})
				return z.NEVER
			}
			if (seconds < min || seconds > max) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: MEG_TRAINING_LABELS.paceRange(
						formatPaceClock(min),
						formatPaceClock(max),
						unitWords,
					),
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
			message: MEG_TRAINING_LABELS.recipeWrongDiscipline(
				NB_DISCIPLINE_LABELS[value.discipline],
			),
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

	const submission = parseWithZod(formData, {
		schema: TrainingSubmitSchema,
		errorMap: megZodErrorMap,
	})
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
	const L = MEG_TRAINING_LABELS
	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-col gap-2">
				<p className="text-body">{L.intro}</p>
				{/* The ticket's whole distinction, said once at the top (#454): a Zone
				    Recipe is a *shape* the app may choose, a threshold is a *number*
				    about this athlete and only ever theirs. */}
				<MegNote>{L.recipeIntro}</MegNote>
			</div>

			{/* The proposal path (#434 follow-up), the history and the gym. The
			    proposals do not weaken the sentence above — an estimate fitted to the
			    athlete's *own* efforts is not a number nobody measured, and it still
			    lands only when they accept it (ADR 0050's derived-then-authored
			    rule). The gym is not a threshold: it is what the rack can make. */}
			<MegRows>
				<MegRow
					to="analyze"
					icon="bar-chart"
					title={L.readHistory}
					detail={L.readHistoryDetail}
				/>
				<MegRow
					to="history"
					icon="clock"
					title={L.history}
					detail={L.historyDetail}
				/>
				<MegRow to="gym" icon="barbell" title={L.gym} detail={L.gymDetail} />
			</MegRows>

			{DISCIPLINES.filter((d) => d !== 'strength').map((discipline) => {
				const existing = loaderData.athleteProfile.disciplineProfiles.find(
					(p) => p.discipline === discipline,
				)

				return (
					<DisciplineThresholdForm
						key={discipline}
						discipline={discipline}
						existing={existing ?? null}
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

/** A whole-number threshold box: digits keypad, no spinner arithmetic. */
function wholeNumber(enterKeyHint: 'next' | 'done') {
	return { inputMode: 'numeric', enterKeyHint } as const
}

function DisciplineThresholdForm({
	discipline,
	existing,
}: {
	discipline: Discipline
	existing: StoredDisciplineProfile | null
}) {
	const L = MEG_TRAINING_LABELS
	// One fetcher per discipline, so a save says "Lagret." under its own form and
	// a refusal lands on its own fields — three forms share one action.
	const fetcher = useFetcher<typeof action>()
	// Every cardio profile carries a recipe now, but the form is rendered from a
	// row that may not exist yet — so it falls back to the same default the app
	// would stamp, and says so with the same words.
	const recipeId = existing?.zoneSystem ?? defaultRecipeIdFor(discipline)
	const recipeSource: ZoneRecipeSource =
		existing?.zoneSystemSource === 'athlete' ? 'athlete' : 'default'
	const [form, fields] = useForm({
		id: `thresholds-${discipline}`,
		constraint: getZodConstraint(TrainingFormSchema),
		lastResult: fetcher.data?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, {
				schema: TrainingSubmitSchema,
				errorMap: megZodErrorMap,
			})
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
	const name = NB_DISCIPLINE_LABELS[discipline]
	const saved =
		fetcher.state === 'idle' && fetcher.data?.result.status === 'success'

	return (
		<MegSection id={`thresholds-${discipline}-title`} title={name}>
			<Card size="sm">
				<CardContent>
					<fetcher.Form method="POST" {...getFormProps(form)}>
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
						{/* Single column on phones (§1.5); gap-x only + per-field pb-4
						    avoids the conform second-submit break from a space-y/gap-y
						    field wrapper (map #277 Notes). */}
						<div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
							<MegField
								className="pb-4"
								label={L.maxHr}
								inputProps={{
									...getInputProps(fields.maxHr, { type: 'number' }),
									...wholeNumber('next'),
								}}
								errors={fields.maxHr.errors}
							/>
							<MegField
								className="pb-4"
								label={L.lthr}
								inputProps={{
									...getInputProps(fields.lthr, { type: 'number' }),
									...wholeNumber('next'),
								}}
								errors={fields.lthr.errors}
							/>
							{discipline === 'bike' && (
								<MegField
									className="pb-4"
									label={L.ftp}
									inputProps={{
										...getInputProps(fields.ftp, { type: 'number' }),
										...wholeNumber('done'),
									}}
									errors={fields.ftp.errors}
								/>
							)}
							{discipline === 'run' && (
								<>
									<MegField
										className="pb-4"
										label={L.thresholdPace}
										inputProps={{
											...getInputProps(fields.thresholdPaceSecPerKm, {
												type: 'text',
											}),
											placeholder: '4:00',
											// `mm:ss` needs the colon, which the numeric pad
											// lacks on iOS; the punctuation pad has it.
											inputMode: 'text',
											autoComplete: 'off',
											autoCorrect: 'off',
											spellCheck: false,
											enterKeyHint: 'next',
										}}
										errors={fields.thresholdPaceSecPerKm.errors}
									/>
									<MegField
										className="pb-4"
										label={L.runPower}
										inputProps={{
											...getInputProps(fields.runPowerThresholdW, {
												type: 'number',
											}),
											...wholeNumber('done'),
										}}
										errors={fields.runPowerThresholdW.errors}
									/>
								</>
							)}
							{discipline === 'swim' && (
								<MegField
									className="pb-4"
									label={L.css}
									inputProps={{
										...getInputProps(fields.cssSecPer100m, {
											type: 'text',
										}),
										placeholder: '1:35',
										inputMode: 'text',
										autoComplete: 'off',
										autoCorrect: 'off',
										spellCheck: false,
										enterKeyHint: 'done',
									}}
									errors={fields.cssSecPer100m.errors}
								/>
							)}
						</div>

						<MegFormErrors errors={form.errors} id={form.errorId} />

						<div className="flex flex-wrap items-center gap-3 pt-2">
							<StatusButton
								type="submit"
								className="w-full sm:w-auto"
								status={
									fetcher.state !== 'idle' ? 'pending' : (form.status ?? 'idle')
								}
							>
								{L.save(name)}
							</StatusButton>
							{saved ? (
								<p
									role="status"
									className="text-footnote text-muted-foreground"
								>
									{L.saved}
								</p>
							) : null}
						</div>
					</fetcher.Form>
				</CardContent>
			</Card>
		</MegSection>
	)
}

/** The stored threshold a recipe's anchor reads, formatted, or null when unset. */
function anchorReading(
	anchor: ZoneAnchor,
	existing: StoredDisciplineProfile | null,
): string | null {
	if (!existing) return null
	const U = MEG_UNIT_SUFFIX
	switch (anchor) {
		case 'ftp':
			return existing.ftp == null ? null : `${existing.ftp} ${U.watt}`
		case 'runPower':
			return existing.runPowerThresholdW == null
				? null
				: `${existing.runPowerThresholdW} ${U.watt}`
		case 'lthr':
			return existing.lthr == null ? null : `${existing.lthr} ${U.bpm}`
		case 'maxHr':
			return existing.maxHr == null ? null : `${existing.maxHr} ${U.bpm}`
		case 'thresholdPace':
			return existing.thresholdPaceSecPerKm == null
				? null
				: `${formatPaceClock(existing.thresholdPaceSecPerKm)} ${U.perKm}`
		case 'css':
			return existing.cssSecPer100m == null
				? null
				: `${formatPaceClock(existing.cssSecPer100m)} ${U.per100m}`
		case 'rpe':
			return null
	}
}

/**
 * The **Zone Recipe** picker (#454) — the one control on this screen that is not
 * a threshold, and the only value here the app is allowed to have filled in.
 *
 * It **says which of those two it is**. A recipe the app chose wears a
 * `Valgt for deg` badge and the sentence explaining what was and was not chosen;
 * a recipe the athlete picked says `Ditt valg` and claims nothing. That
 * distinction is read off the stored `zoneSystemSource`, never off "does the id
 * happen to equal the default" — an athlete who deliberately picks the recipe
 * that is also the default has still picked it.
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
	const L = MEG_TRAINING_LABELS
	const recipe = getRecipe(recipeId)
	const anchor = recipe?.anchor
	const reading = anchor ? anchorReading(anchor, existing) : null
	const name = NB_DISCIPLINE_LABELS[discipline]

	return (
		<div className="flex flex-col gap-2 pb-4">
			<MegSelectField
				meta={meta as FieldMetadata<string>}
				label={L.recipe}
				items={listRecipesForDiscipline(discipline).map((r) => ({
					value: r.id,
					label: MEG_ZONE_RECIPE_LABELS[r.id] ?? r.name,
				}))}
			/>
			<MegNote>
				<Badge
					variant={source === 'default' ? 'secondary' : 'outline'}
					className="mr-2 align-middle"
				>
					{source === 'default' ? L.recipeDefault : L.recipeChosen}
				</Badge>
				{source === 'default' ? L.recipeDefaultLine(name) : L.recipeChosenLine}
			</MegNote>
			{anchor ? (
				<MegNote className="tabular-nums">
					{reading
						? L.anchorSet(MEG_ZONE_ANCHOR_LABELS[anchor], reading)
						: L.anchorMissing(MEG_ZONE_ANCHOR_LABELS[anchor])}
				</MegNote>
			) : null}
		</div>
	)
}
