import { Input as InputPrimitive } from '@base-ui/react/input'
import * as React from 'react'
import { cn } from '#app/utils/misc.tsx'

// shadcn `base-luma` input. Deviations (docs/design/design-system.md):
// D2 a real 44px (`h-11`, CLI `h-9`; ADR 0028 §2.1) and `appearance-none` so
// iOS date/time inputs match (the resets live in `tailwind.css`);
// D5 the transition rides the app's curve. `text-base md:text-sm` — 16px on
// phones so iOS never zooms — is the CLI's own.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			className={cn(
				'bg-input/50 file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 duration-press h-11 w-full min-w-0 appearance-none rounded-3xl border border-transparent px-3 py-1 text-base transition-[color,box-shadow,background-color] ease-out outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm',
				className,
			)}
			{...props}
		/>
	)
}

export { Input }
