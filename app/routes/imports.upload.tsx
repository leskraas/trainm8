import { parseFormData } from '@mjackson/form-data-parser'
import { useRef, useState } from 'react'
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
	ingestActivityFile,
	ingestUploadedFiles,
	type UploadedArtifact,
} from '#app/utils/activity-file-ingest.server.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
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

	let disciplineOverride: string | undefined
	const artifacts: UploadedArtifact[] = []

	const formData = await parseFormData(request, async (field) => {
		if (field.fieldName === 'file') {
			artifacts.push({
				fileName: field.name ?? 'upload',
				bytes: await field.bytes(),
			})
		}
	})

	const rawDiscipline = formData.get('disciplineOverride')
	const disciplineResult = DisciplineOverrideSchema.safeParse({
		disciplineOverride: rawDiscipline || undefined,
	})
	if (disciplineResult.success) {
		disciplineOverride = disciplineResult.data.disciplineOverride
	}

	if (artifacts.length === 0) {
		return data({ error: 'No file uploaded.' }, { status: 400 })
	}

	// Day attribution runs in the Athlete Timezone so a near-midnight activity
	// lands on the athlete's local day, not UTC's (#173).
	const timezone = await getAthleteTimezone(userId)

	// A single non-archive file keeps the focused single-file flow (with the
	// Discipline override); multiple files or a ZIP take the batch path and
	// report an imported / duplicates / failed summary.
	const isBatch =
		artifacts.length > 1 ||
		artifacts[0]!.fileName.toLowerCase().endsWith('.zip')

	if (isBatch) {
		const summary = await ingestUploadedFiles(userId, artifacts, { timezone })
		return data({ summary })
	}

	const result = await ingestActivityFile(userId, artifacts[0]!, {
		disciplineOverride,
		timezone,
	})

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

function BatchSummary({
	summary,
}: {
	summary: {
		imported: number
		duplicates: number
		failed: Array<{ fileName: string; reason: string }>
	}
}) {
	return (
		<div className="mb-4 space-y-2 text-sm" data-testid="batch-summary">
			<p>
				<span className="font-medium">{summary.imported} imported</span>
				{' · '}
				{summary.duplicates} duplicate{summary.duplicates === 1 ? '' : 's'}
				{' · '}
				{summary.failed.length} failed
			</p>
			{summary.failed.length > 0 ? (
				<ul className="text-destructive list-inside list-disc">
					{summary.failed.map((f) => (
						<li key={f.fileName}>
							{f.fileName}: {f.reason}
						</li>
					))}
				</ul>
			) : null}
			{summary.imported > 0 ? (
				<p>
					<Link to="/imports" className="underline">
						See them in the Activity Inbox
					</Link>
				</p>
			) : null}
		</div>
	)
}

export default function ImportsUploadRoute() {
	const actionData = useActionData<typeof action>()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [dragActive, setDragActive] = useState(false)

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
					{actionData && 'error' in actionData && actionData.error ? (
						<p className="text-destructive mb-4 text-sm">{actionData.error}</p>
					) : null}
					{actionData && 'summary' in actionData ? (
						<BatchSummary summary={actionData.summary} />
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
								Activity files (.fit, .fit.gz, .tcx, .gpx, .zip, .gz)
							</label>
							<div
								data-testid="dropzone"
								onDragOver={(e) => {
									e.preventDefault()
									setDragActive(true)
								}}
								onDragLeave={() => setDragActive(false)}
								onDrop={(e) => {
									e.preventDefault()
									setDragActive(false)
									if (fileInputRef.current && e.dataTransfer.files.length) {
										fileInputRef.current.files = e.dataTransfer.files
									}
								}}
								className={`rounded-md border border-dashed p-4 ${
									dragActive ? 'border-primary bg-muted' : 'border-input'
								}`}
							>
								<Input
									ref={fileInputRef}
									id="file"
									name="file"
									type="file"
									multiple
									accept=".fit,.fit.gz,.tcx,.gpx,.zip,.gz"
									required
									className="w-full"
								/>
								<p className="text-muted-foreground mt-2 text-xs">
									Drop one or many files here — or a whole ZIP, including your
									Strava bulk-export archive.{' '}
									<a
										href="https://support.strava.com/hc/en-us/articles/216918437-Exporting-your-Data-and-Bulk-Export"
										target="_blank"
										rel="noreferrer"
										className="underline"
									>
										How to request your Strava export
									</a>
								</p>
							</div>
						</div>

						<div className="space-y-2">
							<label
								htmlFor="disciplineOverride"
								className="text-body-xs text-muted-foreground font-medium"
							>
								Discipline (override auto-detection, single file only)
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
