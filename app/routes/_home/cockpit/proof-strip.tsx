// Proof zone: the Personal Records strip — derived best-efforts that show
// training is working (#134). Reproduces the prototype's PRChips treatment
// (eyebrow label · value · gain pill) over real, derived records. With no
// qualifying efforts it shows an empty/Unavailable state, never a fabricated
// zero. v1 records are all "farthest distance" (higher-is-better), so a present
// delta is always a gain — rendered as a green chevron-up pill.
import { Icon } from '#app/components/ui/icon.tsx'
import { type ProofRecord } from './presenter.ts'
import { DiscDot } from './shared.tsx'

export function ProofStrip({ records }: { records: ProofRecord[] }) {
	if (records.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No personal records yet — they appear once you've logged recorded
				efforts.
			</p>
		)
	}
	return (
		<div className="flex flex-wrap gap-2">
			{records.map((pr) => (
				<div
					key={pr.discipline}
					className="bg-card border-border/60 flex items-center gap-3 rounded-xl border px-3 py-2"
				>
					<DiscDot discipline={pr.discipline} />
					<div>
						<p className="text-muted-foreground text-[11px] tracking-wide uppercase">
							{pr.label}
						</p>
						<p className="text-foreground text-base font-semibold tabular-nums">
							{pr.value}
						</p>
					</div>
					{pr.delta ? (
						<span
							aria-label={`${pr.delta} over previous best`}
							className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400"
						>
							<Icon name="chevron-up" className="size-3" />
							{pr.delta}
						</span>
					) : (
						<span className="text-muted-foreground bg-muted rounded-full px-1.5 py-0.5 text-[11px] font-medium">
							First
						</span>
					)}
				</div>
			))}
		</div>
	)
}
