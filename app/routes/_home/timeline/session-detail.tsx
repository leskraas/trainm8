/**
 * One session, said whole — the same body wherever its details are read
 * (owner decision 1, round 2; ADR 0088): the composer's Drawer at full on a
 * phone, and the day pane or its Sheet on a large screen. It replaces the
 * ownership glyph's popover (ADR 0086 §3), so a session's details have one
 * place per screen instead of a popover on top of the list.
 *
 * What it holds: the session's sentence as tokens, whose it is and what that
 * means, its figures (load, the comparison, the shape), and the quieter
 * actions — _Lås opp_, _Tell i Annet_, _Angre kobling_ / _Koble igjen_ — and
 * the way to the Workout Detail View, where it is edited. No token here opens
 * a popover: on a phone that would stack a second layer over the Drawer
 * (apple-design §12), and editing lives on the session's own page.
 */
import { Link, useFetcher } from 'react-router'
import { ProfileBars } from '#app/components/profile-bars.tsx'
import { SourceCredits } from '#app/components/source-credits.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import {
	ANNET_ACTION_LABELS,
	DAY_PANE_LABELS,
	SESSION_COMPOSER_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { SESSION_ANNET_ACTION } from '#app/utils/session-annet-schema.ts'
import { ImportLinkAction } from './import-actions.tsx'
import { type TimelineSession } from './presenter.ts'
import { ReleaseAction, type TodayRowExtras } from './stream.tsx'

const STATUS_INK: Record<TimelineSession['status'], string> = {
	planned: 'text-foreground',
	completed: 'text-status-on',
	missed: 'text-status-missed',
}

/** What the row knows, beyond its sentence. */
export function sessionFacts(session: TimelineSession): string[] {
	return [
		session.externalLoad,
		session.internalLoad,
		session.doneNote,
		session.extraLabel,
		...session.chips.map((chip) => chip.label),
	].filter((fact): fact is string => !!fact)
}

export function SessionDetail({
	session,
	cta = null,
}: {
	session: TimelineSession
	/** Today's own action (`Se økta`, `Logg økta`), on today's session. */
	cta?: TodayRowExtras['cta']
}) {
	const facts = sessionFacts(session)
	const planned = session.status === 'planned'
	return (
		<div
			data-session-detail={session.id}
			className="flex min-w-0 flex-col gap-2.5"
		>
			{/* First, straight under the title the Drawer and the day pane
			    set above this body: the row's own credit (#557). */}
			{session.sourceCredit ? (
				<SourceCredits credits={[session.sourceCredit]} />
			) : null}
			<dl className="text-footnote grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
				<dt className="text-muted-foreground">{DAY_PANE_LABELS.track}</dt>
				<dd>{session.disciplineLabel}</dd>
				<dt className="text-muted-foreground">{DAY_PANE_LABELS.status}</dt>
				<dd data-day-session-status className={STATUS_INK[session.status]}>
					{DAY_PANE_LABELS.statusWord[session.status]}
				</dd>
				{session.volumeLabel ? (
					<>
						<dt className="text-muted-foreground">{DAY_PANE_LABELS.volume}</dt>
						<dd className="tabular-nums">{session.volumeLabel}</dd>
					</>
				) : null}
				{session.ownerLabel ? (
					<>
						<dt className="text-muted-foreground">{DAY_PANE_LABELS.owner}</dt>
						<dd data-day-session-owner={session.owner}>
							<span aria-hidden className="text-muted-foreground mr-1">
								{session.owner === 'athlete' ? '✎' : '◌'}
							</span>
							{session.ownerLabel}
						</dd>
					</>
				) : null}
				{session.annet ? (
					<>
						<dt className="text-muted-foreground">
							{SESSION_COMPOSER_LABELS.detail.counts}
						</dt>
						<dd>
							{session.annet.inAnnet
								? SESSION_COMPOSER_LABELS.detail.inAnnet
								: SESSION_COMPOSER_LABELS.detail.inTrack}
						</dd>
					</>
				) : null}
			</dl>
			{session.bars.length > 0 ? (
				<span className="block w-[140px]">
					<ProfileBars
						bars={session.bars}
						groups={session.groups}
						scale="row"
					/>
				</span>
			) : null}
			{facts.length > 0 ? (
				<ul className="text-footnote text-muted-foreground flex flex-col gap-0.5 tabular-nums">
					{facts.map((fact, index) => (
						<li key={`${index}-${fact}`}>{fact}</li>
					))}
				</ul>
			) : null}
			{session.ownerNote && !session.release ? (
				<p className="text-footnote text-muted-foreground">
					{session.ownerNote}
				</p>
			) : null}
			<div className="flex flex-wrap items-center gap-2">
				{cta ? (
					<Link
						to={cta.to}
						data-day-cta
						// Named for its session: beside today's row on a large screen,
						// two links both called only "Se økta" would be one name for two
						// controls.
						aria-label={`${cta.label} ${session.title}`}
						className={cn(buttonVariants({ size: 'sm' }), 'rounded-full px-4')}
					>
						{cta.label}
					</Link>
				) : null}
				<Link
					to={session.to}
					prefetch="intent"
					data-day-open
					aria-label={
						planned
							? DAY_PANE_LABELS.editFor(session.title)
							: DAY_PANE_LABELS.openFor(session.title)
					}
					className={cn(
						buttonVariants({ variant: 'outline', size: 'sm' }),
						'rounded-full',
					)}
				>
					{planned ? DAY_PANE_LABELS.edit : DAY_PANE_LABELS.open}
				</Link>
			</div>
			{session.release ? (
				<ReleaseAction
					sessionId={session.id}
					title={session.title}
					label={session.release.actionLabel}
					note={session.release.note}
				/>
			) : null}
			{session.annet ? (
				<AnnetAction
					sessionId={session.id}
					inAnnet={session.annet.inAnnet}
					label={session.annet.actionLabel}
				/>
			) : null}
			{session.importLink && session.importLink.kind !== 'ask' ? (
				<ImportLinkAction link={session.importLink} inline />
			) : null}
		</div>
	)
}

/**
 * Count the session in Annet, or put it back in its track (#505 story 33) —
 * with the session's other quiet actions, never inside the row's link: a
 * control inside a link is two targets under one thumb.
 *
 * It posts to its own resource route, owner-scoped on the server
 * (`setCountsInNoTrack`), and the home loader revalidates after it, so the week
 * header's numbers move with the tap. While the post is in flight the button
 * already says what it will say after, so a second tap is not needed to see
 * that the first one took.
 */
function AnnetAction({
	sessionId,
	inAnnet,
	label,
}: {
	sessionId: string
	inAnnet: boolean
	label: string
}) {
	const fetcher = useFetcher()
	const pending = fetcher.formData?.get('countsInNoTrack')
	const willBeInAnnet = pending == null ? inAnnet : pending === 'true'
	return (
		<fetcher.Form method="post" action={SESSION_ANNET_ACTION} className="flex">
			<input type="hidden" name="sessionId" value={sessionId} />
			<input
				type="hidden"
				name="countsInNoTrack"
				value={String(!willBeInAnnet)}
			/>
			<button
				type="submit"
				data-annet-action={sessionId}
				// The 44px floor is the control's (ADR 0028 §2); the words are as
				// quiet as the row's own facts, so the action never outranks the
				// session it belongs to.
				className="text-muted-foreground text-caption pressable flex min-h-11 items-center underline decoration-dotted underline-offset-[3px]"
			>
				{pending == null
					? label
					: willBeInAnnet
						? ANNET_ACTION_LABELS.toTrack
						: ANNET_ACTION_LABELS.toAnnet}
			</button>
		</fetcher.Form>
	)
}
