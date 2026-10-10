import { Meter as MeterPrimitive } from '@base-ui/react/meter'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '#app/utils/misc.tsx'

/*
 * Local addition (not from the shadcn CLI, which has no meter;
 * docs/design/design-system.md A2), written to mirror `progress.tsx`:
 * same parts, same `data-slot`s, same luma track.
 *
 * A meter: a measured value within a known range — the week's kilometres
 * against its target, a zone's share of the time (ADR 0085 §6). Base UI's
 * Meter gives it `role="meter"` and `aria-valuenow/min/max/text`; use
 * `Progress` (`progress.tsx`) instead for a task that is *getting done*.
 *
 * The fill does not animate. A meter's value changes when the data does —
 * on load, not under the athlete's hand — and Base UI sizes the indicator by
 * its `width`, a layout property; there is no movement here worth a
 * per-frame layout to show.
 *
 * `tone` colours the fill by the status roles, and only the fill: the verdict
 * word beside the meter is what carries the meaning.
 *
 * ```tsx
 * <Meter value={34} max={46} tone="under" aria-label="Uke 41">
 *   <MeterLabel>Uke 41</MeterLabel>
 *   <MeterValue>{() => '34 av 46 km'}</MeterValue>
 *   <MeterTrack><MeterIndicator /></MeterTrack>
 * </Meter>
 * ```
 *
 * With no children it renders just the track and fill.
 */

const meterIndicatorVariants = cva('block h-full rounded-full', {
	variants: {
		tone: {
			primary: 'bg-primary',
			on: 'bg-status-on',
			under: 'bg-status-under',
			over: 'bg-status-over',
			missed: 'bg-status-missed',
			muted: 'bg-muted-foreground',
		},
	},
	defaultVariants: { tone: 'primary' },
})

type MeterTone = VariantProps<typeof meterIndicatorVariants>['tone']

function Meter({
	className,
	children,
	tone,
	...props
}: MeterPrimitive.Root.Props & { tone?: MeterTone }) {
	return (
		<MeterPrimitive.Root
			data-slot="meter"
			data-tone={tone ?? 'primary'}
			className={cn(
				'grid w-full grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1.5',
				className,
			)}
			{...props}
		>
			{children ?? (
				<MeterTrack>
					<MeterIndicator tone={tone} />
				</MeterTrack>
			)}
		</MeterPrimitive.Root>
	)
}

function MeterLabel({ className, ...props }: MeterPrimitive.Label.Props) {
	return (
		<MeterPrimitive.Label
			data-slot="meter-label"
			className={cn('text-sm font-medium', className)}
			{...props}
		/>
	)
}

function MeterValue({ className, ...props }: MeterPrimitive.Value.Props) {
	return (
		<MeterPrimitive.Value
			data-slot="meter-value"
			className={cn(
				'text-muted-foreground justify-self-end text-sm tabular-nums',
				className,
			)}
			{...props}
		/>
	)
}

function MeterTrack({ className, ...props }: MeterPrimitive.Track.Props) {
	return (
		<MeterPrimitive.Track
			data-slot="meter-track"
			className={cn(
				'bg-muted col-span-full block h-3 w-full overflow-hidden rounded-full',
				className,
			)}
			{...props}
		/>
	)
}

function MeterIndicator({
	className,
	tone,
	...props
}: MeterPrimitive.Indicator.Props & { tone?: MeterTone }) {
	return (
		<MeterPrimitive.Indicator
			data-slot="meter-indicator"
			className={cn(meterIndicatorVariants({ tone }), className)}
			{...props}
		/>
	)
}

export {
	Meter,
	MeterLabel,
	MeterValue,
	MeterTrack,
	MeterIndicator,
	type MeterTone,
}
