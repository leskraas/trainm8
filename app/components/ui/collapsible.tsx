import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible'
import { cn } from '#app/utils/misc.tsx'

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
	return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
	return (
		<CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
	)
}

/**
 * D6 (docs/design/design-system.md): the CLI's panel snaps open and shut;
 * `motion-collapse` animates it — height (Base UI measures it into
 * `--collapsible-panel-height`) and opacity, 200ms in / 150ms out on the app's
 * ease-out. Height is the one layout property the system animates: an opening
 * panel really does move what is below it (ADR 0085 §4).
 */
function CollapsibleContent({
	className,
	...props
}: CollapsiblePrimitive.Panel.Props) {
	return (
		<CollapsiblePrimitive.Panel
			data-slot="collapsible-content"
			className={cn('motion-collapse', className)}
			{...props}
		/>
	)
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
