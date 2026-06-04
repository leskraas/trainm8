import { Card } from '#app/components/ui/card.tsx'
import { cn } from '#app/utils/misc.tsx'
import { type ReactNode } from 'react'
import { Link } from 'react-router'

type UpcomingSessionCardProps = {
	to: string
	children: ReactNode
}

export function UpcomingSessionCard({
	to,
	children,
}: UpcomingSessionCardProps) {
	return (
		<Card
			className={cn(
				// Reset Card defaults — padding and layout live on the Link
				'gap-0 overflow-visible p-0',
				// Mobile card: explicit border/shadow to match original design
				'border-border/80 border shadow-md ring-0',
				// Desktop row: strip card chrome, leave plain transparent row
				'sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none',
			)}
		>
			<Link
				to={to}
				prefetch="intent"
				className={cn(
					'grid grid-cols-2 gap-3 p-4 text-left',
					// Follow Card border-radius so focus ring respects the shape
					'rounded-[inherit]',
					'hover:bg-muted/45 transition-colors',
					'focus-visible:ring-ring focus:outline-none focus-visible:ring-2',
					'sm:grid-cols-[6.5rem_4.5rem_1fr_8rem_auto] sm:items-center sm:px-4 sm:py-3',
				)}
			>
				{children}
			</Link>
		</Card>
	)
}
