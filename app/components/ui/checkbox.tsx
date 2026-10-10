import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'

// shadcn `base-luma` checkbox. Deviations (docs/design/design-system.md):
// D5 the focus-ring transition rides the app's curve, not the built-in one;
// N2 the check is the sprite `Icon`; D9 `CheckboxProps` stays exported for
// `forms.tsx`. The `after:` hit area is the CLI's own.
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				'peer bg-input/90 focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary dark:data-checked:bg-primary duration-press relative flex size-4 shrink-0 items-center justify-center rounded-[5px] border border-transparent transition-shadow ease-out outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-transparent after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3',
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
			>
				<Icon name="check" aria-hidden="true" />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	)
}

type CheckboxProps = CheckboxPrimitive.Root.Props

export { Checkbox, type CheckboxProps }
