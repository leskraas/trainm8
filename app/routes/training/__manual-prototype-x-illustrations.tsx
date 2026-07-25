/**
 * PROTOTYPE — throwaway. Small SVG illustrations so every template level is
 * picked by *shape*, not by reading a sentence: a season reads as a profile, a
 * block reads as its rhythm, a week pattern reads as seven days of intensity.
 *
 * Also home to the layered season chart. Delete with the route.
 */
import {
	type BlockTemplate,
	expandPhase,
	FOCUS,
	type Phase,
	phaseId,
	type SeasonTemplate,
	type WeekTemplate,
	zoneHue,
} from './__manual-prototype-x-model.ts'

type PreviewWeek = { hours: number; focus: string; recovery: boolean }

/** Expands a template's blocks into preview weeks using the real rhythm rules. */
function previewWeeks(
	blocks: Array<Pick<Phase, 'focus' | 'weeks' | 'rhythm' | 'baseHours'>>,
	taperWeeks: number,
): PreviewWeek[] {
	const out: PreviewWeek[] = []
	for (const b of blocks) {
		const phase: Phase = {
			id: phaseId('prev'),
			name: '',
			origin: null,
			pattern: null,
			currency: 'hours',
			...b,
		}
		for (const w of expandPhase(phase, {})) {
			out.push({
				hours: w.hours,
				focus: w.focus,
				recovery: w.role === 'recovery',
			})
		}
	}
	const lastLoad = [...out].reverse().find((w) => !w.recovery)
	const cuts = taperWeeks === 1 ? [0.55] : [0.7, 0.45]
	for (let i = 0; i < taperWeeks; i++) {
		out.push({
			hours: (lastLoad?.hours ?? 6) * (cuts[i] ?? 0.5),
			focus: 'recovery',
			recovery: true,
		})
	}
	return out
}

function Bars({
	weeks,
	height = 40,
	loop = false,
}: {
	weeks: PreviewWeek[]
	height?: number
	loop?: boolean
}) {
	const max = Math.max(...weeks.map((w) => w.hours), 0.1)
	const colW = 7
	const W = weeks.length * colW + (loop ? 14 : 0)
	return (
		<svg
			viewBox={`0 0 ${W} ${height}`}
			width={W}
			height={height}
			aria-hidden
			className="shrink-0 overflow-visible"
		>
			{weeks.map((w, i) => {
				const h = Math.max(3, (w.hours / max) * (height - 6))
				return (
					<rect
						key={i}
						x={i * colW + 1}
						y={height - h}
						width={colW - 2}
						height={h}
						rx={2}
						fill={FOCUS[w.focus as keyof typeof FOCUS].hue}
						opacity={w.recovery ? 0.35 : 0.85}
					/>
				)
			})}
			{loop ? (
				<text
					x={W - 10}
					y={height - 2}
					className="fill-muted-foreground text-[11px]"
				>
					↻
				</text>
			) : null}
		</svg>
	)
}

/** Level 1: the whole macro, drawn as the profile it will produce. */
export function SeasonSpark({ template }: { template: SeasonTemplate }) {
	const weeks = previewWeeks(template.blocks, template.taperWeeks)
	const drawn =
		template.anchorKind === 'ongoing' ? [...weeks, ...weeks.slice(0, 4)] : weeks
	return <Bars weeks={drawn} height={44} loop={template.anchorKind === 'ongoing'} />
}

/** Level 2: one block, drawn as its loading:recovery rhythm. */
export function BlockSpark({ template }: { template: BlockTemplate }) {
	const weeks = previewWeeks([template], 0)
	const max = Math.max(...weeks.map((w) => w.hours), 0.1)
	return (
		<div className="flex h-11 shrink-0 items-end gap-1" aria-hidden>
			{weeks.map((w, i) => (
				<div
					key={i}
					className="w-2 rounded-sm"
					style={{
						height: `${Math.max(20, (w.hours / max) * 100)}%`,
						background: FOCUS[w.focus as keyof typeof FOCUS].hue,
						opacity: w.recovery ? 0.35 : 0.85,
					}}
				/>
			))}
		</div>
	)
}

/** Level 3: one Training Week, drawn as seven days of intensity. */
export function PatternSpark({
	template,
	height = 44,
	showDays = false,
}: {
	template: WeekTemplate
	height?: number
	showDays?: boolean
}) {
	const max = Math.max(...template.days.map((d) => d.share), 0.01)
	return (
		<div className="shrink-0" aria-hidden>
			<div className="flex items-end gap-1" style={{ height }}>
				{template.days.map((d, i) => (
					<div key={i} className="flex w-3 flex-col justify-end">
						{d.share === 0 ? (
							<div className="h-1 rounded-full bg-muted-foreground/25" />
						) : (
							<div
								className="rounded-sm"
								style={{
									height: `${Math.max(14, (d.share / max) * height)}px`,
									background: zoneHue(d.zone),
									opacity: d.strength ? 0.45 : 0.9,
									border: d.strength
										? '1.5px dashed var(--muted-foreground)'
										: undefined,
								}}
							/>
						)}
					</div>
				))}
			</div>
			{showDays ? (
				<div className="mt-1 flex gap-1">
					{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
						<span
							key={i}
							className="w-3 text-center text-[9px] text-muted-foreground"
						>
							{d}
						</span>
					))}
				</div>
			) : null}
		</div>
	)
}
