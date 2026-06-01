import { type ComponentProps } from 'react'

import { cn } from '#app/utils/misc.tsx'

export function FloatingToolbar({
	className,
	...props
}: ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'bg-muted/80 shadow-accent absolute inset-x-3 bottom-3 flex items-center justify-end gap-2 rounded-lg p-4 pl-5 shadow-xl backdrop-blur-xs md:gap-4 md:pl-7',
				className,
			)}
			{...props}
		/>
	)
}
