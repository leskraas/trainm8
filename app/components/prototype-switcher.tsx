import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'

// PROTOTYPE — used by `_home/index.tsx`. Hidden in production via NODE_ENV gate.
// Delete this file when the dashboard prototype is folded into the real page.

export type PrototypeVariant = {
	key: string
	name: string
}

export function PrototypeSwitcher({
	variants,
	current,
	paramName = 'variant',
}: {
	variants: PrototypeVariant[]
	current: string
	paramName?: string
}) {
	const [searchParams, setSearchParams] = useSearchParams()

	const idx = Math.max(
		0,
		variants.findIndex((v) => v.key === current),
	)
	const currentVariant = variants[idx] ?? variants[0]

	function go(delta: number) {
		const next = variants[(idx + delta + variants.length) % variants.length]
		if (!next) return
		const params = new URLSearchParams(searchParams)
		params.set(paramName, next.key)
		setSearchParams(params, { replace: true, preventScrollReset: true })
	}

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
			const target = e.target as HTMLElement | null
			if (
				target &&
				(target.tagName === 'INPUT' ||
					target.tagName === 'TEXTAREA' ||
					target.isContentEditable)
			) {
				return
			}
			e.preventDefault()
			go(e.key === 'ArrowLeft' ? -1 : 1)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	})

	if (!currentVariant) return null
	if (process.env.NODE_ENV === 'production') return null

	return (
		<div
			className={cn(
				'pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center',
			)}
		>
			<div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/90 px-1.5 py-1.5 text-zinc-100 shadow-2xl ring-1 ring-black/20 backdrop-blur-md dark:bg-zinc-800/90">
				<button
					type="button"
					onClick={() => go(-1)}
					className="grid size-8 place-items-center rounded-full hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
					aria-label="Previous variant"
				>
					<Icon name="arrow-left" size="sm" />
				</button>
				<div className="px-2 text-xs font-medium tabular-nums">
					<span className="mr-1 inline-block min-w-[1ch] rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase">
						{currentVariant.key}
					</span>
					{currentVariant.name}
					<span className="ml-2 text-[10px] text-zinc-400">
						{idx + 1}/{variants.length}
					</span>
				</div>
				<button
					type="button"
					onClick={() => go(1)}
					className="grid size-8 place-items-center rounded-full hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
					aria-label="Next variant"
				>
					<Icon name="arrow-right" size="sm" />
				</button>
			</div>
		</div>
	)
}
