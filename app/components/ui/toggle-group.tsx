import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import { type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { toggleVariants } from '#app/components/ui/toggle.tsx'
import { cn } from '#app/utils/misc.tsx'

const ToggleGroupContext = React.createContext<
	VariantProps<typeof toggleVariants> & {
		spacing?: number
		orientation?: 'horizontal' | 'vertical'
	}
>({
	size: 'default',
	variant: 'default',
	spacing: 2,
	orientation: 'horizontal',
})

function ToggleGroup({
	className,
	variant,
	size,
	spacing = 2,
	orientation = 'horizontal',
	children,
	...props
}: ToggleGroupPrimitive.Props &
	VariantProps<typeof toggleVariants> & {
		spacing?: number
		orientation?: 'horizontal' | 'vertical'
	}) {
	return (
		<ToggleGroupPrimitive
			data-slot="toggle-group"
			data-variant={variant}
			data-size={size}
			data-spacing={spacing}
			data-orientation={orientation}
			style={{ '--gap': spacing } as React.CSSProperties}
			className={cn(
				'group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] data-vertical:flex-col data-vertical:items-stretch data-[spacing=0]:data-[variant=outline]:rounded-3xl',
				className,
			)}
			{...props}
		>
			<ToggleGroupContext.Provider
				value={{ variant, size, spacing, orientation }}
			>
				{children}
			</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive>
	)
}

function ToggleGroupItem({
	className,
	children,
	variant = 'default',
	size = 'default',
	...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
	const context = React.useContext(ToggleGroupContext)

	return (
		<TogglePrimitive
			data-slot="toggle-group-item"
			data-variant={context.variant || variant}
			data-size={context.size || size}
			data-spacing={context.spacing}
			className={cn(
				'data-[state=on]:bg-muted shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-3 group-data-[spacing=0]/toggle-group:shadow-none focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-2.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-2.5 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-3xl group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-3xl group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-3xl group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-3xl group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t',
				toggleVariants({
					variant: context.variant || variant,
					size: context.size || size,
				}),
				className,
			)}
			{...props}
		>
			{children}
		</TogglePrimitive>
	)
}

/**
 * Local addition (not from the CLI; docs/design/design-system.md A1): a
 * segmented control — one of a few views of the same thing (Uke / Sesong,
 * km / tid). A `ToggleGroup` styled as the luma tabs track, with the pressed
 * item lifted out of it, that always keeps exactly one item pressed: Base UI
 * lets a single-select group be emptied by pressing the pressed item again,
 * which is right for a filter and wrong for a view switch.
 *
 * ```tsx
 * <SegmentedControl value={view} onValueChange={setView} aria-label="Visning">
 *   <ToggleGroupItem value="uke">Uke</ToggleGroupItem>
 *   <ToggleGroupItem value="sesong">Sesong</ToggleGroupItem>
 * </SegmentedControl>
 * ```
 */
function SegmentedControl<Value extends string>({
	value,
	onValueChange,
	className,
	...props
}: Omit<
	React.ComponentProps<typeof ToggleGroup>,
	'value' | 'defaultValue' | 'onValueChange' | 'multiple' | 'spacing'
> & {
	value: Value
	onValueChange: (value: Value) => void
}) {
	return (
		<ToggleGroup
			spacing={0}
			value={[value]}
			onValueChange={(next) => {
				const picked = next[0] as Value | undefined
				if (picked !== undefined) onValueChange(picked)
			}}
			className={cn(
				'bg-muted *:data-[slot=toggle-group-item]:aria-pressed:bg-background *:data-[slot=toggle-group-item]:aria-pressed:text-foreground dark:*:data-[slot=toggle-group-item]:aria-pressed:bg-input/50 *:data-[slot=toggle-group-item]:text-muted-foreground rounded-full p-1 *:data-[slot=toggle-group-item]:rounded-full! *:data-[slot=toggle-group-item]:aria-pressed:shadow-sm',
				className,
			)}
			{...props}
		/>
	)
}

export { ToggleGroup, ToggleGroupItem, SegmentedControl }
