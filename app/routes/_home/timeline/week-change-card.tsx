/**
 * _Ukeskiftet_ on I dag (#505 stories 4–6, 42–55, ADR 0080): the card that
 * shows the week that went, the app's proposals for the coming one — each with
 * its reason and an Ok or a Nei takk — and "Gjør uka lettere −15 %".
 *
 * What the card says is the presenter's (`week-change.ts`); this module
 * draws it and posts the answers to `resources/week-change` with one fetcher
 * per control, so answering one proposal never waits on another.
 *
 * **Optimistic, but honest.** While a post is in flight its control already
 * reads as answered ("Du sa ok · Lagrer …"), but what the answer *did* is said
 * only once the server has said it: each reply carries the card as it now
 * stands, and the card keeps the newest it has seen. That is also what keeps
 * the card on screen after the last answer, when home itself no longer ships
 * it — the athlete reads what their last answer did, then closes the card.
 */
import {
	type FieldMetadata,
	getFormProps,
	getInputProps,
	useForm,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFetcher } from 'react-router'
import { SelectField } from '#app/components/forms.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { roundFactorLabel, WEEK_CHANGE_LABELS } from '#app/utils/labels.ts'
import { type WeekChangeData } from '#app/utils/load/week-change-card.server.ts'
import { ProposalAnswerFormSchema } from '#app/utils/load/week-change-schema.ts'
import { cn } from '#app/utils/misc.tsx'
import { type LedgerSession } from '#app/utils/training.server.ts'
import { type action as weekChangeAction } from '../../resources/week-change.tsx'
import { type TimelineWeek } from './presenter.ts'
import { TrackLine } from './stream.tsx'
import {
	buildWeekChangeCard,
	easedLine,
	type WeekChangeEase,
	type WeekChangeProposalView,
	type WeekChangeReview,
} from './week-change.ts'

const ACTION = '/resources/week-change'

type OnCard = (next: WeekChangeData | null | undefined) => void

export function WeekChangeCard({
	data,
	weeks,
	ledger,
	now,
	timezone,
}: {
	/** Home's card: present while some proposal waits for an answer. */
	data: WeekChangeData | null
	weeks: readonly TimelineWeek[]
	ledger: readonly LedgerSession[]
	now: Date
	timezone: string
}) {
	// The newest card seen, from home or from a reply. Home's wins when it
	// arrives (it is the revalidation after the reply); a null from home after
	// the last answer leaves the reply's card standing.
	const [held, setHeld] = useState(data)
	useEffect(() => {
		if (data) setHeld(data)
	}, [data])
	const onCard = useCallback<OnCard>((next) => {
		if (next) setHeld(next)
	}, [])
	const [closed, setClosed] = useState(false)

	const card = useMemo(
		() => buildWeekChangeCard({ data: held, weeks, ledger, now, timezone }),
		[held, weeks, ledger, now, timezone],
	)
	if (!card || closed) return null

	return (
		<section
			data-week-change
			data-week-change-open={card.open}
			aria-labelledby="week-change-heading"
			className="border-hairline-edge bg-card mx-[14px] my-3 flex flex-col gap-4 rounded-[14px] border px-4 py-4"
		>
			<header className="flex flex-col gap-1">
				<h2
					id="week-change-heading"
					className="text-primary text-[11.5px]/[1.2] font-bold tracking-[0.04em] uppercase"
				>
					{WEEK_CHANGE_LABELS.heading}
				</h2>
				<p className="text-foreground text-[13.5px]/[1.4] [text-wrap:pretty]">
					{card.summary}
				</p>
			</header>

			<Review review={card.review} />

			<div className="flex flex-col gap-2">
				<h3 className="text-ink-dim text-[11px]/[1.2] font-bold tracking-[0.04em] uppercase">
					{WEEK_CHANGE_LABELS.proposals}
				</h3>
				<ul className="flex flex-col gap-3">
					{card.proposals.map((proposal) => (
						<li key={proposal.id}>
							<Proposal proposal={proposal} onCard={onCard} />
						</li>
					))}
				</ul>
			</div>

			<Ease ease={card.ease} onCard={onCard} />

			{card.open ? null : (
				<div className="border-hairline flex items-center justify-between gap-3 border-t pt-3">
					<p className="text-ink-dim text-[12px]/[1.35]">
						{WEEK_CHANGE_LABELS.allAnswered}
					</p>
					<button
						type="button"
						onClick={() => setClosed(true)}
						className="border-hairline-edge text-foreground hover:border-primary min-h-11 flex-none rounded-[10px] border px-4 text-[12.5px]/[1] font-semibold"
					>
						{WEEK_CHANGE_LABELS.close}
					</button>
				</div>
			)}
		</section>
	)
}

/** The week that went (#505 story 43): plan against done, missed and extra. */
function Review({ review }: { review: WeekChangeReview }) {
	return (
		<div data-week-change-review className="flex flex-col gap-2">
			<h3 className="flex items-baseline gap-2 text-[11px]/[1.2] font-bold tracking-[0.04em] uppercase">
				<span className="text-ink-dim">{WEEK_CHANGE_LABELS.weekThatWent}</span>
				<span className="text-ink-dimmer font-semibold tracking-normal normal-case">
					{review.rangeLabel
						? `${review.weekName} · ${review.rangeLabel}`
						: review.weekName}
				</span>
			</h3>
			{review.tracks.map((track) => (
				<TrackLine key={track.trackId} track={track} review />
			))}
			{review.loadLine ? (
				<p className="text-ink-dim text-[12px]/[1.3]">{review.loadLine}</p>
			) : null}
			{review.plannedCount === 0 && review.extras.length === 0 ? (
				<p className="text-ink-dimmer text-[12px]/[1.35]">
					{WEEK_CHANGE_LABELS.emptyWeek}
				</p>
			) : (
				<SessionList
					label={WEEK_CHANGE_LABELS.missed}
					sessions={review.missed}
					empty={
						review.plannedCount > 0
							? WEEK_CHANGE_LABELS.nothingMissed
							: undefined
					}
					marker="missed"
				/>
			)}
			{review.extras.length > 0 ? (
				<SessionList
					label={WEEK_CHANGE_LABELS.extras}
					sessions={review.extras}
					marker="extra"
				/>
			) : null}
		</div>
	)
}

function SessionList({
	label,
	sessions,
	empty,
	marker,
}: {
	label: string
	sessions: WeekChangeReview['missed']
	empty?: string
	marker: 'missed' | 'extra'
}) {
	if (sessions.length === 0) {
		return empty ? (
			<p className="text-ink-dimmer text-[12px]/[1.35]">{empty}</p>
		) : null
	}
	return (
		<p
			{...{ [`data-review-${marker}`]: '' }}
			className="text-[12px]/[1.45] [text-wrap:pretty]"
		>
			<span className="text-ink-dim font-semibold">{label}: </span>
			{sessions.map((session, index) => (
				<span key={session.id} className="text-foreground">
					{index > 0 ? ', ' : null}
					{session.title}
					<span className="text-ink-dimmer">{` (${session.dayLabel})`}</span>
				</span>
			))}
		</p>
	)
}

/** The reply's card, handed up once per reply. */
function useCardFromReply(
	fetcher: ReturnType<typeof useFetcher<typeof weekChangeAction>>,
	onCard: OnCard,
) {
	const reply = fetcher.data
	useEffect(() => {
		if (reply) onCard(reply.weekChange)
	}, [reply, onCard])
}

/** One proposal: what, why, whose — and Ok or Nei takk while it asks. */
function Proposal({
	proposal,
	onCard,
}: {
	proposal: WeekChangeProposalView
	onCard: OnCard
}) {
	const fetcher = useFetcher<typeof weekChangeAction>()
	useCardFromReply(fetcher, onCard)
	const [form, fields] = useForm({
		id: `proposal-${proposal.id}`,
		constraint: getZodConstraint(ProposalAnswerFormSchema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ProposalAnswerFormSchema })
		},
		defaultValue: {
			scope: 'this-time',
			factor: proposal.round ? String(proposal.round.factor) : undefined,
		},
	})

	// In flight: read as answered, but say nothing of what it did yet.
	const sent = fetcher.formData
	const pending =
		sent == null
			? null
			: sent.get('answer') === 'declined'
				? 'declined'
				: 'accepted'
	const refused =
		fetcher.state === 'idle' && fetcher.data && !fetcher.data.result.ok
	const asks = proposal.state === 'answerable' && pending == null

	return (
		<article
			data-proposal={proposal.id}
			data-proposal-kind={proposal.kind}
			data-proposal-state={pending ? 'saving' : proposal.state}
			className="border-hairline flex flex-col gap-2 rounded-[12px] border px-3 py-3"
		>
			<div className="flex flex-wrap items-start gap-x-2 gap-y-1">
				<h4 className="text-foreground min-w-0 flex-1 text-[14px]/[1.3] font-semibold [text-wrap:pretty]">
					{proposal.headline}
				</h4>
				{proposal.ownLabel ? (
					<span
						data-proposal-own
						className="border-hairline-edge text-ink-dim flex flex-none items-center gap-1 rounded-[6px] border px-[6px] text-[10.5px]/[1.6] font-semibold"
					>
						<Icon name="lock-closed" size="xs" />
						{proposal.ownLabel}
					</span>
				) : null}
				{proposal.addsLoad ? (
					<span className="border-hairline-edge text-ink-dim flex-none rounded-[6px] border px-[6px] text-[10.5px]/[1.6] font-semibold">
						{WEEK_CHANGE_LABELS.addsLoad}
					</span>
				) : null}
			</div>
			<p className="text-ink-dim text-[12.5px]/[1.45] [text-wrap:pretty]">
				{proposal.reason}
			</p>

			{asks ? (
				<>
					<fetcher.Form
						method="post"
						action={ACTION}
						{...getFormProps(form)}
						className="flex flex-col gap-2.5"
					>
						<input type="hidden" name="proposalId" value={proposal.id} />
						{proposal.round ? (
							<>
								<input type="hidden" name="intent" value="accept-round" />
								<RoundFactorSelect
									// The field coerces to a number on submit; the select
									// holds its string, as every form value is.
									meta={fields.factor as unknown as FieldMetadata<string>}
									round={proposal.round}
								/>
							</>
						) : (
							<input type="hidden" name="intent" value="answer" />
						)}
						{proposal.scope ? (
							<fieldset className="flex flex-col gap-1.5">
								<legend className="text-ink-dim mb-1.5 text-[11.5px]/[1.2] font-semibold">
									{WEEK_CHANGE_LABELS.scopeLegend}
								</legend>
								<div className="flex flex-wrap gap-2">
									{proposal.scope.options.map((option) => (
										<label
											key={option.value}
											className="border-hairline-edge has-[:checked]:border-primary has-[:checked]:bg-primary/8 has-[:focus-visible]:ring-ring flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-[12.5px]/[1.2] has-[:focus-visible]:ring-2"
										>
											<input
												{...getInputProps(fields.scope, {
													type: 'radio',
													value: option.value,
												})}
												id={`${fields.scope.id}-${option.value}`}
												className="accent-primary"
											/>
											{option.label}
										</label>
									))}
								</div>
							</fieldset>
						) : null}
						<div className="flex gap-2">
							<button
								type="submit"
								name={proposal.round ? undefined : 'answer'}
								value={proposal.round ? undefined : 'accepted'}
								data-answer="ok"
								className="bg-primary text-primary-foreground hover:bg-primary/85 min-h-11 flex-1 rounded-[10px] px-4 text-[13px]/[1] font-bold"
							>
								{WEEK_CHANGE_LABELS.ok}
							</button>
							<DeclineButton
								form={proposal.round ? `decline-${proposal.id}` : undefined}
							/>
						</div>
					</fetcher.Form>
					{/* A round's Nei takk is an answer, not a factor: its own form,
					    which the button beside Ok submits by its `form` attribute. */}
					{proposal.round ? (
						<fetcher.Form
							id={`decline-${proposal.id}`}
							method="post"
							action={ACTION}
							hidden
						>
							<input type="hidden" name="intent" value="answer" />
							<input type="hidden" name="proposalId" value={proposal.id} />
						</fetcher.Form>
					) : null}
				</>
			) : (
				<Answered proposal={proposal} pending={pending} />
			)}
			{refused ? (
				<p role="alert" className="text-warning text-[12px]/[1.35]">
					{WEEK_CHANGE_LABELS.failed}
				</p>
			) : null}
		</article>
	)
}

function DeclineButton({ form }: { form?: string }) {
	return (
		<button
			type="submit"
			form={form}
			name="answer"
			value="declined"
			data-answer="no"
			className="border-hairline-edge text-foreground hover:border-primary min-h-11 flex-1 rounded-[10px] border px-4 text-[13px]/[1] font-semibold"
		>
			{WEEK_CHANGE_LABELS.no}
		</button>
	)
}

/**
 * The round's volume, in five-percent steps within the bounds the server
 * holds: the shared select (ui-conventions §2.4), bound to the form's field.
 */
function RoundFactorSelect({
	meta,
	round,
}: {
	meta: FieldMetadata<string>
	round: NonNullable<WeekChangeProposalView['round']>
}) {
	const steps = Math.round((round.max - round.min) / round.step)
	const items = Array.from({ length: steps + 1 }, (_, index) => {
		const factor = Math.round((round.min + index * round.step) * 100) / 100
		return { value: String(factor), label: roundFactorLabel(factor) }
	})
	return (
		<SelectField
			meta={meta}
			labelProps={{
				children: WEEK_CHANGE_LABELS.factorLegend,
				className: 'text-ink-dim text-[11.5px]/[1.2] font-semibold',
			}}
			items={items}
			triggerClassName="tabular-nums"
		/>
	)
}

/** What an answered (or silenced) proposal did, or that it is on its way. */
function Answered({
	proposal,
	pending,
}: {
	proposal: WeekChangeProposalView
	pending: 'accepted' | 'declined' | null
}) {
	const label = pending
		? `${pending === 'accepted' ? WEEK_CHANGE_LABELS.answeredOk : WEEK_CHANGE_LABELS.answeredNo} · ${WEEK_CHANGE_LABELS.saving}`
		: proposal.stateLabel
	return (
		<div className="flex flex-col gap-1" aria-live="polite">
			<span
				className={cn(
					'flex items-center gap-1.5 text-[12px]/[1.3] font-semibold',
					proposal.state === 'declined' && !pending
						? 'text-ink-dim'
						: 'text-primary',
				)}
			>
				{pending ? null : <Icon name="check" size="xs" />}
				{label}
			</span>
			{!pending && proposal.confirmation ? (
				<p
					data-proposal-confirmation
					className="text-foreground text-[12.5px]/[1.45] [text-wrap:pretty]"
				>
					{proposal.confirmation}
				</p>
			) : null}
		</div>
	)
}

/** "Gjør uka lettere −15 %" (#505 story 51): once per week, before → after. */
function Ease({ ease, onCard }: { ease: WeekChangeEase; onCard: OnCard }) {
	const fetcher = useFetcher<typeof weekChangeAction>()
	useCardFromReply(fetcher, onCard)
	const reply = fetcher.data
	const result =
		reply &&
		reply.intent === 'ease' &&
		reply.result.ok &&
		'before' in reply.result
			? reply.result
			: null
	const saving = fetcher.state !== 'idle'
	const done = ease.state === 'done' || result != null

	return (
		<div
			data-week-change-ease={done ? 'done' : saving ? 'saving' : 'offered'}
			className="border-hairline flex flex-col gap-2 border-t pt-3"
		>
			{done ? (
				<div className="flex flex-col gap-1" aria-live="polite">
					<span className="text-primary flex items-center gap-1.5 text-[12px]/[1.3] font-semibold">
						<Icon name="check" size="xs" />
						{WEEK_CHANGE_LABELS.eased}
					</span>
					{result ? (
						<p
							data-ease-result
							className="text-foreground text-[12.5px]/[1.45] tabular-nums"
						>
							{easedLine(result.before, result.after, ease.currency)}
						</p>
					) : null}
				</div>
			) : (
				<fetcher.Form
					method="post"
					action={ACTION}
					className="flex flex-col gap-2"
				>
					<input type="hidden" name="intent" value="ease" />
					<input type="hidden" name="weekKey" value={ease.weekKey} />
					<button
						type="submit"
						disabled={saving}
						data-ease-action
						className="border-hairline-edge text-foreground hover:border-primary min-h-11 rounded-[10px] border px-4 text-[13px]/[1] font-semibold disabled:opacity-60"
					>
						{saving ? WEEK_CHANGE_LABELS.saving : WEEK_CHANGE_LABELS.ease}
					</button>
					<p className="text-ink-dimmer text-[11.5px]/[1.4] [text-wrap:pretty]">
						{ease.plannedLabel
							? `${ease.plannedLabel}. ${WEEK_CHANGE_LABELS.easeNote}`
							: WEEK_CHANGE_LABELS.easeNote}
					</p>
				</fetcher.Form>
			)}
		</div>
	)
}
