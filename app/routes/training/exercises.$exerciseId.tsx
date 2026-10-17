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
 *
 * The screen is built to the approved mobile design
 * (`docs/design/strength-program-handoff/`, screen 07) with **one recorded
 * departure**: the capture's third record row, *Best session tonnage*, is not
 * built. ADR 0058 §3 declines tonnage and ADR 0063 records why the handoff does
 * not override it. ADR 0063 also states the chart's two rules — the Stall Cut is
 * marked by joining the program's stored stall history on `sessionId`, never by
 * reading a dip off the curve, and a lift in no program shows no working weight,
 * no marking and no note strip at all. The chart itself is `__lift-chart.tsx`,
 * ported onto the shared Chart Primitive (ADR 0029, #490).
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { LIBRARY_SECTION_HREF } from '#app/utils/app-tabs.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { APP_TAB_LABELS, EXERCISE_PAGE_LABELS as L } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type StallHistoryEntry } from '#app/utils/strength/program-engine.ts'
import { type EquipmentId, EQUIPMENT_IDS } from '#app/utils/strength-log.ts'
import { getExerciseHistoryView } from '#app/utils/strength-records.server.ts'
import { type Route } from './+types/exercises.$exerciseId.ts'
import {
	type HistoryPoint,
	type ProgramLiftContext,
	type RecordCard,
	buildExerciseHistoryViewModel,
} from './__exercise-history-presenter.ts'
import { LiftChart } from './__lift-chart.tsx'

export const handle: SEOHandle = { getSitemapEntries: () => null }

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
	{
		title: loaderData
			? L.metaTitle(loaderData.view.exercise.name)
			: L.metaFallback,
	},
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
	return {
		view,
		program: await programLiftContext(userId, params.exerciseId, equipment),
	}
}

/**
 * **What the program knows about this lift, or nothing.**
 *
 * One read of the athlete's own `ProgramLiftState`: the weight it says goes on
 * the bar next, and the Stall Cuts it has recorded. The chart's marking and the
 * note strip both come from this one row, joined on `sessionId`, so the coloured
 * bar and the sentence under it cannot tell two different stories.
 *
 * Scoped through `instance: { userId }`, so a run is readable only by its
 * athlete. Returns `null` for a lift that belongs to no active program — the
 * surface then shows no working weight, no marking and no note, because there is
 * nothing that decided a weight and a zero would claim otherwise.
 *
 * The equipment filter takes a `null` row too: a lift state with no equipment is
 * the rule saying *this lift, however you realize it* (see `schema.prisma`), and
 * excluding it would drop the marking for every athlete whose program predates a
 * stamped variant.
 */
async function programLiftContext(
	userId: string,
	exerciseId: string,
	equipment: EquipmentId | null,
): Promise<ProgramLiftContext | null> {
	const row = await prisma.programLiftState.findFirst({
		where: {
			exerciseId,
			instance: { userId, status: 'active' },
			...(equipment ? { OR: [{ equipment }, { equipment: null }] } : {}),
		},
		orderBy: { updatedAt: 'desc' },
		select: { currentWorkingWeightKg: true, stallHistory: true },
	})
	if (!row) return null
	return {
		workingWeightKg: row.currentWorkingWeightKg,
		stallCuts: parseStallHistory(row.stallHistory),
	}
}

/**
 * The stored `stallHistory` JSON as entries. **A row that does not parse marks
 * nothing** rather than throwing or half-drawing: the screen's other readings are
 * still true, and an unmarked bar is a smaller lie than a bar marked from a
 * number nobody can vouch for.
 */
function parseStallHistory(raw: string): StallHistoryEntry[] {
	try {
		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		return parsed.filter(
			(entry): entry is StallHistoryEntry =>
				typeof entry === 'object' &&
				entry !== null &&
				typeof (entry as StallHistoryEntry).sessionId === 'string' &&
				typeof (entry as StallHistoryEntry).fromKg === 'number' &&
				typeof (entry as StallHistoryEntry).toKg === 'number',
		)
	} catch {
		return []
	}
}

export default function ExerciseHistoryRoute({
	loaderData,
}: Route.ComponentProps) {
	const model = buildExerciseHistoryViewModel(
		loaderData.view,
		loaderData.program,
	)

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={model.title}
				back={{ to: LIBRARY_SECTION_HREF, label: APP_TAB_LABELS.plan }}
				className="mb-6"
			/>

			{/* The card the athlete opened the screen for: what goes on the bar, what
			    it is worth as a single, and whether the lift is moving. It is absent
			    for a lift with no history at all — an empty frame is not a reading. */}
			{model.empty ? null : (
				<section className="bg-card mb-6 rounded-4xl p-5">
					{/* **No program, no header.** A lift the program never priced has no
					    working weight, and a zero would claim one. */}
					{model.header ? (
						<div className="mb-5 flex items-start justify-between gap-4">
							<div>
								<p className="text-caption text-muted-foreground">
									{L.workingWeight}
								</p>
								<p className="text-title tabular-nums">
									{model.header.workingWeight}
								</p>
							</div>
							{model.header.estOneRm ? (
								<div className="text-right">
									<p className="text-caption text-muted-foreground">
										{L.estOneRm}
									</p>
									<p className="text-callout text-primary font-semibold tabular-nums">
										{model.header.estOneRm}
									</p>
									{/* The estimate never floats free: the set it was read off
									    sits under it. */}
									{model.header.estOneRmSource ? (
										<p className="text-caption text-muted-foreground tabular-nums">
											{model.header.estOneRmSource}
										</p>
									) : null}
								</div>
							) : null}
						</div>
					) : null}

					<LiftChart
						bars={model.chart}
						label={model.chartLabel}
						table={model.chartTable}
					/>

					{/* One strip per marked bar, generated from the same record the
					    colour is — the sentence and the bar cannot disagree. */}
					{model.stallNotes.map((note) => (
						<p
							key={note}
							className="bg-muted text-footnote mt-3 flex items-center gap-2 rounded-2xl px-3 py-3 tabular-nums"
						>
							<span
								aria-hidden="true"
								className="bg-destructive size-2 shrink-0 rounded-full"
							/>
							{note}
						</p>
					))}
				</section>
			)}

			<p className="text-callout mb-1">{model.lastTime}</p>
			{model.lastTimeText ? (
				<p className="text-footnote text-muted-foreground mb-6 tabular-nums">
					{L.topSet(model.lastTimeText)}
				</p>
			) : (
				<p className="text-footnote text-muted-foreground mb-6">{L.fillsIn}</p>
			)}

			{/* The way to this lift's **anchors**, and the only one in the app: the
			    per-lift `% 1RM` / `8RM` reference had no entry point, so an athlete
			    could neither state one nor accept the proposal read off a set on
			    this very page. It sits here, above the records, because a record is
			    the evidence an anchor is argued from — and it is shown even with no
			    history, since stating a number about yourself never needed one. */}
			<Link
				to={`/settings/training/lifts/${loaderData.view.exercise.id}`}
				className="text-footnote mb-6 inline-flex min-h-11 items-center underline underline-offset-2"
			>
				{L.yourNumbers}
			</Link>

			{model.variantTabs.length > 1 ? (
				<nav aria-label={L.variants} className="mb-6 flex flex-wrap gap-2">
					{model.variantTabs.map((tab) => (
						<Link
							key={tab.equipment ?? 'all'}
							to={
								tab.equipment
									? `?equipment=${tab.equipment}`
									: `/training/exercises/${loaderData.view.exercise.id}`
							}
							aria-current={tab.current ? 'page' : undefined}
							// A pill drawn at 32px that a thumb reaches at 44: the hit area
							// grows past the border through `after:` (ADR 0028 pillar 2).
							className={cn(
								'text-footnote pressable relative inline-flex h-8 items-center gap-1 rounded-full px-3 after:absolute after:inset-x-0 after:-inset-y-1.5',
								tab.current
									? 'bg-foreground text-background'
									: 'border-border border',
							)}
						>
							{tab.label}
							{tab.sessionCount != null ? (
								<span className="tabular-nums opacity-70">
									{' '}
									· {tab.sessionCount}
								</span>
							) : null}
						</Link>
					))}
				</nav>
			) : null}

			{model.empty ? (
				<p className="border-border/70 bg-muted/40 text-footnote rounded-4xl border p-4">
					{L.empty}
				</p>
			) : (
				<>
					<section aria-labelledby="records" className="mb-8">
						<h2 id="records" className="text-heading mb-3">
							{L.records}
						</h2>
						{model.records.length === 0 ? (
							<p className="text-footnote text-muted-foreground">
								{L.noRecords}
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
							<p className="text-footnote text-muted-foreground mt-2">
								{model.recordsRefused}
							</p>
						) : null}
						{/* A missing estimated 1RM says why it is missing. The same set may
						    not be estimated from on one screen and refused on another, so
						    the sentence here is the estimator's own — the one the propose
						    surface shows. */}
						{model.oneRmUnavailable ? (
							<p className="text-footnote text-muted-foreground mt-2">
								{L.noOneRm(model.oneRmUnavailable)}
							</p>
						) : null}
						{model.estimatorNote ? (
							<p className="text-footnote text-muted-foreground mt-2">
								{model.estimatorNote}
							</p>
						) : null}
					</section>

					<section aria-labelledby="history">
						<h2 id="history" className="text-heading mb-3">
							{L.history}
						</h2>
						{/* The one phrase a kilo-less lift gets, said once and in place. It
						    never becomes a zero to keep the bars continuous. */}
						{model.noKilosNote ? (
							<p className="text-footnote text-muted-foreground mb-3">
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
		<div className="bg-card rounded-3xl px-4 py-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className="text-callout min-w-0">{record.headline}</span>
				<span className="text-callout font-semibold whitespace-nowrap tabular-nums">
					{record.value}
				</span>
			</div>
			<div className="mt-1 flex flex-wrap items-center gap-2">
				{record.gain ? <Badge variant="secondary">{record.gain}</Badge> : null}
				<span className="text-footnote text-muted-foreground tabular-nums">
					{record.achievedLabel}
				</span>
				{/* The set an estimate was read off, beside the estimate. */}
				{record.source ? (
					<span className="text-footnote text-muted-foreground tabular-nums">
						{record.source}
					</span>
				) : null}
				{/* The equation sits **on** the estimate, never in a footnote. */}
				{record.estimator ? (
					<span className="text-footnote text-muted-foreground">
						{L.equation(record.estimator)}
					</span>
				) : null}
			</div>
			{record.note ? (
				<p className="text-footnote text-muted-foreground mt-1">
					{record.note}
				</p>
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
		<div className="bg-card rounded-3xl px-4 py-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className="text-callout tabular-nums">{point.dateLabel}</span>
				<span className="text-callout min-w-0 tabular-nums">{point.text}</span>
			</div>
			{point.barFraction != null ? (
				<div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
					<div
						className="bg-foreground/70 h-full"
						style={{ width: `${Math.round(point.barFraction * 100)}%` }}
					/>
				</div>
			) : null}
			<p className="text-footnote text-muted-foreground mt-1 tabular-nums">
				{L.workingSets(point.workingSetCount)}
			</p>
		</div>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				404: () => <p>{L.notFound}</p>,
			}}
		/>
	)
}
