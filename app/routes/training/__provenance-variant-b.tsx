// PROTOTYPE — Variant B, "The week is the citation": the claim is made once in the
// week header, session rows stay two lines and carry a one-word source mark that
// taps into a single fixed inspect panel below the list (ADR 0030 rule 3).
import { useEffect, useState } from 'react'
import { Badge } from '#app/components/ui/badge.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	citationLine,
	disciplineDot,
	sourceMark,
	type Provenance,
	type PrototypeSession,
	type PrototypeWeek,
} from './__provenance-prototype-data.ts'

const PANEL_ID = 'provenance-inspect'

/**
 * The mark vocabulary. Six marks, one word each, distinguishable without
 * opening anything:
 *   cited      — trainm8 vouches, a real citation behind it (emerald).
 *   cited ≈    — cited, but rendered in a currency the source did not use (amber).
 *   yours      — you edited or authored it; lineage lives in the panel only.
 *   stock      — trainm8 stock with no external source. Deliberately quiet.
 *   community  — someone else's session. Never reads as a trainm8 citation.
 *   unavailable— nothing was generated. Dashed, so it never reads as a session.
 */
type MarkTone =
	| 'stock'
	| 'translated'
	| 'convention'
	| 'shared'
	| 'edited'
	| 'authored'
	| 'unavailable'

type Mark = {
	label: string
	tone: MarkTone
	icon:
		| 'file-text'
		| 'info-circle'
		| 'pencil-1'
		| 'avatar'
		| 'alert-triangle'
		| null
	className: string
}

const TONE_BY_KIND: Record<Provenance['kind'], MarkTone> = {
	stock: 'stock',
	convention: 'convention',
	shared: 'shared',
	authored: 'authored',
	unavailable: 'unavailable',
}

const MARK_STYLE: Record<MarkTone, Pick<Mark, 'icon' | 'className'>> = {
	stock: {
		icon: 'file-text',
		className:
			'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
	},
	translated: {
		icon: 'info-circle',
		className:
			'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
	},
	edited: {
		icon: 'pencil-1',
		className: 'border-border bg-muted text-foreground',
	},
	authored: {
		icon: 'pencil-1',
		className: 'border-border bg-muted text-foreground',
	},
	convention: {
		icon: null,
		className: 'border-transparent bg-muted text-muted-foreground',
	},
	shared: {
		icon: 'avatar',
		className:
			'border-dashed border-zinc-400/60 bg-transparent text-zinc-600 dark:border-zinc-500 dark:text-zinc-300',
	},
	unavailable: {
		icon: 'alert-triangle',
		className:
			'border-dashed border-border bg-transparent text-muted-foreground',
	},
}

/**
 * Adoption wins over the source (workout.server.ts:376 — editing adopts): an
 * edited session's mark says it is yours now, and the citation it came from
 * survives as lineage inside the inspect panel, not on the row.
 */
function markFor(session: PrototypeSession): Mark {
	const base = sourceMark(session.provenance)
	if (session.adoption)
		return { label: 'yours', tone: 'edited', ...MARK_STYLE.edited }
	if (session.provenance.kind === 'stock' && session.provenance.translation) {
		return { label: 'cited ≈', tone: 'translated', ...MARK_STYLE.translated }
	}
	const tone = TONE_BY_KIND[session.provenance.kind]
	return { label: base.label, tone, ...MARK_STYLE[tone] }
}

export function VariantB({ week }: { week: PrototypeWeek }) {
	// Open on Thursday by default — the lossy translation is the case worth
	// landing on. Local state only: no persistence, no mutation.
	const [selectedId, setSelectedId] = useState<string | null>('s4')
	const selected = week.sessions.find((s) => s.id === selectedId) ?? null

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setSelectedId(null)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	// The week header makes one claim. It stays honest by naming, right there,
	// how much of the week no longer matches what was generated.
	const edited = week.sessions.filter((s) => s.adoption).length
	const community = week.sessions.filter(
		(s) => s.provenance.kind === 'shared',
	).length
	const unplanned = week.sessions.filter(
		(s) => s.provenance.kind === 'unavailable',
	).length
	const exceptions = [
		edited ? `${edited} edited by you since` : null,
		community ? `${community} swapped in from the community` : null,
		unplanned ? `${unplanned} slot left unplanned` : null,
	]
		.filter((line): line is string => line !== null)
		.join(' · ')

	return (
		<section
			data-variant="B"
			className="mx-auto w-full max-w-[430px] px-4 pt-3"
		>
			<WeekClaim week={week} exceptions={exceptions} />

			<ol className="mt-2.5 space-y-1">
				{week.sessions.map((session) => (
					<li key={session.id}>
						<SessionRow
							session={session}
							active={session.id === selectedId}
							onSelect={() =>
								setSelectedId((current) =>
									current === session.id ? null : session.id,
								)
							}
						/>
					</li>
				))}
			</ol>

			<InspectPanel session={selected} onDismiss={() => setSelectedId(null)} />
		</section>
	)
}

/**
 * The provenance surface: season shape, block position, and what the week is
 * FOR — in a sentence an athlete would actually say.
 */
function WeekClaim({
	week,
	exceptions,
}: {
	week: PrototypeWeek
	exceptions: string
}) {
	return (
		<header className="bg-card border-border/70 rounded-2xl border p-3">
			<div className="flex items-center justify-between gap-2">
				<span className="flex min-w-0 items-center gap-2">
					<h1 className="truncate text-sm font-semibold">Week {week.weekNo}</h1>
					<Badge variant="secondary" className="shrink-0">
						Generated
					</Badge>
				</span>
				<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
					{week.weekOf}
				</span>
			</div>
			<p className="text-muted-foreground mt-1 truncate text-xs">
				{week.blockName} · {week.blockWeek} · {week.weekTargets}
			</p>

			<p className="text-foreground mt-2.5 text-[15px] leading-snug font-semibold">
				{week.weekClaim}
			</p>

			<div className="bg-muted/50 mt-2 rounded-xl px-2.5 py-1.5">
				<p className="flex items-center gap-1.5 text-xs font-medium">
					<Icon
						name="file-text"
						className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
					/>
					<span className="truncate">Shape from {week.presetName}</span>
				</p>
				<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
					{citationLine(week.presetCitation)}
				</p>
			</div>

			{exceptions ? (
				<p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed">
					<Icon name="info-circle" className="mt-px size-3.5 shrink-0" />
					<span>
						That claim covers the shape of the week. Inside it: {exceptions}.
					</span>
				</p>
			) : null}
		</header>
	)
}

/**
 * Two lines. Always two lines. Bold title + one muted `·`-joined micro-line —
 * the house density (session-ledger.tsx:381). The only provenance ink on the
 * row is the mark, and the mark is one word.
 */
function SessionRow({
	session,
	active,
	onSelect,
}: {
	session: PrototypeSession
	active: boolean
	onSelect: () => void
}) {
	const mark = markFor(session)
	const missing = session.provenance.kind === 'unavailable'
	const rest = session.discipline === 'rest'
	const facts = [
		session.durationMin != null ? `${session.durationMin} min` : null,
		session.tss != null ? `${session.tss} TSS` : null,
		session.target,
	].filter((f): f is string => f != null)

	return (
		<article
			data-testid="session-card"
			className={cn(
				'bg-card border-border/60 flex gap-3 rounded-xl border px-3 py-2',
				(missing || rest) && 'border-dashed',
				missing && 'bg-card/40',
				active && 'border-foreground/25 bg-muted/40',
			)}
		>
			<div className="w-10 shrink-0">
				<p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
					{session.weekday}
				</p>
				<p className="text-muted-foreground/70 text-[10px] tabular-nums">
					{session.date}
				</p>
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p
						className={cn(
							'min-w-0 flex-1 truncate text-sm leading-snug font-semibold',
							missing ? 'text-muted-foreground' : 'text-foreground',
						)}
					>
						{session.title}
					</p>
					{/* Tap-to-inspect: 44 px of hit area around a 20 px pill, driving the
					    one fixed panel below. Never a tooltip, never `title=`. */}
					<button
						type="button"
						onClick={onSelect}
						aria-pressed={active}
						aria-controls={PANEL_ID}
						aria-label={`Where “${session.title}” came from — ${mark.label}`}
						className="focus-visible:ring-ring/60 -my-2.5 -mr-1 flex h-11 shrink-0 items-center rounded-lg pr-1 pl-2 focus:outline-none focus-visible:ring-2"
					>
						<Badge
							variant="outline"
							className={cn(
								'capitalize',
								mark.className,
								active && 'ring-foreground/20 ring-2',
							)}
						>
							{mark.icon ? <Icon name={mark.icon} /> : null}
							{mark.label}
						</Badge>
					</button>
				</div>

				<div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
					<span className="flex min-w-0 items-center gap-1.5">
						<span
							aria-hidden
							className={cn(
								'size-1.5 shrink-0 rounded-full',
								disciplineDot(session.discipline),
							)}
						/>
						<span className="truncate tabular-nums">
							{missing
								? 'No session generated'
								: rest
									? 'Rest & recover'
									: facts.join(' · ')}
						</span>
					</span>
					<ShapeStrip bars={session.shape} />
				</div>
			</div>
		</article>
	)
}

/** The intensity shape, shrunk into the micro-line so the row stays two lines. */
function ShapeStrip({ bars }: { bars: number[] }) {
	if (bars.length === 0) return null
	return (
		<span aria-hidden className="ml-auto flex h-3.5 shrink-0 items-end gap-px">
			{bars.map((bar, i) => (
				<span
					key={i}
					className="bg-muted-foreground/35 w-1 rounded-[1px]"
					style={{ height: `${Math.max(18, Math.round(bar * 100))}%` }}
				/>
			))}
		</span>
	)
}

/**
 * The single fixed inspect panel, shared by the whole week. It swaps content as
 * marks are tapped; everything the row deliberately does not say — full
 * citation, attribution, translation basis, edit lineage — lives here.
 */
function InspectPanel({
	session,
	onDismiss,
}: {
	session: PrototypeSession | null
	onDismiss: () => void
}) {
	return (
		<div
			id={PANEL_ID}
			aria-live="polite"
			className="bg-muted/40 border-border/60 mt-2.5 min-h-28 rounded-2xl border p-3"
		>
			<div className="flex items-start justify-between gap-2">
				<p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
					Where this came from
				</p>
				{session ? (
					<button
						type="button"
						onClick={onDismiss}
						aria-label="Dismiss"
						className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/60 -mt-3 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2"
					>
						<Icon name="cross-1" className="size-3.5" />
					</button>
				) : null}
			</div>

			{session ? (
				<InspectReading session={session} />
			) : (
				<p className="text-muted-foreground mt-2 text-sm leading-relaxed">
					Tap a mark beside any session to see its source. The week's claim
					above covers the shape; the marks cover the sessions.
				</p>
			)}
		</div>
	)
}

function InspectReading({ session }: { session: PrototypeSession }) {
	const mark = markFor(session)
	const p = session.provenance
	return (
		<div className="mt-2">
			<div className="flex items-center gap-2">
				<p className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
					{session.weekday} · {session.title}
				</p>
				<Badge
					variant="outline"
					className={cn('shrink-0 capitalize', mark.className)}
				>
					{mark.icon ? <Icon name={mark.icon} /> : null}
					{mark.label}
				</Badge>
			</div>

			{p.kind === 'stock' ? (
				<div className="mt-2 space-y-1">
					{session.adoption ? null : (
						<p className="flex items-start gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
							<Icon name="check" className="mt-px size-3.5 shrink-0" />
							<span>trainm8 wrote this session and stands behind it.</span>
						</p>
					)}
					<p className="text-foreground text-sm leading-snug">{p.source}</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						{citationLine(p.citation)}
					</p>
					{p.translation ? (
						<div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2.5">
							<p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
								<Icon name="info-circle" className="size-3.5 shrink-0" />
								Shown in a currency the source did not use
							</p>
							<dl className="mt-1.5 space-y-0.5 text-xs">
								<div className="flex gap-2">
									<dt className="text-muted-foreground w-24 shrink-0">
										Source prescribes
									</dt>
									<dd className="text-foreground min-w-0 flex-1">
										{p.translation.sourceAnchor}
									</dd>
								</div>
								<div className="flex gap-2">
									<dt className="text-muted-foreground w-24 shrink-0">
										You see
									</dt>
									<dd className="text-foreground min-w-0 flex-1">
										{p.translation.shownAs}
									</dd>
								</div>
							</dl>
							<p className="text-muted-foreground mt-1.5 text-[11px] leading-relaxed">
								Mapped by {p.translation.basis}. It is a change of units, not a
								score for how likely the session is to work.
							</p>
						</div>
					) : null}
				</div>
			) : null}

			{p.kind === 'convention' ? (
				<div className="mt-2 space-y-1">
					<p className="text-foreground text-sm leading-snug">{p.source}</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						{p.note}
					</p>
					<p className="text-muted-foreground text-[11px] leading-relaxed italic">
						No published source to cite, and we are not claiming one.
					</p>
				</div>
			) : null}

			{p.kind === 'shared' ? (
				<div className="mt-2 space-y-1">
					<p className="text-foreground text-sm leading-snug">
						{p.attribution.handle}
						<span className="text-muted-foreground">
							{' · '}saved by {p.attribution.savedBy} athletes
						</span>
					</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						{p.source}
					</p>
					<p className="mt-1 flex items-start gap-1.5 rounded-lg border border-dashed border-zinc-400/60 px-2 py-1.5 text-[11px] leading-relaxed text-zinc-600 dark:border-zinc-500 dark:text-zinc-300">
						<Icon name="alert-triangle" className="mt-px size-3.5 shrink-0" />
						<span>
							trainm8 has not reviewed this session. It is an attribution, not a
							citation — we do not vouch for it.
						</span>
					</p>
				</div>
			) : null}

			{p.kind === 'authored' ? (
				<p className="text-muted-foreground mt-2 text-sm leading-snug">
					You wrote this session. Nothing was generated for this slot and no
					source is claimed.
				</p>
			) : null}

			{p.kind === 'unavailable' ? (
				<div className="mt-2 space-y-1">
					<p className="text-foreground text-sm leading-snug">
						Nothing was generated for this slot.
					</p>
					<p className="text-muted-foreground text-xs leading-relaxed">
						{p.reason}
					</p>
				</div>
			) : null}

			{/* Adoption's receipt: the row says the session is yours, the panel keeps
			    the lineage it was generated from. */}
			{session.adoption ? (
				<div className="border-border/70 mt-2.5 rounded-xl border border-dashed p-2.5">
					<p className="flex items-center gap-1.5 text-xs font-semibold">
						<Icon name="pencil-1" className="size-3.5 shrink-0" />
						You changed this · {session.adoption.when}
					</p>
					<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
						{session.adoption.changes.join(' · ')}
					</p>
					<p className="text-muted-foreground mt-1.5 text-[11px] leading-relaxed">
						It is your session now — the week's claim no longer describes it.
						Kept as lineage:{' '}
						{p.kind === 'stock' ? citationLine(p.citation) : p.kind}.
					</p>
				</div>
			) : null}

			<p className="text-muted-foreground border-border/60 mt-2.5 flex items-start gap-1.5 border-t pt-2 text-[11px] leading-relaxed">
				<Icon name="link-2" className="mt-px size-3.5 shrink-0" />
				<span>
					<span className="font-medium">Why it sits here:</span> {session.role}{' '}
					— that is the week's shape talking, not the source.
				</span>
			</p>
		</div>
	)
}
