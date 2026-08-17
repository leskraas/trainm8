/**
 * DEV ONLY — the floating athlete switcher.
 *
 * Rendered by the root route, but only when the root loader hands down
 * `devAthletes`, which it only queries when `NODE_ENV === 'development'`. In
 * production the prop is `null` and this component never mounts.
 *
 * Deliberately dev chrome, not product UI: bottom-LEFT (bottom-centre belongs to
 * the plan prototype switcher), high contrast, tiny, numbers only.
 */
import { useCallback, useEffect, useState } from 'react'
import { useFetcher, useLocation } from 'react-router'
import { type DevAthlete } from '#app/utils/dev-athletes.server.ts'
import { cn } from '#app/utils/misc.tsx'

const STORAGE_KEY = 'dev-athlete-switcher-open'

export function DevAthleteSwitcher({
	athletes,
	username,
}: {
	athletes: Array<DevAthlete>
	username: string | null
}) {
	const [open, setOpen] = useState(false)
	const location = useLocation()
	const fetcher = useFetcher()
	const returnTo = `${location.pathname}${location.search}`

	// Read after hydration: the server can't know localStorage.
	useEffect(() => {
		setOpen(localStorage.getItem(STORAGE_KEY) === '1')
	}, [])

	const toggle = useCallback(() => {
		setOpen((wasOpen) => {
			const next = !wasOpen
			localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
			return next
		})
	}, [])

	// Ctrl+Alt+D toggles. `code` not `key`, because Alt+d on macOS types "∂".
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.code !== 'KeyD' || !event.ctrlKey || !event.altKey) return
			const target = event.target
			if (target instanceof HTMLElement) {
				if (
					target.isContentEditable ||
					['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
				) {
					return
				}
			}
			event.preventDefault()
			toggle()
		}
		document.addEventListener('keydown', onKeyDown)
		return () => document.removeEventListener('keydown', onKeyDown)
	}, [toggle])

	const busy = fetcher.state !== 'idle'

	return (
		<div className="fixed bottom-3 left-3 z-50 flex flex-col items-start gap-1 text-xs">
			{open ? (
				<div className="bg-background max-w-[15rem] rounded-md border-2 border-amber-500 shadow-lg">
					<div className="flex items-center justify-between gap-2 border-b px-2 py-1 text-amber-600 dark:text-amber-400">
						<span className="font-mono">dev</span>
						<span className="text-muted-foreground tabular-nums">
							km/wk · s/wk
						</span>
					</div>
					<ul>
						{athletes.map((athlete) => (
							<li key={athlete.username}>
								<button
									type="button"
									disabled={!athlete.seeded || busy}
									aria-current={
										athlete.username === username ? 'true' : undefined
									}
									onClick={() =>
										fetcher.submit(
											{ username: athlete.username, returnTo },
											{
												method: 'POST',
												action: '/resources/dev-switch-athlete',
											},
										)
									}
									className={cn(
										'hover:bg-muted flex w-full items-baseline gap-2 px-2 py-1.5 text-left disabled:opacity-50',
										athlete.username === username && 'bg-muted font-semibold',
									)}
								>
									<span className="w-10 shrink-0 truncate font-mono">
										{athlete.username}
									</span>
									<span className="text-muted-foreground min-w-0 flex-1 truncate">
										{athlete.seeded ? athlete.level : 'not seeded'}
									</span>
									{athlete.seeded ? (
										<span className="shrink-0 tabular-nums">
											{athlete.kmPerWeek.toFixed(0)} · {athlete.sessionsPerWeek}
										</span>
									) : null}
								</button>
							</li>
						))}
						<li>
							<fetcher.Form method="POST" action="/logout">
								<button
									type="submit"
									disabled={busy || !username}
									className="hover:bg-muted w-full border-t px-2 py-1.5 text-left disabled:opacity-50"
								>
									Log out
								</button>
							</fetcher.Form>
						</li>
					</ul>
				</div>
			) : null}
			<button
				type="button"
				onClick={toggle}
				title="Dev athlete switcher (Ctrl+Alt+D)"
				aria-expanded={open}
				className="bg-background rounded-full border-2 border-amber-500 px-2 py-0.5 font-mono shadow-lg"
			>
				{username ?? 'nobody'}
			</button>
		</div>
	)
}
