/**
 * **The moderation gate** (#452, ADR 0052) — the queue without which the publish
 * flow was not allowed to merge.
 *
 * Two acts, and the asymmetry between them is the design:
 *
 * - **Take down.** Permanent. The session goes back to `private`, its **Catalogue
 *   Entry** retires, the **Attribution** records the removal and its reason, and
 *   every open report on that row closes as `taken-down`. The row is never
 *   deleted — that would take the author's own session out of their training
 *   history and strand every fork's back-pointer.
 * - **Dismiss.** Closes one report. The session stays published for everyone else
 *   and stays hidden from the athlete who reported it, because that half was never
 *   the moderator's to overturn.
 *
 * Guarded by the `admin` role, the same way `/admin/cache` is. Reporting is open
 * to every athlete; acting on a report is not — that split is what makes it safe
 * to let anybody report.
 */
import { Form, Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import {
	dismissReport,
	listOpenReports,
	takeDownWorkout,
} from '#app/utils/community.server.ts'
import {
	REPORT_REASON_LABELS,
	formatAttribution,
	readAttribution,
	type ReportReason,
} from '#app/utils/community.ts'
import { formatDate } from '#app/utils/format.ts'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { type Route } from './+types/moderation.ts'

export const meta: Route.MetaFunction = () => [
	{ title: 'Moderation | Trainm8' },
]

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	const reports = await listOpenReports()

	return {
		reports: reports.map((report) => ({
			id: report.id,
			reason: report.reason,
			detail: report.detail,
			createdAt: report.createdAt,
			reporter: report.reporter?.name ?? report.reporter?.username ?? null,
			workout: {
				id: report.workout.id,
				title: report.workout.title,
				description: report.workout.description,
				discipline: report.workout.discipline,
				visibility: report.workout.visibility,
				attribution: readAttribution(report.workout.attribution),
			},
		})),
	}
}

export async function action({ request }: Route.ActionArgs) {
	const moderatorId = await requireUserWithRole(request, 'admin')
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'dismiss') {
		await dismissReport(moderatorId, String(formData.get('reportId')))
		return { ok: true }
	}

	if (intent === 'take-down') {
		const reason = String(formData.get('reason') ?? '').trim()
		await takeDownWorkout({
			moderatorId,
			workoutId: String(formData.get('workoutId')),
			// The author is shown this sentence verbatim, so a takedown with nothing
			// written falls back to the report's own category rather than to silence.
			reason:
				reason ||
				REPORT_REASON_LABELS[
					String(formData.get('reportReason')) as ReportReason
				] ||
				'Removed after a report',
		})
		return { ok: true }
	}

	return { ok: false }
}

export default function ModerationRoute({ loaderData }: Route.ComponentProps) {
	const { reports } = loaderData
	const timeZone = useAthleteTimezone()

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="Moderation"
				back={{ to: '/', label: 'Home' }}
				className="mb-2"
			/>
			<p className="text-muted-foreground mb-6 text-sm">
				Open reports on published sessions, oldest first.
			</p>

			{reports.length === 0 ? (
				<p className="text-muted-foreground text-sm" data-empty-queue>
					No open reports.
				</p>
			) : (
				<ul className="space-y-4">
					{reports.map((report) => (
						<li key={report.id}>
							<Card>
								<CardHeader className="flex flex-wrap items-start justify-between gap-2">
									<div className="min-w-0 space-y-1">
										<CardTitle className="text-base font-bold tracking-tight">
											{report.workout.title}
										</CardTitle>
										<p className="text-body-xs text-muted-foreground">
											{getDisciplineLabel(report.workout.discipline)}
											{report.workout.attribution
												? ` · ${formatAttribution(report.workout.attribution)}`
												: ''}
										</p>
									</div>
									<Badge variant="destructive" className="shrink-0">
										{REPORT_REASON_LABELS[report.reason as ReportReason] ??
											report.reason}
									</Badge>
								</CardHeader>
								<CardContent className="space-y-4">
									{report.workout.description ? (
										<p className="text-body-sm text-muted-foreground">
											{report.workout.description}
										</p>
									) : null}
									<p className="text-body-xs text-muted-foreground">
										Reported by {report.reporter ?? 'a deleted account'} on{' '}
										{formatDate(report.createdAt, timeZone)}
									</p>
									{report.detail ? (
										<p className="text-body-sm rounded-xl border p-3">
											{report.detail}
										</p>
									) : null}

									<Form method="POST" className="space-y-2">
										<input type="hidden" name="intent" value="take-down" />
										<input
											type="hidden"
											name="workoutId"
											value={report.workout.id}
										/>
										<input
											type="hidden"
											name="reportReason"
											value={report.reason}
										/>
										<label
											className="text-body-xs text-muted-foreground block"
											htmlFor={`reason-${report.id}`}
										>
											Reason shown to the author
										</label>
										<Textarea
											id={`reason-${report.id}`}
											name="reason"
											rows={2}
											placeholder={
												REPORT_REASON_LABELS[report.reason as ReportReason]
											}
										/>
										<Button type="submit" variant="destructive" size="sm">
											Take down
										</Button>
									</Form>

									<Form method="POST">
										<input type="hidden" name="intent" value="dismiss" />
										<input type="hidden" name="reportId" value={report.id} />
										<Button type="submit" variant="outline" size="sm">
											Dismiss report
										</Button>
									</Form>
								</CardContent>
							</Card>
						</li>
					))}
				</ul>
			)}

			<p className="text-muted-foreground mt-8 text-sm">
				<Link to="/training/catalogue" className="underline">
					The Catalogue
				</Link>
			</p>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
