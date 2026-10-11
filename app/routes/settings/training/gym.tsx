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
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	MEG_GYM_LABELS,
	MEG_PAGE_TITLES,
	MEG_PLATE_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import {
	getGymProfile,
	saveGymProfile,
} from '#app/utils/plate-inventory.server.ts'
import {
	calculatePlates,
	type PlateSolution,
} from '#app/utils/strength/plates.ts'
import { nbKg } from '../__meg-text.ts'
import { MegField, MegNote, MegResult } from '../__meg-ui.tsx'
import { type Route } from './+types/gym.ts'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.gym,
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
			{ ok: false, error: MEG_GYM_LABELS.invalid },
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
			{ ok: false, error: MEG_GYM_LABELS.notNumbers },
			400,
		)
	}
	if (counts.length > 0 && counts.length !== plateWeights.length) {
		return data<SaveGymActionResult>(
			{
				ok: false,
				error: MEG_GYM_LABELS.countMismatch,
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
				error: MEG_GYM_LABELS.noProfile,
			},
			400,
		)
	}
	return {
		ok: true as const,
		message: MEG_GYM_LABELS.saved,
	}
}

/**
 * The plate line with decimal commas: `20 · 20 · 10 · 2,5` — the Norwegian
 * twin of `plateLineText`, whose `.` the session runner still reads.
 */
function nbPlateLine(solution: PlateSolution): string {
	if (solution.outcome === 'unavailable') return '—'
	if (solution.platesPerSide.length === 0) {
		return solution.perSideKg > 0
			? nbKg(solution.perSideKg)
			: MEG_GYM_LABELS.emptyBar
	}
	return solution.platesPerSide
		.flatMap((plate) =>
			Array.from({ length: plate.count }, () => plate.weightKg),
		)
		.map(nbKg)
		.join(' · ')
}

export default function GymRoute({ loaderData }: Route.ComponentProps) {
	const fetcher = useFetcher<typeof action>()
	const gym = loaderData.gym
	const result = fetcher.data
	const L = MEG_GYM_LABELS

	// The example is solved against the gym on file, so the screen shows the
	// consequence of the numbers rather than describing it.
	const example = gym
		? calculatePlates(100, gym.inventory, { kind: 'external' })
		: null

	// The list fields keep the parser's own format — commas between numbers, a
	// point for decimals — and say so under the fields, because a Norwegian
	// `2,5` in a comma list would read as two plates.
	const list = {
		inputMode: 'decimal',
		autoComplete: 'off',
		autoCorrect: 'off',
		spellCheck: false,
		enterKeyHint: 'next',
	} as const

	return (
		<div className="flex flex-col gap-6">
			<p className="text-body">{L.intro}</p>

			<Card size="sm">
				<CardContent>
					<fetcher.Form method="post" className="flex flex-col gap-4">
						<MegField
							label={L.name}
							inputProps={{
								id: 'gym-name',
								name: 'name',
								defaultValue: gym?.name ?? L.defaultName,
								maxLength: 60,
								autoComplete: 'off',
								enterKeyHint: 'next',
							}}
						/>
						<MegField
							label={L.bars}
							hint={L.barsHint}
							inputProps={{
								...list,
								id: 'gym-bars',
								name: 'bars',
								placeholder: '20, 15',
								defaultValue: gym?.inventory.bars
									.map((b) => b.weightKg)
									.join(', '),
							}}
						/>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<MegField
								label={L.plates}
								inputProps={{
									...list,
									id: 'gym-plates',
									name: 'plates',
									placeholder: '25, 20, 10, 5, 2.5, 1.25',
									defaultValue: gym?.inventory.plates
										.map((p) => p.weightKg)
										.join(', '),
								}}
							/>
							<MegField
								label={L.plateCounts}
								inputProps={{
									...list,
									inputMode: 'numeric',
									id: 'gym-plate-counts',
									name: 'plateCounts',
									placeholder: '2, 2, 2, 2, 1, 1',
									defaultValue: gym?.inventory.plates
										.map((p) => p.count)
										.join(', '),
								}}
							/>
						</div>
						<MegField
							label={L.dumbbells}
							hint={L.dumbbellsHint}
							inputProps={{
								...list,
								enterKeyHint: 'done',
								id: 'gym-dumbbells',
								name: 'dumbbells',
								placeholder: '5, 7.5, 10, 12.5, 15',
								defaultValue: gym?.inventory.fixedDumbbellsKg?.join(', ') ?? '',
							}}
						/>
						<MegNote>{L.listHint}</MegNote>

						<MegResult result={result} />

						<StatusButton
							type="submit"
							className="w-full sm:w-auto sm:self-start"
							status={fetcher.state !== 'idle' ? 'pending' : 'idle'}
						>
							{L.save}
						</StatusButton>
					</fetcher.Form>
				</CardContent>
			</Card>

			{example ? (
				<MegNote className="tabular-nums">
					{example.outcome === 'unavailable'
						? MEG_PLATE_REFUSAL_LABELS[example.reason]
						: example.outcome === 'exact'
							? L.exampleExact(nbPlateLine(example))
							: // `achievedKg`, not `totalWeight`: the gap sentence is owed in the
								// quantity the probe was asked in, and `gapKg` is measured against
								// `achievedKg`. The two coincide here only because the probe is an
								// `external` 100 kg — reading `totalWeight` for a number the athlete
								// is quoted is the exact substitution that shipped three defects
								// elsewhere in this module's callers. `achievedKg` is null only for
								// `bodyweight`, which this probe never is.
								L.exampleNearest(
									example.achievedKg == null ? '—' : nbKg(example.achievedKg),
									nbPlateLine(example),
								)}
				</MegNote>
			) : null}
		</div>
	)
}
