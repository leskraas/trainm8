/**
 * **The rest bar** — the one piece of the runner that must never block anything
 * (#482, ADR 0060 §4, screen `04-runner-logging-rest.png`).
 *
 * It starts on its own, because a timer you have to start is a timer you forget,
 * and it is pinned to the foot of the runner's scroll area rather than opened as
 * a screen: the page keeps scrolling under it and **every set circle stays
 * enabled and tappable while it runs**. The scroll area reserves the bar's height
 * at its foot (`pb-30` on the runner's container), which is what stops it
 * covering the last card's circles.
 *
 * **A wall-clock deadline, never a decremented counter.** A backgrounded tab does
 * not run intervals, so anything counted down comes back short: the state is one
 * `deadline` timestamp, the interval only forces a re-render at
 * {@link REST_TICK_MS}, and everything on the bar is re-derived from the clock by
 * `buildRestClock` on every tick. A phone locked for two minutes comes back to
 * the truth.
 *
 * **Past zero it keeps counting** — `+0:14`, in destructive — rather than
 * stopping or disappearing. An athlete four minutes into a three-minute rest is
 * being told something; a bar that vanished at zero would be hiding it.
 *
 * The component holds **no duration and no rule**: how long a rest is, why, and
 * what a tap does to it are all the rest module's and the runner presenter's
 * (`restForSetTap`, `restForWarmupTap`, `buildRestClock`). `180` and `300` do not
 * appear here.
 */
import { useEffect, useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	REST_ADJUST_STEP_SEC,
	type RestReason,
} from '#app/utils/strength/rest.ts'
import { buildRestClock } from './__runner-presenter.ts'

/**
 * The runner's whole rest state: when it is over, and why it is that long.
 *
 * There is no `remaining` and no `running` — both would be a second copy of a
 * fact the clock already holds, and the second copy is the one that goes stale
 * behind a locked screen.
 */
export type RestState = { deadline: number; reason: RestReason }

/**
 * How often the bar re-renders. **Not a duration** — the rest itself is the
 * deadline's business — just the cadence at which a seconds-resolution clock has
 * to be repainted to look continuous.
 */
export const REST_TICK_MS = 500

export function RestBar({
	rest,
	onAdjust,
	onDismiss,
}: {
	rest: RestState | null
	/** Moves the deadline. The bar never recomputes a remaining time to add to. */
	onAdjust: (sec: number) => void
	onDismiss: () => void
}) {
	const [, setTick] = useState(0)
	const deadline = rest?.deadline ?? null
	useEffect(() => {
		if (deadline == null) return
		const id = setInterval(() => setTick((n) => n + 1), REST_TICK_MS)
		return () => clearInterval(id)
	}, [deadline])

	if (rest == null) return null
	const clock = buildRestClock({
		deadline: rest.deadline,
		reason: rest.reason,
		now: Date.now(),
	})

	return (
		<div
			// `aria-live="off"`: a clock that announced itself every half second
			// would make the screen reader unusable for the thing this screen is for.
			// The bar is a status the athlete looks at, not one that interrupts them.
			role="status"
			aria-live="off"
			aria-label="Rest timer"
			data-rest-bar=""
			data-past={clock.past ? '' : undefined}
			className="bg-card fixed inset-x-0 bottom-0 z-20 border-t px-3.5 py-2.5"
		>
			<div className="container mx-auto flex max-w-2xl items-center gap-2">
				<Icon
					name="clock"
					size="md"
					className={cn(
						clock.past ? 'text-destructive' : 'text-muted-foreground',
					)}
				/>
				{/* **Tabular numerals at a fixed minimum width.** A proportional `1`
				    makes the whole bar twitch once a second, and the reason beside it
				    slide, on a surface being read at arm's length. */}
				<span
					data-testid="rest-clock"
					className={cn(
						'text-body-md min-w-14 font-bold tabular-nums',
						clock.past ? 'text-destructive' : 'text-primary',
					)}
				>
					{clock.text}
				</span>
				{/* The reason, in a phrase — a five-minute timer nobody can account for
				    reads as a bug. */}
				<span className="text-body-2xs text-muted-foreground flex-1 truncate">
					{clock.label}
				</span>
				<Button
					type="button"
					variant="outline"
					size="lg"
					className="text-body-2xs h-10 min-w-11 px-2"
					onClick={() => onAdjust(-REST_ADJUST_STEP_SEC)}
				>
					−{REST_ADJUST_STEP_SEC}s
				</Button>
				<Button
					type="button"
					variant="outline"
					size="lg"
					className="text-body-2xs h-10 min-w-11 px-2"
					onClick={() => onAdjust(REST_ADJUST_STEP_SEC)}
				>
					+{REST_ADJUST_STEP_SEC}s
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-lg"
					className="size-10"
					aria-label="Dismiss the rest timer"
					onClick={onDismiss}
				>
					<Icon name="cross-1" size="md" />
				</Button>
			</div>
		</div>
	)
}
