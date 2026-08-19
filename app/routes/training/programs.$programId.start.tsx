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
import { data, Link, redirect, useFetcher } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { cn } from '#app/utils/misc.tsx'
import { getProgram, startProgram } from '#app/utils/strength-program.server.ts'
import { type Route } from './+types/programs.$programId.start.ts'
import {
	schemeLabel,
	startingWeightHint,
} from './__starting-weights-presenter.ts'

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

	// A blank lift is a lift not started — that is a choice. A *typed* number the
	// app cannot use is not a choice, so it is said out loud rather than dropped:
	// silently discarding it would start the program without the lift the athlete
	// just answered for.
	const startingWeights: Array<{
		exerciseId: string
		equipment: string | null
		weightKg: number
	}> = []
	let refusedNumber = false
	for (const [key, value] of Object.entries(weights)) {
		const trimmed = value.trim()
		if (trimmed === '') continue
		const weightKg = Number(trimmed)
		if (!Number.isFinite(weightKg) || weightKg <= 0) {
			refusedNumber = true
			continue
		}
		const [exerciseId = '', equipment = ''] = key.split('::')
		startingWeights.push({
			exerciseId,
			equipment: equipment === '' ? null : equipment,
			weightKg,
		})
	}
	if (refusedNumber) {
		return data(
			{
				ok: false as const,
				error: 'A starting weight has to be a positive number of kilos.',
			},
			400,
		)
	}

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
		<main className="container mx-auto max-w-md py-6 md:py-8">
			{/* The header the design draws: the program name as an eyebrow over the
			    screen's own title, so the athlete can see *which* program they are
			    about to commit to without the title having to carry it. */}
			<header className="mb-4 flex items-center gap-2">
				<Link
					to="/training/programs"
					aria-label="Back to programs"
					className={cn(
						buttonVariants({ variant: 'ghost', size: 'icon' }),
						'relative -ml-2 shrink-0 after:absolute after:-inset-1.5',
					)}
				>
					<Icon name="arrow-left" size="md" />
				</Link>
				<div className="min-w-0 flex-1">
					<p className="text-body-2xs text-primary font-bold tracking-widest uppercase">
						{program.name}
					</p>
					<h1 className="text-body-md truncate font-bold">Starting weights</h1>
				</div>
			</header>
			<p className="text-body-xs text-muted-foreground mb-6 leading-relaxed">
				One number per lift. After this the program decides the weight from what
				you log.
			</p>

			{/* **`noValidate`.** The browser's own refusal is a silent one: it blocks
			    the submit and, for a programmatically submitted form, says nothing at
			    all — the athlete taps *Start* and nothing happens. Every other thing
			    this screen can refuse comes back from the action as a sentence in the
			    alert below, so constraint failures take that same path. */}
			<fetcher.Form method="post" noValidate className="space-y-4">
				<input type="hidden" name="intent" value="start-program" />
				{program.lifts.map((lift) => {
					const field = `weight::${lift.exerciseId}::${lift.equipment ?? ''}`
					return (
						<div key={field} className="space-y-1.5">
							{/* Name left, scheme right — one row, and both inside the
							    label, so the scheme is read out with the lift rather than
							    stranded beside it as decoration a screen reader skips. */}
							<Label
								htmlFor={field}
								className="text-body-xs flex items-baseline justify-between gap-2 font-semibold"
							>
								<span className="min-w-0 truncate">{lift.name}</span>{' '}
								{/* A real space between the two, whitespace-only and so not a
								    flex item: it keeps the accessible name reading "Squat 5×5"
								    rather than "Squat5×5". */}
								<span className="text-body-2xs text-muted-foreground shrink-0 font-normal">
									{schemeLabel(lift)}
								</span>
							</Label>
							{/* The unit is stated by the field rather than typed by the
							    athlete: `kg` is the only unit this app stores, and asking
							    someone to type it is asking them to get it wrong. */}
							<div
								data-slot="starting-weight-field"
								className="border-border bg-card flex h-13 items-center gap-3 rounded-2xl border px-4"
							>
								{/* **No step.** `step="0.5"` rejected 61.25 kg, on an athlete
								    whose gym owns 1.25 kg plates — a precision the app has no
								    standing to impose, since what can be loaded is a fact
								    about a rack it may know nothing about. Loadability is
								    stated where it is known (the plate line, the engine's
								    rounding note), never enforced here as a false rule. */}
								<Input
									id={field}
									name={field}
									type="number"
									inputMode="decimal"
									step="any"
									min="0"
									defaultValue={lift.defaultStartKg ?? ''}
									aria-describedby={`${field}-hint`}
									className="text-body-md md:text-body-md h-full flex-1 rounded-none border-0 bg-transparent p-0 font-bold focus-visible:border-transparent focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
								/>
								<span className="text-body-2xs text-muted-foreground shrink-0 font-semibold">
									kg
								</span>
							</div>
							{/* Every number the program produced says where it came from —
							    the copy rule the handoff holds everywhere. The sentence is
							    the presenter's, and the kilo in it is the constants'. */}
							<p
								id={`${field}-hint`}
								className="text-body-2xs text-muted-foreground/85 leading-relaxed"
							>
								{startingWeightHint({
									programKey: program.key,
									programName: program.name,
									lift,
								})}
							</p>
						</div>
					)
				})}

				{error ? (
					<p role="alert" className="text-body-xs text-destructive">
						{error}
					</p>
				) : null}

				<Button type="submit" className="text-body-xs h-13 w-full font-bold">
					Start {program.name}
				</Button>
			</fetcher.Form>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
