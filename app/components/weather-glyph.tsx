/**
 * The weather's glyphs (design #433 §5): seven Tabler outline glyphs and one
 * Hugeicons partly-cloudy, monochrome in `currentColor` and stroked like the
 * rest of the app's icons (24×24, stroke 2, round caps), so the weather reads
 * as part of the one icon system and not as MET's colour icons.
 *
 * Drawn inline rather than from the sprite: the sprite is built from
 * `other/svg-icons`, which agents do not change on their own (CLAUDE.md), so
 * the glyphs move there once a human adds them; the paths are the libraries'
 * own, unchanged. Always decorative here: the word beside it, or the visually
 * hidden sentence, carries the meaning.
 */
import { cn } from '#app/utils/misc.tsx'
import { type WeatherGlyph as Glyph } from '#app/utils/weather/day-forecast.ts'

const PATHS: Record<Glyph | 'map-pin', readonly string[]> = {
	sun: [
		'M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
		'M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7',
	],
	moon: [
		'M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008',
	],
	// Hugeicons `sun-cloud-01`: Tabler has no partly-cloudy glyph.
	'partly-cloudy': [
		'M17.478 11h.022a4.5 4.5 0 1 1 0 9H7a5 5 0 0 1-.48-9.977M17.478 11q.021-.247.022-.5a5.5 5.5 0 0 0-10.98-.477M17.478 11a5.5 5.5 0 0 1-1.235 3M6.52 10.023Q6.757 10 7 10c1.126 0 2.165.372 3 1',
		'M9 5.655A3.84 3.84 0 0 0 5.844 4A3.85 3.85 0 0 0 2 7.857C2 9.154 2.638 10.3 3.616 11',
	],
	cloud: [
		'M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878',
	],
	'cloud-rain': [
		'M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7',
		'M11 13v2m0 3v2m4 -5v2m0 3v2',
	],
	'cloud-snow': [
		'M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7',
		'M11 15v.01m0 3v.01m0 3v.01m4 -4v.01m0 3v.01',
	],
	'cloud-storm': [
		'M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1',
		'M13 14l-2 4l3 0l-2 4',
	],
	'cloud-fog': [
		'M7 16a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-12',
		'M5 20l14 0',
	],
	'map-pin': [
		'M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
		'M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0',
	],
}

export function WeatherGlyph({
	glyph,
	className,
}: {
	glyph: Glyph | 'map-pin'
	className?: string
}) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			focusable="false"
			data-weather-glyph={glyph}
			className={cn('inline size-4 shrink-0 self-center', className)}
		>
			{PATHS[glyph].map((d) => (
				<path key={d} d={d} />
			))}
		</svg>
	)
}
