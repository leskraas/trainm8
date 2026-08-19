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
import { formatKg } from '#app/utils/strength/program.constants.ts'
import {
	type ProgramOverview,
	endProgram,
	getProgramOverview,
	openNextProgramSession,
	setWorkingWeight,
} from '#app/utils/strength-program.server.ts'
import { type Route } from './+types/programs.run.$instanceId.ts'

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
	{ title: `${loaderData?.program.name ?? 'Program'} | Trainm8` },
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
	const weightKg = Number(typed.trim())
	if (!Number.isFinite(weightKg) || weightKg <= 0) {
		return 'A working weight has to be a positive number of kilos.'
	}
	if (weightKg > MAX_WORKING_WEIGHT_KG) {
		return `A working weight has to be ${MAX_WORKING_WEIGHT_KG} kg or less — above that it is a typo, not a lift.`
	}
	return null
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
			{ ok: false, error: 'That did not make sense.' },
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
				{ ok: false, error: 'That program run is gone.' },
				404,
			)
		}
		return redirect(`/training/sessions/${opened.sessionId}/log`)
	}

	if (input.intent === 'end-program') {
		const ended = await endProgram(userId, params.instanceId)
		if (!ended) {
			return data<OverviewActionResult>(
				{ ok: false, error: 'That program run is gone.' },
				404,
			)
		}
		return data<OverviewActionResult>({
			ok: true,
			message: 'The program is stopped. Every set you logged under it stays.',
		})
	}

	const refusal = workingWeightRefusal(input.weightKg)
	if (refusal) {
		return data<OverviewActionResult>({ ok: false, error: refusal }, 400)
	}
	const weightKg = Number(input.weightKg.trim())

	const updated = await setWorkingWeight({
		userId,
		instanceId: params.instanceId,
		exerciseId: input.exerciseId,
		equipment: input.equipment ? input.equipment : null,
		weightKg,
	})
	return updated
		? data<OverviewActionResult>({ ok: true, message: 'Working weight set.' })
		: data<OverviewActionResult>(
				{ ok: false, error: 'That lift is gone.' },
				404,
			)
}

/** The three **Stall Responses**, in the athlete's words. */
const STALL_RESPONSE_LABELS: Record<string, string> = {
	stallCut: 'Stall Cut',
	weightRollback: 'Weight Rollback',
	anchorReEstimate: 'Anchor Re-estimate',
}

/** **One weight, rendered the same way everywhere** — the shared house rule,
 * imported rather than restated. This screen used to say `20.3 kg` about a
 * prescription the grid one tap away called `20.25 kg`. */
function kg(value: number): string {
	return `${formatKg(value)} kg`
}

export default function ProgramRunRoute({ loaderData }: Route.ComponentProps) {
	const overview = loaderData
	const fetcher = useFetcher<typeof action>()

	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={overview.program.name}
				back={{ to: '/training/programs', label: 'programs' }}
				className="mb-2"
			/>
			<p className="text-body-sm text-muted-foreground mb-6">
				{overview.status === 'active'
					? 'Running. The next weight comes from your last log, not the calendar.'
					: `This run is ${overview.status}.`}
			</p>

			<StallNotices overview={overview} />

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>
						{overview.today.dayId
							? `Today: Workout ${overview.today.dayId}`
							: 'Today'}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<ul className="text-body-sm space-y-1">
						{overview.today.lifts.map((lift) => {
							const first = lift.sets[0]
							const name = overview.liftNames[lift.exerciseId] ?? 'Lift'
							return (
								<li key={`${lift.exerciseId}-${lift.equipment ?? ''}`}>
									<span className="font-medium">{name}</span> {lift.sets.length}
									×{first?.reps ?? 0}{' '}
									{first?.weight.kind === 'resolved' ? (
										<>@ {kg(first.weight.kg)}</>
									) : (
										<span className="text-muted-foreground">
											— no weight yet ({first?.weight.basis})
										</span>
									)}
								</li>
							)
						})}
					</ul>
					{overview.openSessionId ? (
						/* **Which number this is, said out loud.** A session that is being
						   logged is frozen at the weights it was stamped with — moving them
						   under sets already logged would be the worse failure — so this
						   line quotes the stamp and *Your weights* below quotes the live
						   working weight. Two different numbers with two different meanings,
						   and neither posing as the other. */
						<p className="text-body-xs text-muted-foreground">
							These are the weights stamped on the session you have open, which
							is what its grid is asking for.{' '}
							{overview.openSessionHasLoggedSets
								? 'Because sets are already logged against it, changing a working weight below takes effect on the next session.'
								: 'Nothing is logged against it yet, so changing a working weight below re-stamps it the next time you open it.'}
						</p>
					) : null}
					{overview.nextDayId ? (
						<p className="text-body-xs text-muted-foreground">
							Next after today: Workout {overview.nextDayId}.
						</p>
					) : null}
					{overview.status === 'active' ? (
						<fetcher.Form method="post">
							<input type="hidden" name="intent" value="open-session" />
							<Button type="submit">Open today’s session</Button>
						</fetcher.Form>
					) : null}
				</CardContent>
			</Card>

			<Card className="mb-6">
				<CardHeader>
					<CardTitle>Your weights</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
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
					<Button type="submit" variant="outline">
						Stop this program
					</Button>
					<p className="text-body-xs text-muted-foreground mt-1">
						Stopping keeps every set you logged under it.
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
		<div className="space-y-1">
			<p className="text-body-sm">
				{/* The lift's own name is the way into its history and records — this
				    screen says what you lift *next*, and "is this lift actually moving"
				    is the question it provokes. Without it that screen had no entry
				    point at all. */}
				<Link
					to={`/training/exercises/${lift.exerciseId}`}
					className="font-medium underline"
				>
					{lift.name}
				</Link>{' '}
				{kg(lift.currentWorkingWeightKg)} · {lift.incrementText}
				{lift.stallCount > 0 ? (
					<span className="text-muted-foreground">
						{' '}
						· Stall Count {lift.stallCount}
					</span>
				) : null}
			</p>
			<fetcher.Form method="post" className="flex items-center gap-2">
				<input type="hidden" name="intent" value="set-working-weight" />
				<input type="hidden" name="exerciseId" value={lift.exerciseId} />
				<input type="hidden" name="equipment" value={lift.equipment ?? ''} />
				{/* **No step.** `step="0.5"` rejected 61.25 kg in the browser, on an
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
					className="w-28"
					type="number"
					inputMode="decimal"
					step="any"
					name="weightKg"
					aria-label={`Working weight for ${lift.name} in kg`}
					aria-invalid={error ? true : undefined}
					aria-describedby={
						error ? `weight-error-${lift.exerciseId}` : undefined
					}
					defaultValue={lift.currentWorkingWeightKg}
				/>
				{/* Never "Set": beside a weight field, in a lifting app, "Set" reads as
				    the noun — the thing you do five of. The verb has to say what it does
				    to the number. */}
				<Button type="submit" variant="secondary" size="sm">
					Save weight
				</Button>
			</fetcher.Form>
			{error ? (
				<p
					id={`weight-error-${lift.exerciseId}`}
					className="text-destructive text-body-xs"
					role="alert"
				>
					{error}
				</p>
			) : null}
			{saved ? (
				<p className="text-body-xs text-muted-foreground" role="status">
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
						className="border-border bg-muted/40 rounded-md border p-3"
					>
						<p className="text-body-sm">
							<span className="font-medium">
								{label}: {lift.name} {kg(stall.fromKg)} → {kg(stall.toKg)}.
							</span>{' '}
							You missed reps on this lift often enough in a row that{' '}
							{overview.program.name} says to take the weight back down and
							build it again.
						</p>
						{overview.program.provenanceNote ? (
							<p className="text-body-xs text-muted-foreground mt-1">
								{overview.program.provenanceNote}
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
