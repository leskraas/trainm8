import { Link, Outlet, useLocation } from 'react-router'
import { BASE } from './__lib.ts'
import { BREV_CSS } from './__ui.tsx'

export const meta = () => [
	{ title: 'Brev' },
	{
		name: 'theme-color',
		media: '(prefers-color-scheme: light)',
		content: '#E8E1D2',
	},
	{
		name: 'theme-color',
		media: '(prefers-color-scheme: dark)',
		content: '#0E1013',
	},
]

export default function BrevLayout() {
	const { pathname } = useLocation()
	const quiet =
		pathname.startsWith(`${BASE}/arkiv`) ||
		pathname.startsWith(`${BASE}/velkommen`) ||
		pathname.startsWith(`${BASE}/sesong`) ||
		pathname.startsWith(`${BASE}/styrke`)
	return (
		<div className="brev">
			<style dangerouslySetInnerHTML={{ __html: BREV_CSS }} />
			<Outlet />
			{quiet ? null : (
				<Link to={`${BASE}/arkiv`} className="b-fab" prefetch="intent">
					<svg
						aria-hidden
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
					>
						<rect x="3" y="4" width="18" height="5" rx="1" />
						<path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
					</svg>
					Arkivet
				</Link>
			)}
		</div>
	)
}
