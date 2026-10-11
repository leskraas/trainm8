import { useSpinDelay } from 'spin-delay'
import { STATUS_BUTTON_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { Button, type ButtonVariant } from './button.tsx'
import { Icon } from './icon.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from './tooltip.tsx'

/**
 * A submit button that says it is working. Round 2 (audit D8): an error puts
 * **nothing** in the button — the error is already said at the field it is
 * about (`ErrorList`), and a red ✕ inside a green button was noise that read
 * as "Koble til error" to a screen reader. The spinner and the check keep
 * their place, titled in Norwegian (`STATUS_BUTTON_LABELS`).
 */
export const StatusButton = ({
	message,
	status,
	className,
	children,
	spinDelay,
	...props
}: React.ComponentProps<'button'> &
	ButtonVariant & {
		status: 'pending' | 'success' | 'error' | 'idle'
		message?: string | null
		spinDelay?: Parameters<typeof useSpinDelay>[1]
	}) => {
	const delayedPending = useSpinDelay(status === 'pending', {
		delay: 400,
		minDuration: 300,
		...spinDelay,
	})
	const companion = {
		pending: delayedPending ? (
			<div
				role="status"
				className="inline-flex size-6 items-center justify-center"
			>
				<Icon
					name="update"
					className="animate-spin"
					title={STATUS_BUTTON_LABELS.pending}
				/>
			</div>
		) : null,
		success: (
			<div
				role="status"
				className="inline-flex size-6 items-center justify-center"
			>
				<Icon name="check" title={STATUS_BUTTON_LABELS.success} />
			</div>
		),
		error: null,
		idle: null,
	}[status]

	return (
		<Button className={cn('flex justify-center gap-4', className)} {...props}>
			<div>{children}</div>
			{message && companion ? (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>{companion}</TooltipTrigger>
						<TooltipContent>{message}</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			) : (
				companion
			)}
		</Button>
	)
}
StatusButton.displayName = 'Button'
