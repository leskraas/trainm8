/**
 * **The program overview** — the one screen that answers *"what do I lift
 * today"*.
 *
 * Four things and nothing else: today's session with its loads **resolved now**,
 * what is next from the stored cursor, the working weight per lift with its
 * Stall Count where that count is non-zero, and — where one has fired — the
 * **Stall Response** said once, as a notice with its reason.
 *
 * **A Stall Cut offers nothing.** It is not a prompt, there is no button inside
 * it and it asks the athlete for no decision: an engine that silently drops the
 * squat 10 % and shows the new number is the exact failure the Load Recompute
 * Notice pattern exists to prevent, and an engine that turns the same drop into
 * an offer is the other half of it.
 */
import { Link, data, redirect, useFetcher } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { formatNbKg } from '#app/utils/format.ts'
import {
	LIBRARY_LABELS,
	NB_STALL_RESPONSE_LABELS,
	PROGRAM_RULE_LABELS,
	PROGRAM_RUN_LABELS as L,
} from '#app/utils/labels.ts'
import { parseKiloInput } from '#app/utils/strength/kilo-input.ts'
import {
	type ProgramOverview,
	endProgram,
	getProgramOverview,
	openNextProgramSession,
	setWorkingWeight,
} from '#app/utils/strength-program.server.ts'
import { type Route } from './+types/programs.run.$instanceId.ts'
import {
	incrementText,
	programProvenanceNote,
} from './__programs-list-presenter.ts'

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
	{ title: `${loaderData?.program.name ?? L.metaFallback} | Trainm8` },
]

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const overview = await getProgramOverview(userId, params.instanceId)
	if (!overview) throw new Response('Not found', { status: 404 })
	return overview
}

/** The three intents this surface posts, parsed locally over
 * `Object.fromEntries` — never through the Conform-backed authoring schema,
 * whose round trip drops `load`, `effortCap` and `tempo`. */
const OverviewSchema = z.discriminatedUnion('intent', [
	z.object({ intent: z.literal('open-session') }),
	z.object({
		intent: z.literal('set-working-weight'),
		exerciseId: z.string().min(1),
		equipment: z.string().optional(),
		// Taken as text and judged below rather than coerced here, so the two ways a
		// weight can be wrong get two different sentences. `z.coerce.number()
		// .positive()` collapses `0`, `-5` and `999999` into one parse failure, and
		// "That did not make sense." is not a thing anybody can act on.
		weightKg: z.string().min(1),
	}),
	z.object({ intent: z.literal('end-program') }),
])

/**
 * **The most a working weight may be, as a product decision and not a claim about
 * bodies.**
 *
 * `999999` used to be accepted and then rendered as a prescription, which is a
 * typo wearing a number's clothes. The bound exists to catch the typo, so it is
 * set far above anything a human has lifted — the heaviest competition lifts on
 * record sit under 600 kg, and this is a *working* weight, well under a max — and
 * it is deliberately not dressed up as physiology: nothing here knows what an
 * athlete can lift, and an app that guessed would refuse somebody's real number.
 * A round, obviously-a-limit figure is the honest shape for a sanity bound.
 */
const MAX_WORKING_WEIGHT_KG = 1000

/**
 * **Why a typed working weight is refused, in the athlete's words** — or `null`
 * when it is a weight.
 *
 * Two sentences, because there are two ways to be wrong and they need two
 * different fixes. `0` and `-5` used to come back as *"That did not make sense."*
 * and — worse — the page rendered nothing at all, so the number sat on screen
 * looking saved. The phrasing follows the anchor form
 * (`settings/training/lifts.$exerciseId.tsx`): say what the field takes, not that
 * the form is unhappy.
 */
export function workingWeightRefusal(typed: string): string | null {
	const weightKg = parseKiloInput(typed)
	if (weightKg == null || weightKg <= 0) {
		return L.errors.positive
	}
	if (weightKg > MAX_WORKING_WEIGHT_KG) {
		return L.errors.tooHigh(MAX_WORKING_WEIGHT_KG)
	}
	return null
}

/**
 * The typed working weight as kilos — `62,5` and `62.5` alike (`parseKiloInput`).
 * Read only after {@link workingWeightRefusal} has passed it, so a `null` here is
 * a refused number that slipped past, never a weight to save.
 */
export function workingWeightKg(typed: string): number | null {
	return workingWeightRefusal(typed) == null ? parseKiloInput(typed) : null
}

export type OverviewActionResult =
	| { ok: true; message: string }
	| { ok: false; error: string }

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const parsed = OverviewSchema.safeParse(Object.fromEntries(formData))
	if (!parsed.success) {
		return data<OverviewActionResult>(
			{ ok: false, error: L.errors.nonsense },
			400,
		)
	}
	const input = parsed.data

	if (input.intent === 'open-session') {
		const opened = await openNextProgramSession({
			userId,
			instanceId: params.instanceId,
		})
		if (!opened) {
			return data<OverviewActionResult>(
				{ ok: false, error: L.errors.gone },
				404,
			)
		}
		return redirect(`/training/sessions/${opened.sessionId}/log`)
	}

	if (input.intent === 'end-program') {
		const ended = await endProgram(userId, params.instanceId)
		if (!ended) {
			return data<OverviewActionResult>(
				{ ok: false, error: L.errors.gone },
				404,
			)
		}
		return data<OverviewActionResult>({
			ok: true,
			message: L.stopped,
		})
	}

	const refusal = workingWeightRefusal(input.weightKg)
	const weightKg = workingWeightKg(input.weightKg)
	if (refusal || weightKg == null) {
		return data<OverviewActionResult>(
			{
				ok: false,
				error: refusal ?? L.errors.positive,
			},
			400,
		)
	}

	const updated = await setWorkingWeight({
		userId,
		instanceId: params.instanceId,
		exerciseId: input.exerciseId,
		equipment: input.equipment ? input.equipment : null,
		weightKg,
	})
	return updated
		? data<OverviewActionResult>({ ok: true, message: L.weightSaved })
		: data<OverviewActionResult>({ ok: false, error: L.errors.liftGone }, 404)
}

/** The three **Stall Responses**, in the athlete's words. */
const STALL_RESPONSE_LABELS = NB_STALL_RESPONSE_LABELS

/** **One weight, rendered the same way everywhere** — the shared house rule,
 * imported rather than restated. This screen used to say `20.3 kg` about a
 * prescription the grid one tap away called `20.25 kg`. */
function kg(value: number): string {
	return `${formatNbKg(value)} kg`
}

export default function ProgramRunRoute({ loaderData }: Route.ComponentProps) {
	const overview = loaderData
	const fetcher = useFetcher<typeof action>()

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={overview.program.name}
				back={{ to: '/training/programs', label: LIBRARY_LABELS.programs }}
				className="mb-2"
			/>
			<p className="text-footnote text-muted-foreground mb-6">
				{overview.status === 'active'
					? L.running
					: L.notRunning(overview.status)}
			</p>

			<StallNotices overview={overview} />

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="text-heading">
						{L.today(overview.today.dayId)}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<ul className="space-y-1">
						{overview.today.lifts.map((lift) => {
							const first = lift.sets[0]
							const name = overview.liftNames[lift.exerciseId] ?? 'Løft'
							return (
								<li
									key={`${lift.exerciseId}-${lift.equipment ?? ''}`}
									className="text-callout"
								>
									{name}{' '}
									<span className="text-muted-foreground tabular-nums">
										{lift.sets.length}×{first?.reps ?? 0}
										{first?.weight.kind === 'resolved'
											? ` · ${kg(first.weight.kg)}`
											: ` · ${L.noWeightYet}`}
									</span>
								</li>
							)
						})}
					</ul>
					{overview.openSessionId ? (
						/* **Which number this is, said out loud.** A session that is being
						   logged is frozen at the weights it was stamped with — moving them
						   under sets already logged would be the worse failure — so this
						   line quotes the stamp and *Vektene dine* below quotes the live
						   working weight. Two different numbers with two different meanings,
						   and neither posing as the other. */
						<p className="text-footnote text-muted-foreground">
							{L.stamped}{' '}
							{overview.openSessionHasLoggedSets
								? L.stampedLogged
								: L.stampedOpen}
						</p>
					) : null}
					{overview.nextDayId ? (
						<p className="text-footnote text-muted-foreground">
							{L.next(overview.nextDayId)}
						</p>
					) : null}
					{overview.status === 'active' ? (
						<fetcher.Form method="post">
							<input type="hidden" name="intent" value="open-session" />
							<Button type="submit" className="rounded-full">
								{L.openToday}
							</Button>
						</fetcher.Form>
					) : null}
				</CardContent>
			</Card>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle className="text-heading">{L.yourWeights}</CardTitle>
				</CardHeader>
				<CardContent className="divide-border/60 divide-y">
					{overview.lifts.map((lift) => (
						<WorkingWeightForm
							key={`${lift.exerciseId}::${lift.equipment ?? ''}`}
							lift={lift}
						/>
					))}
				</CardContent>
			</Card>

			{overview.status === 'active' ? (
				<fetcher.Form method="post">
					<input type="hidden" name="intent" value="end-program" />
					<Button type="submit" variant="outline" className="rounded-full">
						{L.stop}
					</Button>
					<p className="text-footnote text-muted-foreground mt-1">
						{L.stopNote}
					</p>
				</fetcher.Form>
			) : null}
		</main>
	)
}

/**
 * **One lift's working weight, and whatever the server said about the last attempt
 * to change it.**
 *
 * Its own `useFetcher`, per lift, for the same reason the log grid gives every set
 * row one: an answer belongs to the field that provoked it. With one fetcher for
 * the whole screen a refusal has no home, and this screen's refusals used to have
 * none at all — a `0` or a `-5` posted, came back `400`, and the page rendered
 * nothing whatsoever, so the number stayed on screen looking saved. The shape is
 * the anchor form's (`settings/training/lifts.$exerciseId.tsx`): the sentence sits
 * under the input it is about, and it says what is wrong with the number.
 */
function WorkingWeightForm({
	lift,
}: {
	lift: ProgramOverview['lifts'][number]
}) {
	const fetcher = useFetcher<typeof action>()
	const answer = fetcher.state === 'idle' ? fetcher.data : null
	const error = answer && 'ok' in answer && !answer.ok ? answer.error : null
	const saved =
		answer && 'ok' in answer && answer.ok ? (answer.message ?? null) : null

	return (
		<div className="space-y-2 py-3 first:pt-0 last:pb-0">
			{/* Arket M's lift row: the lift, its working weight, and what the next
			    made session adds — `neste: +2,5 kg` — in Public Sans tabular
			    figures, never monospace. */}
			<p className="text-callout flex flex-wrap items-baseline gap-x-2">
				{/* The lift's own name is the way into its history and records — this
				    screen says what you lift *next*, and "is this lift actually moving"
				    is the question it provokes. Without it that screen had no entry
				    point at all. */}
				<Link
					to={`/training/exercises/${lift.exerciseId}`}
					className="underline underline-offset-2"
				>
					{lift.name}
				</Link>
				<span className="tabular-nums">{kg(lift.currentWorkingWeightKg)}</span>
				<span className="text-footnote text-muted-foreground tabular-nums">
					{PROGRAM_RULE_LABELS.next(incrementText(lift.increment))}
					{lift.stallCount > 0 ? ` · ${L.shortInARow(lift.stallCount)}` : null}
				</span>
			</p>
			<fetcher.Form method="post" className="flex items-center gap-2">
				<input type="hidden" name="intent" value="set-working-weight" />
				<input type="hidden" name="exerciseId" value={lift.exerciseId} />
				<input type="hidden" name="equipment" value={lift.equipment ?? ''} />
				{/* **Text, with a decimal keypad — never `type="number"`.** A number
				    input is read by the browser's locale: Chromium in English dropped the
				    comma from a typed `62,5` and posted `625`. A text field posts what was
				    typed, and {@link workingWeightRefusal} reads `,` and `.` alike.

				    **No step.** `step="0.5"` rejected 61.25 kg in the browser, on an
				    athlete whose gym owns 1.25 kg plates — a precision constraint the app
				    has no standing to impose, since what can be loaded is a fact about a
				    rack it may know nothing about. Loadability is said where it is known
				    (the plate line, and the engine's own rounding note), never enforced
				    here as a false rule.

				    **And no `min`, which is the same lesson twice.** `min="0"` did not
				    refuse a typed `-5` in words — it *swallowed* it: the browser blocked
				    the submit, so nothing posted, no sentence appeared and nothing saved,
				    while `0` and `999999` came back with sentences that say what to do. A
				    silent refusal is the worst shape a refusal can take, and a native
				    bubble is not this app's voice either. Every way of being wrong now
				    takes the same visible path — post, and let {@link
				    workingWeightRefusal} answer under the field. */}
				<Input
					className="w-28 tabular-nums"
					type="text"
					inputMode="decimal"
					autoComplete="off"
					name="weightKg"
					aria-label={L.weightFor(lift.name)}
					aria-invalid={error ? true : undefined}
					aria-describedby={
						error ? `weight-error-${lift.exerciseId}` : undefined
					}
					defaultValue={formatNbKg(lift.currentWorkingWeightKg)}
				/>
				{/* Never "Set": beside a weight field, in a lifting app, "Set" reads as
				    the noun — the thing you do five of. The verb has to say what it does
				    to the number. */}
				<Button type="submit" variant="secondary" className="rounded-full">
					{L.saveWeight}
				</Button>
			</fetcher.Form>
			{error ? (
				<p
					id={`weight-error-${lift.exerciseId}`}
					className="text-foreground-destructive text-footnote"
					role="alert"
				>
					{error}
				</p>
			) : null}
			{saved ? (
				<p className="text-footnote text-muted-foreground" role="status">
					{saved}
				</p>
			) : null}
		</div>
	)
}

/**
 * The **Stall Response** notices — one per lift that has had one, most recent
 * first. Each states what moved, from what to what, and why. None of them offers
 * anything: there is no control inside a notice, because the drop already
 * happened and the athlete is being told, not asked.
 */
function StallNotices({ overview }: { overview: ProgramOverview }) {
	const stalled = overview.lifts.filter((lift) => lift.lastStall != null)
	if (stalled.length === 0) return null
	return (
		<div className="mb-6 space-y-3">
			{stalled.map((lift) => {
				const stall = lift.lastStall!
				const label = STALL_RESPONSE_LABELS[stall.response] ?? stall.response
				return (
					<div
						key={`${lift.exerciseId}-${lift.equipment ?? ''}`}
						role="status"
						className="bg-muted rounded-3xl p-4"
					>
						<p className="text-callout tabular-nums">
							{label}: {lift.name} {kg(stall.fromKg)} → {kg(stall.toKg)}.
						</p>
						<p className="text-footnote text-muted-foreground mt-1">
							{L.stallNotice(overview.program.name)}
						</p>
						{programProvenanceNote(overview.program) ? (
							<p className="text-footnote text-muted-foreground mt-1">
								{programProvenanceNote(overview.program)}
							</p>
						) : null}
					</div>
				)
			})}
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
