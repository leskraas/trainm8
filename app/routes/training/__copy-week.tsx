/**
 * **Copying a week** onto another week (#415, ADR 0044 §6).
 *
 * The athlete's own way to fill a week, now that the weeks fill themselves from
 * the typical week (decision 14). Split out of `plan.tsx` like the other editors — the
 * route owns the loader, the action and the wording of every refusal; this module
 * owns the controls.
 *
 * Three things the copy has to say, and none of them is a footnote.
 *
 * **A copy is copied as authored, not scaled.** This is the whole difference between
 * copying a week and stamping a pattern, and the athlete cannot be left to discover
 * it. A pattern's share days absorb whatever the target week's derived target is; a
 * copy carries the week they already wrote, and if the target week's figure differs,
 * the Weeks reading above shows the sessions against it exactly as it does for any
 * hand-edited week (ADR 0040 §1).
 *
 * **The two weeks are independent from the moment they exist.** Every session gets
 * its own fresh Workout, so editing Wednesday in one week never touches the other.
 * Said plainly, because a shared prescription is precisely what an athlete would
 * assume "copy" meant.
 *
 * **Copying onto a week that already has sessions says what it would do first.** The
 * same confirmation shape the stamp uses, and the same hard rule underneath it:
 * sessions the athlete has already trained or logged are never replaced, whatever
 * they confirm.
 */
import { useState } from 'react'
import { Form } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { formatNbDayMonth } from '#app/utils/format.ts'
import { SESONG_COPY_LABELS } from '#app/utils/labels.ts'
import { type CopyWeekConflict } from '#app/utils/plan-outline/copy-week.server.ts'

/** One week of the plan, as the two choosers list it. */
export type CopyableWeek = {
	weekKey: string
	weekInPlan: number
	/** The instant the week's Monday opens on, for the display layer to format. */
	startsAt: Date
}

/**
 * A copy the service asked the athlete to confirm: which weeks, and what it found in
 * the target. Replayed verbatim by the confirm form, so the second submit is the
 * first one plus a yes rather than a second request assembled from a stale page.
 */
export type PendingCopy = {
	sourceWeekKey: string
	targetWeekKey: string
	conflict: CopyWeekConflict
}

export function CopyWeekSection({
	outlineId,
	weeks,
	timezone,
	pending,
}: {
	outlineId: string
	weeks: CopyableWeek[]
	timezone: string
	/** The confirmation the last submit came back asking for, or null. */
	pending: PendingCopy | null
}) {
	return (
		<section aria-labelledby="copy-week" className="space-y-4">
			{/* The section's name lives on the `Disclosure` summary that opens it, so
			    this heading is the accessible name only — dropping it would leave the
			    region unnamed, and showing it would print the name twice. */}
			<h2 id="copy-week" className="sr-only">
				{SESONG_COPY_LABELS.copy}
			</h2>
			<p className="text-muted-foreground text-footnote">
				{SESONG_COPY_LABELS.intro}
			</p>
			<p className="text-muted-foreground text-footnote">
				{SESONG_COPY_LABELS.asWritten}
			</p>

			{weeks.length < 2 ? (
				<p className="text-footnote">{SESONG_COPY_LABELS.oneWeek}</p>
			) : pending ? (
				<ConfirmReplace
					pending={pending}
					outlineId={outlineId}
					weeks={weeks}
					timezone={timezone}
				/>
			) : (
				<CopyForm outlineId={outlineId} weeks={weeks} timezone={timezone} />
			)}
		</section>
	)
}

/** Which week to take, and which week to put it on. */
function CopyForm({
	outlineId,
	weeks,
	timezone,
}: {
	outlineId: string
	weeks: CopyableWeek[]
	timezone: string
}) {
	const [sourceWeekKey, setSourceWeekKey] = useState(weeks[0]!.weekKey)
	const [targetWeekKey, setTargetWeekKey] = useState(weeks[1]!.weekKey)

	return (
		<Form method="POST" className="space-y-4">
			<input type="hidden" name="intent" value="copy-week" />
			<input type="hidden" name="outlineId" value={outlineId} />

			{/* Stacked at every width: "Week 7 · 11 Feb" is too long to sit two abreast
			    at 390 px and would clip (UI conventions §2.5). */}
			<WeekChooser
				id="copy-week-source"
				label={SESONG_COPY_LABELS.source}
				name="sourceWeekKey"
				value={sourceWeekKey}
				onChange={setSourceWeekKey}
				weeks={weeks}
				timezone={timezone}
			/>
			<WeekChooser
				id="copy-week-target"
				label={SESONG_COPY_LABELS.target}
				name="targetWeekKey"
				value={targetWeekKey}
				onChange={setTargetWeekKey}
				weeks={weeks}
				timezone={timezone}
			/>

			<Button type="submit" className="w-full sm:w-auto">
				{SESONG_COPY_LABELS.copy}
			</Button>
		</Form>
	)
}

/**
 * One week picker. The two are the same control with different labels, and neither
 * excludes the other's choice: a week onto itself is refused by the service with a
 * sentence, which is a better answer than a list that silently loses an option the
 * athlete was looking for.
 */
function WeekChooser({
	id,
	label,
	name,
	value,
	onChange,
	weeks,
	timezone,
}: {
	id: string
	label: string
	name: string
	value: string
	onChange: (value: string) => void
	weeks: CopyableWeek[]
	timezone: string
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Select value={value} onValueChange={(next) => onChange(String(next))}>
				<SelectTrigger id={id} className="w-full">
					<SelectValue>
						{(chosen) => {
							const week = weeks.find(
								(entry) => entry.weekKey === String(chosen ?? ''),
							)
							return week
								? weekLabel(week, timezone)
								: SESONG_COPY_LABELS.target
						}}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{weeks.map((week) => (
						<SelectItem key={week.weekKey} value={week.weekKey}>
							{weekLabel(week, timezone)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<input type="hidden" name={name} value={value} />
		</div>
	)
}

/**
 * What copying onto a filled week would do, said **before** it does it.
 *
 * Two counts and they are not the same kind of thing. `replacing` is sessions that
 * would be deleted — an edit the athlete made to that week is in there, which is
 * exactly why this panel exists. `keeping` is sessions the copy will not touch under
 * any circumstances, because they were trained. Saying both is what stops "this
 * replaces your week" from reading as a threat to work already done.
 */
function ConfirmReplace({
	pending,
	outlineId,
	weeks,
	timezone,
}: {
	pending: PendingCopy
	outlineId: string
	weeks: CopyableWeek[]
	timezone: string
}) {
	const byKey = new Map(weeks.map((week) => [week.weekKey, week]))
	const source = byKey.get(pending.sourceWeekKey)
	const target = byKey.get(pending.targetWeekKey)
	const { replacing, keeping } = pending.conflict

	return (
		<Card>
			<CardHeader className="gap-1">
				<CardTitle className="text-callout font-semibold">
					{SESONG_COPY_LABELS.filled(isoWeekNumber(pending.targetWeekKey))}
				</CardTitle>
				<p className="text-muted-foreground text-footnote">
					{SESONG_COPY_LABELS.nothingWritten}
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-footnote">
					{replacing === 0
						? SESONG_COPY_LABELS.noneReplaced
						: SESONG_COPY_LABELS.replacing(
								replacing,
								source
									? SESONG_COPY_LABELS.week(
											isoWeekNumber(source.weekKey),
										).toLowerCase()
									: null,
							)}
					{keeping > 0 ? SESONG_COPY_LABELS.keeping(keeping) : ''}
				</p>
				{target ? (
					<p className="text-muted-foreground text-footnote">
						{weekLabel(target, timezone)}
					</p>
				) : null}

				{/* The first submit replayed, plus the yes. */}
				<Form method="POST" className="flex flex-col gap-2 sm:flex-row">
					<input type="hidden" name="intent" value="copy-week" />
					<input type="hidden" name="outlineId" value={outlineId} />
					<input
						type="hidden"
						name="sourceWeekKey"
						value={pending.sourceWeekKey}
					/>
					<input
						type="hidden"
						name="targetWeekKey"
						value={pending.targetWeekKey}
					/>
					<input type="hidden" name="replace" value="on" />
					<Button
						type="submit"
						variant="destructive"
						className="w-full sm:w-auto"
					>
						{SESONG_COPY_LABELS.replace}
					</Button>
				</Form>
				<p className="text-muted-foreground text-footnote">
					{SESONG_COPY_LABELS.orEmpty}
				</p>
			</CardContent>
		</Card>
	)
}

/** `Uke 41 · 12. okt` — the ISO week, as every Sesong surface numbers it. */
function weekLabel(week: CopyableWeek, timezone: string): string {
	return SESONG_COPY_LABELS.weekOption(
		isoWeekNumber(week.weekKey),
		formatNbDayMonth(week.startsAt, timezone),
	)
}
