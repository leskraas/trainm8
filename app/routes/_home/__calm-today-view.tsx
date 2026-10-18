/**
 * **I dag, calm** (spec #558 S4, ADR 0101 §3): the date and the plan's name,
 * today's session as one card with one large _Gjort_, this week as seven
 * rows, and _Se hele sesongen_ to the full Home Timeline. From `lg` the card
 * and the week sit side by side.
 *
 * Every write here is the full view's own, through the same provider: _Gjort_
 * lands with its toast and the card's _Angre_ (ADR 0088), and a free day
 * opens the same composer, in the same Drawer, with the same undo. What the
 * card and the rows say is `__calm-today.ts`, read off the same season the
 * full view renders, so the two cannot disagree.
 *
 * Under Autopilot the Autopilot Notice sits between the card and the week
 * (#576, ADR 0100 §5, `__autopilot-notice.tsx`).
 *
 * Motion is the system's and nothing new: presses (`pressable`), the Drawer,
 * the toast. A row that just landed is tinted while its _Angre_ stands. The
 * celebration on a first _Gjort_ and the morphs are #558 S10.
 */
import { useMemo } from 'react'
import { Link } from 'react-router'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { HOME_TIMELINE_HREF } from '#app/utils/app-tabs.ts'
import {
	CALM_TODAY_LABELS as L,
	HOME_TIMELINE_FULL_VIEW_LABELS,
	SESSION_COMPOSER_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { timelineWindow } from '#app/utils/timeline-window.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'
import { AutopilotNoticeCard } from './__autopilot-notice.tsx'
import {
	buildCalmToday,
	type CalmCard,
	type CalmDay,
	type CalmNext,
	type CalmSession,
	type CalmWeek,
} from './__calm-today.ts'
import { JusterChips } from './__juster-chips.tsx'
import {
	ComposerProvider,
	useComposer,
	useComposerLanding,
} from './timeline/composer-context.tsx'
import { ComposerDrawer } from './timeline/composer-drawer.tsx'
import { type HomeTimelineData } from './timeline/home-timeline.tsx'
import { MarkDoneAction } from './timeline/import-actions.tsx'
import { buildTimelineSeason, buildTodayRow } from './timeline/presenter.ts'
import { type TodayRowExtras } from './timeline/stream.tsx'
import { buildWeekChangeCard } from './timeline/week-change.ts'

/** Where the simple start begins (the First Run). */
const START_HREF = '/start'

/** A card on the page's tone (the luma card, ADR 0085). */
const CARD =
	'bg-card rounded-4xl shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10'

/** One mark per discipline, never text (design system: track hues). */
const TRACK_DOT: Record<string, string> = {
	run: 'bg-track-run',
	bike: 'bg-track-bike',
	swim: 'bg-track-swim',
	strength: 'bg-track-strength',
}

export function CalmToday({ data }: { data: HomeTimelineData }) {
	const {
		ledger,
		activePlan,
		current,
		tsbTrust,
		sustained,
		nudge,
		thresholds,
		weekChange = null,
		autopilotNotice = null,
		importConnected = false,
	} = data
	const now = useMemo(
		() => (data.now ? new Date(data.now) : new Date()),
		[data.now],
	)
	const timezone = useAthleteTimezone()
	const season = useMemo(
		() =>
			buildTimelineSeason({
				ledger,
				now,
				timezone,
				activePlan,
				importConnected,
			}),
		[activePlan, importConnected, ledger, now, timezone],
	)
	// Today's action as the full view says it: a lift's runner link, and what
	// a session's details show when the Drawer opens on it.
	const today = useMemo<TodayRowExtras>(
		() =>
			buildTodayRow({
				ledger,
				now,
				timezone,
				thresholds,
				current,
				trust: tsbTrust,
				sustained,
				nudge,
			}),
		[current, ledger, now, nudge, sustained, thresholds, timezone, tsbTrust],
	)
	const view = useMemo(
		() =>
			buildCalmToday({
				season,
				ledger,
				now,
				timezone,
				activePlan,
				strengthCta: today.cta,
			}),
		[activePlan, ledger, now, season, timezone, today.cta],
	)
	const writable = useMemo(
		() => timelineWindow({ now, timezone, plan: activePlan }),
		[activePlan, now, timezone],
	)
	const waiting =
		buildWeekChangeCard({
			data: weekChange,
			weeks: season.weeks,
			ledger,
			activePlan,
			now,
			timezone,
		})?.waitingCount ?? 0
	// The sessions the card speaks for: their _Gjort_ and _Angre_ live there,
	// so the week's rows do not offer them twice.
	const onCard = useMemo(
		() =>
			new Set(
				view.card.kind === 'session'
					? [view.card.session.id]
					: view.card.kind === 'done'
						? view.card.done.map((one) => one.id)
						: [],
			),
		[view.card],
	)

	return (
		<ComposerProvider
			prefill={data.stampDiscipline}
			thresholds={thresholds}
			todayKey={view.todayKey}
			minDayKey={writable.firstDayKey}
			// One container on every screen: the Drawer. The default view has no
			// day pane to write in; the full view keeps its own.
			container="drawer"
		>
			<main
				data-calm-today
				aria-label={L.region}
				className="mx-auto w-full max-w-xl px-4 pt-2 pb-8 lg:max-w-5xl lg:px-6 lg:pt-6"
			>
				<header className="mb-4 flex min-w-0 flex-col gap-0.5">
					<h1 data-calm-date className="text-title first-letter:uppercase">
						{view.topLine.dateLabel}
					</h1>
					{view.topLine.planName ? (
						<p
							data-calm-plan
							className="text-footnote text-muted-foreground [overflow-wrap:break-word]"
						>
							{view.topLine.planName}
						</p>
					) : null}
				</header>
				<div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
					<div className="flex min-w-0 flex-col gap-4">
						<TodayCard card={view.card} todayKey={view.todayKey} />
						{view.invite ? <StartInvite /> : null}
					</div>
					<div className="flex min-w-0 flex-col gap-4">
						{/* What the autopilot wrote, above the week it wrote to (ADR
						    0100 §5); under Spør meg først, the line to Ukeskiftet. */}
						{autopilotNotice ? (
							<AutopilotNoticeCard
								notice={autopilotNotice}
								weeks={season.weeks}
							/>
						) : null}
						{waiting > 0 ? <WeekChangeWaiting count={waiting} /> : null}
						{view.week.shown ? (
							<WeekList week={view.week} onCard={onCard} />
						) : null}
						<Link
							to={HOME_TIMELINE_HREF}
							prefetch="intent"
							data-calm-season-link
							className={cn(
								buttonVariants({ variant: 'outline' }),
								'w-full justify-between rounded-full px-5',
							)}
						>
							{HOME_TIMELINE_FULL_VIEW_LABELS.link}
							<Icon name="chevron-right" size="sm" />
						</Link>
					</div>
				</div>
			</main>
			<ComposerDrawer weeks={season.weeks} today={today} />
		</ComposerProvider>
	)
}

// ── the today card ────────────────────────────────────────────────────────

function TodayCard({ card, todayKey }: { card: CalmCard; todayKey: string }) {
	const headingId = 'calm-today-card'
	return (
		<section
			aria-labelledby={headingId}
			data-today-card={card.kind}
			className={cn(CARD, 'flex min-w-0 flex-col gap-3 p-5')}
		>
			{card.kind === 'session' ? (
				<SessionCard card={card} headingId={headingId} todayKey={todayKey} />
			) : card.kind === 'done' ? (
				<DoneCard card={card} headingId={headingId} />
			) : card.kind === 'free' ? (
				<PlainCard
					headingId={headingId}
					title={L.freeTitle}
					line={nextLine(card.next)}
					todayKey={todayKey}
				/>
			) : card.kind === 'before-start' ? (
				<PlainCard
					headingId={headingId}
					title={card.title}
					line={card.first?.line ?? L.noFirstSession}
					todayKey={todayKey}
				/>
			) : (
				<NoPlanCard headingId={headingId} todayKey={todayKey} />
			)}
		</section>
	)
}

function nextLine(next: CalmNext | null): string {
	return next?.line ?? L.nothingAhead
}

function SessionCard({
	card,
	headingId,
	todayKey,
}: {
	card: Extract<CalmCard, { kind: 'session' }>
	headingId: string
	todayKey: string
}) {
	const { session } = card
	const { landedSessionId, landedUndoable, undoingSessionId } =
		useComposerLanding()
	const composer = useComposer()
	// A Juster that just landed here keeps its _Angre_ on the card for as long
	// as its toast (ADR 0088): the card is the row it landed on.
	const undoable = landedSessionId === session.id && landedUndoable
	return (
		<>
			<p className="text-footnote text-muted-foreground flex items-center gap-2">
				<span
					aria-hidden
					className={cn(
						'size-2 flex-none rounded-full',
						TRACK_DOT[session.discipline] ?? 'bg-muted-foreground/60',
					)}
				/>
				<span data-calm-activity>{session.disciplineLabel}</span>
				{session.effortLabel ? (
					<span
						data-calm-effort
						className="text-caption text-foreground bg-muted ml-auto rounded-full px-2.5 py-0.5"
					>
						{session.effortLabel}
					</span>
				) : null}
			</p>
			<div className="flex min-w-0 flex-col gap-1">
				<h2
					id={headingId}
					className="text-title [text-wrap:balance] [overflow-wrap:break-word]"
				>
					{session.title}
				</h2>
				{session.durationLabel ? (
					<p
						data-calm-duration
						className="text-heading text-foreground tabular-nums"
					>
						{session.durationLabel}
					</p>
				) : null}
				<p
					data-calm-sentence
					className="text-body text-muted-foreground [text-wrap:pretty]"
				>
					{card.sentence}
				</p>
			</div>
			<div className="mt-1 flex flex-col gap-2">
				<JusterChips
					sessionId={session.id}
					title={session.title}
					discipline={session.discipline}
					sessionTo={session.to}
					todayKey={todayKey}
				/>
				{session.markDone ? (
					<MarkDoneAction
						look="card"
						sessionId={session.id}
						title={session.title}
						label={L.done}
						ariaLabel={L.doneFor(session.title)}
					/>
				) : card.logTo ? (
					<Link
						to={card.logTo.to}
						data-today-cta
						className={cn(
							buttonVariants({ size: 'default' }),
							'h-12 w-full text-base font-semibold',
						)}
					>
						{card.logTo.label}
					</Link>
				) : null}
				{/* One line, so an _Angre_ arriving never moves _Gjort_. */}
				<div className="flex items-center justify-center gap-6">
					<Link
						to={session.to}
						prefetch="intent"
						className="text-footnote text-muted-foreground pressable relative py-1 underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-2.5 hover:underline"
					>
						{L.openSession}
					</Link>
					{undoable ? (
						<button
							type="button"
							data-today-undo={session.id}
							disabled={undoingSessionId === session.id}
							aria-label={SESSION_COMPOSER_LABELS.undoFor(session.title)}
							onClick={() => composer.undo(session.id)}
							className="text-footnote text-primary pressable relative py-1 font-semibold underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-2.5 hover:underline"
						>
							{undoingSessionId === session.id
								? SESSION_COMPOSER_LABELS.undoing
								: SESSION_COMPOSER_LABELS.undo}
						</button>
					) : null}
				</div>
			</div>
		</>
	)
}

function DoneCard({
	card,
	headingId,
}: {
	card: Extract<CalmCard, { kind: 'done' }>
	headingId: string
}) {
	const { landedSessionId, landedUndoable, undoingSessionId } =
		useComposerLanding()
	const composer = useComposer()
	// The mark that just landed keeps its _Angre_ on the card for as long as
	// its toast (ADR 0088): the card is the row it landed on.
	const landed = card.done.find((one) => one.id === landedSessionId)
	return (
		<>
			<p className="text-footnote text-status-on flex items-center gap-2 font-medium">
				<Icon name="circle-check" size="sm" />
				{L.doneMark}
			</p>
			<h2 id={headingId} className="text-title">
				{L.doneTitle}
			</h2>
			<p className="text-body text-foreground [overflow-wrap:break-word]">
				{card.line}
			</p>
			<p className="text-footnote text-muted-foreground [overflow-wrap:break-word]">
				{nextLine(card.next)}
			</p>
			{landed && landedUndoable ? (
				<button
					type="button"
					data-today-undo={landed.id}
					disabled={undoingSessionId === landed.id}
					aria-label={SESSION_COMPOSER_LABELS.undoFor(landed.title)}
					onClick={() => composer.undo(landed.id)}
					className={cn(
						buttonVariants({ variant: 'outline' }),
						'mt-1 h-12 w-full rounded-full text-base',
					)}
				>
					{undoingSessionId === landed.id
						? SESSION_COMPOSER_LABELS.undoing
						: SESSION_COMPOSER_LABELS.undo}
				</button>
			) : null}
		</>
	)
}

function PlainCard({
	headingId,
	title,
	line,
	todayKey,
}: {
	headingId: string
	title: string
	line: string
	todayKey: string
}) {
	return (
		<>
			<h2 id={headingId} className="text-title">
				{title}
			</h2>
			<p className="text-body text-muted-foreground [text-wrap:pretty] [overflow-wrap:break-word]">
				{line}
			</p>
			<AddToday todayKey={todayKey} />
		</>
	)
}

function NoPlanCard({
	headingId,
	todayKey,
}: {
	headingId: string
	todayKey: string
}) {
	return (
		<>
			<h2 id={headingId} className="text-title">
				{L.noPlanTitle}
			</h2>
			<p className="text-body text-muted-foreground [text-wrap:pretty]">
				{L.noPlanBody}
			</p>
			<Link
				to={START_HREF}
				data-calm-start
				className={cn(
					buttonVariants({ size: 'default' }),
					'mt-1 h-12 w-full text-base font-semibold',
				)}
			>
				{L.noPlanAction}
			</Link>
			<AddToday todayKey={todayKey} quiet />
		</>
	)
}

/** No plan, beside a card the athlete wrote themselves: the start, quietly. */
function StartInvite() {
	return (
		<p
			data-calm-invite
			className={cn(
				CARD,
				'text-footnote text-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3',
			)}
		>
			<span className="min-w-0">{L.noPlanTitle}</span>
			<Link
				to={START_HREF}
				className="text-primary relative font-semibold underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-3 hover:underline"
			>
				{L.noPlanAction}
			</Link>
		</p>
	)
}

/** Writing a session today still works on every card that has none. */
function AddToday({
	todayKey,
	quiet = false,
}: {
	todayKey: string
	quiet?: boolean
}) {
	const composer = useComposer()
	return (
		<button
			type="button"
			data-calm-add-today
			onClick={() => composer.openComposer(todayKey)}
			className={cn(
				buttonVariants({ variant: quiet ? 'ghost' : 'outline' }),
				'mt-1 w-full rounded-full',
			)}
		>
			<Icon name="plus" size="sm" />
			{L.addToday}
		</button>
	)
}

// ── this week ─────────────────────────────────────────────────────────────

function WeekChangeWaiting({ count }: { count: number }) {
	return (
		<p
			data-calm-week-change
			className={cn(
				CARD,
				'text-footnote text-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3',
			)}
		>
			<span className="min-w-0">{L.weekChangeWaiting(count)}</span>
			<Link
				to={HOME_TIMELINE_HREF}
				className="text-primary relative font-semibold underline-offset-4 after:absolute after:inset-x-0 after:-inset-y-3 hover:underline"
			>
				{L.weekChangeOpen}
			</Link>
		</p>
	)
}

function WeekList({
	week,
	onCard,
}: {
	week: CalmWeek
	onCard: ReadonlySet<string>
}) {
	const headingId = 'calm-week'
	return (
		<section aria-labelledby={headingId} data-calm-week className="min-w-0">
			<div className="mb-2 flex items-baseline justify-between gap-3 px-1">
				<h2 id={headingId} className="text-heading">
					{week.heading}
				</h2>
				{week.doneLine ? (
					<p
						data-calm-week-done
						className="text-footnote text-muted-foreground tabular-nums"
					>
						{week.doneLine}
					</p>
				) : null}
			</div>
			<ol className={cn(CARD, '@container overflow-hidden')}>
				{week.days.map((day) => (
					<li
						key={day.key}
						data-calm-day={day.key}
						aria-current={day.isToday ? 'date' : undefined}
						className={cn(
							'border-border/60 border-b last:border-b-0',
							day.isToday && 'bg-primary/6 dark:bg-primary/10',
						)}
					>
						{day.sessions.length === 0 ? (
							<FreeDay day={day} />
						) : (
							day.sessions.map((session, index) => (
								<WeekSession
									key={session.id}
									day={day}
									session={session}
									showDay={index === 0}
									onCard={onCard.has(session.id)}
								/>
							))
						)}
					</li>
				))}
			</ol>
		</section>
	)
}

/**
 * The row: the day's gutter, the session, its mark. In a row narrower than
 * 17rem — a 200% text size, mostly, since the rem grows with it — the gutter
 * stacks above the session, so a title never breaks inside its words.
 */
const ROW =
	'grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 @max-[17rem]:grid-cols-[minmax(0,1fr)_auto] @max-[17rem]:gap-y-1'

function DayGutter({ day, show = true }: { day: CalmDay; show?: boolean }) {
	return (
		<span
			aria-hidden
			className={cn(
				'flex flex-col leading-none @max-[17rem]:col-span-2 @max-[17rem]:flex-row @max-[17rem]:items-baseline @max-[17rem]:gap-1.5',
				show ? null : 'invisible @max-[17rem]:hidden',
				day.isToday ? 'text-foreground' : 'text-muted-foreground',
			)}
		>
			<span className="text-caption">{day.weekdayLabel}</span>
			<span className="text-callout tabular-nums">{day.dayOfMonth}</span>
		</span>
	)
}

/** A free day: _fri_, the whole row a real 44px button into the composer. */
function FreeDay({ day }: { day: CalmDay }) {
	const composer = useComposer()
	return (
		<button
			type="button"
			data-calm-free={day.key}
			onClick={() => composer.openComposer(day.key)}
			aria-label={`${day.dayName}, ${day.freeLabel ?? ''}. ${L.addOn(day.dayName)}`}
			className={cn(ROW, 'pressable min-h-14 w-full px-4 py-2 text-left')}
		>
			<DayGutter day={day} />
			<span className="text-footnote text-muted-foreground italic">
				{day.freeLabel}
			</span>
			<span
				aria-hidden
				className={cn(
					'flex size-8 items-center justify-center',
					day.past ? 'text-muted-foreground' : 'text-primary',
				)}
			>
				<Icon name="plus" size="sm" />
			</span>
		</button>
	)
}

function WeekSession({
	day,
	session,
	showDay,
	onCard,
}: {
	day: CalmDay
	session: CalmSession
	showDay: boolean
	/** The card above holds this session's _Gjort_ and _Angre_. */
	onCard: boolean
}) {
	const composer = useComposer()
	const { landedSessionId, landedUndoable, undoingSessionId } =
		useComposerLanding()
	const landed = landedSessionId === session.id
	const offerDone = session.markDone != null && !onCard
	const undoable = landed && landedUndoable && !onCard
	const missed = session.status === 'missed'
	const done = session.status === 'completed'
	const facts = [session.durationLabel, session.effortLabel]
		.filter(Boolean)
		.join(' · ')
	const mark = done ? L.doneMark : missed ? L.missed : L.plannedMark
	return (
		<div
			data-calm-session={session.id}
			data-status={session.status}
			className={cn(
				'duration-collapse [transition-property:background-color] ease-out',
				landed && 'bg-primary/6',
			)}
		>
			<Link
				to={session.to}
				prefetch="intent"
				onClick={(event) => {
					// The details open in the Drawer, as on the full view's phone;
					// a modified click still opens the page.
					if (event.metaKey || event.ctrlKey || event.shiftKey) return
					event.preventDefault()
					composer.openDetail(session.id, day.key)
				}}
				aria-label={`${day.dayName}: ${session.title}${facts ? `, ${facts}` : ''}, ${mark}`}
				className={cn(ROW, 'pressable min-h-14 w-full px-4 py-2 text-left')}
			>
				<DayGutter day={day} show={showDay} />
				<span className="flex min-w-0 flex-col gap-0.5">
					<span
						className={cn(
							'text-callout [overflow-wrap:break-word]',
							missed
								? 'text-muted-foreground line-through decoration-1'
								: 'text-foreground',
						)}
					>
						{session.title}
					</span>
					{facts ? (
						<span className="text-footnote text-muted-foreground tabular-nums">
							{facts}
						</span>
					) : null}
				</span>
				<SessionMark status={session.status} />
			</Link>
			{offerDone || undoable ? (
				<div className="-mt-2 flex flex-wrap items-center gap-x-4 pr-4 pb-1 pl-[4.75rem] @max-[17rem]:pl-4">
					{undoable ? (
						<button
							type="button"
							data-calm-undo={session.id}
							disabled={undoingSessionId === session.id}
							aria-label={SESSION_COMPOSER_LABELS.undoFor(session.title)}
							onClick={() => composer.undo(session.id)}
							className={cn(
								buttonVariants({ variant: 'outline', size: 'sm' }),
								'rounded-full',
							)}
						>
							{undoingSessionId === session.id
								? SESSION_COMPOSER_LABELS.undoing
								: SESSION_COMPOSER_LABELS.undo}
						</button>
					) : null}
					{offerDone && session.markDone ? (
						<MarkDoneAction
							sessionId={session.id}
							title={session.title}
							label={session.markDone.actionLabel}
							ariaLabel={session.markDone.label}
						/>
					) : null}
				</div>
			) : null}
		</div>
	)
}

/** Done, _ikke gjort_ behind today, or an open ring for what is still ahead. */
function SessionMark({ status }: { status: CalmSession['status'] }) {
	if (status === 'completed') {
		return (
			<span
				data-calm-mark="done"
				aria-hidden
				className="bg-status-on text-primary-foreground flex size-6 items-center justify-center rounded-full"
			>
				<Icon name="check" size="xs" />
			</span>
		)
	}
	if (status === 'missed') {
		return (
			<span
				data-calm-mark="missed"
				aria-hidden
				className="text-footnote text-status-missed italic"
			>
				{L.missed}
			</span>
		)
	}
	return (
		<span
			data-calm-mark="planned"
			aria-hidden
			className="border-border size-6 rounded-full border-2"
		/>
	)
}
