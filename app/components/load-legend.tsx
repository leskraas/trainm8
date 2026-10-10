// A Training Load term that explains itself (#181): the label is a popover
// trigger carrying the glossary definition, so "Kondisjon / Tretthet / Form"
// stops assuming expert knowledge on its first occurrence. Deliberately a tiny
// self-contained component so it survives wherever the triad ends up rendered.
//
// A **popover, not a tooltip** (#505 polish, mobile-native): a tooltip opens
// on hover and focus only, so on a phone — where Meg is mostly read — the
// definition behind the dotted underline was unreachable. A tap opens the
// popover; with a mouse it also opens on hover, after the same 500ms the
// app's tooltips wait (`TooltipProvider`), so a pointer passing over does not
// pop it.
//
// Accessibility: the trigger is a real <button> (Base UI's default), so it is
// keyboard-focusable and opens on Enter/Space. Its accessible name is the
// spelled-out term with its abbreviation (`Kondisjon (CTL)`); the popover's
// description is the definition.
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
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
		<Popover>
			<PopoverTrigger
				openOnHover
				delay={500}
				aria-label={legend.term}
				className={cn(
					// The word is small; the hit area is not (`after:`, 44px tall).
					'decoration-muted-foreground/50 aria-expanded:text-foreground relative cursor-help rounded-sm underline decoration-dotted underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-3.5',
					className,
				)}
			>
				{legend.short}
			</PopoverTrigger>
			<PopoverContent align="start" side="bottom" className="w-64 p-3">
				<PopoverDescription className="text-footnote text-popover-foreground">
					{legend.description}
				</PopoverDescription>
			</PopoverContent>
		</Popover>
	)
}
