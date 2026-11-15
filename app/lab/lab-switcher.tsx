import { useEffect, useRef, useState } from 'react'
import { Form, Link, useLocation, useSubmit } from 'react-router'
import { LAB_VARIANTS, labVariant, variantOfPath } from './variants.ts'

/**
 * The App Lab's toggle (ADR 0125): a small pill in the top-right corner of
 * every page, in every app, that opens the list of apps. It is deliberately
 * the same everywhere and quiet, so it never becomes part of any one app's
 * design. Choosing an app remembers it and opens that app's home.
 *
 * Like a prototype picker, the number keys `1`–`6` switch apps instantly from
 * anywhere (not while typing, not with a modifier held). The swap itself never
 * animates: flipping between apps is the thing the owner does most.
 */
export function LabSwitcher() {
	const location = useLocation()
	const current = labVariant(variantOfPath(location.pathname))
	const [open, setOpen] = useState(false)
	const panelRef = useRef<HTMLDivElement>(null)
	const submit = useSubmit()

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
			const target = e.target as HTMLElement | null
			if (
				target &&
				(/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
					target.isContentEditable)
			) {
				return
			}
			const n = Number.parseInt(e.key, 10)
			const next = LAB_VARIANTS[n - 1]
			if (!next || next.key === current.key) return
			e.preventDefault()
			void submit(
				{ app: next.key },
				{ method: 'post', action: '/resources/lab-app' },
			)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [current.key, submit])

	useEffect(() => {
		setOpen(false)
	}, [location.pathname])

	useEffect(() => {
		if (!open) return
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setOpen(false)
		}
		function onPointer(e: PointerEvent) {
			if (!panelRef.current?.contains(e.target as Node)) setOpen(false)
		}
		window.addEventListener('keydown', onKey)
		window.addEventListener('pointerdown', onPointer)
		return () => {
			window.removeEventListener('keydown', onKey)
			window.removeEventListener('pointerdown', onPointer)
		}
	}, [open])

	return (
		<div
			ref={panelRef}
			className="fixed top-[max(0.5rem,env(safe-area-inset-top))] right-[max(0.5rem,env(safe-area-inset-right))] z-[1000] font-sans"
			style={{ colorScheme: 'dark' }}
		>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-haspopup="menu"
				className="flex h-8 touch-manipulation items-center gap-2 rounded-full bg-black/75 pr-3 pl-2 text-[12px] font-semibold text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md transition-transform duration-150 ease-out select-none active:scale-[0.96] motion-reduce:transition-none"
			>
				<span
					aria-hidden
					className="size-3.5 rounded-full ring-2 ring-white/30"
					style={{ background: current.swatch }}
				/>
				<span>{current.name}</span>
				<span aria-hidden className="text-white/50">
					⇄
				</span>
			</button>
			<div
				role="menu"
				data-open={open}
				className="pointer-events-none absolute top-10 right-0 w-[min(20rem,calc(100vw-1rem))] origin-top-right scale-95 overflow-hidden rounded-[20px] bg-neutral-950/95 text-white opacity-0 shadow-2xl ring-1 ring-white/10 backdrop-blur-xl transition-[opacity,transform] duration-150 ease-out data-[open=true]:pointer-events-auto data-[open=true]:scale-100 data-[open=true]:opacity-100 motion-reduce:transition-none"
			>
				<div className="px-4 pt-3 pb-1 text-[11px] font-semibold tracking-[0.12em] text-white/45 uppercase">
					App-lab · velg app
				</div>
				<Form method="post" action="/resources/lab-app" className="p-1.5">
					{LAB_VARIANTS.map((v, i) => {
						const isCurrent = v.key === current.key
						return (
							<button
								key={v.key}
								type="submit"
								name="app"
								value={v.key}
								role="menuitem"
								tabIndex={open ? 0 : -1}
								className="flex w-full touch-manipulation items-start gap-3 rounded-[14px] px-2.5 py-2.5 text-left transition-colors duration-100 hover:bg-white/8 focus-visible:bg-white/10 focus-visible:outline-none"
							>
								<span
									aria-hidden
									className="mt-0.5 size-5 shrink-0 rounded-full"
									style={{
										background: v.swatch,
										boxShadow: isCurrent ? '0 0 0 2px #fff' : undefined,
									}}
								/>
								<span className="min-w-0 flex-1">
									<span className="block text-[15px] leading-tight font-semibold">
										{v.name}
										{isCurrent ? (
											<span className="ml-2 text-[11px] font-medium text-white/50">
												nå
											</span>
										) : null}
									</span>
									<span className="mt-0.5 block text-[13px] leading-snug text-white/60">
										{v.idea}
									</span>
								</span>
								<kbd className="mt-0.5 hidden font-mono text-[11px] text-white/35 sm:block">
									{i + 1}
								</kbd>
							</button>
						)
					})}
				</Form>
				<Link
					to="/lab"
					tabIndex={open ? 0 : -1}
					className="block border-t border-white/10 px-4 py-2.5 text-[13px] text-white/60 hover:text-white"
				>
					Om app-laben →
				</Link>
			</div>
		</div>
	)
}
