/**
 * The season picture at the top of Sesong (round-2 decision 12, ADR 0090):
 * I dag's compact curve and season table (ADR 0087 §2), read off the same
 * season, so `Uke 41` reads the same `mål · gjort` on both tabs.
 *
 * Two differences from I dag, both about what a row is *for* here. A row opens
 * that week's target in _Endre sesongen_, pre-filled and scrolled to, behind
 * its preview (#505 story 75) — I dag's row jumps its list instead. And a week
 * already begun is history (ADR 0084 §1): its row reads and does not act.
 *
 * The analytical `SeasonChart` — layers, read-in, the derivation panel — moved
 * under _Avansert_; this picture is what the athlete recognises first.
 */
import { useCallback, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import {
	SeasonCurveView,
	SeasonTableView,
} from '#app/routes/_home/timeline/season-pane.tsx'
import { formatLoad, formatNbVolumeFigure } from '#app/utils/format.ts'
import { SEASON_EDIT_LABELS, SESONG_PAGE_LABELS } from '#app/utils/labels.ts'
import { type SeasonPicture as SeasonPictureData } from './__season-picture.server.ts'
import { PlanCard } from './__plan-chrome.tsx'

/** Where the Sesong edits card sits, as `SeasonEditLink` scrolls to it. */
const EDITS_ANCHOR = 'season-edits'
/** No week is "in view" on Sesong: there is no list beside the table. */
const NO_FRAME = { from: '', to: '' }

export function SeasonPicture({
	picture,
	firstUnbegunWeekKey,
}: {
	picture: SeasonPictureData
	/** Weeks before it are history: their rows read and do not act. */
	firstUnbegunWeekKey: string
}) {
	const navigate = useNavigate()
	const location = useLocation()
	const { currency, leadTrackId } = picture
	// The curve's formatter, rebuilt here: a function does not cross the wire.
	const curve = useMemo(
		() => ({
			...picture.curve,
			figure: currency
				? (value: number) => formatNbVolumeFigure(value, currency)
				: formatLoad,
		}),
		[picture.curve, currency],
	)
	// A row opens its week's target edit — the page's own query kept, the edit
	// and its fields added, the edits card scrolled to — exactly as
	// `SeasonEditLink` builds the same URL from the readings below.
	const openWeek = useCallback(
		(weekKey: string) => {
			if (!leadTrackId) return
			const params = new URLSearchParams(location.search)
			params.set('edit', 'week-target')
			params.set('weekKey', weekKey)
			params.set('trackId', leadTrackId)
			params.delete('phaseId')
			void navigate(
				{ search: `?${params.toString()}`, hash: EDITS_ANCHOR },
				{ preventScrollReset: true },
			)
		},
		[leadTrackId, location.search, navigate],
	)
	const rowActs = useCallback(
		(weekKey: string) => leadTrackId != null && weekKey >= firstUnbegunWeekKey,
		[leadTrackId, firstUnbegunWeekKey],
	)
	const rowLabel = useCallback(
		(name: string) => `${SEASON_EDIT_LABELS.weekTargetOpen}: ${name}`,
		[],
	)
	const anyBegun = picture.table.rows.some(
		(row) => row.key < firstUnbegunWeekKey,
	)

	return (
		<PlanCard
			titleId="season-picture"
			title={SESONG_PAGE_LABELS.pictureTitle}
			contentClassName="space-y-4"
		>
			{picture.pendingRound ? (
				<PendingRound name={picture.pendingRound.name} />
			) : null}
			<SeasonCurveView curve={curve} />
			<div className="space-y-1.5">
				{/* The table scrolls inside itself on a narrow screen with many
				    tracks, rather than pushing the page sideways (ui-conventions §5). */}
				<div className="-mx-1 overflow-x-auto overscroll-x-contain px-1">
					<SeasonTableView
						table={picture.table}
						frame={NO_FRAME}
						onJump={openWeek}
						rowLabel={rowLabel}
						rowActs={rowActs}
					/>
				</div>
				{picture.openEnded ? (
					// An open-ended plan has no last week (ADR 0079): the table ends at
					// the round being lived and says that it carries on.
					<p
						data-season-continues
						className="border-foreground/30 text-footnote text-muted-foreground border-t-[1.5px] border-dashed pt-1.5 text-center"
					>
						<span aria-hidden>→ </span>
						<span className="text-foreground font-semibold">
							{SESONG_PAGE_LABELS.continues}
						</span>{' '}
						· {SESONG_PAGE_LABELS.continuesNote}
					</p>
				) : null}
			</div>
			<p className="text-caption text-muted-foreground">
				{SESONG_PAGE_LABELS.pictureHint}
				{anyBegun ? ` ${SESONG_PAGE_LABELS.pictureBegunHint}` : null}
			</p>
		</PlanCard>
	)
}

/**
 * The next round, waiting for an answer in Ukeskiftet — said here and answered
 * there: a proposal has one surface (ADR 0080), so Sesong reads it and links
 * to it rather than carrying a second Ja/Nei.
 */
function PendingRound({ name }: { name: string }) {
	return (
		<div
			data-pending-round
			role="status"
			className="bg-primary/8 ring-primary/20 flex flex-col gap-2 rounded-3xl px-4 py-3 ring-1 sm:flex-row sm:items-center"
		>
			<p className="text-footnote min-w-0 flex-1">
				<span className="text-callout block font-semibold">
					{SESONG_PAGE_LABELS.pendingRound}
				</span>
				<span className="text-muted-foreground">
					{SESONG_PAGE_LABELS.pendingRoundNote(name)}
				</span>
			</p>
			<Link
				to="/"
				className="text-footnote text-primary relative inline-flex min-h-11 shrink-0 touch-manipulation items-center font-semibold underline-offset-4 hover:underline"
			>
				{SESONG_PAGE_LABELS.pendingRoundLink}
			</Link>
		</div>
	)
}
