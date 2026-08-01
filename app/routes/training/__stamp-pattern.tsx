/**
 * **Stamping** a Week Pattern into the calendar, and the two soft readings that
 * travel with it (#412).
 *
 * The payoff of the whole planning surface: the athlete picks a pattern, ticks the
 * weeks they want it in, and gets real **Workout Sessions** they can edit like any
 * other. Split out of `plan.tsx` the way `__week-pattern-editor.tsx` is — the route
 * owns the loader, the action and the wording of every refusal; this module owns
 * the controls.
 *
 * Four rules run through it.
 *
 * **Stamped sessions are ordinary sessions.** The copy says so plainly, because
 * everything the athlete already knows about editing a session still works and
 * nothing links back to the pattern. There is no "pattern session" badge here and
 * there is nothing to unlink.
 *
 * **Re-stamping says what it would replace before it does it.** A week that
 * already holds sessions comes back as a confirmation panel naming the counts —
 * how many would be rewritten, how many are left exactly alone because they were
 * trained — and only the second, explicit tap writes anything.
 *
 * **The mix-disagreement notice warns and never corrects.** A stamped week whose
 * sessions disagree with its segment's **Quality Session Mix** is said softly and
 * once: the mix is authored intent, the sessions are the plan's final truth, and
 * deliberately swapping a VO₂ max session for an easy run in a tired week is a
 * valid plan rather than an error (ADR 0042 §9).
 *
 * **How many weeks are stamped is the athlete's choice.** Every week of the plan is
 * offered, none is preselected for them, and no copy anywhere suggests a right
 * number — the guideline figures above read the guideline layer regardless of how
 * far materialization reaches (ADR 0040 §1).
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
import { DISCIPLINE_LABELS, QUALITY_ZONE_LABELS } from '#app/utils/labels.ts'
import { type StampConflict } from '#app/utils/plan-outline/stamp.server.ts'
import { type MixDisagreement } from '#app/utils/plan-outline/stamp.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'

/** A pattern this section can stamp — its name, and whether it has any days at all. */
export type StampablePattern = {
	id: string
	name: string
	days: ReadonlyArray<unknown>
}

/** One week of the plan, as the chooser lists it. */
export type StampableWeek = {
	weekKey: string
	weekInPlan: number
	/** The instant the week's Monday opens on, for the display layer to format. */
	startsAt: Date
}

/**
 * A stamp the service asked the athlete to confirm: which pattern, which weeks,
 * and what it found in them. Replayed verbatim by the confirm form, so the second
 * submit is the first one plus a yes rather than a second, re-collected request.
 */
export type PendingStamp = {
	patternId: string
	weekKeys: string[]
	conflicts: StampConflict[]
}

/** A stamped week disagreeing with its segment's Quality Session Mix. */
export type StampMixNotice = {
	weekKey: string
	weekInPlan: number
	discipline: Discipline
	disagreements: MixDisagreement[]
}

export function StampSection({
	patterns,
	weeks,
	timezone,
	pending,
	mixNotices,
}: {
	patterns: StampablePattern[]
	weeks: StampableWeek[]
	timezone: string
	/** The confirmation the last submit came back asking for, or null. */
	pending: PendingStamp | null
	mixNotices: StampMixNotice[]
}) {
	const stampable = patterns.filter((pattern) => pattern.days.length > 0)

	return (
		<section aria-labelledby="stamp-pattern" className="space-y-4">
			<h2 id="stamp-pattern" className="text-lg font-semibold">
				Put it on your calendar
			</h2>
			<p className="text-muted-foreground text-sm">
				Stamping writes <strong>real sessions</strong> into the weeks you pick.
				They are ordinary sessions from that moment on — edit one, move it,
				delete it, log it. Nothing stays linked to the pattern, so changing a
				Wednesday in one week never touches the other weeks.
			</p>
			<p className="text-muted-foreground text-sm">
				Stamp as few or as many weeks as you like. The figures above are derived
				from your anchor and your ramps and do not change with how far ahead you
				fill in.
			</p>

			{stampable.length === 0 ? (
				<p className="text-sm">
					Add days to a pattern above, and you can stamp it from here.
				</p>
			) : pending ? (
				<ConfirmReplace
					pending={pending}
					patterns={stampable}
					weeks={weeks}
					timezone={timezone}
				/>
			) : (
				<StampForm
					patterns={stampable}
					weeks={weeks}
					timezone={timezone}
				/>
			)}

			{mixNotices.length > 0 ? <MixNotices notices={mixNotices} /> : null}
		</section>
	)
}

/** Which pattern, and which weeks. One submit, however many weeks are ticked. */
function StampForm({
	patterns,
	weeks,
	timezone,
}: {
	patterns: StampablePattern[]
	weeks: StampableWeek[]
	timezone: string
}) {
	const [patternId, setPatternId] = useState(patterns[0]!.id)

	return (
		<Form method="POST" className="space-y-4">
			<input type="hidden" name="intent" value="stamp-week-pattern" />

			{/* One pattern needs no chooser — it travels as the hidden field the
			    multi-pattern case also submits, so the action reads one shape. */}
			{patterns.length === 1 ? (
				<input type="hidden" name="patternId" value={patterns[0]!.id} />
			) : (
				<div className="space-y-2">
					<Label htmlFor="stamp-pattern-choice">Pattern</Label>
					<Select
						value={patternId}
						onValueChange={(value) => setPatternId(String(value))}
					>
						<SelectTrigger id="stamp-pattern-choice" className="w-full">
							<SelectValue>
								{(value) =>
									patterns.find((entry) => entry.id === String(value ?? ''))
										?.name ?? 'Pattern'
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{patterns.map((pattern) => (
								<SelectItem key={pattern.id} value={pattern.id}>
									{pattern.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<input type="hidden" name="patternId" value={patternId} />
				</div>
			)}

			<fieldset className="space-y-2">
				<legend className="text-sm font-medium">Weeks</legend>
				{/* Stacked at every width rather than a wrapping grid of chips: a week
				    reads as "Week 7 · 11 Feb", which is too long for a 390 px chip row and
				    would clip (UI conventions §2.5). */}
				<ul className="divide-border divide-y">
					{weeks.map((week) => (
						<li key={week.weekKey}>
							<label
								htmlFor={`stamp-${week.weekKey}`}
								className="flex cursor-pointer items-center gap-3 py-2 text-sm select-none"
							>
								<input
									type="checkbox"
									id={`stamp-${week.weekKey}`}
									name="weekKeys"
									value={week.weekKey}
									className="border-input text-primary size-4 rounded"
								/>
								<span className="font-medium">Week {week.weekInPlan}</span>
								<span className="text-muted-foreground">
									{formatDate(week.startsAt, timezone)}
								</span>
							</label>
						</li>
					))}
				</ul>
			</fieldset>

			<Button type="submit" className="w-full sm:w-auto">
				Stamp these weeks
			</Button>
		</Form>
	)
}

/**
 * What a re-stamp would replace, said **before** it replaces it.
 *
 * Two counts per week and they are not the same kind of thing. `replacing` is
 * sessions that would be deleted and written again — an edit the athlete made to a
 * stamped week is in there, which is exactly why this panel exists. `keeping` is
 * sessions the stamp will not touch under any circumstances, because they were
 * trained: completed, logged, or backed by a recording. Saying both is what stops
 * "this replaces your week" from reading as a threat to work already done.
 */
function ConfirmReplace({
	pending,
	patterns,
	weeks,
	timezone,
}: {
	pending: PendingStamp
	patterns: StampablePattern[]
	weeks: StampableWeek[]
	timezone: string
}) {
	const pattern = patterns.find((entry) => entry.id === pending.patternId)
	const byKey = new Map(weeks.map((week) => [week.weekKey, week]))
	const replacing = pending.conflicts.reduce(
		(total, week) => total + week.replacing,
		0,
	)
	const keeping = pending.conflicts.reduce(
		(total, week) => total + week.keeping,
		0,
	)

	return (
		<Card>
			<CardHeader className="gap-1">
				<CardTitle className="text-base">
					{pending.weekKeys.length === 1
						? 'That week already has sessions'
						: 'Some of those weeks already have sessions'}
				</CardTitle>
				<p className="text-muted-foreground text-sm">
					Nothing has been written yet.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<ul className="divide-border divide-y text-sm">
					{pending.conflicts.map((conflict) => {
						const week = byKey.get(conflict.weekKey)
						return (
							<li key={conflict.weekKey} className="py-2">
								<span className="font-medium">
									Week {conflict.weekInPlan}
								</span>{' '}
								<span className="text-muted-foreground">
									{week ? `· ${formatDate(week.startsAt, timezone)} ` : ''}·{' '}
									{sessionCount(conflict.replacing)} would be replaced
									{conflict.keeping > 0
										? `, ${sessionCount(conflict.keeping)} kept`
										: ''}
								</span>
							</li>
						)
					})}
				</ul>

				<p className="text-sm">
					{replacing === 0
						? 'Nothing in those weeks would be replaced.'
						: `${capitalise(sessionCount(replacing))} would be deleted and written again from ${pattern?.name ?? 'this pattern'}. Any edits you made to them go with them, and that cannot be undone.`}
					{keeping > 0
						? ` ${capitalise(sessionCount(keeping))} stay exactly as they are — you have already trained or logged them, so stamping never touches them.`
						: ''}
				</p>

				{/* The first submit replayed, plus the yes. Every field travels again, so
				    a confirmation is the same request the athlete already made rather than
				    a second one assembled from a stale page. */}
				<Form method="POST" className="flex flex-col gap-2 sm:flex-row">
					<input type="hidden" name="intent" value="stamp-week-pattern" />
					<input type="hidden" name="patternId" value={pending.patternId} />
					{pending.weekKeys.map((weekKey) => (
						<input
							key={weekKey}
							type="hidden"
							name="weekKeys"
							value={weekKey}
						/>
					))}
					<input type="hidden" name="replace" value="on" />
					<Button type="submit" variant="destructive" className="w-full sm:w-auto">
						Replace and stamp
					</Button>
				</Form>
				<p className="text-muted-foreground text-sm">
					Or untick those weeks above and stamp the rest.
				</p>
			</CardContent>
		</Card>
	)
}

/**
 * Where a stamped week's sessions disagree with the mix its segment authors.
 *
 * Advisory, in the shape the ramp guard and the availability notice take: it names
 * the two figures and stops. No copy here suggests a fix, because there is nothing
 * to fix — the mix says what the segment intends and the week says what the plan
 * now is, and both are the athlete's.
 */
function MixNotices({ notices }: { notices: StampMixNotice[] }) {
	return (
		<div className="space-y-2">
			<p className="text-sm font-medium">Weeks that differ from your mix</p>
			<ul className="space-y-2">
				{notices.map((notice) => (
					<li
						key={`${notice.weekKey}-${notice.discipline}`}
						className="text-muted-foreground text-sm"
					>
						<span className="text-foreground font-medium">
							Week {notice.weekInPlan}
						</span>{' '}
						· {DISCIPLINE_LABELS[notice.discipline].toLowerCase()} ·{' '}
						{notice.disagreements.map(disagreementText).join('; ')}.
					</li>
				))}
			</ul>
			<p className="text-muted-foreground text-sm">
				Your mix is what the block is <em>for</em>; the sessions are what your
				plan actually says. Swapping a hard session for an easy one in a tired
				week is a plan, not a mistake — nothing here has been changed.
			</p>
		</div>
	)
}

/** One zone's two figures, in the mix's own vocabulary. */
function disagreementText(disagreement: MixDisagreement): string {
	const label = QUALITY_ZONE_LABELS[disagreement.zone].toLowerCase()
	return `your mix asks for ${disagreement.authored} ${label} ${plural(disagreement.authored, 'session')}, the week holds ${disagreement.stamped}`
}

function sessionCount(count: number): string {
	return `${count} ${plural(count, 'session')}`
}

function plural(count: number, noun: string): string {
	return count === 1 ? noun : `${noun}s`
}

function capitalise(text: string): string {
	return text ? text[0]!.toUpperCase() + text.slice(1) : text
}
