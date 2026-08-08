// PROTOTYPE — how a generated week says where it came from (#437): the week
// reads like a hand-written plan; every word about its sourcing is one tap away.
import { type ReactNode, useEffect, useState } from 'react'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	type PrototypeSession,
	type PrototypeWeek,
	citationLine,
	disciplineDot,
} from './__provenance-prototype-data.ts'

/**
 * The resolution of #437, chosen from four variants at 390 px (the other three
 * are in this branch's history, at commit 7042b2d).
 *
 * The stance: **provenance is available, not asserted.** The rows carry the
 * plan and nothing else — no marks, no badges, no source lines. Tapping any row
 * opens a drawer holding everything about that session; a quiet `Sources` link
 * in the header opens the same drawer on the week's whole bibliography.
 *
 * Two things still show through, and both are deliberate:
 *
 *   1. **A translated number wears `≈`.** Thursday's pace is a lactate
 *      prescription rendered in a currency the source never used, and it is a
 *      number the athlete executes. The app already reserves `≈` for a value
 *      that was derived rather than authored (Target Resolution), so this is
 *      one character of existing vocabulary rather than a warning — subtle
 *      enough to ignore, honest enough to notice, and it explains itself in the
 *      drawer.
 *   2. **An empty slot stays in the week.** Friday is not a session with a weak
 *      source; it is a slot generation refused to fill. A source can wait
 *      behind a tap, an absence cannot (#429). It is drawn quietly — dashed and
 *      muted — rather than as an alarm.
 *
 * Everything else — citations, the community non-vouch, what you changed after
 * generation ran — is drawer-only.
 */
export function ProvenanceWeek({ week }: { week: PrototypeWeek }) {
	const [open, setOpen] = useState<
		{ kind: 'session'; id: string } | { kind: 'week' } | null
	>(null)

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setOpen(null)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	const openSession =
		open?.kind === 'session'
			? (week.sessions.find((s) => s.id === open.id) ?? null)
			: null

	return (
		<div data-provenance-week="" className="mx-auto w-full max-w-md px-4 py-5">
			<header className="space-y-1.5">
				<p className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
					Week {week.weekNo} · {week.blockName} · {week.blockWeek}
				</p>
				<h1 className="text-xl font-semibold tracking-tight">{week.weekOf}</h1>
				<p className="text-foreground/80 text-sm text-pretty">
					{week.weekClaim}
				</p>
				<div className="flex items-baseline justify-between gap-3 pt-0.5">
					<p className="text-muted-foreground text-xs tabular-nums">
						{week.weekTargets}
					</p>
					{/* The only provenance affordance on the whole screen. It says
					    where, not what — the drawer does the talking. */}
					<button
						type="button"
						onClick={() => setOpen({ kind: 'week' })}
						className="text-muted-foreground hover:text-foreground -my-2 -mr-1.5 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1.5 text-xs transition-colors"
					>
						Sources
						<Icon name="chevron-right" className="size-3.5" />
					</button>
				</div>
			</header>

			<div className="mt-4 space-y-2">
				{week.sessions.map((session) =>
					session.provenance.kind === 'unavailable' ? (
						<EmptySlotRow key={session.id} session={session} />
					) : (
						<SessionRow
							key={session.id}
							session={session}
							onOpen={() => setOpen({ kind: 'session', id: session.id })}
						/>
					),
				)}
			</div>

			<Drawer
				open={open != null}
				onClose={() => setOpen(null)}
				title={
					openSession
						? `${openSession.weekday} ${openSession.date}`
						: 'This week'
				}
			>
				{openSession ? (
					<SessionProvenance
						session={openSession}
						onSeeWeek={() => setOpen({ kind: 'week' })}
					/>
				) : (
					<WeekSources week={week} />
				)}
			</Drawer>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* The week                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The house ledger card, unchanged. The whole card is the tap target, and the
 * only hint that there is anything behind it is a hairline chevron.
 */
function SessionRow({
	session,
	onOpen,
}: {
	session: PrototypeSession
	onOpen: () => void
}) {
	const rest = session.discipline === 'rest'
	const translated =
		session.provenance.kind === 'stock' &&
		session.provenance.translation != null
	const facts = rest
		? ['Rest day', 'no load']
		: [
				disciplineLabel(session.discipline),
				session.target == null
					? null
					: `${translated ? '≈' : ''}${session.target}`,
				session.durationMin == null ? null : `${session.durationMin} min`,
				session.tss == null ? null : `${session.tss} TSS`,
			].filter((fact): fact is string => fact != null)

	return (
		<button
			type="button"
			data-testid="session-card"
			onClick={onOpen}
			className={cn(
				'block w-full rounded-xl border px-3.5 py-3 text-left transition-colors',
				'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
				rest
					? 'border-border/50 bg-muted/20 hover:bg-muted/40 border-dashed'
					: 'border-border/60 bg-card hover:bg-muted/30',
			)}
		>
			<div className="flex items-baseline justify-between gap-2">
				<span className="flex min-w-0 items-baseline gap-2">
					<span
						aria-hidden
						className={cn(
							'size-2 shrink-0 translate-y-[-1px] rounded-full',
							disciplineDot(session.discipline),
						)}
					/>
					<span
						className={cn(
							'truncate text-sm font-semibold',
							rest ? 'text-muted-foreground' : 'text-foreground',
						)}
					>
						{session.title}
					</span>
				</span>
				<span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs tabular-nums">
					{session.weekday} {session.date}
					<Icon
						name="chevron-right"
						aria-hidden
						className="text-muted-foreground/40 size-3.5"
					/>
				</span>
			</div>
			<p className="text-muted-foreground mt-1 truncate text-xs tabular-nums">
				{facts.join(' · ')}
			</p>
			{session.shape.length > 0 ? (
				<div className="mt-2.5">
					<ShapeStrip session={session} />
				</div>
			) : null}
		</button>
	)
}

/**
 * The one row that is not about a source. Generation wrote nothing here rather
 * than inventing something, and that is a fact about the plan the athlete has
 * to act on — so it stays in the week. Drawn quietly: dashed, muted, no colour.
 */
function EmptySlotRow({ session }: { session: PrototypeSession }) {
	const reason =
		session.provenance.kind === 'unavailable' ? session.provenance.reason : ''
	return (
		<article
			data-testid="session-card"
			className="border-border/50 bg-muted/10 rounded-xl border border-dashed px-3.5 py-3"
		>
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-muted-foreground min-w-0 truncate text-sm font-medium">
					{session.title}
				</span>
				<span className="text-muted-foreground/70 shrink-0 text-xs tabular-nums">
					{session.weekday} {session.date}
				</span>
			</div>
			<p className="text-muted-foreground/80 mt-1 text-xs">{reason}</p>
			<button
				type="button"
				className="border-border/60 text-foreground hover:bg-muted/50 mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors"
			>
				<Icon name="plus" className="size-3.5" />
				Add it yourself
			</button>
		</article>
	)
}

function ShapeStrip({ session }: { session: PrototypeSession }) {
	return (
		<div aria-hidden className="flex h-3.5 items-end gap-0.5">
			{session.shape.map((height, i) => (
				<span
					key={i}
					style={{ height: `${Math.max(0.18, height) * 100}%` }}
					className={cn(
						'flex-1 rounded-[1px] opacity-70',
						disciplineDot(session.discipline),
					)}
				/>
			))}
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* The drawer                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A bottom sheet, not a floating panel (ADR 0030 rule 3 — there is no hover on
 * a phone). It holds two levels of the same story: one session, or the week's
 * whole bibliography.
 */
function Drawer({
	open,
	onClose,
	title,
	children,
}: {
	open: boolean
	onClose: () => void
	title: string
	children: ReactNode
}) {
	if (!open) return null
	return (
		<div className="fixed inset-0 z-40">
			<button
				type="button"
				aria-label="Close"
				onClick={onClose}
				className="bg-foreground/20 absolute inset-0 backdrop-blur-[1px]"
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className="border-border bg-card absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl border-t shadow-2xl"
			>
				<div className="bg-card/95 sticky top-0 z-10 px-4 pt-2.5 pb-3 backdrop-blur">
					<div
						aria-hidden
						className="bg-border mx-auto mb-3 h-1 w-9 rounded-full"
					/>
					<div className="flex items-baseline justify-between gap-3">
						<p className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
							{title}
						</p>
						<button
							type="button"
							onClick={onClose}
							aria-label="Close"
							className="text-muted-foreground hover:text-foreground -my-2 -mr-1 grid size-11 place-items-center rounded-full"
						>
							<Icon name="cross-1" className="size-4" />
						</button>
					</div>
				</div>
				<div className="px-4 pb-8">{children}</div>
			</div>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Drawer level 1 — one session                                                */
/* -------------------------------------------------------------------------- */

function SessionProvenance({
	session,
	onSeeWeek,
}: {
	session: PrototypeSession
	onSeeWeek: () => void
}) {
	const p = session.provenance
	return (
		<div className="space-y-5">
			<h2 className="text-lg font-semibold tracking-tight">{session.title}</h2>

			{p.kind === 'stock' ? (
				<section className="space-y-2">
					<Label>Where it came from</Label>
					<p className="text-sm font-medium">{p.source}</p>
					<p className="text-muted-foreground text-sm">
						{citationLine(p.citation)}
					</p>
					<Vouch>trainm8 wrote this session from a published source.</Vouch>
					{p.translation ? (
						<div className="border-border/70 bg-muted/30 mt-3 space-y-2 rounded-xl border p-3">
							<p className="text-sm font-medium">
								Shown in a currency the source did not use
							</p>
							<dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1 text-sm">
								<dt className="text-muted-foreground">Source prescribes</dt>
								<dd>{p.translation.sourceAnchor}</dd>
								<dt className="text-muted-foreground">You see</dt>
								<dd className="tabular-nums">{p.translation.shownAs}</dd>
								<dt className="text-muted-foreground">Mapping</dt>
								<dd>{p.translation.basis}</dd>
							</dl>
							<p className="text-muted-foreground text-xs">
								That is why the pace is written{' '}
								<span className="mx-0.5">≈</span>. It is a change of units, not
								a score for how likely the session is to work — if you train by
								lactate, use the source's number.
							</p>
						</div>
					) : null}
				</section>
			) : null}

			{p.kind === 'convention' ? (
				<section className="space-y-2">
					<Label>Where it came from</Label>
					<p className="text-sm font-medium">{p.source}</p>
					<p className="text-muted-foreground text-sm">{p.note}</p>
					<p className="text-muted-foreground text-xs">
						Ordinary practice, written in-house. There is no published protocol
						behind it and we are not claiming one.
					</p>
				</section>
			) : null}

			{p.kind === 'shared' ? (
				<section className="space-y-2">
					<Label>Where it came from</Label>
					<p className="text-sm font-medium">{p.source}</p>
					<p className="text-muted-foreground flex items-center gap-1.5 text-sm">
						<Icon name="avatar" className="size-3.5" />
						{p.attribution.handle} · saved by {p.attribution.savedBy} athletes
					</p>
					<div className="border-border/70 mt-2 rounded-xl border border-dashed p-3">
						<p className="text-sm font-medium">Not vouched for</p>
						<p className="text-muted-foreground mt-1 text-sm">
							Written by another athlete, not by trainm8. It carries an author,
							not a citation, and it never can. Saves are popularity, not
							evidence.
						</p>
					</div>
				</section>
			) : null}

			{session.adoption ? (
				<section className="space-y-2">
					<Label>What you changed</Label>
					<ul className="space-y-1.5">
						{session.adoption.changes.map((change) => {
							const [from, to] = change.split('→').map((part) => part.trim())
							return (
								<li
									key={change}
									className="flex items-center gap-2 text-sm tabular-nums"
								>
									<span className="text-muted-foreground line-through">
										{from}
									</span>
									<Icon
										name="arrow-right"
										aria-hidden
										className="text-muted-foreground/60 size-3"
									/>
									<span className="font-medium">{to}</span>
								</li>
							)
						})}
					</ul>
					<p className="text-muted-foreground text-xs">
						Edited {session.adoption.when.toLowerCase()}. The citation above
						still holds — editing adopted the session, it did not erase where it
						came from.
					</p>
				</section>
			) : null}

			<section className="space-y-1.5">
				<Label>Why it sits here</Label>
				<p className="text-muted-foreground text-sm">{session.role}</p>
			</section>

			<button
				type="button"
				onClick={onSeeWeek}
				className="border-border/70 hover:bg-muted/50 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3.5 text-sm transition-colors"
			>
				All sources for this week
				<Icon name="chevron-right" className="size-4" />
			</button>
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Drawer level 2 — the week's bibliography                                    */
/* -------------------------------------------------------------------------- */

function WeekSources({ week }: { week: PrototypeWeek }) {
	const cited = week.sessions.filter((s) => s.provenance.kind === 'stock')
	const house = week.sessions.filter((s) => s.provenance.kind === 'convention')
	const shared = week.sessions.filter((s) => s.provenance.kind === 'shared')
	const edited = week.sessions.filter((s) => s.adoption != null)
	const missing = week.sessions.filter(
		(s) => s.provenance.kind === 'unavailable',
	)

	const byAuthor = new Map<string, PrototypeSession[]>()
	for (const session of cited) {
		if (session.provenance.kind !== 'stock') continue
		const author = session.provenance.citation.author
		byAuthor.set(author, [...(byAuthor.get(author) ?? []), session])
	}

	return (
		<div className="space-y-6">
			<div className="space-y-1.5">
				<h2 className="text-lg font-semibold tracking-tight">
					Where this week came from
				</h2>
				<p className="text-muted-foreground text-sm">
					{cited.length} sessions from published sources, {house.length} written
					in-house, {shared.length} from the community.
				</p>
			</div>

			<section className="space-y-2">
				<Label>The season shape</Label>
				<p className="text-sm font-medium">{week.presetName}</p>
				<p className="text-muted-foreground text-sm">
					{citationLine(week.presetCitation)}
				</p>
				<p className="text-muted-foreground text-xs">
					The shape places the week's rest and quality days. It does not write
					the sessions.
				</p>
			</section>

			{[...byAuthor.entries()].map(([author, sessions], authorIndex) => (
				<section key={author} className="space-y-2">
					{/* The label names the *kind* of source once; the authors below it
					    are the bibliography proper. */}
					{authorIndex === 0 ? <Label>Cited — trainm8 vouches</Label> : null}
					<p className="text-sm font-medium">{author}</p>
					{sessions.map((session) => {
						if (session.provenance.kind !== 'stock') return null
						return (
							<div key={session.id} className="space-y-1">
								<p className="text-muted-foreground text-sm">
									{citationLine(session.provenance.citation)}
								</p>
								<p className="text-sm">
									<span className="text-muted-foreground">
										{session.weekday} ·{' '}
									</span>
									{session.title}
									{session.adoption ? (
										<span className="text-muted-foreground"> · edited</span>
									) : null}
								</p>
								{session.provenance.translation ? (
									<p className="text-muted-foreground text-xs">
										Written <span className="mx-0.5">≈</span> — the source
										prescribes {session.provenance.translation.sourceAnchor};
										the pace is a{' '}
										{session.provenance.translation.basis.toLowerCase()}{' '}
										mapping.
									</p>
								) : null}
							</div>
						)
					})}
				</section>
			))}

			<section className="space-y-2">
				<Label>Written in-house</Label>
				<p className="text-muted-foreground text-sm">
					No published protocol behind these, and we are not claiming one.
				</p>
				{house.map((session) => (
					<p key={session.id} className="text-sm">
						<span className="text-muted-foreground">{session.weekday} · </span>
						{session.title}
					</p>
				))}
			</section>

			{shared.length > 0 ? (
				<section className="border-border/70 space-y-2 rounded-xl border border-dashed p-3">
					<Label>Not vouched for</Label>
					{shared.map((session) => (
						<div key={session.id} className="space-y-1">
							<p className="text-sm">
								<span className="text-muted-foreground">
									{session.weekday} ·{' '}
								</span>
								{session.title}
							</p>
							{session.provenance.kind === 'shared' ? (
								<p className="text-muted-foreground text-sm">
									{session.provenance.attribution.handle} · saved by{' '}
									{session.provenance.attribution.savedBy} athletes
								</p>
							) : null}
						</div>
					))}
					<p className="text-muted-foreground text-xs">
						Community sessions carry an author, not a citation.
					</p>
				</section>
			) : null}

			{edited.length > 0 ? (
				<section className="space-y-2">
					<Label>Your changes</Label>
					{edited.map((session) => (
						<div key={session.id} className="space-y-1">
							<p className="text-sm">
								<span className="text-muted-foreground">
									{session.weekday} ·{' '}
								</span>
								{session.title}
							</p>
							<p className="text-muted-foreground text-sm tabular-nums">
								{session.adoption?.changes.join(' · ')}
							</p>
						</div>
					))}
				</section>
			) : null}

			{missing.length > 0 ? (
				<section className="space-y-2">
					<Label>Nothing was written</Label>
					{missing.map((session) => (
						<div key={session.id} className="space-y-1">
							<p className="text-sm">
								<span className="text-muted-foreground">
									{session.weekday} ·{' '}
								</span>
								{session.title}
							</p>
							<p className="text-muted-foreground text-sm">
								{session.provenance.kind === 'unavailable'
									? session.provenance.reason
									: null}
							</p>
						</div>
					))}
				</section>
			) : null}
		</div>
	)
}

/* -------------------------------------------------------------------------- */

function Label({ children }: { children: ReactNode }) {
	return (
		<p className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
			{children}
		</p>
	)
}

function Vouch({ children }: { children: ReactNode }) {
	return (
		<p className="flex items-start gap-1.5 text-sm">
			<Icon
				name="check"
				aria-hidden
				className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
			/>
			<span>{children}</span>
		</p>
	)
}

function disciplineLabel(discipline: PrototypeSession['discipline']): string {
	return discipline === 'run'
		? 'Run'
		: discipline === 'strength'
			? 'Strength'
			: 'Rest'
}
