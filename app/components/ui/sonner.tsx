'use client'

import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { Icon } from '#app/components/ui/icon.tsx'

/** A phone's layout: the bottom tab bar is there (ADR 0083), below `md`. */
const PHONE = '(width < 48rem)'

function usePhone(): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const list = window.matchMedia?.(PHONE)
			list?.addEventListener('change', onChange)
			return () => list?.removeEventListener('change', onChange)
		},
		() => window.matchMedia?.(PHONE).matches ?? false,
		() => false,
	)
}

// Local deviation (docs/design/design-system.md D15, ADR 0088): on a phone
// the toasts sit at the bottom, just above the tab bar — in the thumb's reach
// for _Angre_, and leaving downwards the way the composer's Drawer just did —
// instead of over I dag's top line. From `md` up, where the caller asked.
const Toaster = ({ position, ...props }: ToasterProps) => {
	const { theme = 'system' } = useTheme()
	const phone = usePhone()
	const above = 'calc(var(--tab-bar-space) + 12px)'

	return (
		<Sonner
			theme={theme as ToasterProps['theme']}
			position={phone ? 'bottom-center' : position}
			offset={phone ? { bottom: above } : undefined}
			mobileOffset={phone ? { bottom: above, left: 12, right: 12 } : undefined}
			className="toaster group"
			icons={{
				success: (
					<Icon name="circle-check" aria-hidden="true" className="size-4" />
				),
				info: <Icon name="info-circle" aria-hidden="true" className="size-4" />,
				warning: (
					<Icon name="alert-triangle" aria-hidden="true" className="size-4" />
				),
				error: (
					<Icon name="alert-octagon" aria-hidden="true" className="size-4" />
				),
				loading: (
					<Icon
						name="loader-2"
						aria-hidden="true"
						className="size-4 animate-spin"
					/>
				),
			}}
			style={
				{
					'--normal-bg': 'var(--popover)',
					'--normal-text': 'var(--popover-foreground)',
					'--normal-border': 'var(--border)',
					'--border-radius': 'var(--radius)',
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: 'cn-toast',
				},
			}}
			{...props}
		/>
	)
}

export { Toaster }
