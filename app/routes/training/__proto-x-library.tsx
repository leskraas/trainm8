import { useMemo, useState } from 'react'
import { cn } from '#app/utils/misc.tsx'
import {
	FOCUS_META,
	MACRO_TEMPLATES,
	MESO_TEMPLATES,
	RHYTHM_LABEL,
	deriveBlockWeeks,
	instantiate,
	instantiateMacro,
	projectBlockCtl,
	type BlockFocus,
	type MesoBlock,
} from './__proto-x-blocks-model.ts'
import {
	FALLBACK_PLAN,
	formatEventDate,
	type ProtoPlanInput,
} from './__proto-x-model.ts'

// PROTOTYPE variant G — "Library". The same block engine as variant F, but
// entered through a template gallery: browse common season shapes (race
// builds, block periodization, off-season strength, open-ended maintenance
// loops), preview each as a card, apply one, then tweak the applied plan as
// a horizontal strip of block cards. Browse → apply → adjust, instead of
// configure-from-scratch.

export function LibraryVariant({ plan }: { plan: ProtoPlanInput }) {
	const source = plan ?? FALLBACK_PLAN
	const [applied, setApplied] = useState<{
		macroId: string
		anchored: boolean
		blocks: MesoBlock[]
	} | null>(null)
	const [selectedBlock, setSelectedBlock] = useState<number | null>(null)

	const weeks = useMemo(
		() => (applied ? deriveBlockWeeks(applied.blocks) : []),
		[applied],
	)
	const repeats = applied && !applied.anchored ? 2 : 1
	const ctl = useMemo(
		() => (weeks.length ? projectBlockCtl(weeks, repeats) : []),
		[weeks, repeats],
	)
	const maxTss = Math.max(...weeks.map((w) => w.tss), 1)

	function patchBlock(index: number, patch: Partial<MesoBlock>) {
		setApplied((a) =>
			a
				? {
						...a,
						macroId: '',
						blocks: a.blocks.map((b, i) =>
							i === index ? { ...b, ...patch } : b,
						),
					}
				: a,
		)
	}

	return (
		<main className="mx-auto max-w-4xl px-4 py-6">
			<h1 className="text-xl font-bold">Plan library</h1>
			<p className="text-muted-foreground text-sm">
				Start from a proven season shape — race builds with an end date, or
				open-ended cycles that repeat until you point them at an event.
			</p>

			{/* ── The gallery ────────────────────────────────────────────────── */}
			<div className="mt-4 grid gap-3 sm:grid-cols-2">
				{MACRO_TEMPLATES.map((m) => {
					const mWeeks = deriveBlockWeeks(m.blocks.map(instantiate))
					const mMax = Math.max(...mWeeks.map((w) => w.tss), 1)
					const isApplied = applied?.macroId === m.id
					return (
						<button
							key={m.id}
							type="button"
							onClick={() => {
								setApplied({
									macroId: m.id,
									anchored: m.anchored,
									blocks: instantiateMacro(m),
								})
								setSelectedBlock(null)
							}}
							className={cn(
								'rounded-xl border p-4 text-left transition-colors',
								isApplied
									? 'border-foreground bg-muted/50'
									: 'hover:bg-muted/30',
							)}
						>
							<div className="flex items-start justify-between gap-2">
								<div className="text-sm font-bold">{m.name}</div>
								<span
									className={cn(
										'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
										m.anchored
											? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
											: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
									)}
								>
									{m.anchored ? '🏁 to a race' : '↻ repeats'}
								</span>
							</div>
							<p className="text-muted-foreground mt-1 min-h-8 text-xs">
								{m.description}
							</p>
							{/* mini preview */}
							<div className="mt-2 flex h-12 items-end gap-px">
								{mWeeks.map((w) => (
									<span
										key={w.index}
										className="flex-1 rounded-t-sm"
										style={{
											background: FOCUS_META[w.focus].hex,
											opacity: w.isEasy ? 0.35 : 0.9,
											height: `${15 + (w.tss / mMax) * 85}%`,
										}}
									/>
								))}
							</div>
							<div className="text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
								<span>{mWeeks.length} wk/cycle</span>
								{[...new Set(m.blocks.map((b) => b.focus))].map((f) => (
									<span key={f} className="flex items-center gap-1">
										<span
											className="size-1.5 rounded-sm"
											style={{ background: FOCUS_META[f].hex }}
										/>
										{FOCUS_META[f].label}
									</span>
								))}
							</div>
							{isApplied && (
								<div className="mt-2 text-xs font-bold">✓ applied below</div>
							)}
						</button>
					)
				})}
			</div>

			{/* ── The applied plan ───────────────────────────────────────────── */}
			{applied ? (
				<div className="mt-6 rounded-xl border p-4">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="text-sm font-bold">
							{applied.anchored ? (
								<>
									Applied — ends at {source.eventName},{' '}
									{formatEventDate(source.eventDate)}
								</>
							) : (
								<>
									Applied — open-ended, {weeks.length}-week cycle, repeats
									until retired
								</>
							)}
						</h2>
						<span className="text-muted-foreground text-xs">
							CTL after {repeats > 1 ? `2 cycles` : 'the plan'}:{' '}
							<strong>{ctl[ctl.length - 1]}</strong>
						</span>
					</div>

					{/* Block strip: the plan as tappable block cards */}
					<div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
						{applied.blocks.map((b, i) => (
							<button
								key={b.id}
								type="button"
								onClick={() =>
									setSelectedBlock((s) => (s === i ? null : i))
								}
								className={cn(
									'min-w-28 shrink-0 rounded-lg border-2 p-2 text-left',
									selectedBlock === i
										? 'border-foreground'
										: 'border-transparent',
								)}
								style={{ background: `${FOCUS_META[b.focus].hex}22` }}
							>
								<div
									className="text-xs font-bold"
									style={{ color: FOCUS_META[b.focus].hex }}
								>
									{b.name}
								</div>
								<div className="text-muted-foreground text-[11px] tabular-nums">
									{b.weeks} wk · {b.hours} h/wk
								</div>
								<div className="text-muted-foreground text-[11px]">
									{RHYTHM_LABEL[b.rhythm]}
								</div>
							</button>
						))}
						{!applied.anchored && (
							<div className="text-muted-foreground grid min-w-16 shrink-0 place-items-center text-2xl">
								↻
							</div>
						)}
					</div>

					{/* Tweak panel for the selected block */}
					{selectedBlock != null && applied.blocks[selectedBlock] && (
						<BlockTweaks
							block={applied.blocks[selectedBlock]!}
							onPatch={(p) => patchBlock(selectedBlock, p)}
						/>
					)}

					{/* Week bars for the applied plan */}
					<div className="mt-3 flex h-24 items-end gap-px">
						{Array.from({ length: repeats }).flatMap((_, rep) =>
							weeks.map((w) => (
								<span
									key={`${rep}-${w.index}`}
									className="flex-1 rounded-t-sm"
									style={{
										background: FOCUS_META[w.focus].hex,
										opacity: (w.isEasy ? 0.35 : 0.9) * (rep > 0 ? 0.45 : 1),
										height: `${12 + (w.tss / maxTss) * 88}%`,
									}}
									title={`Week ${w.index + 1} · ${w.blockName} · ${w.hours} h ≈ ${w.tss} TSS${w.isEasy ? ' · easy week' : ''}${rep > 0 ? ' · next repeat' : ''}`}
								/>
							)),
						)}
						{applied.anchored && <span className="pl-1 text-sm">🏁</span>}
					</div>
					<p className="text-muted-foreground mt-2 text-xs">
						Dimmed bars are easy weeks (−30%). Strength blocks: gym sessions
						carry no TSS — the weekly target covers endurance hours only.
					</p>

					<div className="mt-3 flex flex-wrap gap-1">
						<span className="text-muted-foreground mr-1 self-center text-xs font-semibold">
							Add a block:
						</span>
						{MESO_TEMPLATES.map((t) => (
							<button
								key={t.name}
								type="button"
								onClick={() =>
									setApplied((a) =>
										a
											? {
													...a,
													macroId: '',
													blocks: [...a.blocks, instantiate(t)],
												}
											: a,
									)
								}
								className="hover:bg-muted min-h-9 rounded-full border px-2.5 text-xs font-semibold"
							>
								<span
									className="mr-1 inline-block size-2 rounded-sm"
									style={{ background: FOCUS_META[t.focus].hex }}
								/>
								＋ {t.name}
							</button>
						))}
					</div>

					<div className="mt-4 flex justify-end">
						<button
							type="button"
							disabled
							className="bg-foreground text-background rounded-lg px-5 py-2.5 text-sm font-bold opacity-60"
							title="Prototype — writing the Plan Outline is not wired"
						>
							Save Plan Outline (prototype — not wired)
						</button>
					</div>
				</div>
			) : (
				<div className="text-muted-foreground mt-6 rounded-xl border border-dashed p-6 text-center text-sm">
					Pick a template above to see it applied against{' '}
					{source.eventName} — or as an open-ended repeating cycle.
				</div>
			)}
		</main>
	)
}

function BlockTweaks({
	block,
	onPatch,
}: {
	block: MesoBlock
	onPatch: (p: Partial<MesoBlock>) => void
}) {
	return (
		<div className="mt-2 rounded-lg border p-3 text-sm">
			<div className="flex flex-wrap items-center gap-4">
				<span
					className="rounded-full px-2.5 py-1 text-xs font-bold text-white"
					style={{ background: FOCUS_META[block.focus].hex }}
				>
					{block.name}
				</span>
				<label className="flex items-center gap-2 text-xs">
					Weeks
					<span className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => onPatch({ weeks: Math.max(1, block.weeks - 1) })}
							className="bg-muted grid size-8 place-items-center rounded-md font-bold"
							aria-label="Fewer weeks"
						>
							−
						</button>
						<span className="w-8 text-center font-semibold tabular-nums">
							{block.weeks}
						</span>
						<button
							type="button"
							onClick={() => onPatch({ weeks: block.weeks + 1 })}
							className="bg-muted grid size-8 place-items-center rounded-md font-bold"
							aria-label="More weeks"
						>
							＋
						</button>
					</span>
				</label>
				<label className="flex min-w-40 flex-1 items-center gap-2 text-xs">
					{block.hours} h/wk
					<input
						type="range"
						min={2}
						max={14}
						step={0.5}
						value={block.hours}
						onChange={(e) => onPatch({ hours: Number(e.target.value) })}
						className="flex-1"
					/>
				</label>
				<div className="flex gap-1 rounded-lg border p-0.5 text-xs font-semibold">
					{(['3:1', '2:1', 'none'] as const).map((r) => (
						<button
							key={r}
							type="button"
							onClick={() => onPatch({ rhythm: r })}
							className={cn(
								'min-h-8 rounded-md px-2',
								block.rhythm === r && 'bg-foreground text-background',
							)}
						>
							{RHYTHM_LABEL[r]}
						</button>
					))}
				</div>
			</div>
			<p className="text-muted-foreground mt-2 text-xs">
				{FOCUS_META[block.focus].note}
			</p>
			<div className="mt-2 flex flex-wrap gap-1">
				{(Object.keys(FOCUS_META) as BlockFocus[]).map((f) => (
					<button
						key={f}
						type="button"
						onClick={() => onPatch({ focus: f, name: FOCUS_META[f].label })}
						className={cn(
							'min-h-8 rounded-full border px-2 text-[11px] font-semibold',
							block.focus === f && 'text-white',
						)}
						style={
							block.focus === f
								? {
										background: FOCUS_META[f].hex,
										borderColor: FOCUS_META[f].hex,
									}
								: undefined
						}
					>
						{FOCUS_META[f].label}
					</button>
				))}
			</div>
		</div>
	)
}
