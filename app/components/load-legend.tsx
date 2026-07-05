// A Training Load abbreviation that explains itself (#181): the label text is
// a tooltip trigger carrying the glossary definition, so "Fit / Fat / Form"
// stops assuming expert knowledge on its first occurrence. Deliberately a tiny
// self-contained component (it brings its own TooltipProvider) so it survives
// the #184 Dashboard re-composition wherever the triad ends up rendered.
//
// Accessibility: the trigger is a real <button> (base-ui's default), so it is
// keyboard-focusable; base-ui opens the tooltip on focus as well as hover and
// links it to the trigger via aria-describedby. The button's accessible name is
// the spelled-out term (e.g. "Fitness (CTL)"), never the bare abbreviation.
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { type LoadLegend } from '#app/utils/load/legends.ts'
import { cn } from '#app/utils/misc.tsx'

export function LoadLegendLabel({
	legend,
	className,
}: {
	legend: LoadLegend
	className?: string
}) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger
					aria-label={legend.term}
					className={cn(
						'decoration-muted-foreground/50 cursor-help rounded-sm underline decoration-dotted underline-offset-2',
						className,
					)}
				>
					{legend.short}
				</TooltipTrigger>
				<TooltipContent>{legend.description}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}
