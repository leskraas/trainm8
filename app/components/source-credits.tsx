import { cn } from '#app/utils/misc.tsx'

/**
 * The derived-data credits a reading owes (ADR 0098 §3,
 * `derivedAttributionLines`): one quiet line each, under the figures they
 * speak for, never in a tooltip or a fold. No motion: a credit is not news.
 * Renders nothing when nothing is owed. The caller places it: `className`
 * carries the spacing around (and, through `gap-*`, between) the lines.
 */
export function SourceCredits({
	credits,
	className,
}: {
	credits: readonly string[]
	className?: string
}) {
	if (credits.length === 0) return null
	return (
		<div data-source-credit className={cn('flex flex-col gap-0.5', className)}>
			{credits.map((credit) => (
				<p
					key={credit}
					className="text-caption text-muted-foreground font-normal [text-wrap:pretty]"
				>
					{credit}
				</p>
			))}
		</div>
	)
}
