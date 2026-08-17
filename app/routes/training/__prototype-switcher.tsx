/**
 * PROTOTYPE — the variant switcher. Deliberately ugly and un-designed: a dark
 * pill floating over whatever is being judged, so nobody mistakes it for part
 * of the design. Never renders in production.
 *
 * THROWAWAY — do not ship.
 */
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'

export function PrototypeSwitcher({
	variants,
	current,
	athletes = [],
	currentAthlete,
}: {
	variants: { key: string; name: string }[]
	current: string
	/** Dev-only athlete picker, so the owner can flip athlete without the URL. */
	athletes?: { username: string; label: string }[]
	currentAthlete?: string
}) {
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()

	const currentIndex = Math.max(
		0,
		variants.findIndex((v) => v.key === current),
	)
	const active = variants[currentIndex]

	const go = (delta: number) => {
		if (variants.length === 0) return
		const next =
			variants[(currentIndex + delta + variants.length) % variants.length]!
		const params = new URLSearchParams(searchParams)
		params.set('variant', next.key)
		void navigate(`?${params.toString()}`, {
			replace: true,
			preventScrollReset: true,
		})
	}

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
			if (event.metaKey || event.ctrlKey || event.altKey) return
			// A variant that handles the arrow itself wins (sliders, canvases).
			if (event.defaultPrevented) return
			const target = event.target as HTMLElement | null
			if (
				target?.closest(
					'input, textarea, select, [contenteditable], [role="slider"]',
				)
			)
				return
			event.preventDefault()
			go(event.key === 'ArrowRight' ? 1 : -1)
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentIndex, variants, searchParams])

	const pickAthlete = (username: string) => {
		const params = new URLSearchParams(searchParams)
		params.set('athlete', username)
		void navigate(`?${params.toString()}`, {
			replace: true,
			preventScrollReset: true,
		})
	}

	if (import.meta.env.PROD) return null

	// max-w-60 on mobile keeps the arrows clear of the devtools bubble.
	return (
		<div className="fixed bottom-4 left-1/2 z-50 flex max-w-60 -translate-x-1/2 flex-col items-center gap-1 sm:max-w-[calc(100vw-1rem)]">
			{athletes.length > 0 ? (
				<label className="flex items-center gap-1 rounded-full bg-zinc-900 py-1 pr-2 pl-3 text-zinc-50 shadow-2xl ring-1 ring-white/20">
					<span className="font-mono text-[10px] tracking-wide uppercase opacity-70">
						athlete
					</span>
					{/* A bare <select>: throwaway dev chrome, deliberately not the
					    design-system Select, so nobody judges it. */}
					<select
						value={currentAthlete ?? athletes[0]!.username}
						onChange={(event) => pickAthlete(event.currentTarget.value)}
						aria-label="Prototype athlete"
						className="max-w-44 min-w-0 truncate rounded-full bg-transparent px-1 py-0.5 font-mono text-xs text-zinc-50 focus:ring-2 focus:ring-white/60 focus:outline-none"
					>
						{athletes.map((athlete) => (
							<option
								key={athlete.username}
								value={athlete.username}
								className="text-zinc-900"
							>
								{athlete.label}
							</option>
						))}
					</select>
				</label>
			) : null}
			<div className="flex w-full items-center gap-1 rounded-full bg-zinc-900 py-1 pr-1 pl-1 text-zinc-50 shadow-2xl ring-1 ring-white/20">
				<button
					type="button"
					onClick={() => go(-1)}
					aria-label="Previous variant"
					className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-white/15 focus:ring-2 focus:ring-white/60 focus:outline-none"
				>
					<Icon name="arrow-left" size="sm" />
				</button>
				<span className="min-w-0 flex-1 truncate px-2 font-mono text-xs tracking-wide whitespace-nowrap tabular-nums">
					{active ? `${active.key} — ${active.name}` : 'no variants'}
				</span>
				<button
					type="button"
					onClick={() => go(1)}
					aria-label="Next variant"
					className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-white/15 focus:ring-2 focus:ring-white/60 focus:outline-none"
				>
					<Icon name="arrow-right" size="sm" />
				</button>
			</div>
		</div>
	)
}
