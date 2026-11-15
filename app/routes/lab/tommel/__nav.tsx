import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { BASE } from './__api.ts'

export function BackDown({ label = 'Til dagen' }: { label?: string }) {
	return (
		<div
			className="tm-top"
			style={{
				position: 'sticky',
				top: 0,
				background: 'var(--bg)',
				zIndex: 2,
				margin: '0 -20px',
				padding: '0 20px',
			}}
		>
			<Link to={BASE} className="tm-iconbtn" style={{ marginLeft: -10 }}>
				<svg
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					aria-hidden="true"
				>
					<path d="m6 9 6 6 6-6" />
				</svg>
				<span style={{ fontSize: 14 }}>{label}</span>
			</Link>
		</div>
	)
}

/** Pull down at the top to go back to the calm screen. */
export function usePullBack() {
	const navigate = useNavigate()
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		let sy = 0
		let atTop = false
		const start = (e: TouchEvent) => {
			sy = e.touches[0]?.clientY ?? 0
			atTop = window.scrollY <= 0
		}
		const end = (e: TouchEvent) => {
			const dy = (e.changedTouches[0]?.clientY ?? 0) - sy
			if (atTop && dy > 90) void navigate(BASE)
		}
		window.addEventListener('touchstart', start, { passive: true })
		window.addEventListener('touchend', end, { passive: true })
		return () => {
			window.removeEventListener('touchstart', start)
			window.removeEventListener('touchend', end)
		}
	}, [navigate])
	return ref
}
