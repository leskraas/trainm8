// The Plan Adherence band on the app's status tokens (ADR 0085): under amber,
// on target the primary green, over blue-violet — more than asked, not
// alarming. The word is always beside the colour (design-system.md), and it
// is I dag's word for the same band (`NB_ADHERENCE_LABELS`).
const BAND_TONE: Record<AdherenceBand['tone'], { dot: string; wash: string }> =
	{
		under: { dot: 'bg-status-under', wash: 'bg-status-under/12' },
		'on-target': { dot: 'bg-status-on', wash: 'bg-status-on/12' },
		over: { dot: 'bg-status-over', wash: 'bg-status-over/12' },
	}

function AdherenceBandChip({ band }: { band: AdherenceBand }) {
	const tone = BAND_TONE[band.tone]
	return (
		<span
			className={cn(
				'text-caption text-foreground inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
				tone.wash,
			)}
		>
			<span className={cn('size-1.5 rounded-full', tone.dot)} />
			{NB_ADHERENCE_LABELS[band.tone]}
		</span>
	)
}

