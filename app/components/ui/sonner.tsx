import { useTheme } from '#app/routes/resources/theme-switch.tsx'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { Icon } from './icon.tsx'

const Toaster = ({ ...props }: ToasterProps) => {
	const theme = useTheme()

	return (
		<Sonner
			theme={theme as ToasterProps['theme']}
			className="toaster group"
			icons={{
				success: <Icon name="check" className="size-4" />,
				info: <Icon name="info-circled" className="size-4" />,
				warning: <Icon name="exclamation-triangle" className="size-4" />,
				error: <Icon name="cross-1" className="size-4" />,
				loading: <Icon name="update" className="size-4 animate-spin" />,
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

export { EpicToaster, Toaster }
