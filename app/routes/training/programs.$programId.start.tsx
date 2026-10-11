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
import { formatNbKg } from '#app/utils/format.ts'
import { PROGRAM_START_LABELS as L } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { optionalKiloField } from '#app/utils/strength/kilo-input.ts'
import { getProgram, startProgram } from '#app/utils/strength-program.server.ts'
import { type Route } from './+types/programs.$programId.start.ts'
import {
	schemeLabel,
	startingWeightHint,
} from './__starting-weights-presenter.ts'

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
	{ title: L.metaTitle(loaderData?.program.name ?? 'Program') },
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
export const StartProgramSchema = z.object({
	intent: z.literal('start-program'),
	/** `weight::<exerciseId>::<equipment>` per lift, so the **pair** survives the
	 * round trip and a barbell bench cannot seed a dumbbell bench.
	 *
	 * A blank lift is a lift not started — that is a choice, and it reads as
	 * `null`. A *typed* number the app cannot use is not a choice, so it is refused
	 * in words rather than dropped: silently discarding it would start the program
	 * without the lift the athlete just answered for. `62,5` and `62.5` are the
	 * same kilo (`kiloField`). */
	weights: z.record(z.string(), optionalKiloField(L.errors.weight)).optional(),
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
		// The weight's own sentence where a weight was refused; the form-level one
		// only where the post itself was malformed.
		const weightIssue = parsed.error.issues.find(
			(issue) => issue.path[0] === 'weights' && issue.code === 'custom',
		)
		return data(
			{
				ok: false as const,
				error: weightIssue?.message ?? L.errors.form,
			},
			400,
		)
	}

	const startingWeights = Object.entries(parsed.data.weights ?? {}).flatMap(
		([key, weightKg]) => {
			if (weightKg == null) return []
			const [exerciseId = '', equipment = ''] = key.split('::')
			return [
				{
					exerciseId,
					equipment: equipment === '' ? null : equipment,
					weightKg,
				},
			]
		},
	)

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
						? L.errors.gone
						: L.errors.atLeastOne,
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
					aria-label={L.back}
					className={cn(
						buttonVariants({ variant: 'ghost', size: 'icon' }),
						'-ml-2 shrink-0',
					)}
				>
					<Icon name="arrow-left" size="md" />
				</Link>
				<div className="min-w-0 flex-1">
					<p className="text-overline text-primary [overflow-wrap:anywhere] uppercase">
						{program.name}
					</p>
					<h1 className="text-title">{L.heading}</h1>
				</div>
			</header>
			<p className="text-footnote text-muted-foreground mb-6">{L.intro}</p>

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
								className="text-callout flex items-baseline justify-between gap-2"
							>
								<span className="min-w-0 [overflow-wrap:anywhere]">
									{lift.name}
								</span>{' '}
								{/* A real space between the two, whitespace-only and so not a
								    flex item: it keeps the accessible name reading "Squat 5×5"
								    rather than "Squat5×5". */}
								<span className="text-footnote text-muted-foreground shrink-0 font-normal tabular-nums">
									{schemeLabel(lift)}
								</span>
							</Label>
							{/* The unit is stated by the field rather than typed by the
							    athlete: `kg` is the only unit this app stores, and asking
							    someone to type it is asking them to get it wrong.

							    The focus ring is the wrapper's, not the input's (#487). The
							    input cancels the primitive's own ring so this box can own
							    the border, which left a keyboard user with no indicator at
							    all — so the box that *looks* like the field is the box that
							    lights up. `:has(:focus-visible)` rather than `:focus-within`
							    keeps the primitive's keyboard-only semantics. Primary rather
							    than `--ring`, which is only 2.44:1 on a white card and so
							    misses the 3:1 a focus indicator owes SC 1.4.11; primary
							    clears it in both themes (5.25:1 light, 7.02:1 dark) and is
							    already how a wrapper-owns-the-border control marks itself
							    here (`plan.new.$eventId.tsx`). */}
							<div
								data-slot="starting-weight-field"
								className="border-border bg-card has-[:focus-visible]:border-primary has-[:focus-visible]:ring-primary/40 duration-press flex h-12 items-center gap-3 rounded-3xl border px-4 transition-[border-color,box-shadow] ease-out has-[:focus-visible]:ring-2"
							>
								{/* **Text, with a decimal keypad — never `type="number"`.** A
								    number input is read by the browser's locale: Chromium in
								    English dropped the comma from a typed `62,5` and posted
								    `625`, ten times the weight and no error anywhere. A text
								    field posts what was typed, and the action reads `,` and
								    `.` alike (`kiloField`) or refuses it in words.

								    **No step and no min**, for the same reason: `step="0.5"`
								    rejected 61.25 kg on a rack with 1.25 kg plates, and a
								    browser constraint is a silent refusal. Loadability is
								    stated where it is known (the plate line, the engine's
								    rounding note), never enforced here as a false rule. */}
								<Input
									id={field}
									name={field}
									type="text"
									inputMode="decimal"
									autoComplete="off"
									// Shown the way a Norwegian reads it (`62,5`); the action
									// reads `,` and `.` alike.
									defaultValue={
										lift.defaultStartKg == null
											? ''
											: formatNbKg(lift.defaultStartKg)
									}
									aria-describedby={`${field}-hint`}
									className="text-heading h-full flex-1 rounded-none border-0 bg-transparent p-0 tabular-nums focus-visible:border-transparent focus-visible:ring-0"
								/>
								<span className="text-footnote text-muted-foreground shrink-0">
									{L.unit}
								</span>
							</div>
							{/* Every number the program produced says where it came from —
							    the copy rule the handoff holds everywhere. The sentence is
							    the presenter's, and the kilo in it is the constants'. */}
							<p
								id={`${field}-hint`}
								className="text-footnote text-muted-foreground"
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
					<p role="alert" className="text-footnote text-foreground-destructive">
						{error}
					</p>
				) : null}

				<Button type="submit" className="h-12 w-full rounded-full">
					{L.submit(program.name)}
				</Button>
			</fetcher.Form>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
