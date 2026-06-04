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
import {
	DISCIPLINE_LABELS,
	DISCIPLINES,
	type Discipline,
} from '#app/utils/workout-schema.ts'
import { type Route } from './+types/index.ts'

export const handle: SEOHandle = { getSitemapEntries: () => null }

const TrainingFormSchema = z.object({
	discipline: z.enum(DISCIPLINES),
	...DisciplineThresholdSchema.shape,
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
		<div className="flex flex-col gap-10">
			<div>
				<h1 className="text-h1">Training Settings</h1>
				<p className="text-body-md text-muted-foreground mt-2">
					Set your discipline-specific thresholds. These feed into TSS
					calculations and zone resolution.
				</p>
				<div className="mt-2">
					<Link
						to="history"
						className="text-body-sm text-muted-foreground hover:text-foreground underline"
					>
						View threshold history
					</Link>
				</div>
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
			thresholdPaceSecPerKm: existing?.thresholdPaceSecPerKm ?? '',
			cssSecPer100m: existing?.cssSecPer100m ?? '',
		},
	})

	return (
		<section>
			<h2 className="text-h4 mb-4">{DISCIPLINE_LABELS[discipline]}</h2>
			<Form method="POST" {...getFormProps(form)}>
				<input type="hidden" name="discipline" value={discipline} />
				<div className="grid grid-cols-2 gap-x-6 gap-y-4">
					<Field
						labelProps={{ htmlFor: fields.maxHr.id, children: 'Max HR (bpm)' }}
						inputProps={getInputProps(fields.maxHr, { type: 'number' })}
						errors={fields.maxHr.errors}
					/>
					<Field
						labelProps={{ htmlFor: fields.lthr.id, children: 'LTHR (bpm)' }}
						inputProps={getInputProps(fields.lthr, { type: 'number' })}
						errors={fields.lthr.errors}
					/>
					{discipline === 'bike' && (
						<Field
							labelProps={{ htmlFor: fields.ftp.id, children: 'FTP (W)' }}
							inputProps={getInputProps(fields.ftp, { type: 'number' })}
							errors={fields.ftp.errors}
						/>
					)}
					{discipline === 'run' && (
						<Field
							labelProps={{
								htmlFor: fields.thresholdPaceSecPerKm.id,
								children: 'Threshold pace (sec/km)',
							}}
							inputProps={getInputProps(fields.thresholdPaceSecPerKm, {
								type: 'number',
							})}
							errors={fields.thresholdPaceSecPerKm.errors}
						/>
					)}
					{discipline === 'swim' && (
						<Field
							labelProps={{
								htmlFor: fields.cssSecPer100m.id,
								children: 'CSS (sec/100m)',
							}}
							inputProps={getInputProps(fields.cssSecPer100m, {
								type: 'number',
							})}
							errors={fields.cssSecPer100m.errors}
						/>
					)}
				</div>

				<ErrorList errors={form.errors} id={form.errorId} />

				<div className="mt-4">
					<Button type="submit" disabled={isPending} size="sm">
						Save {DISCIPLINE_LABELS[discipline]}
					</Button>
				</div>
			</Form>
		</section>
	)
}
