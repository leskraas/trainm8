export type Palette = {
	bg: string
	ring: string
	chip: string
	ink: string
}

const activityPalette: Record<string, Palette> = {
	run: {
		bg: 'bg-orange-500/10 dark:bg-rose-500/10',
		ring: 'ring-orange-500/30 dark:ring-rose-500/30',
		chip: 'bg-orange-100 dark:bg-rose-900',
		ink: 'text-orange-700 dark:text-rose-300',
	},
	bike: {
		bg: 'bg-sky-500/10 dark:bg-indigo-500/10',
		ring: 'ring-sky-500/30 dark:ring-indigo-500/30',
		chip: 'bg-sky-100 dark:bg-indigo-900',
		ink: 'text-sky-700 dark:text-indigo-300',
	},
	swim: {
		bg: 'bg-cyan-500/10 dark:bg-teal-500/10',
		ring: 'ring-cyan-500/30 dark:ring-teal-500/30',
		chip: 'bg-cyan-100 dark:bg-teal-900',
		ink: 'text-cyan-700 dark:text-teal-300',
	},
	strength: {
		bg: 'bg-violet-500/10 dark:bg-fuchsia-500/10',
		ring: 'ring-violet-500/30 dark:ring-fuchsia-500/30',
		chip: 'bg-violet-100 dark:bg-fuchsia-900',
		ink: 'text-violet-700 dark:text-fuchsia-300',
	},
}

const defaultPalette: Palette = {
	bg: 'bg-zinc-500/10',
	ring: 'ring-zinc-500/30',
	chip: 'bg-zinc-100 dark:bg-zinc-800',
	ink: 'text-zinc-700 dark:text-zinc-300',
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

export function countdownLabel(scheduledAt: Date, now: Date = new Date()): string {
	const diffMs = scheduledAt.getTime() - now.getTime()
	const diffMin = Math.floor(diffMs / (1000 * 60))

	if (diffMin < 0) return 'Now'
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
