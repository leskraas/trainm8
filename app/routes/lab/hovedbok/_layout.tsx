import { Outlet } from 'react-router'
import { CSS, HbProvider } from './__ui.tsx'

export const meta = () => [
	{ title: 'Hovedbok' },
	{
		name: 'theme-color',
		content: '#FFFFFF',
		media: '(prefers-color-scheme: light)',
	},
	{
		name: 'theme-color',
		content: '#0F1114',
		media: '(prefers-color-scheme: dark)',
	},
	{ name: 'apple-mobile-web-app-title', content: 'Hovedbok' },
]

export default function HovedbokLayout() {
	return (
		<div className="hb" id="hb-root">
			<style dangerouslySetInnerHTML={{ __html: CSS }} />
			<HbProvider>
				<Outlet />
			</HbProvider>
		</div>
	)
}
