/**
 * **Copying a week** onto another week (#415, ADR 0044 §6).
 *
 * The other way to fill a week, sitting under the stamp so the athlete reads the two
 * offers together. Split out of `plan.tsx` the way `__stamp-pattern.tsx` is — the
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
import { formatDate } from '#app/utils/format.ts'
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
				Copy a week you liked
			</h2>
			<p className="text-muted-foreground text-sm">
				Every session in the week you pick is duplicated onto the other
				week&rsquo;s matching days, at the same times. Each copy gets its{' '}
				<strong>own workout</strong>, so the two weeks are separate from the
				moment they exist — edit one and the other does not move.
			</p>
			<p className="text-muted-foreground text-sm">
				A week is copied <strong>exactly as you wrote it</strong>. It is not
				stretched to meet the target week&rsquo;s figure above — if that week
				asks for more, the list will show it the way it shows any week you set
				by hand.
			</p>

			{weeks.length < 2 ? (
				<p className="text-sm">
					Your plan has one week, so there is no other week to copy it onto.
				</p>
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
				label="Copy this week"
				name="sourceWeekKey"
				value={sourceWeekKey}
				onChange={setSourceWeekKey}
				weeks={weeks}
				timezone={timezone}
			/>
			<WeekChooser
				id="copy-week-target"
				label="Onto this week"
				name="targetWeekKey"
				value={targetWeekKey}
				onChange={setTargetWeekKey}
				weeks={weeks}
				timezone={timezone}
			/>

			<Button type="submit" className="w-full sm:w-auto">
				Copy the week
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
							return week ? weekLabel(week, timezone) : 'Week'
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
				<CardTitle className="text-base">
					Week {pending.conflict.weekInPlan} already has sessions
				</CardTitle>
				<p className="text-muted-foreground text-sm">
					Nothing has been written yet.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-sm">
					{replacing === 0
						? 'Nothing in that week would be replaced.'
						: `${capitalise(sessionCount(replacing))} would be deleted and written again from ${source ? `week ${source.weekInPlan}` : 'the week you picked'}. Any edits you made to them go with them, and that cannot be undone.`}
					{keeping > 0
						? ` ${capitalise(sessionCount(keeping))} stay exactly as they are — you have already trained or logged them, so copying never touches them.`
						: ''}
				</p>
				{target ? (
					<p className="text-muted-foreground text-sm">
						Week {target.weekInPlan} · {formatDate(target.startsAt, timezone)}
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
						Replace and copy
					</Button>
				</Form>
				<p className="text-muted-foreground text-sm">
					Or pick an empty week instead.
				</p>
			</CardContent>
		</Card>
	)
}

function weekLabel(week: CopyableWeek, timezone: string): string {
	return `Week ${week.weekInPlan} · ${formatDate(week.startsAt, timezone)}`
}

function sessionCount(count: number): string {
	return `${count} ${count === 1 ? 'session' : 'sessions'}`
}

function capitalise(text: string): string {
	return text ? text[0]!.toUpperCase() + text.slice(1) : text
}
