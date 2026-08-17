/**
 * **Your gym** — the bars, the plate counts and the dumbbell rack the plate line
 * is solved against.
 *
 * The screen exists because a plate calculator without it is a lie about somebody
 * else's rack (ADR 0056's stated absence, spec Slice 5). Two properties it holds
 * that a naive form would not:
 *
 * - **The count is the point.** `count` is *pairs owned*, and a solver that
 *   descends greedily fails at 140 kg on a gym with two 20s a side. So the number
 *   beside each plate is asked for, not assumed.
 * - **A rack stated as empty is not a rack nobody stated.** Leaving the dumbbell
 *   field blank means *"I have not said"*, and the plate line then refuses for
 *   that reason rather than picking a bell out of the air.
 *
 * **Loadability and the increment are independent** — owning 1 kg plates does not
 * change a program's increment, and changing an increment does not check whether
 * the gym can make the result. That is the reference product's own stated
 * behaviour and it keeps two ideas from contaminating each other, so this screen
 * touches no program state at all.
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, useFetcher } from 'react-router'
import { z } from 'zod'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	getGymProfile,
	saveGymProfile,
} from '#app/utils/plate-inventory.server.ts'
import { calculatePlates, plateLineText } from '#app/utils/strength/plates.ts'
import { type Route } from './+types/gym.ts'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: 'Your gym',
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const gym = await getGymProfile(userId)
	return { gym }
}

/**
 * The write, in the log grid's idiom: a local zod parse over
 * `Object.fromEntries`, never the Conform-backed authoring schema.
 *
 * The two list fields are **comma-separated numbers**, which is what an athlete
 * reading plates off a rack actually types. Parsed strictly: a value that is not
 * a number is refused rather than dropped, because a silently dropped plate is a
 * plate line that is quietly wrong.
 */
const numberList = z
	.string()
	.optional()
	.transform((raw) =>
		(raw ?? '')
			.split(',')
			.map((part) => part.trim())
			.filter((part) => part !== ''),
	)

const GymSchema = z.object({
	name: z.string().max(60).optional(),
	bars: numberList,
	plates: numberList,
	plateCounts: numberList,
	dumbbells: z.string().optional(),
})

export type SaveGymActionResult =
	| { ok: true; message: string }
	| { ok: false; error: string }

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const parsed = GymSchema.safeParse(Object.fromEntries(formData))
	if (!parsed.success) {
		return data<SaveGymActionResult>(
			{ ok: false, error: 'That did not make sense.' },
			400,
		)
	}
	const input = parsed.data

	const bars = input.bars.map(Number)
	const plateWeights = input.plates.map(Number)
	const counts = input.plateCounts.map(Number)
	if (
		[...bars, ...plateWeights, ...counts].some(
			(value) => !Number.isFinite(value) || value < 0,
		)
	) {
		return data<SaveGymActionResult>(
			{ ok: false, error: 'Every weight and count has to be a number.' },
			400,
		)
	}
	if (counts.length > 0 && counts.length !== plateWeights.length) {
		return data<SaveGymActionResult>(
			{
				ok: false,
				error: 'Give a count for every plate, or leave the counts blank.',
			},
			400,
		)
	}

	// A blank dumbbell field is **no rack stated**, which is not a rack with
	// nothing in it: the first refuses because nobody has said, the second because
	// there is nothing to pick.
	const dumbbellRaw = (input.dumbbells ?? '').trim()
	const dumbbells =
		dumbbellRaw === ''
			? null
			: dumbbellRaw
					.split(',')
					.map((part) => Number(part.trim()))
					.filter((value) => Number.isFinite(value) && value > 0)

	const result = await saveGymProfile({
		userId,
		name: input.name,
		inventory: {
			bars: bars.filter((kg) => kg > 0).map((weightKg) => ({ weightKg })),
			plates: plateWeights
				.map((weightKg, index) => ({
					weightKg,
					count: counts[index] ?? 2,
				}))
				.filter((plate) => plate.weightKg > 0),
			fixedDumbbellsKg: dumbbells,
		},
	})
	if (!result.ok) {
		return data<SaveGymActionResult>(
			{
				ok: false,
				error: 'Your athlete profile is missing, so there is no gym to attach.',
			},
			400,
		)
	}
	return {
		ok: true as const,
		message: 'Saved. Every weight now says what goes on the bar.',
	}
}

export default function GymRoute({ loaderData }: Route.ComponentProps) {
	const fetcher = useFetcher<typeof action>()
	const gym = loaderData.gym
	const result = fetcher.data

	// The example is solved against the gym on file, so the screen shows the
	// consequence of the numbers rather than describing it.
	const example = gym
		? calculatePlates(100, gym.inventory, { kind: 'external' })
		: null

	return (
		<div className="space-y-6">
			<p className="text-body-sm text-muted-foreground">
				What your gym owns, so the weight input can say what goes on the bar.
				The count is pairs — two 20s per side is a count of 2.
			</p>

			<fetcher.Form method="post" className="space-y-4">
				<div>
					<Label htmlFor="gym-name">This gym’s name</Label>
					<Input
						id="gym-name"
						name="name"
						defaultValue={gym?.name ?? 'My gym'}
						className="mt-1"
					/>
				</div>

				<div>
					<Label htmlFor="gym-bars">Bars, in kg</Label>
					<Input
						id="gym-bars"
						name="bars"
						inputMode="decimal"
						placeholder="20, 15"
						defaultValue={gym?.inventory.bars.map((b) => b.weightKg).join(', ')}
						className="mt-1"
					/>
					<p className="text-body-xs text-muted-foreground mt-1">
						The first one is the bar a lift assumes.
					</p>
				</div>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<Label htmlFor="gym-plates">Plates, in kg</Label>
						<Input
							id="gym-plates"
							name="plates"
							inputMode="decimal"
							placeholder="25, 20, 10, 5, 2.5, 1.25"
							defaultValue={gym?.inventory.plates
								.map((p) => p.weightKg)
								.join(', ')}
							className="mt-1"
						/>
					</div>
					<div>
						<Label htmlFor="gym-plate-counts">Pairs of each</Label>
						<Input
							id="gym-plate-counts"
							name="plateCounts"
							inputMode="numeric"
							placeholder="2, 2, 2, 2, 1, 1"
							defaultValue={gym?.inventory.plates
								.map((p) => p.count)
								.join(', ')}
							className="mt-1"
						/>
					</div>
				</div>

				<div>
					<Label htmlFor="gym-dumbbells">Fixed dumbbells, in kg</Label>
					<Input
						id="gym-dumbbells"
						name="dumbbells"
						inputMode="decimal"
						placeholder="5, 7.5, 10, 12.5, 15"
						defaultValue={gym?.inventory.fixedDumbbellsKg?.join(', ') ?? ''}
						className="mt-1"
					/>
					<p className="text-body-xs text-muted-foreground mt-1">
						Leave this blank if you have not said — a blank field is not an
						empty rack.
					</p>
				</div>

				<Button type="submit" disabled={fetcher.state !== 'idle'}>
					Save my gym
				</Button>
			</fetcher.Form>

			{result && 'error' in result ? (
				<p className="text-destructive text-body-sm" role="alert">
					{result.error}
				</p>
			) : null}
			{result && 'message' in result ? (
				<p className="text-body-sm" role="status">
					{result.message}
				</p>
			) : null}

			{example ? (
				<p className="text-body-sm text-muted-foreground">
					{example.outcome === 'unavailable'
						? example.explanation
						: example.outcome === 'exact'
							? `100 kg on this rack is ${plateLineText(example)} per side.`
							: `This rack cannot make 100 kg — the nearest is ${example.totalWeight} kg, ${plateLineText(example)} per side.`}
				</p>
			) : null}
		</div>
	)
}
