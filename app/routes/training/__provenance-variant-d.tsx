// PROTOTYPE — Variant D, "Three resolutions, said once": the block states the model, the week states its claim and its dominant source, and a session speaks only when it disagrees with its week or carries a caveat the week cannot carry.
import { useEffect, useState, type ReactNode } from 'react'
import { Badge } from '#app/components/ui/badge.tsx'
import { Icon, type IconName } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	citationLine,
	disciplineDot,
	sourceMark,
	type Citation,
	type PrototypeSession,
	type PrototypeWeek,
} from './__provenance-prototype-data.ts'

/* -------------------------------------------------------------------------- */
/* Deriving the three resolutions                                             */
/* -------------------------------------------------------------------------- */

function citationKey(c: Citation): string {
	return `${c.author}|${c.work}|${c.year}`
}

/** Surname + year — the short form a dense row can afford. */
function shortCite(c: Citation): string {
	const surname = c.author.split(' ').slice(-1)[0] ?? c.author
	return `${surname} ${c.year}`
}

/**
 * The source the week can speak for: the citation shared by the most sessions.
 * The week states this once; sessions that match it stay silent.
 */
function dominantSource(week: PrototypeWeek) {
	const tally = new Map<string, { citation: Citation; count: number }>()
	for (const session of week.sessions) {
		if (session.provenance.kind !== 'stock') continue
		const key = citationKey(session.provenance.citation)
		const seen = tally.get(key)
		if (seen) seen.count += 1
		else tally.set(key, { citation: session.provenance.citation, count: 1 })
	}
	let best: { citation: Citation; count: number } | null = null
	for (const entry of tally.values()) {
		if (!best || entry.count > best.count) best = entry
	}
	return best
}

type Speech = {
	tone: 'caveat' | 'departure' | 'outside' | 'missing'
	icon: IconName
	lead: string
	rest: string
}

/**
 * The four cases where a row overrides the week's statement. Everything else
 * returns null and pays nothing — that silence is the variant's whole claim.
 */
function speechFor(
	session: PrototypeSession,
	dominantKey: string | null,
): Speech | null {
	const p = session.provenance
	if (p.kind === 'unavailable') {
		return {
			tone: 'missing',
			icon: 'alert-octagon',
			lead: 'Not planned',
			rest: 'nothing was invented for this slot',
		}
	}
	if (session.adoption) {
		return {
			tone: 'departure',
			icon: 'pencil-1',
			lead: `Edited ${session.adoption.when.toLowerCase()}`,
			rest: `${session.adoption.changes.length} changes · source kept`,
		}
	}
	if (p.kind === 'shared') {
		return {
			tone: 'outside',
			icon: 'avatar',
			lead: p.attribution.handle,
			rest: 'community · not vouched',
		}
	}
	if (p.kind === 'authored') {
		return {
			tone: 'outside',
			icon: 'pencil-2',
			lead: 'Yours',
			rest: 'written outside the plan',
		}
	}
	if (p.kind === 'stock') {
		const offClaim = citationKey(p.citation) !== dominantKey
		const dominantName = dominantKey?.split('|')[0]?.split(' ').slice(-1)[0]
		if (p.translation) {
			return {
				tone: 'caveat',
				icon: 'alert-triangle',
				lead: 'Translated',
				rest:
					offClaim && dominantName
						? `${shortCite(p.citation)}, not ${dominantName}`
						: shortCite(p.citation),
			}
		}
		if (offClaim) {
			return {
				tone: 'outside',
				icon: 'file-text',
				lead: 'Different source',
				rest: shortCite(p.citation),
			}
		}
	}
	return null
}

type Row = {
	session: PrototypeSession
	speech: Speech | null
	/** Which statement covers a silent row: the week's citation, or the shape. */
	node: 'cited' | 'shape'
}

const speechTone: Record<Speech['tone'], string> = {
	caveat:
		'bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
	departure: 'bg-muted text-muted-foreground',
	outside: 'bg-muted text-muted-foreground',
	missing: 'bg-muted text-foreground',
}

const markTone: Record<string, string> = {
	stock: 'border-emerald-600/40 text-emerald-700 dark:text-emerald-300',
	convention: 'border-border text-muted-foreground',
	shared: 'border-amber-500/50 text-amber-700 dark:text-amber-300',
	authored: 'border-border text-foreground',
	unavailable: 'border-dashed border-border text-muted-foreground',
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export function VariantD({ week }: { week: PrototypeWeek }) {
	const [openKey, setOpenKey] = useState<string | null>(null)

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setOpenKey(null)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [])

	function toggle(key: string) {
		setOpenKey((current) => (current === key ? null : key))
	}

	const dominant = dominantSource(week)
	const dominantKey = dominant ? citationKey(dominant.citation) : null

	const rows: Row[] = week.sessions.map((session) => ({
		session,
		speech: speechFor(session, dominantKey),
		node: session.provenance.kind === 'stock' ? 'cited' : 'shape',
	}))

	// Contiguous runs of silent rows get one bracket each; a run that speaks
	// breaks the bracket, which is the point.
	const groups: Array<{ covered: boolean; rows: Row[] }> = []
	for (const row of rows) {
		const covered = row.speech === null
		const last = groups[groups.length - 1]
		if (last && last.covered === covered) last.rows.push(row)
		else groups.push({ covered, rows: [row] })
	}

	const silentCount = rows.filter((r) => r.speech === null).length
	const departed = week.sessions.filter(
		(s) =>
			s.adoption &&
			s.provenance.kind === 'stock' &&
			citationKey(s.provenance.citation) === dominantKey,
	).length

	const openSession = openKey?.startsWith('s:')
		? (week.sessions.find((s) => `s:${s.id}` === openKey) ?? null)
		: null
	const openRow = openSession
		? (rows.find((r) => r.session.id === openSession.id) ?? null)
		: null

	return (
		<section
			data-variant="D"
			className="mx-auto w-full max-w-[430px] px-4 pt-4 pb-4"
		>
			{/* ---- Resolution 1: the block. The model everything sits inside. ---- */}
			<button
				type="button"
				aria-expanded={openKey === 'block'}
				onClick={() => toggle('block')}
				className={cn(
					'flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
					openKey === 'block'
						? 'border-border bg-muted ring-ring/40 ring-2'
						: 'border-border bg-muted/40 hover:bg-muted/70',
				)}
			>
				<span className="min-w-0 flex-1">
					<span className="text-muted-foreground block text-[10px] font-medium tracking-wider uppercase">
						Block · the model
					</span>
					<span className="text-foreground mt-0.5 block truncate text-sm font-semibold">
						{week.blockName} · {week.blockWeek}
					</span>
					<span className="text-muted-foreground mt-0.5 block truncate text-[11px]">
						{week.presetName} · {shortCite(week.presetCitation)}
					</span>
				</span>
				<Icon
					name="info-circle"
					className="text-muted-foreground size-4 shrink-0"
					aria-hidden
				/>
			</button>

			{/* One nesting step: the week and its sessions live inside the block. */}
			<div className="mt-2 pl-2">
				{/* ---- Resolution 2: the week. Its role, and the source it can
				     speak for on behalf of the rows below. ---- */}
				<div
					className={cn(
						'bg-card rounded-xl border px-3 py-3 transition-colors',
						openKey === 'week'
							? 'border-border ring-ring/40 ring-2'
							: 'border-border',
					)}
				>
					<p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
						Week {week.weekNo} · {week.weekOf}
					</p>
					<p className="text-foreground mt-1 text-sm leading-snug font-semibold">
						{week.weekClaim}
					</p>
					<p className="text-muted-foreground mt-1 text-[11px] tabular-nums">
						{week.weekTargets}
					</p>
					{dominant ? (
						<button
							type="button"
							aria-expanded={openKey === 'week'}
							onClick={() => toggle('week')}
							className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-lg bg-emerald-500/10 px-2.5 py-2 text-left transition-colors hover:bg-emerald-500/15"
						>
							<Icon
								name="file-text"
								className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-300"
								aria-hidden
							/>
							<span className="min-w-0 flex-1 text-[11px] leading-snug text-emerald-800 dark:text-emerald-200">
								<span className="font-semibold">
									{dominant.count} sessions cited to{' '}
									{shortCite(dominant.citation)}
								</span>
								<span className="block truncate opacity-80">
									{dominant.citation.work} — trainm8 vouches for these
								</span>
							</span>
							<Icon
								name="chevron-down"
								className={cn(
									'size-3.5 shrink-0 text-emerald-700 transition-transform dark:text-emerald-300',
									openKey === 'week' && 'rotate-180',
								)}
								aria-hidden
							/>
						</button>
					) : null}
					<p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
						<span className="inline-flex items-center gap-1.5">
							<span className="size-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
							cited above
						</span>
						<span className="inline-flex items-center gap-1.5">
							<span className="size-1.5 rounded-full ring-1 ring-zinc-400 ring-inset dark:ring-zinc-500" />
							placed by the shape
						</span>
					</p>
				</div>

				{/* ---- Resolution 3: the sessions. Bracketed rows inherit; boxed
				     rows speak. ---- */}
				<div className="mt-2 space-y-2">
					{groups.map((group, i) =>
						group.covered ? (
							<CoveredGroup
								key={`g${i}`}
								rows={group.rows}
								openKey={openKey}
								onToggle={toggle}
							/>
						) : (
							<div key={`g${i}`} className="space-y-2">
								{group.rows.map((row) => (
									<SessionRow
										key={row.session.id}
										row={row}
										open={openKey === `s:${row.session.id}`}
										onToggle={toggle}
									/>
								))}
							</div>
						),
					)}
				</div>

				<p className="text-muted-foreground mt-3 px-1 text-[11px] leading-relaxed">
					{silentCount} of {week.sessions.length} sessions say nothing of their
					own — they are covered by the two statements above. Tap any row for
					the detail.
				</p>
			</div>

			{/* ---- Tap-to-inspect: one fixed panel, never a floating tooltip. ---- */}
			{openKey ? (
				<div className="sticky bottom-20 z-30 mt-3">
					<InspectPanel
						week={week}
						dominant={dominant}
						departed={departed}
						openKey={openKey}
						row={openRow}
						onClose={() => setOpenKey(null)}
					/>
				</div>
			) : null}
		</section>
	)
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A run of silent rows, drawn as one bracket hanging off the week's statement:
 * vertical rule down the left, curving into the sentence that names what covers
 * them. "No mark" therefore never has to be guessed at.
 */
function CoveredGroup({
	rows,
	openKey,
	onToggle,
}: {
	rows: Row[]
	openKey: string | null
	onToggle: (key: string) => void
}) {
	return (
		<div className="relative pl-4">
			<span
				aria-hidden
				className="pointer-events-none absolute top-1 bottom-[18px] left-0 w-3 rounded-bl-lg border-b-2 border-l-2 border-zinc-300 dark:border-zinc-700"
			/>
			<div className="space-y-0.5">
				{rows.map((row) => (
					<SessionRow
						key={row.session.id}
						row={row}
						open={openKey === `s:${row.session.id}`}
						onToggle={onToggle}
					/>
				))}
			</div>
			<p className="text-muted-foreground mt-1.5 pl-1 text-[11px]">
				{rows.length === 1
					? '1 session inherits'
					: `${rows.length} sessions inherit`}{' '}
				the statements above
			</p>
		</div>
	)
}

function SessionRow({
	row,
	open,
	onToggle,
}: {
	row: Row
	open: boolean
	onToggle: (key: string) => void
}) {
	const { session, speech } = row
	const silent = speech === null
	const unavailable = session.provenance.kind === 'unavailable'
	return (
		<button
			type="button"
			data-testid="session-card"
			aria-expanded={open}
			onClick={() => onToggle(`s:${session.id}`)}
			className={cn(
				'relative w-full rounded-lg px-3 py-2.5 text-left transition-colors',
				silent
					? 'hover:bg-muted/50'
					: unavailable
						? 'bg-card border-border border border-dashed'
						: 'bg-card border-border border',
				open && 'ring-ring/50 bg-muted/50 ring-2',
			)}
		>
			{/* The node on the bracket: filled = cited above, hollow = placed by
			    the shape. Only silent rows carry one. */}
			{silent ? (
				<span
					aria-hidden
					className={cn(
						'absolute top-4 -left-[18px] size-1.5 rounded-full',
						row.node === 'cited'
							? 'bg-zinc-400 dark:bg-zinc-500'
							: 'bg-background ring-1 ring-zinc-400 ring-inset dark:ring-zinc-500',
					)}
				/>
			) : null}

			<span className="flex items-baseline justify-between gap-2">
				<span className="flex min-w-0 items-baseline gap-2">
					<span className="text-muted-foreground w-8 shrink-0 text-[11px] font-medium tracking-wide uppercase">
						{session.weekday}
					</span>
					<span
						className={cn(
							'truncate text-sm font-semibold',
							unavailable ? 'text-muted-foreground' : 'text-foreground',
						)}
					>
						{session.title}
					</span>
				</span>
				{session.durationMin != null || session.tss != null ? (
					<span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
						{session.durationMin != null ? `${session.durationMin} min` : null}
						{session.durationMin != null && session.tss != null ? ' · ' : null}
						{session.tss != null ? `${session.tss} TSS` : null}
					</span>
				) : (
					<Badge
						variant="outline"
						className="text-muted-foreground h-4 shrink-0 border-dashed px-1.5 text-[10px]"
					>
						n/a
					</Badge>
				)}
			</span>

			<span className="mt-1 flex items-center justify-between gap-2 pl-10">
				<span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px]">
					<span
						className={cn(
							'size-1.5 shrink-0 rounded-full',
							disciplineDot(session.discipline),
						)}
					/>
					<span className="truncate">
						{session.target ? `${session.target} · ` : null}
						{session.role}
					</span>
				</span>
				{session.shape.length > 0 ? <ShapeStrip bars={session.shape} /> : null}
			</span>

			{speech ? (
				<span
					className={cn(
						'mt-1.5 ml-10 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]',
						speechTone[speech.tone],
					)}
				>
					<Icon
						name={speech.icon}
						className={cn(
							'size-3.5 shrink-0',
							speech.tone === 'missing' && 'text-amber-600 dark:text-amber-400',
						)}
						aria-hidden
					/>
					<span className="min-w-0 flex-1 truncate">
						<span className="font-semibold">{speech.lead}</span>
						{' · '}
						{speech.rest}
					</span>
					<Icon
						name="chevron-down"
						className={cn(
							'size-3 shrink-0 opacity-70 transition-transform',
							open && 'rotate-180',
						)}
						aria-hidden
					/>
				</span>
			) : null}
		</button>
	)
}

function ShapeStrip({ bars }: { bars: number[] }) {
	return (
		<span aria-hidden className="flex h-3.5 w-14 shrink-0 items-end gap-px">
			{bars.map((bar, i) => (
				<span
					key={i}
					className="bg-foreground/15 flex-1 rounded-[1px]"
					style={{ height: `${Math.max(14, Math.round(bar * 100))}%` }}
				/>
			))}
		</span>
	)
}

/* -------------------------------------------------------------------------- */
/* Inspect panel                                                               */
/* -------------------------------------------------------------------------- */

function InspectPanel({
	week,
	dominant,
	departed,
	openKey,
	row,
	onClose,
}: {
	week: PrototypeWeek
	dominant: { citation: Citation; count: number } | null
	departed: number
	openKey: string
	row: Row | null
	onClose: () => void
}) {
	const level: 'block' | 'week' | 'session' =
		openKey === 'block' ? 'block' : openKey === 'week' ? 'week' : 'session'
	// A silent row's facts are owned by the statement above it — the breadcrumb
	// highlights the level that actually holds the claim.
	const owner: 'block' | 'week' | 'session' =
		level !== 'session'
			? level
			: row?.speech
				? 'session'
				: row?.node === 'cited'
					? 'week'
					: 'block'

	return (
		<div className="border-border bg-card rounded-xl border p-3 shadow-lg">
			<div className="flex items-start justify-between gap-2">
				<p className="text-muted-foreground mt-1 min-w-0 flex-1 truncate text-[11px]">
					<Crumb active={owner === 'block'}>{week.blockName}</Crumb>
					{' ▸ '}
					<Crumb active={owner === 'week'}>Week {week.weekNo}</Crumb>
					{' ▸ '}
					<Crumb active={owner === 'session'}>
						{row ? `${row.session.weekday} ${row.session.date}` : '—'}
					</Crumb>
				</p>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close"
					className="text-muted-foreground hover:text-foreground -my-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-lg"
				>
					<Icon name="cross-1" className="size-4" aria-hidden />
				</button>
			</div>

			{level === 'block' ? (
				<BlockBody week={week} />
			) : level === 'week' ? (
				<WeekBody week={week} dominant={dominant} departed={departed} />
			) : row ? (
				<SessionBody week={week} row={row} dominant={dominant} />
			) : null}
		</div>
	)
}

function Crumb({ active, children }: { active: boolean; children: ReactNode }) {
	return (
		<span className={cn(active && 'text-foreground font-semibold')}>
			{children}
		</span>
	)
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="mt-2.5">
			<p className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
				{label}
			</p>
			<p className="text-foreground mt-0.5 text-xs leading-relaxed">
				{children}
			</p>
		</div>
	)
}

function Note({
	tone = 'muted',
	children,
}: {
	tone?: 'muted' | 'caveat'
	children: ReactNode
}) {
	return (
		<p
			className={cn(
				'mt-2.5 rounded-lg p-2.5 text-xs leading-relaxed',
				tone === 'caveat'
					? 'bg-amber-500/10 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200'
					: 'bg-muted text-muted-foreground',
			)}
		>
			{children}
		</p>
	)
}

function BlockBody({ week }: { week: PrototypeWeek }) {
	return (
		<div className="mt-1">
			<p className="text-foreground text-sm font-semibold">{week.presetName}</p>
			<Field label="Season shape">{citationLine(week.presetCitation)}</Field>
			<Field label="Where this week sits">
				{week.blockName} · {week.blockWeek}
			</Field>
			<Note>
				The shape decides which weeks push and which back off. Everything below
				inherits it unless a row says otherwise.
			</Note>
		</div>
	)
}

function WeekBody({
	week,
	dominant,
	departed,
}: {
	week: PrototypeWeek
	dominant: { citation: Citation; count: number } | null
	departed: number
}) {
	return (
		<div className="mt-1">
			<p className="text-foreground text-sm leading-snug font-semibold">
				{week.weekClaim}
			</p>
			<Field label="This week">
				{week.weekOf} · {week.weekTargets}
			</Field>
			{dominant ? (
				<>
					<Field label="Source the week speaks for">
						{citationLine(dominant.citation)}
					</Field>
					<Note>
						Covers {dominant.count} of {week.sessions.length} sessions
						{departed > 0
							? `, ${departed} of which you have since edited — that one now speaks for itself`
							: null}
						. trainm8 vouches for what it cites here; every row outside the
						claim carries its own line.
					</Note>
				</>
			) : null}
		</div>
	)
}

function SessionBody({
	week,
	row,
	dominant,
}: {
	week: PrototypeWeek
	row: Row
	dominant: { citation: Citation; count: number } | null
}) {
	const { session } = row
	const p = session.provenance
	const mark = sourceMark(p)
	return (
		<div className="mt-1">
			<div className="flex items-start justify-between gap-2">
				<p className="text-foreground min-w-0 flex-1 text-sm leading-snug font-semibold">
					{session.title}
				</p>
				<Badge
					variant="outline"
					className={cn('shrink-0', markTone[mark.tone] ?? 'border-border')}
				>
					{mark.label}
				</Badge>
			</div>

			<Field label="Why this slot">{session.role}</Field>

			{p.kind === 'stock' ? (
				<>
					<Field label="Source">{p.source}</Field>
					<Field label="Citation">{citationLine(p.citation)}</Field>
					{p.translation ? (
						<Note tone="caveat">
							<span className="font-semibold">Translated currency.</span> The
							source prescribes {p.translation.sourceAnchor}. We render{' '}
							{p.translation.shownAs}. The mapping is {p.translation.basis} — it
							is a change of currency, not a confidence score.
						</Note>
					) : null}
				</>
			) : null}

			{p.kind === 'convention' ? (
				<>
					<Field label="Source">{p.source}</Field>
					<Note>
						{p.note} Covered by the shape, not by a citation — there is no
						external work to point at.
					</Note>
				</>
			) : null}

			{p.kind === 'shared' ? (
				<>
					<Field label="Author">
						{p.attribution.handle} · {p.source}
					</Field>
					<Field label="Saved by">{p.attribution.savedBy} athletes</Field>
					<Note tone="caveat">
						<span className="font-semibold">Not vouched.</span> trainm8 has not
						reviewed this session and it carries no citation. It sits outside
						the week&rsquo;s claim; saves are popularity, not evidence.
					</Note>
				</>
			) : null}

			{p.kind === 'authored' ? (
				<Note>You wrote this one. No source is claimed for it.</Note>
			) : null}

			{p.kind === 'unavailable' ? (
				<Note>
					<span className="text-foreground font-semibold">
						No session was generated.
					</span>{' '}
					{p.reason} The slot is left empty on purpose — an invented session
					would be worse than a gap.
				</Note>
			) : null}

			{session.adoption ? (
				<div className="border-border mt-2.5 rounded-lg border border-dashed p-2.5">
					<p className="text-foreground text-xs font-semibold">
						<Icon name="pencil-1" className="mr-1.5 size-3.5" aria-hidden />
						Edited {session.adoption.when.toLowerCase()}
					</p>
					<ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
						{session.adoption.changes.map((change) => (
							<li key={change} className="flex items-start gap-1.5">
								<span className="mt-1.5 size-1 shrink-0 rounded-full bg-current" />
								<span>{change}</span>
							</li>
						))}
					</ul>
					<p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
						It has left the generated week, so it no longer answers to the
						week&rsquo;s claim. The source it came from is still recorded above.
					</p>
				</div>
			) : null}

			{row.speech === null ? (
				<Note>
					<span className="text-foreground font-semibold">
						Silent by inheritance.
					</span>{' '}
					This row states nothing of its own because it agrees with{' '}
					{row.node === 'cited' && dominant
						? `the week: ${citationLine(dominant.citation)}`
						: `the block: ${week.presetName}`}
					.
				</Note>
			) : null}
		</div>
	)
}
