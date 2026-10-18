/**
 * The Autopilot Notice on I dag (UI _Neste uke er lagt ut_; #576, ADR 0100
 * §5): what the autopilot wrote at the close, one line each with its stored
 * reason, _Angre_ on every change and _Angre alt_ from two, and _Gjør uka
 * lettere −15 %_ under them. It sits between today's card and this week.
 *
 * It states; it never asks. What the lines say is `autopilot-notice.ts`'s;
 * this module draws them and posts each _Angre_ to `resources/autopilot` with
 * its own fetcher, so undoing one line never waits on another. The server's
 * sentence comes back with the reply and is said in a toast (Sonner, as every
 * write on I dag, ADR 0088); the page's loaders then revalidate, and the line
 * reads _Angret_ from the stored state, never from a guess.
 *
 * Motion is the system's and nothing new: the press (`pressable`) and the
 * toast. A line changing to _Angret_ swaps in place — it is the answer to the
 * tap the athlete just made, so it should land at once.
 *
 * Its lifecycle (#580): once the card has been on screen, it tells the server
 * so (`seen`), quietly and once; I dag lets it go on a later day once the week
 * it laid has begun. It leaves with a page load, never under the thumb, so it
 * needs no exit motion. _Se hele sesongen_ keeps every notice, read-only, at
 * its week (`AutopilotHistoryCard`).
 */
import { type RefObject, useEffect, useRef } from 'react'
import { useFetcher } from 'react-router'
import { toast } from 'sonner'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { type action as autopilotAction } from '#app/routes/resources/autopilot.tsx'
import { AUTOPILOT_NOTICE_LABELS as L } from '#app/utils/labels.ts'
import {
	type AutopilotNotice,
	type AutopilotNoticeLine,
} from '#app/utils/load/autopilot-notice.ts'
import { AUTOPILOT_ACTION } from '#app/utils/load/autopilot-schema.ts'
import { cn } from '#app/utils/misc.tsx'
import { type TimelineWeek } from './timeline/presenter.ts'
import { Ease } from './timeline/week-change-card.tsx'
import { buildEase } from './timeline/week-change.ts'

/** A card on the page's tone (the luma card, ADR 0085), as I dag's others. */
const CARD =
	'bg-card rounded-4xl shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10'

type AutopilotFetcher = ReturnType<typeof useFetcher<typeof autopilotAction>>

/**
 * Say the reply's sentence once, in a toast: a success as a success, a
 * refusal as an error. Keyed by `id`, so a re-render (or StrictMode's double
 * effect) updates the same toast instead of stacking a second.
 */
function useReplyToast(fetcher: AutopilotFetcher, id: string) {
	const said = useRef<unknown>(null)
	const reply = fetcher.data
	useEffect(() => {
		if (fetcher.state !== 'idle' || !reply || said.current === reply) return
		said.current = reply
		if (!reply.toast) return
		if (reply.ok) toast.success(reply.toast, { id })
		else toast.error(reply.toast, { id })
	}, [fetcher.state, reply, id])
}

/**
 * Tell the server, once, that the athlete has seen the notice: when at least
 * half of it has been on screen. A plain post rather than a fetcher, so
 * nothing on the page reloads for it; one that fails is tried on the next
 * visit.
 */
function useSeen(
	ref: RefObject<HTMLElement | null>,
	weekKey: string,
	seen: boolean,
) {
	const sent = useRef(seen)
	useEffect(() => {
		const node = ref.current
		if (sent.current || !node) return
		const tell = () => {
			if (sent.current) return
			sent.current = true
			const body = new FormData()
			body.set('intent', 'seen')
			body.set('weekKey', weekKey)
			void fetch(AUTOPILOT_ACTION, {
				method: 'POST',
				body,
				keepalive: true,
			}).catch(() => {
				sent.current = false
			})
		}
		if (typeof IntersectionObserver === 'undefined') {
			tell()
			return
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect()
					tell()
				}
			},
			{ threshold: 0.5 },
		)
		observer.observe(node)
		return () => observer.disconnect()
	}, [ref, weekKey])
}

export function AutopilotNoticeCard({
	notice,
	weeks,
}: {
	notice: AutopilotNotice
	weeks: readonly TimelineWeek[]
}) {
	const headingId = 'autopilot-notice'
	const ref = useRef<HTMLElement>(null)
	useSeen(ref, notice.closedWeekKey, notice.seen)
	const coming = weeks.find((week) => week.key === notice.comingWeekKey) ?? null
	const ease = buildEase(notice, coming)
	return (
		<section
			ref={ref}
			aria-labelledby={headingId}
			data-autopilot-notice={notice.closedWeekKey}
			data-begun={notice.begun || undefined}
			className={cn(CARD, 'flex min-w-0 flex-col gap-3 p-5')}
		>
			<h2 id={headingId} className="text-heading [text-wrap:balance]">
				{notice.heading}
			</h2>
			<ul className="divide-border/60 flex flex-col divide-y">
				{notice.lines.map((line) => (
					<NoticeLine key={line.proposalId} line={line} />
				))}
			</ul>
			<UnlaidLine text={notice.unlaidLine} />
			{notice.closedLine ? (
				<p
					data-autopilot-closed
					className="text-footnote text-muted-foreground [text-wrap:pretty]"
				>
					{notice.closedLine}
				</p>
			) : null}
			{notice.undoable >= 2 ? (
				<UndoAll weekKey={notice.closedWeekKey} count={notice.undoable} />
			) : null}
			{notice.showEase ? <Ease ease={ease} /> : null}
		</section>
	)
}

/**
 * A past notice at its week in _Se hele sesongen_ (#580): the lines and
 * reasons as they stand, and what was undone — read-only, since the way back
 * lives on I dag's notice and closes when the week begins.
 */
export function AutopilotHistoryCard({ notice }: { notice: AutopilotNotice }) {
	const headingId = `autopilot-history-${notice.closedWeekKey}`
	return (
		<section
			aria-labelledby={headingId}
			data-autopilot-history={notice.comingWeekKey}
			className="border-border bg-card mx-4 my-3 flex min-w-0 flex-col gap-2 rounded-[14px] border px-4 py-4"
		>
			<h3
				id={headingId}
				className="text-muted-foreground text-[11px]/[1.2] font-bold tracking-[0.04em] uppercase"
			>
				{L.historyHeading}
			</h3>
			<ul className="divide-border/60 flex flex-col divide-y">
				{notice.lines.map((line) => (
					<NoticeLine key={line.proposalId} line={line} readOnly />
				))}
			</ul>
			<UnlaidLine text={notice.unlaidLine} />
		</section>
	)
}

/** A week the close could not lay, said plainly with why (#580). */
function UnlaidLine({ text }: { text: string | null }) {
	if (!text) return null
	return (
		<p
			data-autopilot-unlaid
			className="text-callout text-foreground flex min-w-0 items-start gap-2 [text-wrap:pretty] [overflow-wrap:break-word]"
		>
			<Icon
				name="alert-triangle"
				size="sm"
				aria-hidden
				// On the first line, not centred on a sentence that wraps.
				className="text-muted-foreground mt-0.5 shrink-0 self-start"
			/>
			<span className="min-w-0">{text}</span>
		</p>
	)
}

function NoticeLine({
	line,
	readOnly = false,
}: {
	line: AutopilotNoticeLine
	readOnly?: boolean
}) {
	return (
		<li
			data-autopilot-line={line.kind}
			data-undo={line.undo ?? undefined}
			className="flex min-w-0 flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
		>
			{line.subject ? (
				<p className="text-footnote text-muted-foreground [overflow-wrap:anywhere]">
					{line.subject}
				</p>
			) : null}
			<p
				className={cn(
					'text-callout [text-wrap:pretty] [overflow-wrap:break-word]',
					line.undo === 'undone' ? 'text-muted-foreground' : 'text-foreground',
				)}
			>
				{line.text}
			</p>
			{line.undo === 'offered' && !readOnly ? (
				<UndoLine line={line} />
			) : line.undo === 'undone' ? (
				<p className="text-footnote text-muted-foreground flex items-center gap-1.5 font-medium">
					<Icon name="check" size="xs" />
					{L.undone}
				</p>
			) : null}
		</li>
	)
}

function UndoLine({ line }: { line: AutopilotNoticeLine }) {
	const fetcher = useFetcher<typeof autopilotAction>()
	useReplyToast(fetcher, `autopilot-undo-${line.proposalId}`)
	const busy = fetcher.state !== 'idle'
	return (
		<fetcher.Form method="post" action={AUTOPILOT_ACTION}>
			<input type="hidden" name="intent" value="undo" />
			<input type="hidden" name="proposalId" value={line.proposalId} />
			<button
				type="submit"
				data-autopilot-undo={line.proposalId}
				disabled={busy}
				aria-label={L.undoFor(line.subject ?? line.text)}
				className={cn(
					buttonVariants({ variant: 'outline' }),
					'pressable h-11 rounded-full px-5',
				)}
			>
				{busy ? L.undoing : L.undo}
			</button>
		</fetcher.Form>
	)
}

function UndoAll({ weekKey, count }: { weekKey: string; count: number }) {
	const fetcher = useFetcher<typeof autopilotAction>()
	useReplyToast(fetcher, `autopilot-undo-week-${weekKey}`)
	const busy = fetcher.state !== 'idle'
	return (
		<fetcher.Form method="post" action={AUTOPILOT_ACTION}>
			<input type="hidden" name="intent" value="undo-week" />
			<input type="hidden" name="weekKey" value={weekKey} />
			<button
				type="submit"
				data-autopilot-undo-all
				disabled={busy}
				aria-label={L.undoAllFor(count)}
				className={cn(
					buttonVariants({ variant: 'outline' }),
					'pressable h-12 w-full rounded-full text-base',
				)}
			>
				{busy ? L.undoing : L.undoAll}
			</button>
		</fetcher.Form>
	)
}
