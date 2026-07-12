import { cn } from '#app/utils/misc.tsx'
import {
	type ShapeSegment,
	type ShapeSegmentFill,
} from '#app/utils/shape-strip.ts'
import { type TrainingZone } from '#app/utils/session-profile.ts'

/** Solid zone hues (the Score direction's Z1–Z5 scale, both themes). Static
 * class strings for the Tailwind compiler. */
const ZONE_FILL: Record<TrainingZone, string> = {
	1: 'bg-zone-1',
	2: 'bg-zone-2',
	3: 'bg-zone-3',
	4: 'bg-zone-4',
	5: 'bg-zone-5',
}

const FILL_CLASS: Record<ShapeSegmentFill, string> = {
	zone: '',
	muted: 'bg-muted-foreground/30',
	// The hatched non-zone treatment: visibly outside the Z1–Z5 encoding.
	hatched:
		'bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--muted-foreground)_45%,transparent)_0_3px,transparent_3px_7px)]',
}

/**
 * The Workout Shape strip (#258, spec §8): a lean, bottom-aligned segment
 * chart — height is intensity, width is time. No axis, no legend, no
 * captions, no bracket rail: the Token Sentence above is the workout's
 * statement, and this strip's one job is pre-attentive rhythm-and-hardness.
 * `aria-hidden` — the sentence is the accessible statement too.
 *
 * Renders nothing when there are no segments: with zero paintable steps the
 * preview region is absent entirely, never an empty frame or a fabricated bar.
 */
export function ShapeStrip({
	segments,
	className,
}: {
	segments: ShapeSegment[]
	className?: string
}) {
	if (segments.length === 0) return null
	return (
		<div
			aria-hidden
			data-shape-strip
			className={cn('flex h-[42px] w-full items-end gap-[2px]', className)}
		>
			{segments.map((segment) => (
				<div
					key={segment.id}
					data-shape-segment
					data-fill={segment.fill}
					data-zone-step={segment.zone ?? undefined}
					data-nominal-width={segment.nominalWidth ? true : undefined}
					style={{
						flexGrow: segment.weightSec,
						height: `${segment.heightPct}%`,
					}}
					className={cn(
						// basis-0 makes flex-grow carry the whole width ratio; the
						// min-width keeps even a nominal segment readable between
						// long neighbours — never a sliver.
						'min-w-1.5 basis-0 rounded-t-[3px]',
						segment.zone != null ? ZONE_FILL[segment.zone] : '',
						FILL_CLASS[segment.fill],
					)}
				/>
			))}
		</div>
	)
}
