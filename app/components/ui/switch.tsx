'use client'

import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from '#app/utils/misc.tsx'

// shadcn `base-luma` switch (`npx shadcn@latest add switch`). Deviations
// (docs/design/design-system.md): D13 `transition-all` becomes the track's
// colours and the thumb's transform on the press curve (`duration-press`,
// `--ease-out`); reduced motion keeps the colour and drops the slide.
function Switch({
	className,
	size = 'default',
	...props
}: SwitchPrimitive.Root.Props & {
	size?: 'sm' | 'default'
}) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			data-size={size}
			className={cn(
				'peer group/switch focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary group-has-[:focus-visible]/field-label:data-checked:border-primary data-unchecked:bg-input/90 duration-press relative inline-flex shrink-0 items-center rounded-full border-2 transition-[background-color,border-color] ease-out outline-none group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:data-unchecked:border-transparent after:absolute after:-inset-x-3 after:-inset-y-3 focus-visible:ring-3 aria-invalid:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-unchecked:border-transparent data-[size=default]:h-5 data-[size=default]:w-11 data-[size=sm]:h-4 data-[size=sm]:w-7',
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="bg-background dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground duration-press pointer-events-none block rounded-full shadow-sm ring-0 transition-transform ease-out not-dark:bg-clip-padding group-data-[size=default]/switch:h-4 group-data-[size=default]/switch:w-6 group-data-[size=sm]/switch:h-3 group-data-[size=sm]/switch:w-4 motion-reduce:transition-none data-checked:translate-x-[calc(100%-8px)] data-unchecked:translate-x-0"
			/>
		</SwitchPrimitive.Root>
	)
}

export { Switch }
