import { Outlet } from 'react-router'
import { StiRoot } from './__ui.tsx'

export const meta = () => [
	{ title: 'Sti' },
	{
		name: 'theme-color',
		media: '(prefers-color-scheme: light)',
		content: '#F3F5F2',
	},
	{
		name: 'theme-color',
		media: '(prefers-color-scheme: dark)',
		content: '#121614',
	},
]

export default function StiLayout() {
	return (
		<StiRoot>
			<Outlet />
		</StiRoot>
	)
}
