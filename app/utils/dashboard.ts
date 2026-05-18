export type Palette = {
	bg: string
	ring: string
	chip: string
	ink: string
}

const activityPalette: Record<string, Palette> = {
	run: {
		bg: 'from-orange-500/15 to-rose-500/10',
		ring: 'ring-orange-400/30',
		chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
		ink: 'text-orange-600 dark:text-orange-300',
	},
	bike: {
		bg: 'from-sky-500/15 to-indigo-500/10',
		ring: 'ring-sky-400/30',
		chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
		ink: 'text-sky-600 dark:text-sky-300',
	},
	swim: {
		bg: 'from-cyan-500/15 to-teal-500/10',
		ring: 'ring-cyan-400/30',
		chip: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
		ink: 'text-cyan-600 dark:text-cyan-300',
	},
	strength: {
		bg: 'from-violet-500/15 to-fuchsia-500/10',
		ring: 'ring-violet-400/30',
		chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
		ink: 'text-violet-600 dark:text-violet-300',
	},
}

const defaultPalette: Palette = {
	bg: 'from-zinc-500/10 to-zinc-500/5',
	ring: 'ring-zinc-300/40',
	chip: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
	ink: 'text-zinc-600 dark:text-zinc-300',
}

export function paletteFor(activityType: string | null | undefined): Palette {
	if (!activityType) return defaultPalette
	return activityPalette[activityType] ?? defaultPalette
}

type Block = {
	repeatCount: number
	steps: Array<{ durationSec: number | null }>
}

export function sumBlockDurationMin(blocks: Block[]): number | null {
	let totalSec = 0
	let hasDuration = false

	for (const block of blocks) {
		for (const step of block.steps) {
			if (step.durationSec != null) {
				hasDuration = true
				totalSec += step.durationSec * block.repeatCount
			}
		}
	}

	if (!hasDuration) return null
	return Math.round(totalSec / 60)
}

export function countdownLabel(
	scheduledAt: Date,
	now: Date = new Date(),
): string {
	const diffMs = scheduledAt.getTime() - now.getTime()
	const diffMin = Math.floor(diffMs / (1000 * 60))

	if (diffMin <= 0) return 'Now'
	if (diffMin < 60) return `In ${diffMin} min`

	const diffH = Math.floor(diffMin / 60)
	if (diffH < 24) return `In ${diffH}h`

	const diffD = Math.floor(diffH / 24)
	if (diffD === 1) return 'Tomorrow'
	if (diffD < 7) return `In ${diffD} days`

	const weeks = Math.floor(diffD / 7)
	return `In ${weeks}w`
}

export function greetingFor(date: Date): string {
	const hour = date.getHours()
	if (hour < 12) return 'Good morning'
	if (hour < 17) return 'Good afternoon'
	if (hour < 21) return 'Good evening'
	return 'Up late'
}

export function isoDayKey(date: Date): string {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, '0')
	const d = String(date.getDate()).padStart(2, '0')
	return `${y}-${m}-${d}`
}

export function buildWeekDays(today: Date, length = 7): Date[] {
	const days: Date[] = []
	for (let i = 0; i < length; i++) {
		const d = new Date(today)
		d.setDate(today.getDate() + i)
		d.setHours(0, 0, 0, 0)
		days.push(d)
	}
	return days
}
