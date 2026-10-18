/**
 * **Styrkeøkter i uka** — the athlete's **Strength Frequency** answer (#574,
 * ADR 0103): the 1, 2 or 3 strength sessions a week they tapped when they
 * picked _styrke_ in the First Run, changed here. It is their own answer and
 * the app never guesses it, so an athlete who never answered sees that they
 * have not, and one tap answers.
 *
 * **Styrkedagene i planen** (#597, ADR 0104 §4): where the active plan has a
 * strength track, the athlete chooses its days — _La appen velge_, the
 * default, or weekday chips limited to their **Training Availability**. The
 * chosen days are the track's **Pinned days**, and their count is the
 * Strength Frequency. A change shows the coming weeks before it writes
 * (ADR 0084) and is undone from its toast (ADR 0088).
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useState } from 'react'
import { data, useFetcher } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod/v3'
import {
	dayChoiceKey,
	LANDED_MS,
	useOncePer,
	type ReplyDataOf,
} from '#app/components/day-choice.ts'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	SegmentedControl,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import { WeekdayChips } from '#app/components/weekday-chips.tsx'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { updateAthleteProfile } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	STRENGTH_PER_WEEK_CHOICES,
	type StrengthPerWeek,
} from '#app/utils/first-run/start-draft.ts'
import { StrengthPerWeekSchema } from '#app/utils/first-run/start-schema.ts'
import {
	MEG_STRENGTH_DAYS_LABELS,
	MEG_STRENGTH_LABELS,
	SESONG_NOTICE_LABELS,
	SIMPLE_START_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	dayChoiceOf,
	MAX_PINNED_STRENGTH_DAYS,
	type DayChoice,
} from '#app/utils/plan-outline/pinned-days.ts'
import {
	previewStrengthDays,
	readStrengthDays,
	setStrengthDays,
	type StrengthDaysPreviewWeek,
} from '#app/utils/plan-outline/strength-days.server.ts'
import {
	patternWeekdaysOf,
	type PatternWeekday,
} from '#app/utils/plan-outline/week-pattern.ts'
import { MegFormErrors, MegNote } from '../__meg-ui.tsx'
import { type Route } from './+types/styrke.ts'

const L = MEG_STRENGTH_LABELS
const D = MEG_STRENGTH_DAYS_LABELS

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: L.title,
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const [profile, days] = await Promise.all([
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: { strengthPerWeek: true },
		}),
		readStrengthDays(userId),
	])
	return { strengthPerWeek: profile?.strengthPerWeek ?? null, days }
}

const StrengthAnswerSchema = z.object({ strength: StrengthPerWeekSchema })

/** One strength row as a write found it, which an undo puts back exactly. */
const StrengthRowSchema = z.object({
	kind: z.enum(['fixed', 'lifting', 'share']),
	weekday: z.number().int().min(0).max(6).nullable(),
	workoutId: z.string().min(1).nullable(),
	weight: z.number().positive().nullable().optional(),
	orderInDay: z.number().int().min(0).optional(),
})
const StrengthRowsSchema = z.array(StrengthRowSchema).max(14)

/** Rows off the form, each weekday read onto the pattern's axis. */
function restoredRows(rows: z.infer<typeof StrengthRowsSchema>) {
	return rows.map((row) => ({
		...row,
		weekday: row.weekday == null ? null : patternWeekdaysOf([row.weekday])[0]!,
	}))
}

const UndoSchema = z.object({
	days: z.array(z.number().int().min(0).max(6)).nullable(),
	count: z.number().int().min(0),
	answer: z.number().int().nullable(),
	/** The strength blocks' frequencies the write set, to put back. */
	frequencies: z
		.array(
			z.object({
				segmentId: z.string().min(1),
				sessionsPerWeek: z.number().int().min(0).nullable(),
			}),
		)
		.max(64)
		.default([]),
	/** The strength rows the write replaced in the plan's other patterns. */
	elsewhere: z
		.array(
			z.object({
				patternId: z.string().min(1),
				rows: StrengthRowsSchema,
			}),
		)
		.max(32)
		.default([]),
	/** The rows and the stored Pinned days the write replaced. */
	rows: StrengthRowsSchema.optional(),
	pinnedDays: z.string().max(64).nullable().optional(),
	version: z.string(),
})

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'preview-days') {
		const preview = await previewStrengthDays(userId, dayChoiceOf(formData))
		return preview.ok
			? { intent: 'preview' as const, preview, error: null }
			: data(
					{ intent: 'preview' as const, preview: null, error: preview.reason },
					{ status: 400 },
				)
	}

	if (intent === 'apply-days') {
		const written = await setStrengthDays(userId, {
			choice: dayChoiceOf(formData),
			version: String(formData.get('version') ?? ''),
		})
		if (!written.ok) {
			return data(
				{ intent: 'applied' as const, written: null, error: written.reason },
				{ status: 400 },
			)
		}
		return { intent: 'applied' as const, written, error: null }
	}

	if (intent === 'undo-days') {
		let payload: unknown = null
		try {
			payload = JSON.parse(String(formData.get('undo') ?? 'null'))
		} catch {
			payload = null
		}
		const parsed = UndoSchema.safeParse(payload)
		if (!parsed.success) {
			return data(
				{ intent: 'undone' as const, ok: false, error: 'stale' as const },
				{ status: 400 },
			)
		}
		const {
			days,
			count,
			answer,
			frequencies,
			elsewhere,
			rows,
			pinnedDays,
			version,
		} = parsed.data
		const undone = await setStrengthDays(userId, {
			choice: days == null ? null : patternWeekdaysOf(days),
			version,
			restore: {
				count,
				answer,
				frequencies,
				...(rows ? { rows: restoredRows(rows) } : {}),
				...(pinnedDays !== undefined ? { pinnedDays } : {}),
				elsewhere: elsewhere.map((entry) => ({
					patternId: entry.patternId,
					rows: restoredRows(entry.rows),
				})),
			},
		})
		return undone.ok
			? { intent: 'undone' as const, ok: true, error: null }
			: data(
					{ intent: 'undone' as const, ok: false, error: undone.reason },
					{ status: 400 },
				)
	}

	const parsed = StrengthAnswerSchema.safeParse(Object.fromEntries(formData))
	if (!parsed.success) {
		return data({ ok: false as const, error: L.invalid }, { status: 400 })
	}
	await updateAthleteProfile(userId, { strengthPerWeek: parsed.data.strength })
	return { ok: true as const, error: null }
}

export default function StrengthFrequencySettings({
	loaderData,
}: Route.ComponentProps) {
	const days = loaderData.days
	const pinned = days?.pinned ?? null
	return (
		<div className="flex flex-col gap-10">
			{pinned ? (
				<section className="flex flex-col gap-2">
					<p className="text-body">{L.intro}</p>
					<MegNote>{L.fromDays(pinned.length)}</MegNote>
				</section>
			) : (
				<StrengthAnswerForm
					stored={loaderData.strengthPerWeek}
					withDays={days != null}
				/>
			)}
			{days ? <StrengthDaysSection state={days} /> : null}
		</div>
	)
}

/** The Strength Frequency answer: 1, 2 or 3 a week (ADR 0103). */
function StrengthAnswerForm({
	stored,
	withDays,
}: {
	stored: number | null
	withDays: boolean
}) {
	const fetcher = useFetcher<typeof action>()
	const [value, setValue] = useState<StrengthPerWeek | null>(
		STRENGTH_PER_WEEK_CHOICES.find((count) => count === stored) ?? null,
	)
	const reply = fetcher.data && 'ok' in fetcher.data ? fetcher.data : null
	const saved =
		fetcher.state === 'idle' && reply?.ok === true && value === stored
	return (
		<fetcher.Form method="POST" className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<p className="text-body">{L.intro}</p>
				<MegNote>{stored == null ? L.unanswered : L.answered(stored)}</MegNote>
			</div>
			<div className="space-y-2">
				<p className="text-callout" id="meg-strength-legend">
					{SIMPLE_START_LABELS.strength.legend}
				</p>
				<SegmentedControl
					value={value == null ? '' : String(value)}
					onValueChange={(next) => {
						const picked = STRENGTH_PER_WEEK_CHOICES.find(
							(count) => String(count) === next,
						)
						if (picked) setValue(picked)
					}}
					aria-labelledby="meg-strength-legend"
					className="w-full"
				>
					{STRENGTH_PER_WEEK_CHOICES.map((count) => (
						<ToggleGroupItem
							key={count}
							value={String(count)}
							aria-label={SIMPLE_START_LABELS.strength.choiceLabel(count)}
							className="text-callout h-11 flex-1 tabular-nums"
						>
							{count}
						</ToggleGroupItem>
					))}
				</SegmentedControl>
				{value != null ? (
					<input type="hidden" name="strength" value={value} />
				) : null}
				<MegNote>{withDays ? L.planNoteWithDays : L.planNote}</MegNote>
			</div>
			<MegFormErrors
				errors={
					reply?.error && typeof reply.error === 'string'
						? [reply.error]
						: undefined
				}
			/>
			<StatusButton
				type="submit"
				className="text-callout w-full sm:w-auto sm:self-start"
				disabled={value == null || value === stored}
				status={
					fetcher.state !== 'idle' ? 'pending' : saved ? 'success' : 'idle'
				}
			>
				{L.save}
			</StatusButton>
		</fetcher.Form>
	)
}

type DaysState = NonNullable<Route.ComponentProps['loaderData']['days']>

/**
 * The plan's lifting days: _La appen velge_ or the athlete's own, with the
 * coming weeks shown before the write and _Angre_ on the toast after it.
 */
function StrengthDaysSection({ state }: { state: DaysState }) {
	const fetcher = useFetcher<typeof action>({ key: 'strength-days' })
	const undo = useFetcher<typeof action>({ key: 'strength-days-undo' })
	const [mode, setMode] = useState<'auto' | 'own'>(
		state.pinned ? 'own' : 'auto',
	)
	const [chosen, setChosen] = useState<PatternWeekday[]>(state.pinned ?? [])
	// A write that lands (or an undo) reloads the state: start from it again.
	const stateKey = `${state.version}`
	const [seenState, setSeenState] = useState(stateKey)
	if (seenState !== stateKey) {
		setSeenState(stateKey)
		setMode(state.pinned ? 'own' : 'auto')
		setChosen(state.pinned ?? [])
	}

	const current = dayChoiceKey(mode, chosen)
	const stored = dayChoiceKey(state.pinned ? 'own' : 'auto', state.pinned ?? [])
	const reply = fetcher.data && 'intent' in fetcher.data ? fetcher.data : null
	const preview =
		reply?.intent === 'preview' && reply.preview ? reply.preview : null
	// A preview stands only for the choice it was read for.
	const showing =
		preview &&
		dayChoiceKey(preview.choice ? 'own' : 'auto', preview.choice ?? []) ===
			current
			? preview
			: null
	const error =
		reply?.error && current !== stored
			? D.refusals[reply.error as keyof typeof D.refusals]
			: null
	const busy = fetcher.state !== 'idle'

	useWrittenToast(reply, undo.submit)
	useUndoneToast(undo.data)

	return (
		<section
			aria-labelledby="meg-strength-days"
			className="flex flex-col gap-6"
		>
			<div className="flex flex-col gap-2">
				<h2 id="meg-strength-days" className="text-heading">
					{D.heading}
				</h2>
				<MegNote>{D.intro}</MegNote>
			</div>

			<fetcher.Form method="POST" className="flex flex-col gap-6">
				<input type="hidden" name="mode" value={mode} />
				<div className="space-y-2">
					<p className="text-callout" id="meg-strength-days-mode">
						{D.modeLegend}
					</p>
					<SegmentedControl
						value={mode}
						onValueChange={(next) => {
							if (next === 'auto' || next === 'own') setMode(next)
						}}
						aria-labelledby="meg-strength-days-mode"
						className="w-full"
					>
						<ToggleGroupItem value="auto" className="text-callout h-11 flex-1">
							{D.auto}
						</ToggleGroupItem>
						<ToggleGroupItem value="own" className="text-callout h-11 flex-1">
							{D.own}
						</ToggleGroupItem>
					</SegmentedControl>
					{mode === 'auto' ? (
						<MegNote>{D.autoNote(Math.max(state.count, 1))}</MegNote>
					) : null}
				</div>

				{mode === 'own' ? (
					<fieldset className="flex flex-col gap-2">
						<legend className="text-callout mb-1.5">{D.chipsLegend}</legend>
						<WeekdayChips
							idPrefix="meg-strength-day"
							chosen={chosen}
							onChange={setChosen}
							available={state.available}
							max={MAX_PINNED_STRENGTH_DAYS}
						/>
						<MegNote>
							{state.available ? D.chipsNote : D.chipsNoteNoAvailability}
						</MegNote>
						<MegNote>{D.ownNote}</MegNote>
					</fieldset>
				) : null}

				{error ? <MegFormErrors errors={[error]} /> : null}

				{showing ? (
					<StrengthDaysPreview
						weeks={showing.weeks}
						choice={showing.choice}
						version={showing.version}
						busy={busy}
						onCancel={() => {
							setMode(state.pinned ? 'own' : 'auto')
							setChosen(state.pinned ?? [])
						}}
					/>
				) : (
					<StatusButton
						type="submit"
						name="intent"
						value="preview-days"
						variant="outline"
						className="text-callout w-full sm:w-auto sm:self-start"
						disabled={
							current === stored || (mode === 'own' && chosen.length === 0)
						}
						status={busy ? 'pending' : 'idle'}
					>
						{busy ? D.previewing : D.preview}
					</StatusButton>
				)}
			</fetcher.Form>
		</section>
	)
}

/**
 * The coming weeks with the choice, beside how they are laid now, and the
 * write itself — so nothing is written the athlete has not seen (ADR 0084).
 */
function StrengthDaysPreview({
	weeks,
	choice,
	version,
	busy,
	onCancel,
}: {
	weeks: StrengthDaysPreviewWeek[]
	choice: DayChoice
	version: string
	busy: boolean
	onCancel: () => void
}) {
	const clashes = weeks.flatMap((week) =>
		week.after.clashes.map((clash) => ({ week, clash })),
	)
	return (
		<div
			className={cn(
				'bg-card ring-foreground/5 dark:ring-foreground/10 flex flex-col gap-4 rounded-4xl p-4 shadow-xs ring-1',
				// It rises 4px and fades in as it mounts (`@starting-style`, 200ms
				// ease-out); reduced motion keeps the fade.
				'duration-collapse [transition-property:opacity,translate] ease-out',
				'starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0',
			)}
		>
			<input type="hidden" name="version" value={version} />
			<h3 className="text-callout font-semibold">{D.previewHeading}</h3>
			<ul className="divide-border/70 flex flex-col divide-y">
				{weeks.map((week) => {
					const changed =
						week.before.lifting.join(',') !== week.after.lifting.join(',')
					return (
						<li
							key={week.weekKey}
							className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0"
						>
							<p className="text-footnote text-muted-foreground tabular-nums">
								{D.week(isoWeekNumber(week.weekKey))}
							</p>
							<p className="text-callout break-words">
								{D.lifting(week.after.lifting)}
								<span className="text-muted-foreground">
									{' · '}
									{D.hard(week.after.hard)}
								</span>
							</p>
							<p className="text-footnote text-muted-foreground break-words">
								{changed ? D.was(week.before.lifting) : D.same}
							</p>
						</li>
					)
				})}
			</ul>
			{clashes.length > 0 ? (
				<div className="flex flex-col gap-1.5">
					<ul className="flex flex-col gap-1.5">
						{clashes.map(({ week, clash }) => (
							<li
								key={`${week.weekKey}-${clash.reason}-${clash.weekday}`}
								className="text-footnote break-words"
							>
								{D.week(isoWeekNumber(week.weekKey))}:{' '}
								{D.clash(
									SESONG_NOTICE_LABELS.dayClash(clash.reason, clash.weekday),
									clash.pinned,
								)}
							</li>
						))}
					</ul>
					{choice ? <MegNote>{D.clashNote}</MegNote> : null}
				</div>
			) : null}
			<div className="flex flex-col gap-2 sm:flex-row">
				<StatusButton
					type="submit"
					name="intent"
					value="apply-days"
					className="text-callout w-full sm:w-auto"
					status={busy ? 'pending' : 'idle'}
				>
					{busy ? D.applying : D.apply}
				</StatusButton>
				<Button
					type="button"
					variant="ghost"
					className="text-callout w-full sm:w-auto"
					onClick={onCancel}
				>
					{D.cancel}
				</Button>
			</div>
		</div>
	)
}

type ReplyData = ReplyDataOf<typeof action>

/**
 * The write's toast (ADR 0088): what the days are now, and _Angre_, which
 * puts back exactly what the write replaced.
 */
function useWrittenToast(
	reply: ReplyData | null,
	submit: ReturnType<typeof useFetcher>['submit'],
) {
	const written =
		reply && 'written' in reply && reply.written ? reply.written : null
	useOncePer(written, (written) => {
		toast.success(D.saved(written.choice), {
			id: 'strength-days',
			duration: LANDED_MS,
			action: {
				label: D.undo,
				onClick: () =>
					void submit(
						{
							intent: 'undo-days',
							undo: JSON.stringify({
								days: written.previous.days,
								count: written.previous.count,
								answer: written.previous.answer,
								frequencies: written.previous.frequencies,
								rows: written.previous.rows,
								pinnedDays: written.previous.pinnedDays,
								elsewhere: written.previous.elsewhere,
								version: written.version,
							}),
						},
						{ method: 'POST' },
					),
			},
		})
	})
}

/** The undo's own toast: the days are as they were. */
function useUndoneToast(reply: ReplyData | undefined) {
	const undone =
		reply && 'intent' in reply && reply.intent === 'undone' ? reply : null
	useOncePer(undone, (undone) => {
		// The same toast, so its _Angre_ goes: there is nothing left to undo.
		if (undone.ok)
			toast.success(D.undone, { id: 'strength-days', action: undefined })
		else if (undone.error)
			toast.error(D.refusals[undone.error as keyof typeof D.refusals], {
				id: 'strength-days',
			})
	})
}
