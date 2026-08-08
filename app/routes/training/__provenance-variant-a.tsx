// Variant A — "Cited line": provenance is ambient and per-session, a third muted
// micro-line under every session's title and facts, always visible, tapping into
// a fixed inspect panel rather than a tooltip (ADR 0030 rule 3).
import { useEffect, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	citationLine,
	disciplineDot,
	sourceMark,
	type Discipline,
	type PrototypeSession,
	type PrototypeWeek,
} from './__provenance-prototype-data.ts'

// Copy kept out of JSX so apostrophes stay plain text.
const COPY = {
	headerHint: 'Every session says where it came from.',
	vouch: 'trainm8 wrote this session from a published source.',
	vouchAdapted:
		'trainm8 wrote the original from a published source. What you run now is your version of it.',
	notScore:
		'This is a translation between currencies, not a confidence score. The source never prescribed a pace.',
	lineage:
		'You changed it, so the citation stays as lineage: what you run now is adapted from the source, not the source itself.',
	noSource: 'trainm8 stock. No external source, and none is being claimed.',
	nonVouch:
		'trainm8 has not reviewed this session. It comes from another athlete and carries no citation.',
	refused:
		'Nothing was generated for this slot. The blank is the answer, not a zero.',
} as const

const INK = {
	cited: 'text-emerald-600 dark:text-emerald-400',
	caveat: 'text-amber-600 dark:text-amber-400',
	quiet: 'text-muted-foreground',
} as const

export function VariantA({ week }: { week: PrototypeWeek }) {
	const [inspectedId, setInspectedId] = useState<string | null>(null)
	const inspected = week.sessions.find((s) => s.id === inspectedId) ?? null

	useEffect(() => {
		if (!inspected) return
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setInspectedId(null)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [inspected])

	return (
		<div data-variant="A" className="mx-auto w-full max-w-[430px]">
			{/* Week header: phase, claim, targets. It makes no provenance claim of
			    its own — in this variant the sessions carry all of it. */}
			<header className="px-4 pt-6 pb-4">
				<p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
					Week {week.weekNo} · {week.weekOf}
				</p>
				<h1 className="text-foreground mt-1 text-xl font-semibold tracking-tight">
					{week.blockName}{' '}
					<span className="text-muted-foreground text-base font-normal">
						{week.blockWeek}
					</span>
				</h1>
				<p className="text-muted-foreground mt-1.5 text-sm leading-snug">
					{week.weekClaim}
				</p>
				<p className="text-foreground mt-2.5 text-xs font-medium tabular-nums">
					{week.weekTargets}
				</p>
				<p className="text-muted-foreground/70 mt-1 text-[11px]">
					{COPY.headerHint}
				</p>
			</header>

			<div className="flex flex-col gap-2 px-4">
				{week.sessions.map((session) => (
					<SessionCard
						key={session.id}
						session={session}
						inspected={session.id === inspectedId}
						onInspect={() =>
							setInspectedId((current) =>
								current === session.id ? null : session.id,
							)
						}
					/>
				))}
			</div>

			{/* Keeps the last card reachable above the fixed panel. */}
			<div className={cn('transition-all', inspected ? 'h-96' : 'h-6')} />

			{inspected ? (
				<InspectPanel
					session={inspected}
					onClose={() => setInspectedId(null)}
				/>
			) : null}
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* The dense row: title line, facts line, source line. Nothing else.          */
/* -------------------------------------------------------------------------- */

function SessionCard({
	session,
	inspected,
	onInspect,
}: {
	session: PrototypeSession
	inspected: boolean
	onInspect: () => void
}) {
	const missing = session.provenance.kind === 'unavailable'
	const rest = session.discipline === 'rest'
	return (
		<article
			data-testid="session-card"
			data-session={session.id}
			className={cn(
				'bg-card border-border/60 rounded-xl border px-3.5 pt-3 pb-1',
				(missing || rest) && 'border-dashed',
				missing && 'bg-muted/20',
				inspected && 'border-border ring-border ring-1',
			)}
		>
			<div className="flex items-baseline justify-between gap-2">
				<span className="flex min-w-0 items-baseline gap-2">
					<span
						className={cn(
							'size-2 shrink-0 translate-y-[-1px] rounded-full',
							disciplineDot(session.discipline),
							missing && 'opacity-40',
						)}
					/>
					<span
						className={cn(
							'truncate text-sm leading-snug font-semibold',
							missing ? 'text-muted-foreground' : 'text-foreground',
						)}
					>
						{session.title}
					</span>
				</span>
				<span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
					{session.weekday} {session.date}
				</span>
			</div>

			<FactsLine session={session} />
			<ShapeStrip shape={session.shape} discipline={session.discipline} />

			<button
				type="button"
				onClick={onInspect}
				aria-expanded={inspected}
				className={cn(
					'-mx-1.5 mt-0.5 flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left',
					'hover:bg-muted/60 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
					inspected && 'bg-muted',
				)}
			>
				<SourceLine session={session} />
			</button>
		</article>
	)
}

/** The house micro-line: `·`-joined facts, plus the caveat that belongs to the
 *  number itself (a translated pace, an edited prescription) sitting next to it. */
function FactsLine({ session }: { session: PrototypeSession }) {
	const p = session.provenance
	if (p.kind === 'unavailable') {
		return (
			<p className="text-muted-foreground mt-1 text-[11px]">
				<span className="capitalize">{session.discipline}</span> · no session
				generated · no load
			</p>
		)
	}
	if (session.discipline === 'rest') {
		return (
			<p className="text-muted-foreground mt-1 text-[11px]">
				Rest day · no load
			</p>
		)
	}
	const translated = p.kind === 'stock' && p.translation != null
	return (
		<p className="text-muted-foreground mt-1 flex items-center gap-2 text-[11px]">
			<span className="truncate tabular-nums">
				{session.durationMin != null ? `${session.durationMin} min` : null}
				{session.tss != null ? ` · ${session.tss} TSS` : null}
				{session.target ? ' · ' : null}
				{session.target ? (
					<span
						className={cn(
							'font-medium',
							translated ? INK.caveat : 'text-foreground',
						)}
					>
						{session.target}
					</span>
				) : null}
			</span>
			{translated ? (
				<Caveat icon="update" text="pace translated" />
			) : session.adoption ? (
				<Caveat
					icon="pencil-1"
					text={`edited ${session.adoption.when.toLowerCase()}`}
				/>
			) : null}
		</p>
	)
}

function Caveat({ icon, text }: { icon: IconName; text: string }) {
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center gap-1 text-[11px]',
				INK.caveat,
			)}
		>
			<Icon name={icon} className="size-3" />
			{text}
		</span>
	)
}

/**
 * The always-on third line. One mark word, then the source in `·`-joined muted
 * text, then — for a community session — the non-vouch, which never truncates
 * away. Five kinds, five visibly different readings.
 */
function SourceLine({ session }: { session: PrototypeSession }) {
	const p = session.provenance
	const mark = sourceMark(p)

	if (p.kind === 'stock') {
		const adapted = session.adoption != null
		return (
			<>
				<Mark
					icon={adapted ? 'link-2' : 'file-text'}
					ink={INK.cited}
					label={adapted ? 'adapted' : mark.label}
				/>
				<span className="text-muted-foreground min-w-0 truncate text-[11px]">
					{adapted ? 'from ' : null}
					{p.source} · {p.citation.author}, {p.citation.year}
				</span>
			</>
		)
	}

	if (p.kind === 'convention') {
		return (
			<>
				<Mark icon={null} ink={INK.quiet} label={mark.label} />
				<span className="text-muted-foreground min-w-0 truncate text-[11px]">
					{/* Don't say "stock · trainm8 stock" — the mark already said it. */}
					{p.source.toLowerCase().includes(mark.label)
						? null
						: `${p.source} · `}
					{lowerFirst(firstSentence(p.note))}
				</span>
			</>
		)
	}

	if (p.kind === 'shared') {
		return (
			<>
				<Mark icon="avatar" ink="text-foreground" label={mark.label} />
				<span className="text-muted-foreground min-w-0 truncate text-[11px]">
					{p.attribution.handle} · saved by {p.attribution.savedBy}
				</span>
				<span
					className={cn(
						'ml-auto inline-flex shrink-0 items-center gap-1 text-[11px]',
						INK.caveat,
					)}
				>
					<Icon name="info-circle" className="size-3" />
					not reviewed
				</span>
			</>
		)
	}

	if (p.kind === 'unavailable') {
		return (
			<>
				<Mark icon="alert-triangle" ink={INK.caveat} label={mark.label} />
				<span className="text-muted-foreground min-w-0 truncate text-[11px]">
					{lowerFirst(firstSentence(p.reason))}
				</span>
			</>
		)
	}

	return (
		<>
			<Mark icon="pencil-1" ink="text-foreground" label={mark.label} />
			<span className="text-muted-foreground min-w-0 truncate text-[11px]">
				you wrote this
			</span>
		</>
	)
}

function Mark({
	icon,
	ink,
	label,
}: {
	icon: IconName | null
	ink: string
	label: string
}) {
	return (
		<span
			className={cn(
				'inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold tracking-wide uppercase',
				ink,
			)}
		>
			{icon ? <Icon name={icon} className="size-3" /> : null}
			{label}
		</span>
	)
}

function ShapeStrip({
	shape,
	discipline,
}: {
	shape: number[]
	discipline: Discipline
}) {
	if (shape.length === 0) return null
	return (
		<div className="mt-2 flex h-4 w-full items-end gap-px overflow-hidden rounded-[2px]">
			{shape.map((h, i) => (
				<div
					key={i}
					style={{ height: `${Math.round(h * 100)}%` }}
					className={cn(
						'min-w-px flex-1 rounded-[1px] opacity-70',
						disciplineDot(discipline),
					)}
				/>
			))}
		</div>
	)
}

/* -------------------------------------------------------------------------- */
/* Tap-to-inspect: a fixed panel pinned to the viewport bottom. Never a tooltip. */
/* -------------------------------------------------------------------------- */

function InspectPanel({
	session,
	onClose,
}: {
	session: PrototypeSession
	onClose: () => void
}) {
	const p = session.provenance
	return (
		<aside
			role="region"
			aria-label={`Source for ${session.title}`}
			className="border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t shadow-[0_-8px_28px_rgba(0,0,0,0.14)]"
		>
			<div className="mx-auto max-h-[58vh] w-full max-w-[430px] overflow-y-auto px-4 pt-3 pb-20">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
							{session.weekday} {session.date} · source
						</p>
						<p className="text-foreground mt-0.5 truncate text-sm font-semibold">
							{session.title}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close source panel"
						className="hover:bg-muted focus-visible:ring-ring -mt-1 -mr-1.5 grid size-11 shrink-0 place-items-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
					>
						<Icon name="cross-1" className="size-4" />
					</button>
				</div>

				<div className="mt-3 flex flex-col gap-3">
					{p.kind === 'stock' ? (
						<>
							<Row label={session.adoption ? 'Adapted from' : 'Cited'}>
								<span className="text-foreground">{p.source}</span>
								<span className="text-muted-foreground mt-0.5 block">
									{citationLine(p.citation)}
								</span>
							</Row>
							<p className={cn('text-xs', INK.cited)}>
								{session.adoption ? COPY.vouchAdapted : COPY.vouch}
							</p>
							{p.translation ? (
								<Note tone="caveat" icon="update" title="Translated number">
									<Pair k="Source prescribes" v={p.translation.sourceAnchor} />
									<Pair k="Shown to you" v={p.translation.shownAs} />
									<Pair k="Mapping" v={p.translation.basis} />
									<p className="text-muted-foreground mt-2">{COPY.notScore}</p>
								</Note>
							) : null}
						</>
					) : null}

					{p.kind === 'convention' ? (
						<>
							<Row label="Stock session">
								<span className="text-foreground">{p.source}</span>
								<span className="text-muted-foreground mt-0.5 block">
									{p.note}
								</span>
							</Row>
							<p className="text-muted-foreground text-xs">{COPY.noSource}</p>
						</>
					) : null}

					{p.kind === 'shared' ? (
						<>
							<Row label="Community session">
								<span className="text-foreground">
									{p.attribution.handle} · {p.source}
								</span>
								<span className="text-muted-foreground mt-0.5 block">
									Saved by {p.attribution.savedBy} athletes
								</span>
							</Row>
							<Note tone="caveat" icon="info-circle" title="Not vouched for">
								<p>{COPY.nonVouch}</p>
							</Note>
						</>
					) : null}

					{p.kind === 'unavailable' ? (
						<Note tone="caveat" icon="alert-triangle" title="Unavailable">
							<p>{p.reason}</p>
							<p className="text-muted-foreground mt-2">{COPY.refused}</p>
						</Note>
					) : null}

					{p.kind === 'authored' ? (
						<Row label="Yours">
							<span className="text-foreground">You wrote this session.</span>
						</Row>
					) : null}

					{session.adoption ? (
						<Note
							tone="plain"
							icon="pencil-1"
							title={`You edited it — ${session.adoption.when}`}
						>
							<ul className="mt-1 flex flex-col gap-1">
								{session.adoption.changes.map((change) => (
									<li
										key={change}
										className="text-foreground flex items-center gap-1.5"
									>
										<Icon
											name="chevron-right"
											className="text-muted-foreground size-3 shrink-0"
										/>
										{change}
									</li>
								))}
							</ul>
							<p className="text-muted-foreground mt-2">{COPY.lineage}</p>
						</Note>
					) : null}

					<Row label="Why this slot">
						<span className="text-muted-foreground">{session.role}</span>
					</Row>
				</div>
			</div>
		</aside>
	)
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div>
			<p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
				{label}
			</p>
			<div className="mt-1 text-xs leading-relaxed">{children}</div>
		</div>
	)
}

function Note({
	tone,
	icon,
	title,
	children,
}: {
	tone: 'caveat' | 'plain'
	icon: IconName
	title: string
	children: ReactNode
}) {
	return (
		<div
			className={cn(
				'rounded-lg border p-2.5 text-xs leading-relaxed',
				tone === 'caveat'
					? 'border-amber-500/30 bg-amber-500/5'
					: 'border-border/60 bg-muted/30',
			)}
		>
			<p
				className={cn(
					'flex items-center gap-1.5 font-semibold',
					tone === 'caveat' ? INK.caveat : 'text-foreground',
				)}
			>
				<Icon name={icon} className="size-3.5 shrink-0" />
				{title}
			</p>
			<div className="mt-1.5">{children}</div>
		</div>
	)
}

function Pair({ k, v }: { k: string; v: string }) {
	return (
		<p className="text-muted-foreground">
			{k}: <span className="text-foreground">{v}</span>
		</p>
	)
}

function firstSentence(text: string): string {
	const cut = text.indexOf('. ')
	const first = cut === -1 ? text : text.slice(0, cut)
	return first.replace(/\.$/, '')
}

function lowerFirst(text: string): string {
	return text.charAt(0).toLowerCase() + text.slice(1)
}
