import {
	FormDataParseError,
	MaxFilesExceededError,
	MultipartParseError,
	parseFormData,
} from '@mjackson/form-data-parser'
import { useRef, useState } from 'react'
import { data, Form, Link, redirect, useActionData } from 'react-router'
import { z } from 'zod/v3'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
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
	UPLOAD_LIMITS,
	type UploadedArtifact,
} from '#app/utils/activity-file-ingest.server.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	APP_TAB_LABELS,
	NB_DISCIPLINE_LABELS,
	UPLOAD_LABELS,
	uploadFailureLabel,
} from '#app/utils/labels.ts'
import { cn, useIsPending } from '#app/utils/misc.tsx'
import { DISCIPLINES } from '#app/utils/workout-schema.ts'
import { type Route } from './+types/imports.upload.ts'

const L = UPLOAD_LABELS

export const meta: Route.MetaFunction = () => [
	{ title: `${L.title} | Trainm8` },
]

const DisciplineOverrideSchema = z.object({
	disciplineOverride: z.enum(DISCIPLINES).optional(),
})

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)

	let disciplineOverride: string | undefined
	const artifacts: UploadedArtifact[] = []

	let formData: FormData
	try {
		formData = await parseFormData(
			request,
			{
				maxFileSize: UPLOAD_LIMITS.maxFileSize,
				maxFiles: UPLOAD_LIMITS.maxFiles,
			},
			async (field) => {
				if (field.fieldName === 'file') {
					const bytes = await field.bytes()
					// An empty file input still posts one part, with no filename and
					// no bytes (the parser names such a part `file-upload`): that is
					// "no file", not a file of an unknown type.
					const unnamed = !field.name || field.name === 'file-upload'
					if (unnamed && bytes.byteLength === 0) return
					artifacts.push({ fileName: field.name ?? 'upload', bytes })
				}
			},
		)
	} catch (err) {
		if (err instanceof MaxFilesExceededError) {
			return data(
				{ error: L.tooManyFiles(UPLOAD_LIMITS.maxFiles) },
				{ status: 400 },
			)
		}
		if (
			err instanceof FormDataParseError ||
			err instanceof MultipartParseError
		) {
			return data({ error: L.tooLarge }, { status: 400 })
		}
		throw err
	}

	const rawDiscipline = formData.get('disciplineOverride')
	const disciplineResult = DisciplineOverrideSchema.safeParse({
		disciplineOverride: rawDiscipline || undefined,
	})
	if (disciplineResult.success) {
		disciplineOverride = disciplineResult.data.disciplineOverride
	}

	if (artifacts.length === 0) {
		return data({ error: L.noFile }, { status: 400 })
	}

	// Day attribution happens in the Athlete Timezone (#173): the Athlete
	// Profile's zone, degrading to UTC only when no profile exists.
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
			// Auto-save already filed it as a Workout Session (ADR 0049), so land the
			// athlete on the activity itself rather than on a queue to work through.
			return redirect(
				result.sessionId ? `/training/sessions/${result.sessionId}` : '/',
			)
		case 'duplicate':
			return data({ error: L.duplicate }, { status: 400 })
		case 'unsupported':
		case 'failed':
			// The parsers speak English other code matches on; the page says
			// it in Norwegian.
			return data(
				{ error: uploadFailureLabel(result.message) },
				{ status: 400 },
			)
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
		<div
			role="status"
			className="bg-card mb-6 space-y-2 rounded-4xl p-4 shadow-xs"
			data-testid="batch-summary"
		>
			<p className="text-callout tabular-nums">
				{L.summary(summary.imported, summary.duplicates, summary.failed.length)}
			</p>
			{summary.failed.length > 0 ? (
				<ul className="text-footnote text-foreground-destructive space-y-1">
					{summary.failed.map((f) => (
						<li key={f.fileName} className="break-words">
							{f.fileName}: {uploadFailureLabel(f.reason)}
						</li>
					))}
				</ul>
			) : null}
			{summary.imported > 0 ? (
				<Link to="/" className={cn(buttonVariants({ variant: 'outline' }))}>
					{L.seeThem}
				</Link>
			) : null}
		</div>
	)
}

/** The discipline choices, the closed trigger showing a word, not a value. */
const DISCIPLINE_ITEMS = [
	{ value: '', label: L.autoDetect },
	...DISCIPLINES.map((discipline) => ({
		value: discipline,
		label: NB_DISCIPLINE_LABELS[discipline],
	})),
]

export default function ImportsUploadRoute() {
	const actionData = useActionData<typeof action>()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [dragActive, setDragActive] = useState(false)
	const [chosen, setChosen] = useState<string[]>([])
	const isPending = useIsPending()

	function readChosen() {
		setChosen(
			Array.from(fileInputRef.current?.files ?? [], (file) => file.name),
		)
	}

	return (
		<main className="container mx-auto max-w-md py-6 md:py-8">
			<PageHeader
				title={L.title}
				back={{ to: '/me', label: APP_TAB_LABELS.me }}
			/>
			<p className="text-body text-muted-foreground mt-4">{L.intro}</p>

			{/* Form sits directly on the page background — no card wrap (§1.6). */}
			<div className="mt-6">
				{actionData && 'error' in actionData && actionData.error ? (
					<p
						role="alert"
						className="text-footnote text-foreground-destructive mb-4"
					>
						{actionData.error}
					</p>
				) : null}
				{actionData && 'summary' in actionData ? (
					<BatchSummary summary={actionData.summary} />
				) : null}
				<Form method="POST" encType="multipart/form-data" className="space-y-6">
					<div className="space-y-2">
						<label htmlFor="file" className="text-callout block">
							{L.files}
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
									readChosen()
								}
							}}
							className={cn(
								'bg-card duration-press space-y-3 rounded-3xl border-2 border-dashed p-4 transition-colors ease-out',
								dragActive ? 'border-primary bg-primary/5' : 'border-border',
							)}
						>
							{/*
							 * The native input stays (it is what posts, and what a drop
							 * fills), visually hidden; the system's button opens it, so the
							 * page never shows the browser's own English "Choose Files".
							 */}
							<input
								ref={fileInputRef}
								id="file"
								name="file"
								type="file"
								multiple
								accept=".fit,.fit.gz,.tcx,.gpx,.zip,.gz"
								onChange={readChosen}
								className="peer sr-only"
							/>
							<div className="flex flex-wrap items-center gap-3">
								<label
									htmlFor="file"
									className={cn(
										buttonVariants({ variant: 'secondary' }),
										'peer-focus-visible:ring-ring/30 cursor-pointer peer-focus-visible:ring-3',
									)}
								>
									{L.choose}
								</label>
								<span
									className="text-footnote text-muted-foreground min-w-0 break-words"
									aria-live="polite"
								>
									{chosen.length > 0
										? L.chosen(chosen.length, chosen[0]!)
										: L.none}
								</span>
							</div>
							<p className="text-footnote text-muted-foreground">
								{L.filesHint}. {L.drop}{' '}
								<a
									href="https://support.strava.com/hc/en-us/articles/216918437-Exporting-your-Data-and-Bulk-Export"
									target="_blank"
									rel="noreferrer"
									className="hover:text-foreground relative underline after:absolute after:-inset-x-1 after:-inset-y-3"
								>
									{L.stravaExport}
								</a>
							</p>
						</div>
					</div>

					<div className="space-y-2">
						<label htmlFor="disciplineOverride" className="text-callout block">
							{L.discipline}
						</label>
						<Select
							name="disciplineOverride"
							defaultValue=""
							items={DISCIPLINE_ITEMS}
						>
							<SelectTrigger id="disciplineOverride" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{DISCIPLINE_ITEMS.map((item) => (
									<SelectItem key={item.value} value={item.value}>
										{item.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-footnote text-muted-foreground">
							{L.disciplineHint}
						</p>
					</div>

					<Button
						type="submit"
						className="text-callout w-full"
						disabled={isPending}
					>
						{isPending ? L.submitting : L.submit}
					</Button>
				</Form>
			</div>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
