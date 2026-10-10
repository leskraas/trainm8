import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#app/utils/misc.tsx'

// shadcn `base-luma` button. Local deviations, each listed in
// `docs/design/design-system.md` §"Deviations from shadcn" (ADR 0085):
//
// - D1 press: `pressable` replaces `transition-all` and the 1px
//   `active:translate-y-px` nudge — `scale(0.97)` at 160ms on the app's
//   ease-out, colours on the same curve, the scale dropped under reduced
//   motion. `transition-all` eased the focus ring and the border on a
//   built-in curve.
// - D2 touch: the default size is a real 44px (`h-11`, ADR 0028 §2.1); the
//   compact sizes keep their look and reach ~44px through an invisible
//   `after:` hit area. `touch-manipulation` so a `<Link
//   className={buttonVariants()}>` taps without the double-tap wait too.
// - D3 border colour per variant: the base says `border-transparent` and
//   Tailwind emits `.border-border` *before* `.border-transparent`, so a
//   `<Link>` spreading `buttonVariants({ variant: 'outline' })` (no
//   tailwind-merge) rendered borderless. Each variant states its own.
const buttonVariants = cva(
	"group/button focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 pressable relative inline-flex shrink-0 touch-manipulation items-center justify-center rounded-4xl border bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none after:absolute after:inset-x-0 after:-inset-y-1.5 focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-3 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-primary/80 border-transparent',
				outline:
					'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-input/30 dark:bg-transparent',
				secondary:
					'bg-secondary text-secondary-foreground aria-expanded:bg-secondary aria-expanded:text-secondary-foreground border-transparent hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]',
				ghost:
					'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50 border-transparent',
				destructive:
					'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40 border-transparent',
				link: 'text-primary border-transparent underline-offset-4 hover:underline',
			},
			size: {
				// D2: h-11 (CLI: h-9); `after:inset-y-0` cancels the base hit area.
				default:
					'h-11 gap-1.5 px-3 after:inset-y-0 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5',
				xs: "h-6 gap-1 px-2.5 text-xs after:-inset-y-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
				sm: 'h-8 gap-1 px-3 after:-inset-y-1.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
				lg: 'h-10 gap-1.5 px-4 after:-inset-y-0.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
				icon: 'size-9 after:-inset-1',
				'icon-xs':
					"size-6 after:-inset-2.5 [&_svg:not([class*='size-'])]:size-3",
				'icon-sm': 'size-8 after:-inset-1.5',
				'icon-lg': 'size-10 after:-inset-0.5',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

function Button({
	className,
	variant = 'default',
	size = 'default',
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	)
}

/** The repo's name for the variant props (D9: kept for its call sites). */
type ButtonVariant = VariantProps<typeof buttonVariants>

export { Button, buttonVariants, type ButtonVariant }
