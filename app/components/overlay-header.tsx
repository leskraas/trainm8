/**
 * The standard header for summoned surfaces — sheets and dialogs (mobile UI
 * standard, #282): title (+ optional description) on the left, a close
 * button pinned top-right. Built on Base UI's Dialog primitives, so it must
 * render inside a `Dialog.Popup`.
 */
import { Dialog } from '@base-ui/react/dialog'
import { type ReactNode } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'

export function OverlayHeader({
	title,
	description,
}: {
	title: ReactNode
	description?: ReactNode
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="min-w-0">
				<Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
				{description ? (
					<Dialog.Description className="text-muted-foreground text-sm">
						{description}
					</Dialog.Description>
				) : null}
			</div>
			<Dialog.Close
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Close"
						// ~44px effective touch target on a 32px control (#280).
						className="relative -mt-1 -mr-1 shrink-0 after:absolute after:-inset-1.5"
					/>
				}
			>
				<Icon name="cross-1" />
			</Dialog.Close>
		</div>
	)
}
