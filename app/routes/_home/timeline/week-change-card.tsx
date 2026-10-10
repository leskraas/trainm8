/**
 * _Ukeskiftet_ on I dag (#505 stories 4–6, 42–55, ADR 0080): the card that
 * shows the week that went, the app's proposals for the coming one — each with
 * its reason and an Ok or a Nei takk — and "Gjør uka lettere −15 %".
 *
 * What the card says is the presenter's (`week-change.ts`); this module draws
 * it and posts the answers to `resources/week-change`, each control a conform
 * form on the shared schema (`week-change-schema.ts`) with its own fetcher, so
 * answering one proposal never waits on another, and a refusal comes back as
 * that form's error.
 *
 * **Optimistic, but honest.** While a post is in flight its control already
 * reads as answered ("Du sa ok · Lagrer …"), but what the answer *did* is said
 * only once the server has said it: each reply carries the card as it now
 * stands, and {@link useWeekChange} keeps the newest it has seen. That is also
 * what keeps the card on screen after the last answer, when home itself no
 * longer ships it — the athlete reads what their last answer did, then closes
 * the card.
 */
import {
	getFormProps,
	getInputProps,
	useForm,
	type SubmissionResult,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { useCallback, useEffect, useState } from 'react'
import { useFetcher } from 'react-router'
import { ErrorList, SelectField } from '#app/components/forms.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { type action as weekChangeAction } from '#app/routes/resources/week-change.tsx'
import {
	roundFactorLabel,
	TOP_LINE_LABELS,
	WEEK_CHANGE_LABELS,
} from '#app/utils/labels.ts'
import { type WeekChangeData } from '#app/utils/load/week-change-card.ts'
import {
	WEEK_CHANGE_ACTION,
	type WeekChangeAction,
	WeekChangeActionSchema,
} from '#app/utils/load/week-change-schema.ts'
import { cn } from '#app/utils/misc.tsx'
import { TrackLine } from './stream.tsx'
import {
	roundVolumeLine,
	type WeekChangeCard as WeekChangeCardView,
	type WeekChangeEase,
	type WeekChangeProposalView,
	type WeekChangeReview,
} from './week-change.ts'

type OnCard = (next: WeekChangeData | null | undefined) => void

/**
 * The newest card seen, from home or from a reply. Home's wins when it
 * arrives (it is the revalidation after the reply); a null from home after
 * the last answer leaves the reply's card standing.
 */
export function useWeekChange(data: WeekChangeData | null) {
	const [held, setHeld] = useState(data)
	useEffect(() => {
		if (data) setHeld(data)
	}, [data])
	const onCard = useCallback<OnCard>((next) => {
		if (next) setHeld(next)
	}, [])
	return { held, onCard }
}

/** The card's own anchor, for the badge on I dag's top line that leads to it. */
export const WEEK_CHANGE_ATTR = 'data-week-change'

/**
 * Bring the card's first open question into view: the proposal still asking,
 * centred, so its Ok sits on screen under the sticky week header. A jump, not
 * a glide (ADR 0086): the list's `scroll-behavior: smooth` is for the
 * reader's own keyboard, and every write the app makes is instant.
 */
export function goToWeekChange() {
	const card = document.querySelector(`[${WEEK_CHANGE_ATTR}]`)
	const first =
		card?.querySelector('[data-proposal-state="answerable"]') ?? card
	first?.scrollIntoView({ block: 'center', behavior: 'instant' })
}

/**
 * Ukeskiftet's way in from the top of I dag (#505 story 42, ADR 0086): a small
 * badge on the top line — `2 forslag` — that jumps to the card under today's
 * row. It used to be a line of its own above the hero, a whole row of the
 * phone's height spent on every visit while a proposal waited; on the top
 * line it costs no row, and its name still says the whole sentence.
 */
export function WeekChangeBadge({ count }: { count: number }) {
	return (
		<button
			type="button"
			data-week-change-waiting
			onClick={goToWeekChange}
			aria-label={TOP_LINE_LABELS.weekChangeName(count)}
			// The tint is 6 % in light: at 10 % the green caption on it fell to
			// 4.3:1, under AA for 12px text.
			className="bg-primary/6 dark:bg-primary/12 text-primary text-caption pressable relative flex h-7 flex-none items-center gap-1 rounded-full px-2.5 font-semibold whitespace-nowrap tabular-nums after:absolute after:inset-x-0 after:-inset-y-2"
		>
			<span aria-hidden className="bg-primary size-1.5 rounded-full" />
			{/* Under 360px the word gives way and the count stays (`● 1`), so the
			    race's name beside it has room to stay whole; the button's name
			    still says the whole sentence. */}
			{count}
			<span className="max-[359px]:hidden">
				{` ${TOP_LINE_LABELS.weekChangeWord}`}
			</span>
		</button>
	)
}

export function WeekChangeCard({
	card,
	onCard,
}: {
	card: WeekChangeCardView | null
	onCard: OnCard
}) {
	const [closed, setClosed] = useState(false)
	if (!card || closed) return null

	return (
		<section
			{...{ [WEEK_CHANGE_ATTR]: '' }}
			data-week-change-open={card.open}
			aria-labelledby="week-change-heading"
			className="border-border bg-card mx-4 my-3 flex flex-col gap-4 rounded-[14px] border px-4 py-4"
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
				<h3 className="text-muted-foreground text-[11px]/[1.2] font-bold tracking-[0.04em] uppercase">
					{card.proposalsHeading}
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
				<div className="border-border/70 flex items-center justify-between gap-3 border-t pt-3">
					<p className="text-muted-foreground text-[12px]/[1.35]">
						{WEEK_CHANGE_LABELS.allAnswered}
					</p>
					<button
						type="button"
						onClick={() => setClosed(true)}
						className="border-border text-foreground hover:border-primary min-h-11 flex-none rounded-[10px] border px-4 text-[12.5px]/[1] font-semibold"
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
				<span className="text-muted-foreground">
					{WEEK_CHANGE_LABELS.weekThatWent}
				</span>
				<span className="text-muted-foreground font-semibold tracking-normal normal-case">
					{review.rangeLabel
						? `${review.weekName} · ${review.rangeLabel}`
						: review.weekName}
				</span>
			</h3>
			{review.tracks.map((track) => (
				<TrackLine key={track.trackId} track={track} review />
			))}
			{review.loadLine ? (
				<p className="text-muted-foreground text-[12px]/[1.3]">
					{review.loadLine}
				</p>
			) : null}
			{review.plannedCount === 0 && review.extras.length === 0 ? (
				<p className="text-muted-foreground text-[12px]/[1.35]">
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
			<p className="text-muted-foreground text-[12px]/[1.35]">{empty}</p>
		) : null
	}
	return (
		<p
			{...{ [`data-review-${marker}`]: '' }}
			className="text-[12px]/[1.45] [text-wrap:pretty]"
		>
			<span className="text-muted-foreground font-semibold">{label}: </span>
			{sessions.map((session, index) => (
				<span key={session.id} className="text-foreground">
					{index > 0 ? ', ' : null}
					{session.title}
					<span className="text-muted-foreground">{` (${session.dayLabel})`}</span>
				</span>
			))}
		</p>
	)
}

type WeekChangeFetcher = ReturnType<typeof useFetcher<typeof weekChangeAction>>

/** The reply's card, handed up once per reply. */
function useCardFromReply(fetcher: WeekChangeFetcher, onCard: OnCard) {
	const reply = fetcher.data
	useEffect(() => {
		if (reply) onCard(reply.weekChange)
	}, [reply, onCard])
}

/** One conform form on the shared schema, fed the fetcher's last reply. */
function useWeekChangeForm(
	id: string,
	fetcher: WeekChangeFetcher,
	defaultValue: Partial<Record<string, string>>,
) {
	return useForm<WeekChangeAction>({
		id,
		constraint: getZodConstraint(WeekChangeActionSchema),
		lastResult: fetcher.data?.submission as
			| SubmissionResult<string[]>
			| undefined,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: WeekChangeActionSchema })
		},
		defaultValue,
	})
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
	const round = proposal.round
	const [form, fields] = useWeekChangeForm(`proposal-${proposal.id}`, fetcher, {
		intent: round ? 'accept-round' : 'answer',
		proposalId: proposal.id,
		scope: proposal.scope ? 'this-time' : undefined,
		factor: round ? String(round.factor) : undefined,
	})
	// A round's Nei takk is an answer, not a factor: a form of its own.
	const [declineForm, declineFields] = useWeekChangeForm(
		`decline-${proposal.id}`,
		fetcher,
		{ intent: 'answer', proposalId: proposal.id },
	)

	// In flight: read as answered, but say nothing of what it did yet.
	const sent = fetcher.formData
	const pending =
		sent == null
			? null
			: sent.get('answer') === 'declined'
				? 'declined'
				: 'accepted'
	const asks = proposal.state === 'answerable' && pending == null
	const factor = Number(fields.factor.value ?? round?.factor ?? 1)

	return (
		<article
			data-proposal={proposal.id}
			data-proposal-kind={proposal.kind}
			data-proposal-state={pending ? 'saving' : proposal.state}
			aria-label={proposal.headline}
			className="border-border/70 flex flex-col gap-2 rounded-[12px] border px-3 py-3"
		>
			<div className="flex flex-wrap items-start gap-x-2 gap-y-1">
				<h4 className="text-foreground min-w-0 flex-1 text-[14px]/[1.3] font-semibold [text-wrap:pretty]">
					{proposal.headline}
				</h4>
				{proposal.ownLabel ? (
					<span className="border-border text-muted-foreground flex flex-none items-center gap-1 rounded-[6px] border px-[6px] text-[10.5px]/[1.6] font-semibold">
						<Icon name="lock-closed" size="xs" />
						{proposal.ownLabel}
					</span>
				) : null}
				{proposal.addsLoad ? (
					<span className="border-border text-muted-foreground flex-none rounded-[6px] border px-[6px] text-[10.5px]/[1.6] font-semibold">
						{WEEK_CHANGE_LABELS.addsLoad}
					</span>
				) : null}
			</div>
			<p className="text-muted-foreground text-[12.5px]/[1.45] [text-wrap:pretty]">
				{proposal.reason}
			</p>

			{asks ? (
				<>
					<fetcher.Form
						method="post"
						action={WEEK_CHANGE_ACTION}
						{...getFormProps(form)}
						className="flex flex-col gap-2.5"
					>
						<input {...getInputProps(fields.intent, { type: 'hidden' })} />
						<input {...getInputProps(fields.proposalId, { type: 'hidden' })} />
						{round ? (
							<div className="flex flex-col gap-1">
								<SelectField
									meta={fields.factor}
									labelProps={{
										children: WEEK_CHANGE_LABELS.factorLegend,
										className:
											'text-muted-foreground text-[11.5px]/[1.2] font-semibold',
									}}
									items={roundFactorItems(round)}
									triggerClassName="tabular-nums"
								/>
								{round.peak ? (
									<p
										aria-live="polite"
										className="text-muted-foreground text-[12px]/[1.35] tabular-nums"
									>
										{roundVolumeLine(round.peak, factor)}
									</p>
								) : null}
							</div>
						) : null}
						{proposal.scope ? (
							<fieldset className="flex flex-col gap-1.5">
								<legend className="text-muted-foreground mb-1.5 text-[11.5px]/[1.2] font-semibold">
									{WEEK_CHANGE_LABELS.scopeLegend}
								</legend>
								<div className="flex flex-wrap gap-2">
									{proposal.scope.options.map((option) => (
										<label
											key={option.value}
											className="border-border has-[:checked]:border-primary has-[:checked]:bg-primary/8 has-[:focus-visible]:ring-ring flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-[12.5px]/[1.2] has-[:focus-visible]:ring-2"
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
								name={round ? undefined : 'answer'}
								value={round ? undefined : 'accepted'}
								className="bg-primary text-primary-foreground hover:bg-primary/85 min-h-11 flex-1 rounded-[10px] px-4 text-[13px]/[1] font-bold"
							>
								{WEEK_CHANGE_LABELS.ok}
							</button>
							<button
								type="submit"
								form={round ? declineForm.id : undefined}
								name="answer"
								value="declined"
								className="border-border text-foreground hover:border-primary min-h-11 flex-1 rounded-[10px] border px-4 text-[13px]/[1] font-semibold"
							>
								{WEEK_CHANGE_LABELS.no}
							</button>
						</div>
						<ErrorList id={form.errorId} errors={form.errors} />
					</fetcher.Form>
					{round ? (
						<fetcher.Form
							method="post"
							action={WEEK_CHANGE_ACTION}
							{...getFormProps(declineForm)}
							hidden
						>
							<input
								{...getInputProps(declineFields.intent, { type: 'hidden' })}
							/>
							<input
								{...getInputProps(declineFields.proposalId, {
									type: 'hidden',
								})}
							/>
						</fetcher.Form>
					) : null}
				</>
			) : (
				<>
					<Answered proposal={proposal} pending={pending} />
					<ErrorList errors={form.errors ?? declineForm.errors} />
				</>
			)}
		</article>
	)
}

/** The factor in five-percent steps, within the bounds the server holds. */
function roundFactorItems(round: NonNullable<WeekChangeProposalView['round']>) {
	const steps = Math.round((round.max - round.min) / round.step)
	return Array.from({ length: steps + 1 }, (_, index) => {
		const factor = Math.round((round.min + index * round.step) * 100) / 100
		return { value: String(factor), label: roundFactorLabel(factor) }
	})
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
	const quiet =
		!pending && (proposal.state === 'declined' || proposal.state === 'too-late')
	return (
		<div className="flex flex-col gap-1" aria-live="polite">
			<span
				className={cn(
					'flex items-center gap-1.5 text-[12px]/[1.3] font-semibold',
					quiet ? 'text-muted-foreground' : 'text-primary',
				)}
			>
				{pending || proposal.state === 'too-late' ? null : (
					<Icon name="check" size="xs" />
				)}
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
	const [form, fields] = useWeekChangeForm(`ease-${ease.weekKey}`, fetcher, {
		intent: 'ease',
		weekKey: ease.weekKey,
	})
	const saving = fetcher.state !== 'idle'

	return (
		<div
			data-week-change-ease={
				ease.state === 'done' ? 'done' : saving ? 'saving' : 'offered'
			}
			className="border-border/70 flex flex-col gap-2 border-t pt-3"
		>
			{ease.state === 'done' ? (
				<div className="flex flex-col gap-1" aria-live="polite">
					<span className="text-primary flex items-center gap-1.5 text-[12px]/[1.3] font-semibold">
						<Icon name="check" size="xs" />
						{WEEK_CHANGE_LABELS.eased}
					</span>
					{ease.resultLabel ? (
						<p
							data-ease-result
							className="text-foreground text-[12.5px]/[1.45] tabular-nums"
						>
							{ease.resultLabel}
						</p>
					) : null}
				</div>
			) : (
				<fetcher.Form
					method="post"
					action={WEEK_CHANGE_ACTION}
					{...getFormProps(form)}
					className="flex flex-col gap-2"
				>
					<input {...getInputProps(fields.intent, { type: 'hidden' })} />
					<input {...getInputProps(fields.weekKey, { type: 'hidden' })} />
					<button
						type="submit"
						disabled={saving}
						className="border-border text-foreground hover:border-primary min-h-11 rounded-[10px] border px-4 text-[13px]/[1] font-semibold disabled:opacity-60"
					>
						{saving ? WEEK_CHANGE_LABELS.saving : WEEK_CHANGE_LABELS.ease}
					</button>
					<p className="text-muted-foreground text-[11.5px]/[1.4] [text-wrap:pretty]">
						{ease.plannedLabel
							? `${ease.plannedLabel}. ${WEEK_CHANGE_LABELS.easeNote}`
							: WEEK_CHANGE_LABELS.easeNote}
					</p>
					<ErrorList id={form.errorId} errors={form.errors} />
				</fetcher.Form>
			)}
		</div>
	)
}
