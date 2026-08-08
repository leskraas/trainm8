// PROTOTYPE — Variant C, "Receipt": session rows carry zero provenance ink; the
// whole week's sourcing lives in one panel you open, laid out as a bibliography.
import { type ReactNode } from 'react'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	type Citation,
	type Provenance,
	type PrototypeSession,
	type PrototypeWeek,
	type Translation,
	citationLine,
	disciplineDot,
	sourceMark,
} from './__provenance-prototype-data.ts'

/**
 * The stance: **the plan costs the rows nothing.** An athlete reading the week
 * sees what a hand-written week looks like — title, target, duration, load,
 * shape — and not one word about where it came from. Trust is available on
 * demand, in a receipt, rather than asserted seven times on the way past.
 *
 * The one thing that may not be deferred is the thing you have to act on. The
 * Friday strength slot is not a session with a weak source; it is a slot
 * generation *refused to fill*, and a warning withheld is a warning broken
 * (#429). So the line falls here: **sources go in the receipt, absences stay in
 * the week.** Nothing else earns a row.
 *
 * The strip above the week is the claim ("every session is sourced") and the way
 * in; the receipt itself is docked at the foot of the week as a full-width
 * sheet, so opening it never pushes the plan off the screen.
 */
export function VariantC({ week }: { week: PrototypeWeek }) {
	const tally = tallyWeek(week)
	return (
		<div data-variant="C" className="mx-auto w-full max-w-md px-4 py-5">
			<header className="space-y-1.5">
				<p className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
					Week {week.weekNo} · {week.blockName} · {week.blockWeek}
				</p>
				<h1 className="text-xl font-semibold tracking-tight">{week.weekOf}</h1>
				<p className="text-foreground/80 text-sm text-pretty">
					{week.weekClaim}
				</p>
				<p className="text-muted-foreground text-xs tabular-nums">
					{week.weekTargets}
				</p>
			</header>

			{/* The whole week's provenance, as one quiet line. It makes the claim
			    once and points at the evidence; the rows below stay clean. */}
			<a
				href="#week-receipt"
				className="border-border/60 bg-muted/30 hover:bg-muted/60 mt-4 flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors"
			>
				<Icon
					name="file-text"
					size="sm"
					className="text-muted-foreground shrink-0"
				/>
				<span className="min-w-0 flex-1 text-xs leading-snug">
					<span className="text-foreground font-medium">
						Every session this week is sourced.
					</span>{' '}
					<span className="text-muted-foreground">
						Nothing on the rows — the receipt is at the foot of the week.
					</span>
				</span>
				<Icon
					name="chevron-down"
					size="sm"
					className="text-muted-foreground shrink-0"
				/>
			</a>

			<ol className="mt-3 space-y-2">
				{week.sessions.map((session) => (
					<li key={session.id}>
						{session.provenance.kind === 'unavailable' ? (
							<EmptySlotRow
								session={session}
								reason={session.provenance.reason}
							/>
						) : (
							<SessionRow session={session} />
						)}
					</li>
				))}
			</ol>

			<Receipt week={week} tally={tally} />
		</div>
	)
}

/* ------------------------------------------------------------------ the week */

/**
 * A clean row, at the house density: one bold title line, one muted micro-line
 * of `·`-joined facts, the structure strip beneath. Deliberately identical in
 * anatomy to `LedgerSessionCard` — no mark, no chip, no source, no chevron.
 */
function SessionRow({ session }: { session: PrototypeSession }) {
	const rest = session.discipline === 'rest'
	const facts = [
		disciplineLabel(session.discipline),
		session.target,
		session.durationMin == null ? null : `${session.durationMin} min`,
		session.tss == null ? null : `${session.tss} TSS`,
	].filter((fact): fact is string => fact != null)
	return (
		<article
			data-testid="session-card"
			className={cn(
				'rounded-xl border px-3.5 py-3',
				rest
					? 'border-border/50 bg-muted/20 border-dashed'
					: 'border-border/60 bg-card',
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
				<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
					{session.weekday} {session.date}
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
		</article>
	)
}

/**
 * The exception to the whole variant. Generation had no season shape carrying a
 * strength segment and wrote nothing rather than inventing something — which is
 * the one piece of provenance the athlete has to act on, so it cannot wait in a
 * panel. It reads as a gap in the plan, not as a session with a bad source.
 */
function EmptySlotRow({
	session,
	reason,
}: {
	session: PrototypeSession
	reason: string
}) {
	return (
		<article
			data-testid="session-card"
			className="rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 px-3.5 py-3"
		>
			<div className="flex items-baseline justify-between gap-2">
				<span className="flex min-w-0 items-baseline gap-2">
					<Icon
						name="alert-triangle"
						size="sm"
						className="shrink-0 translate-y-0.5 text-amber-600 dark:text-amber-400"
					/>
					<span className="truncate text-sm font-semibold">
						{session.title}
					</span>
				</span>
				<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
					{session.weekday} {session.date}
				</span>
			</div>
			<p className="text-muted-foreground mt-1 text-xs">{session.role}</p>
			<p className="text-foreground/80 mt-2 text-xs leading-relaxed text-pretty">
				{reason}
			</p>
			<div className="mt-2.5 flex flex-wrap items-center gap-2">
				<Button variant="outline" size="sm">
					<Icon name="plus" size="sm" data-icon="inline-start" />
					Add it yourself
				</Button>
				<span className="text-muted-foreground text-[11px]">
					Left in the week on purpose — the receipt hides sources, never gaps.
				</span>
			</div>
		</article>
	)
}

/** The session's intensity shape at the size of a word. Not a chart, no axis. */
function ShapeStrip({ session }: { session: PrototypeSession }) {
	return (
		<div
			aria-hidden
			className="flex h-5 w-full items-end gap-px overflow-hidden rounded"
		>
			{session.shape.map((value, index) => (
				<div
					key={index}
					style={{ height: `${Math.max(10, Math.round(value * 100))}%` }}
					className={cn(
						'min-w-px flex-1 rounded-[1px] opacity-80',
						disciplineDot(session.discipline),
					)}
				/>
			))}
		</div>
	)
}

/* --------------------------------------------------------------- the receipt */

function Receipt({ week, tally }: { week: PrototypeWeek; tally: Tally }) {
	const cited = groupCitedByAuthor(week.sessions)
	const shapePlaced = conventionsFor(
		week.sessions,
		(source) => source === week.presetName,
	)
	const houseStock = conventionsFor(
		week.sessions,
		(source) => source !== week.presetName,
	)
	const community = week.sessions.filter(
		(session) => session.provenance.kind === 'shared',
	)
	const edited = week.sessions.filter((session) => session.adoption != null)
	const missing = week.sessions.filter(
		(session) => session.provenance.kind === 'unavailable',
	)

	return (
		// Bleeds to both screen edges (the -mx-4 exactly cancels the page padding,
		// so nothing overflows) so the panel reads as a sheet docked under the week
		// rather than one more card in the stack.
		<details
			id="week-receipt"
			open
			className="group border-border/70 bg-card -mx-4 mt-4 scroll-mt-4 border-t shadow-xs"
		>
			<summary className="hover:bg-muted/40 flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors [&::-webkit-details-marker]:hidden">
				<Icon
					name="file-text"
					size="sm"
					className="text-muted-foreground shrink-0"
				/>
				<span className="min-w-0 flex-1">
					<span className="block text-sm font-semibold">
						Where this week came from
					</span>
					<span className="text-muted-foreground block text-xs">
						{tally.line}
					</span>
				</span>
				<Icon
					name="chevron-down"
					size="sm"
					className="text-muted-foreground shrink-0 transition-transform group-open:rotate-180"
				/>
			</summary>

			<div className="border-border/70 space-y-6 border-t px-4 pt-4 pb-6">
				<p className="text-muted-foreground text-xs leading-relaxed text-pretty">
					Top to bottom, this is the week's bibliography: the season shape that
					laid out the days, then each source with the sessions it wrote. What
					trainm8 vouches for and what it does not are kept apart on purpose.
				</p>

				{/* 1 — the shape that placed the days, before any workout source. */}
				<Section
					eyebrow="The season shape"
					mark={markFor({
						kind: 'stock',
						source: week.presetName,
						citation: week.presetCitation,
					})}
				>
					<div className="border-border/60 bg-muted/20 space-y-2 rounded-xl border p-3">
						<p className="text-sm font-medium">{week.presetName}</p>
						<p className="text-muted-foreground text-xs leading-relaxed break-words">
							{citationLine(week.presetCitation)}
						</p>
						<p className="text-foreground/80 text-xs leading-relaxed text-pretty">
							Chose the block pattern — {week.blockName}, {week.blockWeek} — and
							where the days fall. It does not choose the workouts.
						</p>
						{shapePlaced.length > 0 ? (
							<div className="border-border/60 space-y-2 border-t pt-2">
								{shapePlaced.map(({ session, note }) => (
									<UsedBy key={session.id} session={session} note={note} />
								))}
							</div>
						) : null}
					</div>
				</Section>

				{/* 2 — the vouched citations, grouped by author. */}
				<Section
					eyebrow="Cited sources"
					mark={markFor(cited[0]?.entries[0]?.session.provenance)}
					caption="trainm8 wrote these from a published source and stands behind the reading."
				>
					<div className="space-y-3">
						{cited.map((group) => (
							<div
								key={group.author}
								className="border-border/60 bg-muted/20 space-y-3 rounded-xl border p-3"
							>
								<p className="text-sm font-medium">{group.author}</p>
								{group.entries.map((entry) => (
									<div key={entry.session.id} className="space-y-2">
										<p className="text-muted-foreground text-xs leading-relaxed break-words">
											{citationLine(entry.citation)}
										</p>
										<UsedBy
											session={entry.session}
											note={`Rendered as “${entry.sourceLabel}”`}
											trailing={
												entry.session.adoption ? (
													<span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[11px]">
														<Icon name="pencil-1" size="xs" />
														edited
													</span>
												) : null
											}
										/>
										{entry.translation ? (
											<TranslationNote translation={entry.translation} />
										) : null}
									</div>
								))}
							</div>
						))}
					</div>
				</Section>

				{/* 3 — in-house work with nothing to cite; must not borrow authority. */}
				{houseStock.length > 0 ? (
					<Section
						eyebrow="trainm8 stock"
						mark={markFor(houseStock[0]?.session.provenance)}
						caption="Ordinary practice, written in-house. There is no published protocol behind these and we are not claiming one."
					>
						<div className="border-border/60 space-y-3 rounded-xl border border-dashed p-3">
							{houseStock.map(({ session, note }) => (
								<UsedBy key={session.id} session={session} note={note} />
							))}
						</div>
					</Section>
				) : null}

				{/* 4 — a different kind of claim, so a different box. Never mixed in
				    with the citations above. */}
				{community.length > 0 ? (
					<Section
						eyebrow="Not vouched for"
						mark={markFor(community[0]?.provenance)}
					>
						<div className="border-border space-y-3 rounded-xl border border-dashed bg-zinc-500/5 p-3">
							{community.map((session) => {
								const provenance = session.provenance
								if (provenance.kind !== 'shared') return null
								return (
									<div key={session.id} className="space-y-2">
										<p className="text-sm font-medium">
											{provenance.attribution.handle}
										</p>
										<p className="text-muted-foreground text-xs">
											{provenance.source} · saved by{' '}
											{provenance.attribution.savedBy} athletes
										</p>
										<UsedBy session={session} />
										<p className="text-foreground/80 border-border/60 border-t pt-2 text-xs leading-relaxed text-pretty">
											<span className="font-medium">
												trainm8 has not reviewed this session.
											</span>{' '}
											It carries an author, not a citation, and it never can —
											another athlete's work is attributed, not vouched for.
										</p>
									</div>
								)
							})}
						</div>
					</Section>
				) : null}

				{/* 5 — provenance as a record of departures, not a badge. */}
				{edited.length > 0 ? (
					<Section
						eyebrow="Your changes"
						mark={<Mark tone="authored" label="yours" />}
						caption="What generation produced, and what you did to it since."
					>
						<div className="space-y-3">
							{edited.map((session) => (
								<div
									key={session.id}
									className="border-border/60 bg-muted/20 space-y-2 rounded-xl border p-3"
								>
									<div className="flex items-baseline justify-between gap-2">
										<p className="min-w-0 truncate text-sm font-medium">
											{session.weekday} · {session.title}
										</p>
										<span className="text-muted-foreground shrink-0 text-[11px]">
											{session.adoption?.when}
										</span>
									</div>
									<ul className="space-y-1.5">
										{(session.adoption?.changes ?? []).map((change) => (
											<li
												key={change}
												className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
											>
												<Diff change={change} />
											</li>
										))}
									</ul>
									<p className="text-muted-foreground text-[11px] leading-relaxed text-pretty">
										The citation above still holds — editing adopted the
										session, it did not erase where it came from.
									</p>
								</div>
							))}
						</div>
					</Section>
				) : null}

				{/* 6 — the one entry that also appears in the week itself. */}
				{missing.length > 0 ? (
					<Section
						eyebrow="Nothing was written"
						mark={markFor(missing[0]?.provenance)}
					>
						<div className="space-y-2 rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 p-3">
							{missing.map((session) => (
								<div key={session.id} className="space-y-1">
									<p className="text-sm font-medium">
										{session.weekday} {session.date} · {session.title}
									</p>
									<p className="text-muted-foreground text-xs leading-relaxed text-pretty">
										{session.provenance.kind === 'unavailable'
											? session.provenance.reason
											: null}
									</p>
								</div>
							))}
							<p className="text-foreground/80 text-xs leading-relaxed text-pretty">
								This one is also in the week above. Sources can wait until you
								ask for them; a slot you may have to fill yourself cannot.
							</p>
						</div>
					</Section>
				) : null}
			</div>
		</details>
	)
}

/**
 * The lossy translation, stated as a property of the anchor. Two currencies and
 * the basis for moving between them — never a percentage, a bar or a score,
 * because "how sure are we" is not the question the athlete asked.
 */
function TranslationNote({ translation }: { translation: Translation }) {
	return (
		<div className="border-border/60 bg-background/60 space-y-2 rounded-lg border p-2.5">
			<p className="flex items-center gap-1.5 text-xs font-medium">
				<Icon
					name="info-circle"
					size="xs"
					className="text-muted-foreground shrink-0"
				/>
				Shown in a different currency than the source prescribed
			</p>
			<dl className="space-y-1 text-xs">
				<div className="flex flex-wrap gap-x-2">
					<dt className="text-muted-foreground shrink-0">Source prescribes</dt>
					<dd className="min-w-0 font-medium tabular-nums">
						{translation.sourceAnchor}
					</dd>
				</div>
				<div className="flex flex-wrap gap-x-2">
					<dt className="text-muted-foreground shrink-0">You see</dt>
					<dd className="min-w-0 font-medium tabular-nums">
						{translation.shownAs}
					</dd>
				</div>
				<div className="flex flex-wrap gap-x-2">
					<dt className="text-muted-foreground shrink-0">Mapping</dt>
					<dd className="min-w-0">{translation.basis}</dd>
				</div>
			</dl>
			<p className="text-muted-foreground text-[11px] leading-relaxed text-pretty">
				A judgement about how the two currencies line up — not a confidence
				score, and not something the source says. If you train by lactate, use
				the source's number.
			</p>
		</div>
	)
}

/** One change, as a departure: what was generated, then what it is now. */
function Diff({ change }: { change: string }) {
	const [before, after] = change.split('→')
	if (before == null || after == null) {
		return <span className="text-foreground">{change}</span>
	}
	return (
		<>
			<span className="text-muted-foreground line-through">
				{before.trim()}
			</span>
			<Icon
				name="arrow-right"
				size="xs"
				className="text-muted-foreground shrink-0"
			/>
			<span className="text-foreground font-medium">{after.trim()}</span>
		</>
	)
}

/* ------------------------------------------------------------------- pieces */

function Section({
	eyebrow,
	mark,
	caption,
	children,
}: {
	eyebrow: string
	mark?: ReactNode
	caption?: string
	children: ReactNode
}) {
	return (
		<section className="space-y-2">
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
					{eyebrow}
				</h2>
				{mark}
			</div>
			{caption ? (
				<p className="text-muted-foreground text-xs leading-relaxed text-pretty">
					{caption}
				</p>
			) : null}
			{children}
		</section>
	)
}

/** A session as it appears in the bibliography: which day used this source. */
function UsedBy({
	session,
	note,
	trailing,
}: {
	session: PrototypeSession
	note?: string
	trailing?: ReactNode
}) {
	return (
		<div className="flex items-start gap-2">
			<span
				aria-hidden
				className={cn(
					'mt-1.5 size-1.5 shrink-0 rounded-full',
					disciplineDot(session.discipline),
				)}
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate text-xs font-medium">
					{session.weekday} · {session.title}
				</p>
				<p className="text-muted-foreground text-[11px] leading-relaxed text-pretty">
					{note ? `${note} · ` : null}
					{session.role}
				</p>
			</div>
			{trailing}
		</div>
	)
}

/**
 * The word the other variants print beside every session title. Variant C prints
 * it nowhere near a row — it survives only as a section mark, said once per kind
 * of source instead of once per session. That is the whole argument, in one
 * component's placement.
 */
function markFor(provenance: Provenance | undefined): ReactNode {
	if (!provenance) return null
	return <Mark {...sourceMark(provenance)} />
}

function Mark({ tone, label }: { tone: string; label: string }) {
	return (
		<Badge variant="outline" className={cn('font-medium', markTone(tone))}>
			{label}
		</Badge>
	)
}

function markTone(tone: string): string {
	switch (tone) {
		case 'stock':
			return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
		case 'shared':
			return 'border-zinc-500/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300'
		case 'unavailable':
			return 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
		default:
			return 'border-border bg-muted text-muted-foreground'
	}
}

/* -------------------------------------------------------------------- shapes */

type CitedEntry = {
	session: PrototypeSession
	citation: Citation
	sourceLabel: string
	translation?: Translation
}

type CitedGroup = { author: string; entries: CitedEntry[] }

/**
 * Grouped by author rather than by session, because that is what makes this a
 * bibliography: both Daniels sessions sit under one name with their own
 * locators, instead of repeating the same book twice down a list.
 */
function groupCitedByAuthor(sessions: PrototypeSession[]): CitedGroup[] {
	const groups: CitedGroup[] = []
	for (const session of sessions) {
		const provenance = session.provenance
		if (provenance.kind !== 'stock') continue
		const entry: CitedEntry = {
			session,
			citation: provenance.citation,
			sourceLabel: provenance.source,
			translation: provenance.translation,
		}
		const existing = groups.find(
			(group) => group.author === provenance.citation.author,
		)
		if (existing) {
			existing.entries.push(entry)
		} else {
			groups.push({ author: provenance.citation.author, entries: [entry] })
		}
	}
	return groups
}

/**
 * Conventions split by what they name as their source: the ones the season shape
 * placed belong under the shape's own citation, the rest are house stock with
 * nothing to cite.
 */
function conventionsFor(
	sessions: PrototypeSession[],
	matches: (source: string) => boolean,
): Array<{ session: PrototypeSession; note: string }> {
	const rows: Array<{ session: PrototypeSession; note: string }> = []
	for (const session of sessions) {
		const provenance = session.provenance
		if (provenance.kind !== 'convention') continue
		if (!matches(provenance.source)) continue
		rows.push({ session, note: provenance.note })
	}
	return rows
}

type Tally = { line: string }

/** The receipt's own micro-line — the week's sourcing counted, not adjectives. */
function tallyWeek(week: PrototypeWeek): Tally {
	let cited = 0
	let stock = 0
	let community = 0
	let missing = 0
	let edited = 0
	for (const session of week.sessions) {
		if (session.adoption) edited += 1
		switch (session.provenance.kind) {
			case 'stock':
				cited += 1
				break
			case 'convention':
				stock += 1
				break
			case 'shared':
				community += 1
				break
			case 'unavailable':
				missing += 1
				break
			case 'authored':
				break
		}
	}
	const parts = [
		cited > 0 ? `${cited} cited` : null,
		stock > 0 ? `${stock} trainm8 stock` : null,
		community > 0 ? `${community} community` : null,
		edited > 0 ? `${edited} edited by you` : null,
		missing > 0 ? `${missing} not written` : null,
	].filter((part): part is string => part != null)
	return { line: parts.join(' · ') }
}

function disciplineLabel(discipline: PrototypeSession['discipline']): string {
	return discipline === 'run'
		? 'Run'
		: discipline === 'strength'
			? 'Strength'
			: 'Rest'
}
