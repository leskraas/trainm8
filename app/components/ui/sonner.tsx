import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { Icon } from '#app/components/ui/icon.tsx'

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = 'system' } = useTheme()

	return (
		<Sonner
			theme={theme as ToasterProps['theme']}
			className="toaster group"
			icons={{
				success: <Icon name="check" size="sm" aria-hidden="true" />,
				info: <Icon name="info-circled" size="sm" aria-hidden="true" />,
				warning: (
					<Icon name="exclamation-triangle" size="sm" aria-hidden="true" />
				),
				error: <Icon name="cross-1" size="sm" aria-hidden="true" />,
				loading: (
					<Icon
						name="update"
						size="sm"
						aria-hidden="true"
						className="animate-spin"
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

const EpicToaster = Toaster

export { Toaster, EpicToaster }
