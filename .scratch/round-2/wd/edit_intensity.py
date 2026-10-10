import sys

p = sys.argv[1]
s = open(p).read()


def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:80], s.count(old))
    s = s.replace(old, new)


rep("""import { formatPaceClock } from '#app/utils/format.ts'
import { POWER_REF_LABELS } from '#app/utils/intensity-target.ts'
import { cn } from '#app/utils/misc.tsx'
""", """import { formatPaceClock } from '#app/utils/format.ts'
import { POWER_REF_LABELS } from '#app/utils/intensity-target.ts'
import { INTENSITY_POPOVER_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
""")
rep("""const KIND_GROUP_LABELS: Record<KindGroup, string> = {
	pace: 'pace',
	watts: 'watts',
	heartRate: 'heart rate',
	lactate: 'lactate',
	rpe: 'RPE',
}
""", """const L = INTENSITY_POPOVER_LABELS

const KIND_GROUP_LABELS: Record<KindGroup, string> = L.kinds
""")
rep("""		if (target) announce?.(`Intensity set to ${intensityChipText(target)}`)""", """		if (target) announce?.(L.announce(intensityChipText(target)))""")
rep("""				<span className="text-body-2xs">or set:</span>""", """				<span className="text-caption">{L.orSet}</span>""")
rep("""							<span aria-hidden className="text-muted-foreground/50 px-0.5">
								·
							</span>""", """							<span aria-hidden className="text-muted-foreground px-0.5">
								·
							</span>""")
rep("""								'hover:text-foreground focus-visible:ring-ring min-h-11 cursor-pointer rounded-sm px-1 text-sm outline-none focus-visible:ring-2',""", """								'hover:text-foreground focus-visible:ring-ring pressable min-h-11 cursor-pointer rounded-lg px-1.5 text-sm outline-none focus-visible:ring-2',""")
rep("""					minLabel="Min mmol/L"
					maxLabel="Max mmol/L (optional)\"""", """					minLabel={L.from('mmol/L')}
					maxLabel={L.to('mmol/L')}""")
rep("""					minLabel="Min RPE"
					maxLabel="Max RPE (optional)\"""", """					minLabel={L.from('RPE')}
					maxLabel={L.to('RPE')}""")
rep("""				className="text-muted-foreground border-border/60 border-t pt-2 text-xs"
			>
				{target
					? zoneEquivalentProvenance(
							target,
							zoneEquivalent(target, profile),
							resolvedRangeText(target, profile),
						)
					: draft.kind
						? 'not placed in a zone yet — finish the value'
						: 'no intensity set'}""", """				className="text-footnote text-muted-foreground border-border/60 border-t pt-2"
			>
				{target
					? zoneEquivalentProvenance(
							target,
							zoneEquivalent(target, profile),
							resolvedRangeText(target, profile),
						)
					: draft.kind
						? L.notPlaced
						: L.none}""")
rep("""					<Button type="button" variant="ghost" size="xs" onClick={onRemove}>
						Remove intensity
					</Button>""", """					<Button type="button" variant="ghost" size="sm" onClick={onRemove}>
						{L.remove}
					</Button>""")
rep("""			aria-label="Zone"
			data-slot="intensity-zone-chips\"""", """			aria-label={L.zone}
			data-slot="intensity-zone-chips\"""")
rep("""							'min-h-11 min-w-11 flex-1 cursor-pointer rounded-md px-2 text-sm font-semibold outline-none [font-variant-caps:small-caps]',
							ZONE_CHIP_TINT[chipStep(index)],
							'focus-visible:ring-ring text-foreground focus-visible:ring-2',
							active
								? 'ring-foreground/60 ring-2'
								: 'opacity-70 hover:opacity-100',""", """							'pressable min-h-11 min-w-11 flex-1 cursor-pointer rounded-2xl px-2 text-sm font-semibold outline-none [font-variant-caps:small-caps]',
							ZONE_CHIP_TINT[chipStep(index)],
							'focus-visible:ring-ring text-foreground focus-visible:ring-2',
							// The pressed chip carries a ring; the others keep full ink.
							// They were dimmed to 70 % — 3:1 text, under AA (#505
							// round 2) — and a dimmed label reads as disabled.
							active && 'ring-foreground/60 ring-2',""")
rep("""				label="Pace unit"
				options={[
					{ id: 'clock', label: '/km' },
					{ id: 'pct', label: '% T-pace' },
				]}""", """				label={L.paceUnit}
				options={[
					{ id: 'clock', label: '/km' },
					{ id: 'pct', label: L.thresholdPace },
				]}""")
rep("""					minLabel="Min pace"
					maxLabel="Max pace (optional)\"""", """					minLabel={L.from(L.pace)}
					maxLabel={L.to(L.pace)}""")
rep("""					minLabel="Min % T-pace"
					maxLabel="Max % T-pace (optional)\"""", """					minLabel={L.from(L.thresholdPace)}
					maxLabel={L.to(L.thresholdPace)}""")
rep("""				label="Power unit\"""", """				label={L.powerUnit}""")
rep("""					minLabel="Min W"
					maxLabel="Max W (optional)\"""", """					minLabel={L.from('W')}
					maxLabel={L.to('W')}""")
rep("""					minLabel={`Min %${pctRef}`}
					maxLabel={`Max %${pctRef} (optional)`}""", """					minLabel={L.from(`%${pctRef}`)}
					maxLabel={L.to(`%${pctRef}`)}""")
rep("""				label="Heart rate unit"
				options={[
					{ id: 'bpm', label: 'bpm' },
					{ id: 'lthr', label: '%LTHR' },
					{ id: 'maxHr', label: '%maxHR' },
				]}""", """				label={L.heartRateUnit}
				options={[
					{ id: 'bpm', label: L.bpm },
					{ id: 'lthr', label: L.lthr },
					{ id: 'maxHr', label: L.maxHr },
				]}""")
rep("""					minLabel="Min bpm"
					maxLabel="Max bpm (optional)\"""", """					minLabel={L.from(L.bpm)}
					maxLabel={L.to(L.bpm)}""")
rep("""					minLabel={unit === 'maxHr' ? 'Min %maxHR' : 'Min %LTHR'}
					maxLabel={
						unit === 'maxHr' ? 'Max %maxHR (optional)' : 'Max %LTHR (optional)'
					}""", """					minLabel={L.from(unit === 'maxHr' ? L.maxHr : L.lthr)}
					maxLabel={L.to(unit === 'maxHr' ? L.maxHr : L.lthr)}""")
rep("""			className="border-input bg-muted/40 inline-flex w-fit rounded-lg border p-0.5"
		>
			{options.map((option) => (
				<button
					key={option.id}
					type="button"
					aria-pressed={option.id === active}
					onClick={() => onSelect(option.id)}
					className={cn(
						'focus-visible:ring-ring min-h-10 cursor-pointer rounded-md px-2.5 text-sm outline-none focus-visible:ring-2',
						option.id === active
							? 'bg-background text-foreground font-medium shadow-sm'
							: 'text-muted-foreground hover:text-foreground',
					)}
				>""", """			// The segmented rail's look (`SegmentedControl`, ADR 0085): a muted
			// well with the pressed unit raised on it, every segment 44px tall.
			className="bg-muted inline-flex w-fit flex-wrap rounded-full p-0.5"
		>
			{options.map((option) => (
				<button
					key={option.id}
					type="button"
					aria-pressed={option.id === active}
					onClick={() => onSelect(option.id)}
					className={cn(
						'focus-visible:ring-ring pressable min-h-11 cursor-pointer rounded-full px-3 text-sm outline-none focus-visible:ring-2',
						option.id === active
							? 'bg-background text-foreground font-medium shadow-sm'
							: 'text-muted-foreground hover:text-foreground',
					)}
				>""")
rep("""			<label htmlFor={id} className="text-muted-foreground text-xs">
				{label}
			</label>""", """			<label htmlFor={id} className="text-caption text-muted-foreground">
				{label}
			</label>""")
rep("""					aria-label={`Decrease ${label}`}
					disabled={parsed == null || parsed <= nudge.min}
					onClick={decrease}
					className="size-11 shrink-0 rounded-lg text-lg\"""", """					aria-label={L.decrease(label)}
					disabled={parsed == null || parsed <= nudge.min}
					onClick={decrease}
					className="size-11 shrink-0 rounded-3xl text-lg\"""")
rep("""					className="border-input bg-background focus-visible:ring-ring h-11 w-full min-w-0 flex-1 rounded-lg border px-1 text-center text-base font-medium tabular-nums outline-none focus-visible:ring-2\"""", """					className="bg-input/50 focus-visible:ring-ring/30 duration-press h-11 w-full min-w-0 flex-1 rounded-3xl border border-transparent px-1 text-center text-base font-medium tabular-nums transition-[box-shadow] ease-out outline-none focus-visible:ring-3\"""")
rep("""					aria-label={`Increase ${label}`}
					disabled={nudge.max != null && parsed != null && parsed >= nudge.max}
					onClick={increase}
					className="size-11 shrink-0 rounded-lg text-lg\"""", """					aria-label={L.increase(label)}
					disabled={nudge.max != null && parsed != null && parsed >= nudge.max}
					onClick={increase}
					className="size-11 shrink-0 rounded-3xl text-lg\"""")
open(p, 'w').write(s)
