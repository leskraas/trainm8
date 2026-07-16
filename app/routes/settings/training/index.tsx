import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, Form, Link, useNavigation } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { DisciplineThresholdSchema } from '#app/utils/athlete-schema.ts'
import {
	getOrCreateAthleteProfile,
	setDisciplineThresholds,
} from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatPaceClock, parsePace } from '#app/utils/format.ts'
import {
	DISCIPLINE_LABELS,
	DISCIPLINES,
	type Discipline,
} from '#app/utils/workout-schema.ts'
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

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const athleteProfile = await getOrCreateAthleteProfile(userId)
	return { athleteProfile }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const submission = parseWithZod(formData, { schema: TrainingFormSchema })
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
				<Link
					to="history"
					className="text-body-sm text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center underline"
				>
					View threshold history
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

function DisciplineThresholdForm({
	discipline,
	existing,
	isPending,
}: {
	discipline: Discipline
	existing: {
		maxHr: number | null
		lthr: number | null
		ftp: number | null
		runPowerThresholdW: number | null
		thresholdPaceSecPerKm: number | null
		cssSecPer100m: number | null
		enabled: boolean
	} | null
	isPending: boolean
}) {
	const [form, fields] = useForm({
		id: `thresholds-${discipline}`,
		constraint: getZodConstraint(TrainingFormSchema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: TrainingFormSchema })
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
		},
	})

	return (
		<section>
			<h2 className="mb-4 text-lg font-semibold">
				{DISCIPLINE_LABELS[discipline]}
			</h2>
			<Form method="POST" {...getFormProps(form)}>
				<input type="hidden" name="discipline" value={discipline} />
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
