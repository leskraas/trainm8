/**
 * **This lift over time** — per-exercise history and the honest records
 * (ADR 0056 §6, spec slice 3).
 *
 * The question the screen answers is *"is this lift actually moving"*, so it
 * reads top-to-bottom as: what you did last time, what your records are, then
 * the session-by-session history the records were read out of.
 *
 * **Only the honest readings ship.** The heaviest working set ever, a rep-max
 * record per rep count, and an estimated 1RM whose equation is named on the
 * number. **Session tonnage and logging streaks are declined, not deferred** —
 * tonnage rewards junk volume and a streak measures app-opening, so neither is
 * here and neither is promised later.
 *
 * **Nothing on this screen is stored.** Records are derived on read (ADR 0021),
 * there is no records table and no way to author one. The mapping onto view
 * models lives in `__exercise-history-presenter.ts` and is tested there, so this
 * file is markup.
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { type EquipmentId, EQUIPMENT_IDS } from '#app/utils/strength-log.ts'
import { getExerciseHistoryView } from '#app/utils/strength-records.server.ts'
import { type Route } from './+types/exercises.$exerciseId.ts'
import {
	type HistoryPoint,
	type RecordCard,
	buildExerciseHistoryViewModel,
} from './__exercise-history-presenter.ts'

export const handle: SEOHandle = { getSitemapEntries: () => null }

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
	{ title: `${loaderData?.view.exercise.name ?? 'Exercise'} | Trainm8` },
]

function parseEquipment(value: string | null): EquipmentId | null {
	return value && (EQUIPMENT_IDS as readonly string[]).includes(value)
		? (value as EquipmentId)
		: null
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	// The variant is a query param rather than a path segment: it is a *filter* on
	// one lift's history, and every tab is the same resource read differently.
	const equipment = parseEquipment(
		new URL(request.url).searchParams.get('equipment'),
	)
	const view = await getExerciseHistoryView(userId, params.exerciseId, {
		equipment,
	})
	if (!view) throw new Response('Not found', { status: 404 })
	return { view }
}

export default function ExerciseHistoryRoute({
	loaderData,
}: Route.ComponentProps) {
	const model = buildExerciseHistoryViewModel(loaderData.view)

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={model.title}
				back={{ to: '/', label: 'Home' }}
				className="mb-6"
			/>

			<p className="text-body-md mb-1">{model.lastTime}</p>
			{model.lastTimeText ? (
				<p className="text-muted-foreground text-body-sm mb-6">
					Top set: {model.lastTimeText}
				</p>
			) : (
				<p className="text-muted-foreground text-body-sm mb-6">
					Log a working set and this page fills in.
				</p>
			)}

			{/* The way to this lift's **anchors**, and the only one in the app: the
			    per-lift `% 1RM` / `8RM` reference had no entry point, so an athlete
			    could neither state one nor accept the proposal read off a set on
			    this very page. It sits here, above the records, because a record is
			    the evidence an anchor is argued from — and it is shown even with no
			    history, since stating a number about yourself never needed one. */}
			<Link
				to={`/settings/training/lifts/${loaderData.view.exercise.id}`}
				className="text-body-sm mb-6 inline-flex min-h-11 items-center underline"
			>
				Your numbers for this lift
			</Link>

			{model.variantTabs.length > 1 ? (
				<nav aria-label="Variant" className="mb-6 flex flex-wrap gap-2">
					{model.variantTabs.map((tab) => (
						<Link
							key={tab.equipment ?? 'all'}
							to={
								tab.equipment
									? `?equipment=${tab.equipment}`
									: `/training/exercises/${loaderData.view.exercise.id}`
							}
							aria-current={tab.current ? 'page' : undefined}
							className={
								tab.current
									? 'bg-foreground text-background text-body-xs rounded-full px-3 py-1'
									: 'border-border text-body-xs rounded-full border px-3 py-1'
							}
						>
							{tab.label}
							{tab.sessionCount != null ? (
								<span className="text-body-xs opacity-70">
									{' '}
									· {tab.sessionCount}
								</span>
							) : null}
						</Link>
					))}
				</nav>
			) : null}

			{model.empty ? (
				<p className="border-border/70 bg-muted/40 text-body-sm rounded-2xl border p-4">
					No working sets logged on this lift yet, so there is nothing to read.
				</p>
			) : (
				<>
					<section aria-labelledby="records" className="mb-8">
						<h2 id="records" className="mb-3 text-lg font-semibold">
							Records
						</h2>
						{model.records.length === 0 ? (
							<p className="text-muted-foreground text-body-sm">
								Nothing here can be read as a record yet.
							</p>
						) : (
							<ul className="flex flex-col gap-2">
								{model.records.map((record) => (
									<li key={record.key}>
										<RecordRow record={record} />
									</li>
								))}
							</ul>
						)}
						{/* An assisted lift takes no record, and the reason is said rather
						    than left as an empty strip: the number is bodyweight minus the
						    assistance, so it grows as the work shrinks. The athlete's
						    assisted pull-ups are improving; the app just cannot call any of
						    them a maximum. */}
						{model.recordsRefused ? (
							<p className="text-muted-foreground text-body-xs mt-2">
								{model.recordsRefused}
							</p>
						) : null}
						{/* A missing estimated 1RM says why it is missing. The same set may
						    not be estimated from on one screen and refused on another, so
						    the sentence here is the estimator's own — the one the propose
						    surface shows. */}
						{model.oneRmUnavailable ? (
							<p className="text-muted-foreground text-body-xs mt-2">
								No estimated 1RM: {model.oneRmUnavailable}
							</p>
						) : null}
						{model.estimatorNote ? (
							<p className="text-muted-foreground text-body-xs mt-2">
								{model.estimatorNote}
							</p>
						) : null}
					</section>

					<section aria-labelledby="history">
						<h2 id="history" className="mb-3 text-lg font-semibold">
							Every session on this lift
						</h2>
						{/* The one phrase a kilo-less lift gets, said once and in place. It
						    never becomes a zero to keep the bars continuous. */}
						{model.noKilosNote ? (
							<p className="text-muted-foreground text-body-sm mb-3">
								{model.noKilosNote}
							</p>
						) : null}
						<ul className="flex flex-col gap-2">
							{model.sessions.map((point) => (
								<li key={point.sessionId}>
									<SessionRow point={point} />
								</li>
							))}
						</ul>
					</section>
				</>
			)}
		</main>
	)
}

function RecordRow({ record }: { record: RecordCard }) {
	return (
		<div className="bg-background rounded-lg px-4 py-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className="text-body-sm font-medium">{record.headline}</span>
				<span className="font-mono text-base">{record.value}</span>
			</div>
			<div className="mt-1 flex flex-wrap items-center gap-2">
				{record.gain ? <Badge variant="secondary">{record.gain}</Badge> : null}
				<span className="text-muted-foreground text-body-xs">
					{record.achievedLabel}
				</span>
				{/* The equation sits **on** the estimate, never in a footnote. */}
				{record.estimator ? (
					<span className="text-muted-foreground text-body-xs">
						{record.estimator} equation
					</span>
				) : null}
			</div>
			{record.note ? (
				<p className="text-muted-foreground text-body-xs mt-1">{record.note}</p>
			) : null}
		</div>
	)
}

/**
 * One session on the curve. The bar is scaled to the range in view, and a
 * session with no honest kilo renders **no bar at all** rather than a bar of
 * length zero — it is still listed, because level 6 → 7 is real.
 */
function SessionRow({ point }: { point: HistoryPoint }) {
	return (
		<div className="bg-background rounded-lg px-4 py-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className="text-body-sm font-medium">{point.dateLabel}</span>
				<span className="text-body-sm font-mono">{point.text}</span>
			</div>
			{point.barFraction != null ? (
				<div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
					<div
						className="bg-foreground/70 h-full"
						style={{ width: `${Math.round(point.barFraction * 100)}%` }}
					/>
				</div>
			) : null}
			<p className="text-muted-foreground text-body-xs mt-1">
				{point.workingSetCount}{' '}
				{point.workingSetCount === 1 ? 'working set' : 'working sets'}
			</p>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => <p>We could not find that exercise.</p>,
			}}
		/>
	)
}
