/**
 * The manual planning surface: the season the athlete authored, and where they
 * reshape it.
 *
 * Two readings of one object (spec #399 story 67) — **Blocks** shapes the season
 * and **Weeks** audits it — selected by a `?tab=` search param rather than nested
 * routes — the same URL-state rule the **Discipline Query** follows — because they
 * are two views and not two pages.
 *
 * **Blocks is the write surface for the phase structure (#402).** Every edit is
 * one action on one phase — add, rename, resize, move, remove — and never a
 * whole-season save, so an athlete who mistypes one week count does not re-submit
 * their season to fix it. The phases stay contiguous because a phase stores a
 * position and a week count and no dates at all (ADR 0044 §3), and the **Plan
 * Start Week** never moves because it is authored on the Outline rather than
 * counted back from the Event.
 *
 * Every number here is **derived** on read from the **Season Anchor** and the
 * phases (ADR 0040 §1) — nothing on this page is stored per week, so every target
 * and every week role is recomputed by the next read after a structural edit and
 * none of them can go stale. Where a track's rule cannot price a week the surface
 * says **Unavailable** with its reason, and never a fabricated figure.
 */
import { useState } from 'react'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Field } from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogPopup,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Checkbox } from '#app/components/ui/checkbox.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { dayBoundsUTC } from '#app/utils/athlete-calendar.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatDate, formatWeeklyVolume } from '#app/utils/format.ts'
import {
	DISCIPLINE_LABELS,
	RHYTHM_LABELS,
	VOLUME_CURRENCY_UNITS,
	WEEK_ROLE_LABELS,
} from '#app/utils/labels.ts'
import {
	addPhase,
	deletePlanOutline,
	movePhase,
	removePhase,
	renamePhase,
	resizePhase,
	setPhaseRhythm,
	type PhaseEditRefusal,
} from '#app/utils/plan-outline/authoring.server.ts'
import {
	phaseWeekRoles,
	RHYTHMS,
	type Rhythm,
} from '#app/utils/plan-outline/derive.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	getActiveSeason,
	getSeasonForEvent,
} from '#app/utils/training.server.ts'
import { type Route } from './+types/plan.ts'

export const meta: Route.MetaFunction = () => [{ title: 'Plan | Trainm8' }]

const TABS = ['blocks', 'weeks'] as const
type Tab = (typeof TABS)[number]

/**
 * The two readings' own names. Not a domain enum — **Block** is a UI word only
 * (CONTEXT.md, Plan Outline phase) and these label a view, so they live beside
 * the view rather than in `labels.ts`.
 */
const TAB_LABELS: Record<Tab, string> = { blocks: 'Blocks', weeks: 'Weeks' }

function tabFrom(request: Request): Tab {
	const raw = new URL(request.url).searchParams.get('tab')
	return TABS.includes(raw as Tab) ? (raw as Tab) : 'blocks'
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	// `?event=` addresses one Event's season — the plan just authored, or the one
	// an Event linked to. Without it the surface shows the active plan: the nearest
	// upcoming outlined Event (ADR 0018), which is the plan the athlete is living
	// in but not necessarily the one they just asked for.
	const eventId = new URL(request.url).searchParams.get('event')
	const season = eventId
		? await getSeasonForEvent(userId, eventId)
		: await getActiveSeason(userId)
	// An Event with no plan of its own falls back to the active plan rather than
	// dead-ending; with no plan at all, the flow's first question is the honest
	// destination — not a hollow page.
	if (!season) throw redirect(eventId ? '/training/plan' : '/training/plan/new')

	return {
		eventQuery: eventId,
		tab: tabFrom(request),
		season: {
			...season,
			/**
			 * Each week's Monday as the instant of local midnight, so the display layer
			 * formats the calendar day the athlete's week actually opens on.
			 */
			weeks: season.weeks.map((week) => ({
				...week,
				startsAt: dayBoundsUTC(week.weekKey, season.timezone).start,
			})),
			phases: season.phases.map((phase) => ({
				...phase,
				startsAt: dayBoundsUTC(phase.fromWeekKey, season.timezone).start,
			})),
		},
	}
}

/**
 * What the phase forms submit, per field.
 *
 * A form body is strings, and these coerce them into the shapes the authoring
 * schemas take. The service re-parses everything it is handed, so no write reaches
 * the database without passing the same rules twice; what these add is *wording* —
 * an athlete who clears the weeks box reads a sentence rather than "expected
 * number, received nan".
 */
const WeeksField = z.preprocess(
	// A cleared box arrives as `''`, and `Number('')` is 0 — which would read back as
	// "a phase runs at least one week" when what happened is that nothing was typed.
	(value) =>
		typeof value === 'string' && value.trim() === '' ? undefined : value,
	z.coerce
		.number({ errorMap: () => ({ message: 'How many weeks is this phase?' }) })
		.int('A phase runs in whole weeks')
		.min(1, 'A phase runs at least one week')
		.max(52, 'A phase runs at most 52 weeks'),
)
const NameField = z
	.string({ errorMap: () => ({ message: 'Name the phase' }) })
	.trim()
	.min(1, 'Name the phase')
	.max(60, 'A phase name is at most 60 characters')
const AtIndexField = z.coerce.number().int().min(0).catch(0)
const RhythmField = z.enum(RHYTHMS).catch('3:1')
const IdField = z.string().min(1)

/** A checkbox that is absent from the body when unchecked, as HTML has it. */
function checked(formData: FormData, name: string): boolean {
	return formData.get(name) === 'on'
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	const phaseId = IdField.safeParse(formData.get('phaseId'))
	const outlineId = IdField.safeParse(formData.get('outlineId'))

	switch (intent) {
		case 'add-phase': {
			const name = NameField.safeParse(formData.get('name'))
			const weeks = WeeksField.safeParse(formData.get('weeks'))
			if (!outlineId.success)
				return refuse('That plan is not available to edit.')
			if (!name.success) return refuse(firstIssue(name.error))
			if (!weeks.success) return refuse(firstIssue(weeks.error))
			return report(
				await addPhase(userId, {
					outlineId: outlineId.data,
					atIndex: AtIndexField.parse(formData.get('atIndex')),
					name: name.data,
					weeks: weeks.data,
					rhythm: RhythmField.parse(formData.get('rhythm')),
					tapers: checked(formData, 'tapers'),
				}),
			)
		}
		case 'rename-phase': {
			const name = NameField.safeParse(formData.get('name'))
			if (!phaseId.success) return refuse(PHASE_GONE)
			if (!name.success) return refuse(firstIssue(name.error))
			return report(
				await renamePhase(userId, { phaseId: phaseId.data, name: name.data }),
			)
		}
		case 'resize-phase': {
			const weeks = WeeksField.safeParse(formData.get('weeks'))
			if (!phaseId.success) return refuse(PHASE_GONE)
			if (!weeks.success) return refuse(firstIssue(weeks.error))
			return report(
				await resizePhase(userId, { phaseId: phaseId.data, weeks: weeks.data }),
			)
		}
		case 'set-phase-rhythm': {
			if (!phaseId.success) return refuse(PHASE_GONE)
			return report(
				await setPhaseRhythm(userId, {
					phaseId: phaseId.data,
					rhythm: RhythmField.parse(formData.get('rhythm')),
					tapers: checked(formData, 'tapers'),
				}),
			)
		}
		case 'move-phase': {
			if (!phaseId.success) return refuse(PHASE_GONE)
			return report(
				await movePhase(userId, {
					phaseId: phaseId.data,
					direction:
						formData.get('direction') === 'later' ? 'later' : 'earlier',
				}),
			)
		}
		case 'remove-phase': {
			if (!phaseId.success) return refuse(PHASE_GONE)
			return report(await removePhase(userId, { phaseId: phaseId.data }))
		}
		case 'delete-plan': {
			if (!outlineId.success)
				return refuse('That plan is not available to edit.')
			const deleted = await deletePlanOutline(userId, {
				outlineId: outlineId.data,
			})
			if (!deleted.ok) return report(deleted)
			// Home, not back here: this athlete may have no plan left to render, and the
			// Plan card is where the absence reads honestly.
			return redirectWithToast('/', {
				type: 'success',
				title: 'Plan deleted',
				description: 'Your event and your trained sessions are untouched.',
			})
		}
	}

	return refuse('That is not something this page can do.')
}

const PHASE_GONE = 'That phase is no longer part of this plan.'

/** A refusal the athlete reads, at the top of the reading that produced it. */
function refuse(error: string) {
	return data({ error }, { status: 400 })
}

function firstIssue(error: z.ZodError): string {
	return error.issues[0]?.message ?? 'That is not a value this phase can take.'
}

/**
 * One service result, worded. Every refusal is a state the athlete can act on, so
 * each is a sentence and none is an exception; typing the map to the union makes a
 * refusal added later a compile error here rather than a silent catch-all.
 */
function report(
	result: { ok: true } | { ok: false; reason: PhaseEditRefusal },
) {
	if (result.ok) return { ok: true as const }
	return refuse(refusalMessage(result.reason))
}

function refusalMessage(reason: PhaseEditRefusal): string {
	switch (reason) {
		case 'outline-not-found':
			return 'That plan is not available to edit.'
		case 'phase-not-found':
			return PHASE_GONE
		case 'plan-too-long':
			return 'That would run your plan past two years. Shorten a phase first.'
		case 'last-phase':
			return 'A plan keeps at least one phase. Delete the plan itself if that is what you want.'
		case 'at-the-edge':
			return 'That phase is already at the end of your season.'
	}
}

export default function PlanRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { season, tab, eventQuery } = loaderData
	const error =
		actionData && 'error' in actionData ? actionData.error : undefined
	const timezone = season.timezone
	const totalWeeks = season.weeks.length

	// The tab is URL state, and it must not drop the season the athlete is looking
	// at: both params travel together, with the default tab kept out of the URL.
	function readingHref(name: Tab): string {
		const params = new URLSearchParams()
		if (eventQuery) params.set('event', eventQuery)
		if (name !== 'blocks') params.set('tab', name)
		const search = params.toString()
		return search ? `/training/plan?${search}` : '/training/plan'
	}

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title="Season plan"
				back={{ to: '/', label: 'Home' }}
				className="mb-4"
			/>

			<div className="mb-8 space-y-3">
				<div className="space-y-1">
					<p className="font-medium">
						<Link
							to={`/training/events/${season.eventId}`}
							className="hover:underline"
						>
							{season.eventName}
						</Link>
					</p>
					{/* The Event's date is a calendar day anchor, formatted in UTC like
					    every other Event date in the app (ADR 0023). */}
					<p className="text-muted-foreground text-sm">
						{formatDate(season.eventDate, 'UTC')} ·{' '}
						{totalWeeks === 1 ? '1 week' : `${totalWeeks} weeks`} from{' '}
						{formatDate(season.phases[0]!.startsAt, timezone)}
					</p>
				</div>
				<p className="text-sm">{fitSentence(season.fit)}</p>
				<ul className="space-y-1">
					{season.tracks.map((track) => (
						<li key={track.discipline} className="text-sm">
							<span className="font-medium">
								{DISCIPLINE_LABELS[track.discipline]}
							</span>{' '}
							<span className="text-muted-foreground">
								· authored in {VOLUME_CURRENCY_UNITS[track.currency]} · starts
								at {formatWeeklyVolume(track.anchors[0]!.value, track.currency)}
							</span>
						</li>
					))}
				</ul>
			</div>

			<nav aria-label="Season views" className="mb-4 flex gap-2">
				{TABS.map((name) => (
					<Link
						key={name}
						to={readingHref(name)}
						aria-current={tab === name ? 'page' : undefined}
						className={buttonVariants({
							variant: tab === name ? 'default' : 'outline',
							size: 'sm',
						})}
					>
						{TAB_LABELS[name]}
					</Link>
				))}
			</nav>

			{tab === 'blocks' ? (
				<BlocksReading season={season} error={error} />
			) : (
				<WeeksReading season={season} />
			)}
		</main>
	)
}

type SeasonData = Route.ComponentProps['loaderData']['season']

/**
 * The Blocks reading: the phases in authored order, each editable in place.
 *
 * One card per phase and one action per control — rename, resize, rhythm, move,
 * remove — because the athlete's mistake is usually one field of one phase, and a
 * whole-season save makes them re-submit everything to fix it. Nothing on this
 * reading is a volume quantity: a phase says *when* and *why* (ADR 0041), so the
 * deepest cut a rhythm implies belongs to the track segment and is not authored
 * here.
 */
function BlocksReading({
	season,
	error,
}: {
	season: SeasonData
	error?: string
}) {
	return (
		<div className="space-y-8">
			{error ? (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			) : null}

			<ol aria-label="Phases" className="space-y-3">
				{season.phases.map((phase, position) => (
					// Keyed by the phase's own id: position orders the season and identity
					// edits it, and an index key would carry a card's local state onto its
					// neighbour the moment two phases swap places.
					<li key={phase.id}>
						<PhaseCard
							phase={phase}
							position={position}
							phaseCount={season.phases.length}
							// Compared by *position*, so a season with two phases named "Base"
							// lights up one of them rather than both (ADR 0044 §2).
							isCurrent={position === season.currentPhaseIndex}
							timezone={season.timezone}
						/>
					</li>
				))}
			</ol>

			<AddPhaseForm season={season} />
			<DeletePlanSection season={season} />
		</div>
	)
}

/**
 * One phase, read and edited.
 *
 * The week count, the rhythm and the taper flag are held in local state so the
 * recovery weeks below them redraw as the athlete chooses — the rhythm's
 * consequence is visible *before* it is saved, rather than discovered on the Weeks
 * reading afterwards. Each control still submits on its own.
 */
function PhaseCard({
	phase,
	position,
	phaseCount,
	isCurrent,
	timezone,
}: {
	phase: SeasonData['phases'][number]
	position: number
	phaseCount: number
	isCurrent: boolean
	timezone: string
}) {
	const [weeks, setWeeks] = useState(String(phase.weeks))
	const [rhythm, setRhythm] = useState<Rhythm>(phase.rhythm)
	const [tapers, setTapers] = useState(phase.tapers)

	return (
		<Card>
			<CardHeader className="gap-1">
				<CardTitle className="flex flex-wrap items-center gap-2 text-base">
					{phase.name}
					{isCurrent ? <Badge>Current</Badge> : null}
					{phase.tapers ? <Badge variant="secondary">Tapers</Badge> : null}
				</CardTitle>
				<p className="text-muted-foreground text-sm">
					{phase.fromWeekInPlan === phase.toWeekInPlan
						? `Week ${phase.fromWeekInPlan}`
						: `Weeks ${phase.fromWeekInPlan}–${phase.toWeekInPlan}`}{' '}
					· from {formatDate(phase.startsAt, timezone)}
				</p>
			</CardHeader>
			<CardContent className="space-y-6">
				<Form method="POST" className="flex items-end gap-2">
					<input type="hidden" name="intent" value="rename-phase" />
					<input type="hidden" name="phaseId" value={phase.id} />
					<Field
						className="flex-1"
						labelProps={{ children: 'Name' }}
						inputProps={{
							id: `name-${phase.id}`,
							name: 'name',
							type: 'text',
							defaultValue: phase.name,
							maxLength: 60,
							// Free text, and no vocabulary: "Off-season" and "Return to run"
							// store exactly as well as "Base" (ADR 0044 §2).
							required: true,
						}}
					/>
					<Button type="submit" variant="outline">
						Rename
					</Button>
				</Form>

				<Form method="POST" className="flex items-end gap-2">
					<input type="hidden" name="intent" value="resize-phase" />
					<input type="hidden" name="phaseId" value={phase.id} />
					<Field
						className="w-28"
						labelProps={{ children: 'Weeks' }}
						inputProps={{
							id: `weeks-${phase.id}`,
							name: 'weeks',
							type: 'number',
							min: 1,
							max: 52,
							inputMode: 'numeric',
							value: weeks,
							onChange: (event) => setWeeks(event.currentTarget.value),
						}}
					/>
					<Button type="submit" variant="outline">
						Save weeks
					</Button>
				</Form>

				<Form method="POST" className="space-y-4">
					<input type="hidden" name="intent" value="set-phase-rhythm" />
					<input type="hidden" name="phaseId" value={phase.id} />
					<RhythmFields
						idSuffix={phase.id}
						rhythm={rhythm}
						onRhythmChange={setRhythm}
						tapers={tapers}
						onTapersChange={setTapers}
					/>
					<RecoveryPreview
						weeks={Number(weeks)}
						rhythm={rhythm}
						tapers={tapers}
					/>
					<Button type="submit" variant="outline">
						Save rhythm
					</Button>
				</Form>

				{/* One form per button: a submit carries a single name/value pair, and the
				    move needs its direction alongside its intent. */}
				<div className="flex flex-wrap gap-2">
					{(['earlier', 'later'] as const).map((direction) => (
						<Form method="POST" key={direction}>
							<input type="hidden" name="intent" value="move-phase" />
							<input type="hidden" name="phaseId" value={phase.id} />
							<input type="hidden" name="direction" value={direction} />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								// The first phase has nothing earlier and the last nothing later.
								disabled={
									direction === 'earlier'
										? position === 0
										: position === phaseCount - 1
								}
							>
								Move {direction}
							</Button>
						</Form>
					))}
					<Form method="POST">
						<input type="hidden" name="intent" value="remove-phase" />
						<input type="hidden" name="phaseId" value={phase.id} />
						<Button
							type="submit"
							variant="ghost"
							size="sm"
							// A plan keeps at least one phase; the service refuses it too, and
							// says so, for a page rendered before a sibling was removed.
							disabled={phaseCount === 1}
						>
							Remove
						</Button>
					</Form>
				</div>
			</CardContent>
		</Card>
	)
}

/**
 * The rhythm and taper controls, shared by an existing phase and a new one.
 *
 * Both are the phase's *time* structure (ADR 0044 §4): which weeks recover, and
 * whether the phase descends toward the event. Neither carries a magnitude — how
 * deep a recovery week or a taper cuts is the **Training Track segment**'s, and a
 * phase that carried it would be a phase carrying volume.
 */
function RhythmFields({
	idSuffix,
	rhythm,
	onRhythmChange,
	tapers,
	onTapersChange,
}: {
	idSuffix: string
	rhythm: Rhythm
	onRhythmChange: (rhythm: Rhythm) => void
	tapers: boolean
	onTapersChange: (tapers: boolean) => void
}) {
	const rhythmId = `rhythm-${idSuffix}`
	const tapersId = `tapers-${idSuffix}`
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor={rhythmId}>Loading rhythm</Label>
				{/* The shared Base UI Select (ui-conventions §2.4) driven by local state
				    rather than by `SelectField`, which binds to a Conform field: the
				    recovery-week preview below reads this value as it changes, and these
				    row-scoped forms carry no Conform state. The submitted value rides in a
				    hidden input, so the body is the same either way. */}
				<Select
					value={rhythm}
					onValueChange={(value) => onRhythmChange(value as Rhythm)}
				>
					<SelectTrigger id={rhythmId} className="w-full">
						<SelectValue>
							{(value) => RHYTHM_LABELS[(value as Rhythm) ?? rhythm]}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{RHYTHMS.map((option) => (
							<SelectItem key={option} value={option}>
								{RHYTHM_LABELS[option]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<input type="hidden" name="rhythm" value={rhythm} />
			</div>
			<div className="flex items-center gap-2">
				<Checkbox
					id={tapersId}
					checked={tapers}
					onCheckedChange={(state) => onTapersChange(Boolean(state.valueOf()))}
				/>
				<Label htmlFor={tapersId}>This phase tapers</Label>
				{tapers ? <input type="hidden" name="tapers" value="on" /> : null}
			</div>
		</div>
	)
}

/**
 * Which weeks of the phase recover, drawn for the rhythm currently chosen — before
 * anything is saved.
 *
 * It reads `phaseWeekRoles`, the same function the season derivation uses, so the
 * preview cannot promise a recovery week that lands elsewhere once stored.
 */
function RecoveryPreview({
	weeks,
	rhythm,
	tapers,
}: {
	weeks: number
	rhythm: Rhythm
	tapers: boolean
}) {
	// The week count is a live form value, so it can be empty or nonsense mid-edit;
	// there is nothing honest to draw until it is a real span.
	if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) return null
	const roles = phaseWeekRoles({ weeks, rhythm, tapers })
	const recoveryWeeks = roles
		.map((role, index) => (role === 'recovery' ? index + 1 : null))
		.filter((week): week is number => week != null)

	return (
		<div className="space-y-2">
			{/* A group of marks rather than a list, so `listitem` keeps meaning "phase"
			    on this reading. Each mark says its own role out loud. */}
			<div
				role="group"
				aria-label="Week roles"
				className="flex flex-wrap gap-1"
			>
				{roles.map((role, index) => (
					<span
						key={index}
						className={
							role === 'loading'
								? 'bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs tabular-nums'
								: 'bg-primary/15 text-primary rounded-md px-2 py-1 text-xs font-medium tabular-nums'
						}
					>
						{/* The mark is a colour, so the role is also said out loud. */}
						<span className="sr-only">{`Week ${index + 1}: ${WEEK_ROLE_LABELS[role]}`}</span>
						<span aria-hidden="true">{index + 1}</span>
					</span>
				))}
			</div>
			<p className="text-muted-foreground text-sm">
				{tapers
					? 'Every week of this phase steps down toward your event, so it holds no recovery week.'
					: recoveryWeeks.length === 0
						? 'No recovery weeks in this phase.'
						: `Recovery weeks: ${recoveryWeeks.map((week) => `week ${week}`).join(', ')} of this phase. How deeply they cut is the track's, not the phase's.`}
			</p>
		</div>
	)
}

/**
 * Add a phase, at a position in the season.
 *
 * A form on the page background rather than in a card (ui-conventions §1.6). The
 * position is offered as "at the start" or "after ⟨phase⟩" because that is how a
 * season reads out loud, and because an insert is *between* phases — there is no
 * gap for a phase to land in (ADR 0044 §3).
 */
function AddPhaseForm({ season }: { season: SeasonData }) {
	const [weeks, setWeeks] = useState('4')
	const [rhythm, setRhythm] = useState<Rhythm>('3:1')
	const [tapers, setTapers] = useState(false)
	const positions = [
		{ value: '0', label: 'At the start' },
		...season.phases.map((phase, index) => ({
			value: String(index + 1),
			label: `After ${phase.name}`,
		})),
	]
	const [atIndex, setAtIndex] = useState(String(season.phases.length))

	return (
		<Form method="POST" className="space-y-4">
			<h2 className="text-lg font-semibold">Add a phase</h2>
			<input type="hidden" name="intent" value="add-phase" />
			<input type="hidden" name="outlineId" value={season.outlineId} />
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field
					labelProps={{ children: 'Name' }}
					inputProps={{
						id: 'new-phase-name',
						name: 'name',
						type: 'text',
						placeholder: 'e.g. Off-season',
						maxLength: 60,
						required: true,
					}}
				/>
				<Field
					labelProps={{ children: 'Weeks' }}
					inputProps={{
						id: 'new-phase-weeks',
						name: 'weeks',
						type: 'number',
						min: 1,
						max: 52,
						inputMode: 'numeric',
						value: weeks,
						onChange: (event) => setWeeks(event.currentTarget.value),
					}}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="new-phase-position">Where it goes</Label>
				<Select
					value={atIndex}
					onValueChange={(value) => setAtIndex(String(value))}
				>
					<SelectTrigger id="new-phase-position" className="w-full">
						<SelectValue>
							{(value) =>
								positions.find((option) => option.value === value)?.label
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{positions.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<input type="hidden" name="atIndex" value={atIndex} />
				<p className="text-muted-foreground text-sm">
					Your plan grows forward — adding a phase never moves the week your
					plan starts on.
				</p>
			</div>
			<RhythmFields
				idSuffix="new-phase"
				rhythm={rhythm}
				onRhythmChange={setRhythm}
				tapers={tapers}
				onTapersChange={setTapers}
			/>
			<RecoveryPreview weeks={Number(weeks)} rhythm={rhythm} tapers={tapers} />
			<Button type="submit">Add phase</Button>
		</Form>
	)
}

/**
 * Delete the plan, confirmed — and the confirmation says what goes and what stays.
 *
 * What goes is the **Plan Outline**: the phases, the tracks and their **Season
 * Anchors**. What stays is the **Event** and every **Workout Session** already
 * trained, because a session anchors to the Event and never to a phase. Saying both
 * halves is the point: "this cannot be undone" alone would leave an athlete
 * guessing whether their training history goes with it.
 */
function DeletePlanSection({ season }: { season: SeasonData }) {
	return (
		<section aria-labelledby="delete-plan" className="space-y-4">
			<h2 id="delete-plan" className="text-lg font-semibold">
				Delete this plan
			</h2>
			<p className="text-muted-foreground text-sm">
				Removes the season you authored. {season.eventName} stays on your
				calendar, and every session you have already trained stays exactly as it
				is.
			</p>
			<AlertDialog>
				<AlertDialogTrigger
					render={
						<Button variant="destructive" size="sm">
							Delete plan
						</Button>
					}
				/>
				<AlertDialogPopup>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this plan?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes your phases, your training tracks and your starting
							volumes. It does not touch {season.eventName} or any session you
							have already trained — your event stays on your calendar as a
							marker. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Form method="POST">
						<input type="hidden" name="intent" value="delete-plan" />
						<input type="hidden" name="outlineId" value={season.outlineId} />
						<AlertDialogFooter>
							<AlertDialogCancel type="button">Keep plan</AlertDialogCancel>
							<AlertDialogAction type="submit" variant="destructive">
								Delete plan
							</AlertDialogAction>
						</AlertDialogFooter>
					</Form>
				</AlertDialogPopup>
			</AlertDialog>
		</section>
	)
}

/**
 * The Weeks reading: every Training Week with its role and its derived target per
 * track. One column per track in **that track's** own currency — never a total
 * across them, which would need an exchange rate the app refuses to invent
 * (ADR 0043 §5).
 */
function WeeksReading({ season }: { season: SeasonData }) {
	// A track whose every week reads Unavailable gets its reason said once, rather
	// than a column of dashes the athlete has to interpret (Unavailable Metric).
	const unpricedTracks = season.tracks.filter((track) =>
		season.weeks.every(
			(week) =>
				week.targets.find((target) => target.discipline === track.discipline)
					?.value == null,
		),
	)

	return (
		<>
			<ul aria-label="Training weeks" className="divide-border divide-y">
				{season.weeks.map((week) => (
					<li
						key={week.weekKey}
						className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
					>
						<div className="text-sm">
							<span className="font-medium">Week {week.weekInPlan}</span>{' '}
							<span className="text-muted-foreground">
								· {formatDate(week.startsAt, season.timezone)} ·{' '}
								{season.phases[week.phaseIndex]?.name} ·{' '}
								{WEEK_ROLE_LABELS[week.role]}
							</span>
						</div>
						<dl className="flex flex-wrap gap-x-4 text-sm">
							{week.targets.map((target) => (
								<div key={target.discipline} className="flex gap-1.5">
									<dt className="text-muted-foreground">
										{DISCIPLINE_LABELS[target.discipline]}
									</dt>
									<dd className="font-medium tabular-nums">
										{target.value == null ? (
											<span className="text-muted-foreground font-normal">
												Unavailable
											</span>
										) : (
											formatWeeklyVolume(target.value, target.currency)
										)}
									</dd>
								</div>
							))}
						</dl>
					</li>
				))}
			</ul>
			{unpricedTracks.map((track) => (
				<p
					key={track.discipline}
					className="text-muted-foreground mt-3 text-sm"
				>
					{DISCIPLINE_LABELS[track.discipline]} weeks read Unavailable — a
					strength track&rsquo;s weekly sets are not derived yet.
				</p>
			))}
		</>
	)
}

/**
 * Where the season ends against the Event, said plainly. The plan is never
 * stretched to meet the Event: the athlete decides whether to add weeks (ADR 0044
 * §3, spec #399 story 4).
 */
function fitSentence(fit: SeasonData['fit']): string {
	const weeks = fit.kind === 'ends-on-event-week' ? 0 : fit.weeks
	const plural = weeks === 1 ? 'week' : 'weeks'
	if (fit.kind === 'ends-on-event-week') {
		return 'Your plan ends on your event’s week.'
	}
	return fit.kind === 'ends-before'
		? `Your plan ends ${weeks} ${plural} before your event’s week. Add weeks if you want it to reach the event.`
		: `Your plan runs ${weeks} ${plural} past your event’s week.`
}

export { GeneralErrorBoundary as ErrorBoundary }
