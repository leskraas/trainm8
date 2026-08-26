/**
 * The discipline's lane dot.
 *
 * It came out of the Cockpit's shared vocabulary when the rest of that
 * vocabulary was retired with the zones it dressed (#499), and it lived in
 * `stream.tsx` for as long as the stream's row was the only thing that drew
 * one. #501 gave the stamped cell a second reader, and the cell is a module
 * the stream itself imports — so the dot sits here, below both of them, rather
 * than making the two files import each other.
 */
import { paletteFor } from '#app/utils/dashboard.ts'
import { cn } from '#app/utils/misc.tsx'

export function DiscDot({
	discipline,
	className,
	solid = false,
}: {
	discipline: string
	className?: string
	/**
	 * Fill the dot with the discipline's own ink instead of its 15%-alpha chip
	 * tint. The tint is right inside a chip, where it sits behind a label; on its
	 * own at 6px it is all but invisible, and the home timeline's lane dot is the
	 * only thing naming the discipline on that row.
	 */
	solid?: boolean
}) {
	const palette = paletteFor(discipline)
	return (
		<span
			className={cn(
				'inline-block size-2 rounded-full',
				solid ? cn('bg-current', palette.ink) : palette.chip,
				className,
			)}
		/>
	)
}
