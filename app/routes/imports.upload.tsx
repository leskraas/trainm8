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
import { ingestActivityFile } from '#app/utils/activity-file-ingest.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
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

	let fileBytes: Uint8Array | null = null
	let fileName = ''
	let disciplineOverride: string | undefined

	const formData = await parseFormData(request, async (field) => {
		if (field.fieldName === 'file') {
			fileBytes = await field.bytes()
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

	if (!fileBytes) {
		return data({ error: 'No file uploaded.' }, { status: 400 })
	}

	const result = await ingestActivityFile(
		userId,
		{ fileName, bytes: fileBytes },
		// UTC timezone as default; Athlete Profile not yet wired in here
		{ disciplineOverride, timezone: 'UTC' },
	)

	switch (result.status) {
		case 'imported':
			return redirect('/imports')
		case 'duplicate':
			return data(
				{ error: 'This activity has already been imported.' },
				{ status: 400 },
			)
		case 'unsupported':
		case 'failed':
			return data({ error: result.message }, { status: 400 })
	}
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
								Activity file (.gpx, .tcx or .fit)
							</label>
							<Input
								id="file"
								name="file"
								type="file"
								accept=".gpx,.tcx,.fit"
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
