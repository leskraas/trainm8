/**
 * **Start a program** — one question per lift, and then never again.
 *
 * Where the program publishes its own starting weight it is pre-filled, and the
 * athlete may overtype it: StrongLifts starts the squat, bench and press at the
 * empty bar and the row and deadlift at the low end of its published 30–40 kg
 * range, so a novice needs no 1RM to begin. Where the program instead publishes
 * a *seeding instruction* — *"a weight you could lift for 10 reps"* — the field
 * says so and stays empty, because inventing a kilo there would be answering a
 * question only the athlete can answer.
 *
 * A lift left blank with no published default is simply not started. It is not
 * begun at a guessed weight.
 */
import { data, redirect, useFetcher } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getProgram, startProgram } from '#app/utils/strength-program.server.ts'
import { type Route } from './+types/programs.$programId.start.ts'

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
	{ title: `Start ${loaderData?.program.name ?? 'a program'} | Trainm8` },
]

export async function loader({ request, params }: Route.LoaderArgs) {
	await requireUserId(request)
	const program = await getProgram(params.programId)
	if (!program) throw new Response('Not found', { status: 404 })
	return { program }
}

/**
 * The posted form, parsed locally rather than through the Conform-backed
 * authoring schema — that round trip silently drops `load`, `effortCap` and
 * `tempo`, and a starting weight is exactly the kind of number it would lose.
 */
const StartProgramSchema = z.object({
	intent: z.literal('start-program'),
	/** `weight::<exerciseId>::<equipment>` per lift, so the **pair** survives the
	 * round trip and a barbell bench cannot seed a dumbbell bench. */
	weights: z.record(z.string(), z.string()).optional(),
})

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const raw = Object.fromEntries(formData)

	const weights: Record<string, string> = {}
	for (const [key, value] of Object.entries(raw)) {
		if (key.startsWith('weight::') && typeof value === 'string') {
			weights[key.slice('weight::'.length)] = value
		}
	}
	const parsed = StartProgramSchema.safeParse({ intent: raw.intent, weights })
	if (!parsed.success) {
		return data(
			{ ok: false as const, error: 'That form did not make sense.' },
			400,
		)
	}

	const startingWeights = Object.entries(weights).flatMap(([key, value]) => {
		const trimmed = value.trim()
		if (trimmed === '') return []
		const weightKg = Number(trimmed)
		if (!Number.isFinite(weightKg) || weightKg <= 0) return []
		const [exerciseId = '', equipment = ''] = key.split('::')
		return [
			{ exerciseId, equipment: equipment === '' ? null : equipment, weightKg },
		]
	})

	const result = await startProgram({
		userId,
		programId: params.programId,
		startedOn: new Date(),
		startingWeights,
	})
	if (!result.ok) {
		return data(
			{
				ok: false as const,
				error:
					result.reason === 'no-such-program'
						? 'That program is gone.'
						: 'Give at least one lift a starting weight.',
			},
			400,
		)
	}
	return redirect(`/training/programs/run/${result.instanceId}`)
}

export default function StartProgramRoute({
	loaderData,
}: Route.ComponentProps) {
	const { program } = loaderData
	const fetcher = useFetcher<typeof action>()
	const error =
		fetcher.data && 'ok' in fetcher.data && !fetcher.data.ok
			? fetcher.data.error
			: null

	return (
		<main className="container mx-auto max-w-xl py-6 md:py-8">
			<PageHeader
				title={`Start ${program.name}`}
				back={{ to: '/training/programs', label: 'programs' }}
				className="mb-2"
			/>
			<p className="text-body-sm text-muted-foreground mb-6">
				One number per lift. After this the program decides the weight from what
				you log.
			</p>

			<fetcher.Form method="post" className="space-y-6">
				<input type="hidden" name="intent" value="start-program" />
				{program.lifts.map((lift) => {
					const field = `weight::${lift.exerciseId}::${lift.equipment ?? ''}`
					return (
						<div key={field} className="space-y-1">
							<Label htmlFor={field}>
								{lift.name} — {lift.setCount}×{lift.repsPerSet}
							</Label>
							<Input
								id={field}
								name={field}
								type="number"
								inputMode="decimal"
								step="0.5"
								min="0"
								defaultValue={lift.defaultStartKg ?? ''}
								aria-describedby={`${field}-hint`}
							/>
							<p
								id={`${field}-hint`}
								className="text-body-xs text-muted-foreground"
							>
								{lift.defaultStartKg != null
									? `${program.name} publishes ${lift.defaultStartKg} kg here. Overtype it if you know better.`
									: lift.startSeedRepMaxReps != null
										? `${program.name} says: a weight you could lift for ${lift.startSeedRepMaxReps} reps.`
										: `${program.name} publishes no starting weight for this lift. Leave it blank and it is not started.`}
							</p>
						</div>
					)
				})}

				{error ? (
					<p role="alert" className="text-body-sm text-destructive">
						{error}
					</p>
				) : null}

				<Button type="submit">Start {program.name}</Button>
			</fetcher.Form>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
