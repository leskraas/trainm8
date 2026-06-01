import { cn } from '#app/utils/misc.tsx'

export function FloatingToolbar({
	className,
	...props
}: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'absolute inset-x-3 bottom-3 flex items-center justify-end gap-2 rounded-lg bg-muted/80 p-4 pl-5 shadow-xl shadow-accent backdrop-blur-xs md:gap-4 md:pl-7',
				className,
			)}
			{...props}
		/>
	)
}
