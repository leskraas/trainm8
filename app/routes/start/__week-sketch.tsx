import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import {
	type Effort,
	type WeekSketch as Sketch,
	type StartWeekSession,
} from '#app/utils/first-run/start-draft.ts'
import {
	FIRST_RUN_LABELS,
	NB_WEEKDAY_LABELS,
	nbDurationLabel,
	SIMPLE_START_LABELS,
	START_OPTION_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { MORPH } from '#app/utils/view-morph.ts'

const L = SIMPLE_START_LABELS.sketch

/**
 * One mark colour per sport (design-system: track hues are marks); a Simple
 * Activity, which has no track hue, takes the muted one.
 */
const TRACK_MARK: Partial<Record<StartWeekSession['discipline'], string>> = {
	run: 'bg-track-run',
	bike: 'bg-track-bike',
	swim: 'bg-track-swim',
}

/** Solid for a hard session, fainter as it gets easier. */
const EFFORT_OPACITY: Record<Effort, string> = {
	easy: 'opacity-45',
	moderate: 'opacity-75',
	hard: 'opacity-100',
}

function duration(minutes: number): string {
	return nbDurationLabel(minutes * 60)
}

/** A lifting chip's height: 0.75rem of the day's 4rem. */
const LIFT_HEIGHT = 18.75
/** The 2px between stacked blocks: 0.125rem of 4rem. */
const STACK_GAP = 3.125
/** The shortest session still reads as a block. */
const MIN_SESSION = 14
/** How long a block that left stays to drop out (`--transition-duration-morph-exit`). */
const LEAVE_MS = 160

/** One block of a day, placed in percent of the day's height from the top. */
type SketchBlock = {
	key: string
	weekday: number
	className: string
	top: number
	height: number
	lifting: boolean
}

/** A block on screen: arriving (with its place in the stagger) or leaving. */
type ShownBlock = SketchBlock & {
	enterIndex: number | null
	leaving: boolean
}

/**
 * Each day's blocks as places in its column: lifting on top of the sessions,
 * the stack resting on the baseline, sessions taller for longer and shrunk
 * together when a day holds more than fits.
 */
function sketchBlocks(sketch: Sketch): SketchBlock[] {
	const longest = Math.max(
		1,
		...sketch.days.flatMap((day) => day.sessions.map((s) => s.minutes)),
	)
	return sketch.days.flatMap((day) => {
		const lifting = day.lifting.map((_, index) => ({
			key: `${day.weekday}:lift-${index}`,
			className: 'bg-track-strength',
			height: LIFT_HEIGHT,
			lifting: true,
		}))
		const raw = day.sessions.map((session) =>
			Math.max(MIN_SESSION, (session.minutes / longest) * 100),
		)
		const count = lifting.length + raw.length
		const room =
			100 - lifting.length * LIFT_HEIGHT - Math.max(0, count - 1) * STACK_GAP
		const sum = raw.reduce((total, height) => total + height, 0)
		const scale = sum > room && sum > 0 ? Math.max(0, room) / sum : 1
		const sessions = day.sessions.map((session, index) => ({
			key: `${day.weekday}:session-${index}`,
			className: cn(
				TRACK_MARK[session.discipline] ?? 'bg-muted-foreground',
				EFFORT_OPACITY[session.effort],
			),
			height: raw[index]! * scale,
			lifting: false,
		}))
		// Top to bottom; placed from the baseline up.
		const stack = [...lifting, ...sessions]
		let bottom = 100
		const placed = stack
			.slice()
			.reverse()
			.map((block) => {
				const top = bottom - block.height
				bottom = top - STACK_GAP
				return { ...block, weekday: day.weekday, top }
			})
		return placed.reverse()
	})
}

/**
 * The blocks on screen across changes of the sketch: a block that arrives is
 * numbered for the 30ms stagger, and one that left stays for its 160ms exit
 * before it unmounts. Derived while rendering (the sanctioned "state from
 * the previous render" pattern), so a block that stays keeps its DOM node and
 * its change transitions instead of replaying an entrance.
 */
function useShownBlocks(blocks: SketchBlock[]): ShownBlock[] {
	const signature = useMemo(
		() =>
			blocks
				.map(
					(b) =>
						`${b.key}@${b.top.toFixed(2)}/${b.height.toFixed(2)}/${b.className}`,
				)
				.join('|'),
		[blocks],
	)
	const [state, setState] = useState(() => ({
		signature,
		shown: blocks.map<ShownBlock>((block) => ({
			...block,
			enterIndex: null,
			leaving: false,
		})),
	}))
	let current = state
	if (state.signature !== signature) {
		const before = new Set(
			state.shown.filter((block) => !block.leaving).map((block) => block.key),
		)
		const now = new Set(blocks.map((block) => block.key))
		let arriving = 0
		current = {
			signature,
			shown: [
				...blocks.map<ShownBlock>((block) => ({
					...block,
					enterIndex: before.has(block.key) ? null : arriving++,
					leaving: false,
				})),
				...state.shown
					.filter((block) => !now.has(block.key))
					.map((block) => ({ ...block, enterIndex: null, leaving: true })),
			],
		}
		setState(current)
	}
	const hasLeaving = current.shown.some((block) => block.leaving)
	useEffect(() => {
		if (!hasLeaving) return
		const timer = window.setTimeout(
			() =>
				setState((was) => ({
					...was,
					shown: was.shown.filter((block) => !block.leaving),
				})),
			LEAVE_MS + 20,
		)
		return () => window.clearTimeout(timer)
	}, [hasLeaving, current.signature])
	return current.shown
}

/**
 * _Uka di_, the **Week Sketch** (#563): seven days, Monday first, each a
 * column whose block is the day's session — taller for longer, more solid
 * the harder it is — with the week's session count and total time above. It is the
 * top Start Option's first week (`weekSketch`), so it never shows a week the
 * plan would not lay.
 *
 * A screen reader hears a list of days (`mandag: Rolig økt · Løping, 45 min`,
 * `tirsdag: fri`), or _Uka di er tom ennå_; the blocks are only a picture of
 * the same list.
 *
 * Motion (#582): as the answers change, a block that arrives rises from the
 * baseline, 30ms after the one before; one that changes size stretches in
 * place; one that goes drops out in 160ms (`sketch-block`). The sketch is
 * the `start-week` surface the top Start Option card morphs out of.
 */
export function WeekSketch({ sketch }: { sketch: Sketch }) {
	const empty = sketch.sessionCount === 0 && sketch.strengthSessions === 0
	const blocks = useMemo(() => sketchBlocks(sketch), [sketch])
	const shown = useShownBlocks(blocks)
	// No motion on the first paint: a screen that opens with a week shows it.
	const [live, setLive] = useState(false)
	useEffect(() => setLive(true), [])
	return (
		<section
			aria-labelledby="week-sketch-title"
			className="bg-card space-y-3 rounded-4xl p-4 shadow-xs"
			style={{ viewTransitionName: MORPH.week }}
			data-week-sketch
			data-sketch-live={live ? '' : undefined}
		>
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<h2
					id="week-sketch-title"
					className="text-overline text-muted-foreground shrink-0 uppercase"
				>
					{L.title}
				</h2>
				<p
					className="text-footnote text-muted-foreground tabular-nums"
					data-week-sketch-summary
				>
					{empty
						? L.empty
						: L.summary(sketch.sessionCount, duration(sketch.minutes))}
					{sketch.strengthSessions > 0 ? (
						<span data-week-sketch-strength>
							{' · '}
							{START_OPTION_LABELS.plusStrength(sketch.strengthSessions)}
						</span>
					) : null}
				</p>
			</div>
			<ol
				aria-label={L.title}
				aria-hidden={empty ? true : undefined}
				className="grid grid-cols-7 gap-1.5"
			>
				{sketch.days.map((day) => {
					const weekday = NB_WEEKDAY_LABELS[day.weekday]!
					const said = [
						...day.sessions.map((session) =>
							L.session(
								session.effort === 'easy'
									? session.title
									: `${session.title} (${START_OPTION_LABELS.effort[session.effort]})`,
								duration(session.minutes),
							),
						),
						// A lifting day is said by its session, never in minutes (#574).
						...day.lifting.map((lift) => L.lifting(lift.title)),
					]
					const spoken = said.length === 0 ? L.free : said.join('; ')
					return (
						<li key={day.weekday} className="flex min-w-0 flex-col gap-1">
							<span className="sr-only">{L.day(weekday, spoken)}</span>
							<span
								aria-hidden
								className="bg-muted/60 relative block h-16 overflow-hidden rounded-2xl"
							>
								{shown
									.filter((block) => block.weekday === day.weekday)
									.map((block) => (
										<span
											key={block.key}
											className={cn(
												'sketch-block absolute inset-0 block',
												block.className,
											)}
											style={
												{
													'--sketch-y': `${block.top.toFixed(2)}%`,
													'--sketch-cut': `${(100 - block.height).toFixed(2)}%`,
													'--sketch-index': block.enterIndex ?? undefined,
												} as CSSProperties
											}
											data-week-sketch-lifting={
												block.lifting && !block.leaving ? '' : undefined
											}
											data-entering={block.enterIndex != null ? '' : undefined}
											data-leaving={block.leaving ? '' : undefined}
										/>
									))}
							</span>
							<span
								aria-hidden
								className="text-caption text-muted-foreground text-center"
							>
								{FIRST_RUN_LABELS.dayShort[day.weekday]}
							</span>
						</li>
					)
				})}
			</ol>
		</section>
	)
}
