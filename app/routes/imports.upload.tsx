import { parseFormData } from '@mjackson/form-data-parser'
import { data, Form, Link, redirect, useActionData } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import {
	createActivityImport,
	autoMatchImport,
} from '#app/utils/activity-import.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { parseGpx } from '#app/utils/gpx-parser.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { DISCIPLINES } from '#app/utils/workout-schema.ts'
import { type Route } from './+types/imports.upload.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Upload Activity | Trainm8' },
]

const DisciplineOverrideSchema = z.object({
	disciplineOverride: z.enum(DISCIPLINES).optional(),
})

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)

	let fileContent: string | null = null
	let fileName = ''
	let disciplineOverride: string | undefined

	const formData = await parseFormData(request, async (field) => {
		if (field.fieldName === 'file') {
			const bytes = await field.bytes()
			fileContent = new TextDecoder().decode(bytes)
			fileName = field.name ?? 'upload'
		}
	})

	const rawDiscipline = formData.get('disciplineOverride')
	const disciplineResult = DisciplineOverrideSchema.safeParse({
		disciplineOverride: rawDiscipline || undefined,
	})
	if (disciplineResult.success) {
		disciplineOverride = disciplineResult.data.disciplineOverride
	}

	if (!fileContent) {
		return data({ error: 'No file uploaded.' }, { status: 400 })
	}

	const ext = fileName.split('.').pop()?.toLowerCase()
	if (ext !== 'gpx' && ext !== 'fit') {
		return data(
			{ error: 'Only .gpx and .fit files are accepted.' },
			{ status: 400 },
		)
	}

	let activity: Awaited<ReturnType<typeof parseGpx>>
	try {
		if (ext === 'gpx') {
			activity = parseGpx(fileContent)
		} else {
			// FIT parsing not yet implemented — store as raw only
			return data(
				{
					error: '.fit file support is coming soon. Please upload a .gpx file.',
				},
				{ status: 400 },
			)
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to parse file'
		return data({ error: message }, { status: 400 })
	}

	if (disciplineOverride) {
		activity.discipline = disciplineOverride
	}

	const externalId = `manual-${fileName}-${activity.startedAt.toISOString()}`

	let importRecord: { id: string }
	try {
		importRecord = await createActivityImport(userId, {
			externalProvider: 'manual',
			externalId,
			rawJson: JSON.stringify({ fileName, fileContent }),
			...activity,
		})
	} catch (err) {
		const isDup =
			err instanceof Error && err.message.toLowerCase().includes('unique')
		if (isDup) {
			return data(
				{ error: 'This activity has already been imported.' },
				{ status: 400 },
			)
		}
		throw err
	}

	// Attempt auto-match (UTC timezone as default; Athlete Profile not yet built)
	await autoMatchImport(userId, importRecord.id, 'UTC')

	return redirect('/imports')
}

export default function ImportsUploadRoute() {
	const actionData = useActionData<typeof action>()

	return (
		<main className="container max-w-lg py-10">
			<div className="mb-6 flex items-center gap-3">
				<Link
					to="/imports"
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Back to inbox
				</Link>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Upload Activity</CardTitle>
				</CardHeader>
				<CardContent>
					{actionData?.error ? (
						<p className="text-destructive mb-4 text-sm">{actionData.error}</p>
					) : null}
					<Form
						method="POST"
						encType="multipart/form-data"
						className="space-y-4"
					>
						<div className="space-y-2">
							<label
								htmlFor="file"
								className="text-body-xs text-muted-foreground font-medium"
							>
								GPX file
							</label>
							<Input
								id="file"
								name="file"
								type="file"
								accept=".gpx,.fit"
								required
								className="w-full"
							/>
						</div>

						<div className="space-y-2">
							<label
								htmlFor="disciplineOverride"
								className="text-body-xs text-muted-foreground font-medium"
							>
								Discipline (override auto-detection)
							</label>
							<Select name="disciplineOverride" defaultValue="">
								<SelectTrigger id="disciplineOverride" className="w-full">
									<SelectValue placeholder="Auto-detect" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="">Auto-detect</SelectItem>
									{DISCIPLINES.map((d) => (
										<SelectItem key={d} value={d}>
											{getDisciplineLabel(d)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<Button type="submit" className="w-full">
							Upload
						</Button>
					</Form>
				</CardContent>
			</Card>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
