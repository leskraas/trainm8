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
		weightKg: z.coerce.number().positive(),
	}),
	z.object({ intent: z.literal('end-program') }),
])

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

	const updated = await setWorkingWeight({
		userId,
		instanceId: params.instanceId,
		exerciseId: input.exerciseId,
		equipment: input.equipment ? input.equipment : null,
		weightKg: input.weightKg,
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

function kg(value: number): string {
	return `${Number.isInteger(value) ? value : value.toFixed(1)} kg`
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
					{overview.lifts.map((lift) => {
						const field = `${lift.exerciseId}::${lift.equipment ?? ''}`
						return (
							<div key={field} className="space-y-1">
								<p className="text-body-sm">
									{/* The lift's own name is the way into its history and
									    records — this screen says what you lift *next*, and
									    "is this lift actually moving" is the question it
									    provokes. Without it that screen had no entry point at
									    all. */}
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
									<input
										type="hidden"
										name="intent"
										value="set-working-weight"
									/>
									<input
										type="hidden"
										name="exerciseId"
										value={lift.exerciseId}
									/>
									<input
										type="hidden"
										name="equipment"
										value={lift.equipment ?? ''}
									/>
									<Input
										className="w-28"
										type="number"
										inputMode="decimal"
										step="0.5"
										min="0"
										name="weightKg"
										aria-label={`Working weight for ${lift.name} in kg`}
										defaultValue={lift.currentWorkingWeightKg}
									/>
									<Button type="submit" variant="secondary" size="sm">
										Set
									</Button>
								</fetcher.Form>
							</div>
						)
					})}
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
