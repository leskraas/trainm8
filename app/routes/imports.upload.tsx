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
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	createActivityImport,
	autoMatchImport,
} from '#app/utils/activity-import.server.ts'
import { parseGpx } from '#app/utils/gpx-parser.server.ts'
import { DISCIPLINES } from '#app/utils/workout-schema.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
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
	const parsed = DisciplineOverrideSchema.safeParse({
		disciplineOverride: rawDiscipline || undefined,
	})
	if (parsed.success) {
		disciplineOverride = parsed.data.disciplineOverride
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

	let parsed2: Awaited<ReturnType<typeof parseGpx>>
	try {
		if (ext === 'gpx') {
			parsed2 = parseGpx(fileContent)
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
		parsed2.discipline = disciplineOverride
	}

	const externalId = `manual-${fileName}-${parsed2.startedAt.toISOString()}`

	let importRecord: { id: string }
	try {
		importRecord = await createActivityImport(userId, {
			externalProvider: 'manual',
			externalId,
			rawJson: JSON.stringify({ fileName, fileContent }),
			...parsed2,
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
							<input
								id="file"
								name="file"
								type="file"
								accept=".gpx,.fit"
								required
								className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
							/>
						</div>

						<div className="space-y-2">
							<label
								htmlFor="disciplineOverride"
								className="text-body-xs text-muted-foreground font-medium"
							>
								Discipline (override auto-detection)
							</label>
							<select
								id="disciplineOverride"
								name="disciplineOverride"
								className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
							>
								<option value="">Auto-detect</option>
								{DISCIPLINES.map((d) => (
									<option key={d} value={d}>
										{getDisciplineLabel(d)}
									</option>
								))}
							</select>
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
