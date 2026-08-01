/**
 * The **layered season chart** (#413) — the planning surface's primary object.
 *
 * Variant F's central decision was that the season is a *shape* the athlete
 * already recognises, not a table with a picture beside it. So volume, fitness,
 * rhythm, ramp and emphasis stack on **one time axis**, each toggling
 * independently, and the athlete reads one thing at a time.
 *
 * **This graduates onto `ChartFigure`, where the preset gallery deliberately did
 * not.** `__preset-gallery.tsx` states the criterion it stays bespoke under: its
 * strip is a *pre-attentive glyph*, with no per-week value to read out, because a
 * preset carries no **Volume Currency** and no **Season Anchor** so every bar is a
 * ratio. Every one of those clauses is false here. Each bar is a real week in a
 * real currency; each bar has a derivation five buckets deep; an unpriced week is
 * an **Unavailable Metric** that has to mark itself and inspect to a reason. That
 * is exactly the graduation the gallery names — "if a preset preview ever grows a
 * per-week reading, it graduates onto `ChartFigure` and inherits the rest" — so
 * the inspect controller, the fixed panel, the `n/a` marker, the keyboard model
 * and the accessible table are all inherited rather than rebuilt.
 *
 * ### One axis is one track in one currency (ADR 0043 §7)
 *
 * The value axis belongs to exactly one **Training Track** reading exactly one
 * **Volume Currency**. Nothing is normalised onto it: every choice of scaling
 * between kilometres and sets would be a claim about an exchange rate that does
 * not exist, which is the fabricated conversion ADR 0041 forbade, smuggled in as a
 * pixel decision. So:
 *
 * - Which track, and which currency, are **controls** — and neither is a tab. The
 *   **Blocks** and **Weeks** readings stay the only tabs, because they are two
 *   readings of the plan while a unit is one reading rendered twice (ADR 0043 §8).
 * - The **fitness** layer needs a second value axis, so it gets a second chart
 *   under the first, aligned on the same weeks and driven by the same inspected
 *   index — "more views means more axes", not one axis carrying two units. It is
 *   off by default: a second chart is a second inspect panel, and two at 390 px is
 *   two things to read (ADR 0028).
 * - Everything else — phase boundaries, week roles, another track's segment
 *   boundaries, mix marks per week, re-anchor points, the **Target Event** — rides
 *   the **time** axis, where ADR 0043 §7 expressly allows it.
 *
 * ### The panel below, never a tooltip
 *
 * Tapping a week reveals it in the fixed panel below the chart (ADR 0030 rule 3),
 * and that panel is where the conversion's derivation becomes readable: five
 * buckets with their sources do not fit inline on a phone, which is the reason
 * ADR 0045 §10 put the chain one interaction away in the first place. An
 * **Unavailable Metric** inspects to the reason that closed it, never to nothing.
 * The panel shows a line per **enabled** layer, so toggling a layer off removes it
 * from the reading as well as from the picture.
 *
 * ### The Form layer declines, and that is the feature
 *
 * A plan carries one number per week, so a replay spreads it as a flat daily
 * average. CTL's 42-day window averages a week's distribution away anyway; ATL's
 * 7-day window is a reading *of* that distribution, and TSB is CTL − ATL. So Form
 * is not a quantity this plan contains. The layer is offered, refuses in plain
 * words, and draws nothing — an athlete who looks for Form finds the answer rather
 * than an absence they have to interpret.
 */
import { useMemo, useState, type ReactNode } from 'react'
import {
	ChartFigure,
	ChartUnavailableMark,
	niceLinearTicks,
	useChartInspect,
	type ChartDataTableModel,
	type ChartGeom,
	type ChartInspect,
} from '#app/components/chart/chart.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { weekMonday } from '#app/utils/athlete-calendar.ts'
import {
	formatDate,
	formatDerivationValue,
	formatEmphasisLabel,
	formatLoad,
	formatSignedPercent,
	formatWeeklyVolume,
} from '#app/utils/format.ts'
import {
	CONVERSION_CONVENTION_LABELS,
	DISCIPLINE_LABELS,
	NO_CONTRIBUTION_LABELS,
	THRESHOLD_FIELD_LABELS,
	VOLUME_CURRENCY_LABELS,
	VOLUME_CURRENCY_UNITS,
	WEEK_ROLE_LABELS,
	QUALITY_ZONE_LABELS,
} from '#app/utils/labels.ts'
import {
	type Rhythm,
	type VolumeCurrency,
	type WeekRole,
} from '#app/utils/plan-outline/derive.ts'
import { type PlannedLoadContexts } from '#app/utils/plan-outline/planned-load.ts'
import {
	DEFAULT_SEASON_CHART_LAYERS,
	readableCurrencies,
	readingChain,
	seasonChartModel,
	seasonFitnessLayer,
	SEASON_CHART_LAYERS,
	type FitnessAnchor,
	type FitnessLayer,
	type SeasonChartLayer,
	type SeasonChartModel,
	type SeasonChartReading,
	type SeasonChartWeek,
} from '#app/utils/plan-outline/season-chart.ts'
import {
	type DerivationSource,
	type DerivationStep,
	type VolumeBucket,
} from '#app/utils/plan-outline/volume-conversion.ts'
import { weekIndexOf } from '#app/utils/plan-outline/week-keys.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'

// ---------------------------------------------------------------------------
// The season this chart reads — the loader's shape, narrowed to what it uses
// ---------------------------------------------------------------------------

export type SeasonChartSeason = {
	startWeekKey: string
	timezone: string
	eventName: string
	eventDate: Date
	phases: Array<{
		name: string
		weeks: number
		rhythm: Rhythm
		tapers: boolean
	}>
	tracks: Array<{
		trackId: string
		discipline: Discipline
		currency: VolumeCurrency
		anchors: Array<{ fromWeekKey: string; value: number }>
		segments: Array<{
			phaseIndex: number
			ramp: number | null
			mix: Array<{ zone: 3 | 4 | 5; sessionsPerWeek: number }>
		}>
		strengthSegments: Array<{
			segmentId: string
			startWeekInPlan: number | null
			weeks: number
			ramp: number | null
		}>
	}>
	weeks: Array<{
		weekKey: string
		weekInPlan: number
		phaseIndex: number
		role: WeekRole
		startsAt: Date
		targets: Array<{
			trackId: string
			value: number | null
			overridden: boolean
			derivedValue: number | null
		}>
	}>
}

/**
 * The layers' own names. Not a domain enum — they label a *view*, exactly as the
 * Blocks/Weeks tab labels do, so they live beside the view rather than in
 * `labels.ts` (`plan.tsx`'s `TAB_LABELS` sets the precedent).
 */
const LAYER_LABELS: Record<SeasonChartLayer, string> = {
	volume: 'Volume',
	fitness: 'Fitness',
	rhythm: 'Rhythm',
	ramp: 'Ramp',
	emphasis: 'Emphasis',
	form: 'Form',
}

// ── geometry ──────────────────────────────────────────────────────────────────
// The viewBox is 720×240 stretched to the container under
// `preserveAspectRatio="none"`, so all *text* rides as HTML overlays and only
// shapes are drawn in SVG. Bottom padding is deep enough for two time-axis strips
// under the baseline — the rhythm band and the emphasis marks — plus the week
// numbers, because those layers add no value axis and must not eat the plot.
const CHART_PADDING = { top: 18, right: 8, bottom: 52, left: 8 }
const RHYTHM_BAND_TOP = 4
/** Loading reads tallest, so the rhythm is legible without relying on colour. */
const RHYTHM_BAND_HEIGHT: Record<WeekRole, number> = {
	loading: 10,
	recovery: 6,
	taper: 4,
}
const RHYTHM_BAND_CLASS: Record<WeekRole, string> = {
	loading: 'fill-primary/60',
	recovery: 'fill-muted-foreground/50',
	taper: 'fill-muted-foreground/30',
}
const EMPHASIS_ROW_OFFSET = 22

const ZONE_DOT: Record<3 | 4 | 5, string> = {
	3: 'bg-zone-3',
	4: 'bg-zone-4',
	5: 'bg-zone-5',
}

export function SeasonChart({
	season,
	contexts,
	fitnessAnchor,
}: {
	season: SeasonChartSeason
	/** The per-Discipline half of the **Volume Conversion**'s input (ADR 0045 §4). */
	contexts: PlannedLoadContexts
	/** The measured fitness the plan is replayed forward from; `null` declines. */
	fitnessAnchor: FitnessAnchor | null
}) {
	const [layers, setLayers] = useState<readonly SeasonChartLayer[]>(
		DEFAULT_SEASON_CHART_LAYERS,
	)
	const firstTrack = season.tracks[0]
	const [trackId, setTrackId] = useState(firstTrack?.trackId ?? '')
	const [currency, setCurrency] = useState<VolumeCurrency>(
		firstTrack?.currency ?? 'km',
	)

	const track = season.tracks.find((t) => t.trackId === trackId) ?? firstTrack
	const model = useMemo(
		() =>
			track
				? seasonChartModel({
						startWeekKey: season.startWeekKey,
						phases: season.phases,
						tracks: season.tracks,
						weeks: season.weeks,
						eventWeekIndex: eventWeekIndexOf(season),
						trackId: track.trackId,
						currency,
						contexts,
					})
				: null,
		[season, track, currency, contexts],
	)

	const showFitness = layers.includes('fitness')
	const fitness = useMemo(
		() =>
			showFitness
				? seasonFitnessLayer({
						phases: season.phases,
						tracks: season.tracks.map((t) => ({
							discipline: t.discipline,
							currency: t.currency,
							segments: t.segments,
							targets: season.weeks.map(
								(week) =>
									week.targets.find(
										(target) => target.trackId === t.trackId,
									) ?? {
										value: null,
										overridden: false,
										derivedValue: null,
									},
							),
						})),
						contexts,
						anchor: fitnessAnchor,
					})
				: null,
		[showFitness, season, contexts, fitnessAnchor],
	)

	// One controller for the whole stack, so the two charts and the two panels are
	// always reading the *same* week — a second controller would let the fitness
	// panel say week 6 while the volume panel says week 3.
	const inspect = useChartInspect(model?.weeks.length ?? 0)

	if (!model || !track || model.weeks.length === 0) return null

	function toggleLayer(layer: SeasonChartLayer) {
		setLayers((current) =>
			current.includes(layer)
				? current.filter((name) => name !== layer)
				: [...current, layer],
		)
	}

	return (
		<section aria-labelledby="season-chart-heading" className="mb-8 space-y-3">
			<h2 id="season-chart-heading" className="text-lg font-semibold">
				Your season
			</h2>

			<Controls
				season={season}
				trackId={track.trackId}
				currency={currency}
				authoredCurrency={track.currency}
				layers={layers}
				onTrack={(id) => {
					const next = season.tracks.find((t) => t.trackId === id)
					setTrackId(id)
					// The currency belongs to the track, so following it is the only
					// honest default: carrying `km` onto a `sets` track would open the
					// chart on a reading that refuses (ADR 0043 §1).
					if (next) setCurrency(next.currency)
					inspect.clear()
				}}
				onCurrency={setCurrency}
				onLayer={toggleLayer}
			/>

			<VolumePanel
				model={model}
				season={season}
				layers={layers}
				inspect={inspect}
			/>

			{showFitness ? (
				<FitnessPanel
					model={model}
					season={season}
					fitness={fitness!}
					inspect={inspect}
				/>
			) : null}

			{layers.includes('form') ? <FormRefusal /> : null}
		</section>
	)
}

/**
 * The **Target Event**'s week, as a 0-based plan index, or `null` when the Event
 * falls outside the plan.
 *
 * Outside is a real and common state — a plan may end weeks before its Event, and
 * ADR 0044 §3 refuses to stretch the season to meet it — so the flag is simply
 * absent from the axis and the surface's own fit sentence says where the Event
 * lands instead. The Event's week is its Monday in the **Athlete Timezone**, the
 * same key every week-scoped row on this plan hangs off.
 */
function eventWeekIndexOf(season: SeasonChartSeason): number | null {
	const index = weekIndexOf(
		season.startWeekKey,
		weekMonday(season.eventDate, season.timezone),
	)
	return index >= 0 && index < season.weeks.length ? index : null
}

// ---------------------------------------------------------------------------
// Controls — a reading, a unit, and the layers. None of them is navigation.
// ---------------------------------------------------------------------------

function Controls({
	season,
	trackId,
	currency,
	authoredCurrency,
	layers,
	onTrack,
	onCurrency,
	onLayer,
}: {
	season: SeasonChartSeason
	trackId: string
	currency: VolumeCurrency
	authoredCurrency: VolumeCurrency
	layers: readonly SeasonChartLayer[]
	onTrack: (id: string) => void
	onCurrency: (currency: VolumeCurrency) => void
	onLayer: (layer: SeasonChartLayer) => void
}) {
	const currencies = readableCurrencies(authoredCurrency)
	return (
		<div className="space-y-2">
			{season.tracks.length > 1 ? (
				<Toggles label="Track">
					{season.tracks.map((track) => (
						<Toggle
							key={track.trackId}
							pressed={track.trackId === trackId}
							onClick={() => onTrack(track.trackId)}
						>
							{DISCIPLINE_LABELS[track.discipline]}
						</Toggle>
					))}
				</Toggles>
			) : null}

			{currencies.length > 1 ? (
				<Toggles label="Read in">
					{currencies.map((option) => (
						<Toggle
							key={option}
							pressed={option === currency}
							onClick={() => onCurrency(option)}
							label={
								option === authoredCurrency
									? `Read in ${VOLUME_CURRENCY_LABELS[option]}, as authored`
									: `Read in ${VOLUME_CURRENCY_LABELS[option]}, derived`
							}
						>
							{VOLUME_CURRENCY_UNITS[option]}
							{option === authoredCurrency ? null : (
								<span className="text-xs opacity-70"> derived</span>
							)}
						</Toggle>
					))}
				</Toggles>
			) : null}

			<Toggles label="Layers">
				{SEASON_CHART_LAYERS.map((layer) => (
					<Toggle
						key={layer}
						pressed={layers.includes(layer)}
						onClick={() => onLayer(layer)}
					>
						{LAYER_LABELS[layer]}
					</Toggle>
				))}
			</Toggles>
		</div>
	)
}

/**
 * A labelled row of toggles. Wraps rather than scrolling: six short chips fit two
 * rows at 390 px, and a scrolling strip hides the layers off-screen behind an
 * affordance the athlete has to discover (ADR 0028).
 */
function Toggles({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-muted-foreground w-16 shrink-0 text-xs">
				{label}
			</span>
			<div className="flex flex-wrap gap-2">{children}</div>
		</div>
	)
}

function Toggle({
	pressed,
	onClick,
	children,
	label,
}: {
	pressed: boolean
	onClick: () => void
	children: ReactNode
	/** An accessible name where the visible chip is a unit rather than a phrase. */
	label?: string
}) {
	return (
		<Button
			type="button"
			size="sm"
			variant={pressed ? 'default' : 'outline'}
			aria-pressed={pressed}
			aria-label={label}
			onClick={onClick}
		>
			{children}
		</Button>
	)
}

// ---------------------------------------------------------------------------
// The volume panel — the one value axis
// ---------------------------------------------------------------------------

function VolumePanel({
	model,
	season,
	layers,
	inspect,
}: {
	model: SeasonChartModel
	season: SeasonChartSeason
	layers: readonly SeasonChartLayer[]
	inspect: ChartInspect
}) {
	const { axis, weeks, peak } = model
	const yMax = niceLinearTicks(peak).at(-1)!
	const unit = VOLUME_CURRENCY_UNITS[axis.currency]

	const dataTable: ChartDataTableModel = {
		caption: `${DISCIPLINE_LABELS[axis.discipline]} volume by Training Week, in ${unit}${
			axis.derived
				? `, a derived reading of a track authored in ${VOLUME_CURRENCY_UNITS[axis.authoredCurrency]}`
				: ''
		}. Move across the chart to read a week's derivation in the panel below it.`,
		columns: [
			'Week',
			'Starts',
			'Block',
			'Week role',
			unit,
			'Change',
			'Emphasis',
		],
		rows: weeks.map((week) => [
			String(week.weekInPlan),
			formatDate(season.weeks[week.weekInPlan - 1]!.startsAt, season.timezone),
			week.phaseName,
			WEEK_ROLE_LABELS[week.role],
			readingText(week.volume, axis.currency),
			// Spelled out rather than dashed: a screen reader reads "—" as "dash",
			// and the first week of a plan has no previous week rather than an
			// unknown change.
			week.step == null ? 'No change to read' : formatSignedPercent(week.step),
			emphasisText(week),
		]),
	}

	return (
		<ChartFigure
			inspect={inspect}
			count={weeks.length}
			yMax={yMax}
			padding={CHART_PADDING}
			plotHeightClass="h-64"
			ariaLabel={`${DISCIPLINE_LABELS[axis.discipline]} volume across the season, in ${unit}. Use the arrow keys to read a week.`}
			dataTable={dataTable}
			renderMarks={(geom) => (
				<VolumeMarks
					geom={geom}
					weeks={weeks}
					layers={layers}
					inspect={inspect}
				/>
			)}
			renderOverlay={(geom) => (
				<VolumeOverlay geom={geom} model={model} layers={layers} yMax={yMax} />
			)}
			renderInspect={(index) => (
				<InspectReading
					week={index == null ? null : weeks[index]!}
					model={model}
					season={season}
					layers={layers}
				/>
			)}
		/>
	)
}

function VolumeMarks({
	geom,
	weeks,
	layers,
	inspect,
}: {
	geom: ChartGeom
	weeks: SeasonChartWeek[]
	layers: readonly SeasonChartLayer[]
	inspect: ChartInspect
}) {
	const { padding, baselineY, scaleY, slotW, slotLeft, slotCenter } = geom
	const barW = Math.max(2, slotW * 0.62)
	const showVolume = layers.includes('volume')
	const showRamp = layers.includes('ramp')
	const showRhythm = layers.includes('rhythm')

	// The ramp layer is the *slope between two bar tops* and so lives on the value
	// axis the bars already own — it adds no second scale, which is what lets it be
	// a layer here rather than a chart of its own (ADR 0043 §7).
	const rampPoints = weeks
		.map((week, i) =>
			week.volume.available
				? `${slotCenter(i)},${scaleY(week.volume.value)}`
				: null,
		)
		.filter((point): point is string => point != null)

	return (
		<>
			{/* Phase boundaries — the time axis, always, because the blocks are the
			    plan's own structure rather than a layer over it. */}
			{weeks.map((week, i) =>
				week.phaseStart && i > 0 ? (
					<line
						key={`phase-${week.weekKey}`}
						x1={slotLeft(i)}
						x2={slotLeft(i)}
						y1={padding.top}
						y2={baselineY}
						stroke="currentColor"
						className="text-border"
						strokeWidth={1}
						strokeDasharray="2 4"
						vectorEffect="non-scaling-stroke"
					/>
				) : null,
			)}

			{/* The Target Event's week. */}
			{weeks.map((week, i) =>
				week.eventWeek ? (
					<rect
						key={`event-${week.weekKey}`}
						x={slotLeft(i)}
						y={padding.top}
						width={slotW}
						height={baselineY - padding.top}
						className="fill-primary/10"
					/>
				) : null,
			)}

			{/* The inspected week, behind everything it highlights. */}
			{inspect.index != null ? (
				<rect
					x={slotLeft(inspect.index)}
					y={padding.top}
					width={slotW}
					height={baselineY - padding.top}
					className="fill-foreground/10"
				/>
			) : null}

			{showVolume
				? weeks.map((week, i) =>
						week.volume.available ? (
							<rect
								key={`bar-${week.weekKey}`}
								x={slotCenter(i) - barW / 2}
								y={scaleY(week.volume.value)}
								width={barW}
								height={Math.max(0, baselineY - scaleY(week.volume.value))}
								rx={2}
								className={week.overridden ? 'fill-primary/50' : 'fill-primary'}
							/>
						) : (
							// Never a zero bar: an Unavailable week is known-empty, and the
							// stub says so at a glance (ADR 0030 rule 1).
							<ChartUnavailableMark
								key={`na-${week.weekKey}`}
								cx={slotCenter(i)}
								baselineY={baselineY}
								width={barW}
							/>
						),
					)
				: null}

			{showRamp && rampPoints.length >= 2 ? (
				<polyline
					points={rampPoints.join(' ')}
					fill="none"
					stroke="currentColor"
					className="text-foreground/70"
					strokeWidth={2}
					strokeDasharray="4 3"
					vectorEffect="non-scaling-stroke"
				/>
			) : null}

			{/* Below the baseline: the rhythm band. Loading is tallest, so the week
			    role reads without relying on colour alone. */}
			{showRhythm
				? weeks.map((week, i) => (
						<rect
							key={`role-${week.weekKey}`}
							x={slotLeft(i) + slotW * 0.15}
							y={baselineY + RHYTHM_BAND_TOP}
							width={slotW * 0.7}
							height={RHYTHM_BAND_HEIGHT[week.role]}
							rx={1}
							className={RHYTHM_BAND_CLASS[week.role]}
						/>
					))
				: null}

			{/* A dated lifting block opening — another track's segment boundary, on
			    the time axis and never on the value axis (ADR 0043 §7). */}
			{weeks.map((week, i) =>
				week.segmentStarts.length > 0 ? (
					<rect
						key={`block-${week.weekKey}`}
						x={slotLeft(i)}
						y={baselineY - 2}
						width={2}
						height={RHYTHM_BAND_TOP + 12}
						className="fill-muted-foreground"
					/>
				) : null,
			)}

			{/* A re-anchor: the week the athlete moved the plan's own starting number
			    to. A caret sitting on the baseline, so it reads as an event in time
			    rather than as a value — the anchor's number is the panel's to say. */}
			{weeks.map((week, i) =>
				week.anchors.some((anchor) => anchor.reAnchor) ? (
					<polygon
						key={`anchor-${week.weekKey}`}
						points={`${slotCenter(i)},${baselineY - 9} ${slotCenter(i) - 5},${baselineY} ${slotCenter(i) + 5},${baselineY}`}
						className="fill-foreground"
						data-testid="re-anchor-mark"
					/>
				) : null,
			)}

			{/* Full-height per-week hit areas: hover inspects on desktop, tap toggles
			    on touch. Transparent and on top, so every pointer lands on a week. */}
			{weeks.map((week, i) => (
				<rect
					key={`hit-${week.weekKey}`}
					x={slotLeft(i)}
					y={padding.top}
					width={slotW}
					height={baselineY - padding.top}
					fill="transparent"
					className="cursor-pointer"
					{...inspect.slotProps(i)}
				/>
			))}
		</>
	)
}

function VolumeOverlay({
	geom,
	model,
	layers,
	yMax,
}: {
	geom: ChartGeom
	model: SeasonChartModel
	layers: readonly SeasonChartLayer[]
	yMax: number
}) {
	const { padding, baselineY, slotCenter, slotW, leftPct, topPct } = geom
	const { weeks, axis } = model
	// Every week's number at ten weeks; every other beyond that, so the row never
	// collides at 390 px (ADR 0028).
	const numberEvery = weeks.length > 10 ? 2 : 1

	return (
		<>
			<span
				className="text-muted-foreground absolute left-1 text-[10px]"
				style={{ top: topPct(padding.top - 14) }}
			>
				{yMax} {VOLUME_CURRENCY_UNITS[axis.currency]}
			</span>

			{/* Block names along the top, centred over their weeks. */}
			{weeks.map((week, i) =>
				week.phaseStart ? (
					<span
						key={`name-${week.weekKey}`}
						className="text-muted-foreground absolute text-[10px] font-medium tracking-wide uppercase"
						style={{ left: leftPct(slotCenter(i) - slotW / 2), top: topPct(2) }}
					>
						{week.phaseName}
					</span>
				) : null,
			)}

			{/* `n/a` beside the honest stub — the marker's label, as crisp HTML. */}
			{weeks.map((week, i) =>
				week.volume.available ? null : (
					<span
						key={`na-${week.weekKey}`}
						className="text-muted-foreground absolute -translate-x-1/2 -translate-y-full text-[10px]"
						style={{ left: leftPct(slotCenter(i)), top: topPct(baselineY - 6) }}
					>
						n/a
					</span>
				),
			)}

			{/* The emphasis layer: one dot per quality session, tinted by its zone. */}
			{layers.includes('emphasis')
				? weeks.map((week, i) => {
						const dots = week.emphasis.flatMap((reading) =>
							reading.terms.flatMap((term) =>
								Array.from({ length: term.sessionsPerWeek }, (_, n) => ({
									zone: term.zone,
									key: `${reading.discipline}-${term.zone}-${n}`,
								})),
							),
						)
						if (dots.length === 0) return null
						return (
							<span
								key={`mix-${week.weekKey}`}
								className="absolute flex -translate-x-1/2 gap-0.5"
								style={{
									left: leftPct(slotCenter(i)),
									top: topPct(baselineY + EMPHASIS_ROW_OFFSET),
								}}
							>
								{dots.map((dot) => (
									<span
										key={dot.key}
										className={`block size-1.5 rounded-full ${ZONE_DOT[dot.zone]}`}
									/>
								))}
							</span>
						)
					})
				: null}

			{/* Week numbers along the bottom. */}
			{weeks.map((week, i) =>
				i % numberEvery === 0 ? (
					<span
						key={`num-${week.weekKey}`}
						className="text-muted-foreground absolute -translate-x-1/2 text-[10px]"
						style={{
							left: leftPct(slotCenter(i)),
							top: topPct(baselineY + 34),
						}}
					>
						{week.weekInPlan}
					</span>
				) : null,
			)}

			{/* The Target Event, flagged on its own week. */}
			{weeks.map((week, i) =>
				week.eventWeek ? (
					<span
						key={`flag-${week.weekKey}`}
						className="bg-foreground text-background absolute -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap"
						style={{
							left: leftPct(slotCenter(i)),
							top: topPct(padding.top + 2),
						}}
					>
						Event
					</span>
				) : null,
			)}
		</>
	)
}

// ---------------------------------------------------------------------------
// The fitness panel — a second value axis, so a second chart (ADR 0043 §7)
// ---------------------------------------------------------------------------

function FitnessPanel({
	model,
	season,
	fitness,
	inspect,
}: {
	model: SeasonChartModel
	season: SeasonChartSeason
	fitness: FitnessLayer
	inspect: ChartInspect
}) {
	if (fitness.status === 'unavailable') {
		return (
			<p
				className="text-muted-foreground text-sm"
				data-testid="fitness-unavailable"
			>
				Projected fitness is Unavailable — {fitnessGapSentence(fitness.gap)}.
			</p>
		)
	}

	const ctl = fitness.ctl
	const yMax = niceLinearTicks(Math.max(1, ...ctl)).at(-1)!

	return (
		<div className="space-y-1">
			<ChartFigure
				inspect={inspect}
				count={model.weeks.length}
				yMax={yMax}
				padding={{ top: 14, right: 8, bottom: 20, left: 8 }}
				plotHeightClass="h-32"
				ariaLabel="Projected fitness (CTL) across the season, replayed from your plan. Use the arrow keys to read a week."
				dataTable={{
					caption: `Projected fitness (CTL) at the end of each Training Week, replayed from ${season.eventName}'s plan.`,
					columns: ['Week', 'Projected fitness (CTL)'],
					rows: model.weeks.map((week, i) => [
						String(week.weekInPlan),
						formatLoad(ctl[i]!),
					]),
				}}
				renderMarks={(geom) => (
					<FitnessMarks geom={geom} ctl={ctl} inspect={inspect} />
				)}
				renderOverlay={(geom) => (
					<span
						className="text-muted-foreground absolute left-1 text-[10px]"
						style={{ top: geom.topPct(2) }}
					>
						{yMax} CTL
					</span>
				)}
				renderInspect={(index) =>
					index == null ? (
						<span className="text-muted-foreground">
							Tap a week to read the fitness your plan projects for it.
						</span>
					) : (
						<span>
							<span className="font-medium">
								Week {model.weeks[index]!.weekInPlan}
							</span>{' '}
							· projected fitness {formatLoad(ctl[index]!)}
						</span>
					)
				}
			/>
			{/* One derivation statement for the whole curve, never a note per point
			    (ADR 0045 §10). */}
			<p className="text-muted-foreground text-[11px]">
				{projectionBasisSentence(fitness)}
			</p>
		</div>
	)
}

function FitnessMarks({
	geom,
	ctl,
	inspect,
}: {
	geom: ChartGeom
	ctl: number[]
	inspect: ChartInspect
}) {
	const { padding, baselineY, scaleY, slotW, slotLeft, slotCenter } = geom
	const line = ctl.map((v, i) => `${slotCenter(i)},${scaleY(v)}`).join(' ')

	return (
		<>
			{inspect.index != null ? (
				<rect
					x={slotLeft(inspect.index)}
					y={padding.top}
					width={slotW}
					height={baselineY - padding.top}
					className="fill-foreground/10"
				/>
			) : null}
			<polyline
				points={line}
				fill="none"
				stroke="currentColor"
				className="text-primary"
				strokeWidth={2.5}
				vectorEffect="non-scaling-stroke"
			/>
			{ctl.map((_, i) => (
				<rect
					key={i}
					x={slotLeft(i)}
					y={padding.top}
					width={slotW}
					height={baselineY - padding.top}
					fill="transparent"
					className="cursor-pointer"
					{...inspect.slotProps(i)}
				/>
			))}
		</>
	)
}

/** Why the projected curve is withheld, from the plan's own codes (ADR 0023). */
function fitnessGapSentence(
	gap: Extract<FitnessLayer, { status: 'unavailable' }>['gap'],
): string {
	switch (gap.kind) {
		case 'no-anchor':
			return 'there is no recorded training load to replay your plan forward from yet'
		case 'building-baseline':
			return `your fitness baseline is still building, on day ${gap.daysOfHistory} of ${gap.requiredDays}`
		case 'unpriced': {
			const blocked = gap.basis.tracks.find((track) => !track.contributes)
			return blocked
				? `${DISCIPLINE_LABELS[blocked.discipline]}: ${NO_CONTRIBUTION_LABELS[blocked.reason]}`
				: 'this plan authors no week a load can be read from'
		}
	}
}

/** The one sentence the whole curve carries — which tracks fed it, and how. */
function projectionBasisSentence(
	fitness: Extract<FitnessLayer, { status: 'projected' }>,
): string {
	const contributing = fitness.basis.tracks.filter((track) => track.contributes)
	const from = contributing
		.map(
			(track) =>
				`${DISCIPLINE_LABELS[track.discipline]} in ${VOLUME_CURRENCY_UNITS[track.currency]}`,
		)
		.join(', ')
	const conventions = fitness.basis.conventions
		.map((id) => CONVERSION_CONVENTION_LABELS[id])
		.join(' and ')
	return [
		`Replayed from the fitness you carried into week 1, through your plan's own weeks — ${from}.`,
		conventions ? `Priced through your own zone recipe, ${conventions}.` : null,
		'Your plan is one number a week, so only fitness is projected.',
	]
		.filter((part): part is string => part != null)
		.join(' ')
}

// ---------------------------------------------------------------------------
// The inspect panel — a line per enabled layer, and the derivation
// ---------------------------------------------------------------------------

function InspectReading({
	week,
	model,
	season,
	layers,
}: {
	week: SeasonChartWeek | null
	model: SeasonChartModel
	season: SeasonChartSeason
	layers: readonly SeasonChartLayer[]
}) {
	if (!week) {
		return (
			<span className="text-muted-foreground">
				Tap a week to read it — its values, and where a derived number came
				from.
			</span>
		)
	}
	const { axis } = model
	const startsAt = season.weeks[week.weekInPlan - 1]!.startsAt

	return (
		<div className="space-y-2">
			<p>
				<span className="font-medium">Week {week.weekInPlan}</span>{' '}
				<span className="text-muted-foreground">
					· {formatDate(startsAt, season.timezone)} · {week.phaseName}
					{week.eventWeek ? ' · your event’s week' : ''}
				</span>
			</p>

			{layers.includes('volume') ? (
				<p>
					{DISCIPLINE_LABELS[axis.discipline]}{' '}
					<span className="font-medium">
						{readingText(week.volume, axis.currency)}
					</span>
					{week.volume.available ? (
						<span className="text-muted-foreground text-xs">
							{' '}
							· {week.volume.marker}
							{week.overridden ? ' · you hand-set this week' : ''}
						</span>
					) : null}
				</p>
			) : null}

			{layers.includes('rhythm') ? (
				<p className="text-muted-foreground text-xs">
					{WEEK_ROLE_LABELS[week.role]} week
				</p>
			) : null}

			{layers.includes('ramp') ? (
				<p className="text-xs">
					{week.step == null
						? 'No change to read against the week before.'
						: `${formatSignedPercent(week.step)} on the week before.`}{' '}
					<span className="text-muted-foreground">
						{week.authoredRamp == null
							? 'Ramp: the documented convention.'
							: `Ramp authored at ${formatSignedPercent(week.authoredRamp)}.`}
					</span>
				</p>
			) : null}

			{layers.includes('emphasis') ? (
				<p className="text-xs">
					{week.emphasis.length === 0
						? 'No quality sessions this week.'
						: week.emphasis
								.map(
									(reading) =>
										`${DISCIPLINE_LABELS[reading.discipline]}: ${formatEmphasisLabel(reading.terms)}`,
								)
								.join(' · ')}
				</p>
			) : null}

			{week.anchors.length > 0 ? (
				<p className="text-muted-foreground text-xs">
					{week.anchors
						.map(
							(anchor) =>
								`${anchor.reAnchor ? 'Re-anchored' : 'Season Anchor'}: ${DISCIPLINE_LABELS[anchor.discipline]} ${formatWeeklyVolume(anchor.value, anchor.currency)}`,
						)
						.join(' · ')}
				</p>
			) : null}

			{week.segmentStarts.length > 0 ? (
				<p className="text-muted-foreground text-xs">
					{week.segmentStarts
						.map(
							(start) =>
								`A ${DISCIPLINE_LABELS[start.discipline].toLowerCase()} block opens this week`,
						)
						.join(' · ')}
				</p>
			) : null}

			{week.overflow.length > 0 ? (
				<p className="text-xs">
					Your mix alone asks for more than this week&rsquo;s volume. The easy
					work floors at nothing and the plan is left exactly as you wrote it.
				</p>
			) : null}

			{layers.includes('volume') ? (
				<Derivation week={week} currency={axis.currency} />
			) : null}
		</div>
	)
}

/**
 * Where a derived number came from — the chain, then the buckets.
 *
 * Shown rather than hidden behind a second tap: ADR 0045 §10 puts the chain **one**
 * interaction away, and that interaction is the tap that opened this panel. An
 * authored reading has nothing to show and renders nothing, which is what "an
 * `authored` marker with no empty panel" means (ADR 0045 §9).
 */
function Derivation({
	week,
	currency,
}: {
	week: SeasonChartWeek
	currency: VolumeCurrency
}) {
	if (!week.derivation) return null
	const chain = readingChain(week.derivation, week.volume, currency)
	if (chain.length <= 1) return null

	// Ending at the total reads as arithmetic: the chain is walked back from the
	// figure above, so reversing it walks forward to it.
	const rows = [...chain].reverse()

	return (
		<div className="space-y-1">
			<p className="text-muted-foreground text-xs font-medium">
				Where this number comes from
			</p>
			<dl className="space-y-0.5 text-xs">
				{rows.map((step) => (
					<div key={step.id} className="flex flex-wrap gap-x-2">
						<dt className="text-muted-foreground">{stepName(step)}</dt>
						<dd className="font-medium">
							{formatDerivationValue(step.unit, step.value)}
						</dd>
						<dd className="text-muted-foreground">{sourceText(step.source)}</dd>
					</div>
				))}
			</dl>
			{week.buckets.length > 0 ? <Buckets buckets={week.buckets} /> : null}
			{week.derivation.substitutions.map((substitution) => (
				<p key={substitution.band} className="text-muted-foreground text-xs">
					Zone {substitution.requested} is priced off {substitution.recipeId}{' '}
					band {substitution.band}, the nearest zone {substitution.declaredZone}{' '}
					your zone system declares.
				</p>
			))}
		</div>
	)
}

/**
 * The week decomposed: one easy bucket plus one per zone in the mix (ADR 0045 §1).
 *
 * A real table, because it is one — and it scrolls inside its own container rather
 * than pushing the page sideways at 390 px (`docs/design/ui-conventions.md` §5).
 */
function Buckets({ buckets }: { buckets: VolumeBucket[] }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[22rem] text-left text-xs">
				<caption className="sr-only">
					This week decomposed into intensity buckets
				</caption>
				<thead className="text-muted-foreground">
					<tr>
						<th scope="col" className="font-normal">
							Bucket
						</th>
						<th scope="col" className="font-normal">
							Hours
						</th>
						<th scope="col" className="font-normal">
							Distance
						</th>
						<th scope="col" className="font-normal">
							Load
						</th>
						<th scope="col" className="font-normal">
							Intensity
						</th>
					</tr>
				</thead>
				<tbody>
					{buckets.map((bucket) => (
						<tr key={`${bucket.kind}-${bucket.zone}`}>
							<th scope="row" className="pr-2 font-normal">
								{bucket.kind === 'easy'
									? 'Easy'
									: `${bucket.sessionsPerWeek}× ${QUALITY_ZONE_LABELS[bucket.zone as 3 | 4 | 5]}`}
							</th>
							<td className="pr-2">
								{formatDerivationValue('hours', bucket.hours)}
							</td>
							<td className="pr-2">
								{bucket.km == null
									? '—'
									: formatDerivationValue('km', bucket.km)}
							</td>
							<td className="pr-2">
								{formatDerivationValue('tss', bucket.tss)}
							</td>
							<td>
								{formatDerivationValue('if', bucket.intensityFactor)} ·{' '}
								{bucket.band}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

// ---------------------------------------------------------------------------
// Wording the derivation's codes (ADR 0023 — the domain carries no copy)
// ---------------------------------------------------------------------------

const STEP_NAMES: Record<string, string> = {
	authored: 'You authored',
	'quality-hours': 'Quality time in zone',
	'quality-km': 'Quality distance',
	'quality-tss': 'Quality load',
	'easy-hours': 'Easy time',
	'easy-km': 'Easy distance',
	'easy-tss': 'Easy load',
	'easy-pace-ratio': 'Easy-pace ratio',
	'speed:easy': 'Easy speed',
	'speed:quality': 'Quality speed',
	'if:easy': 'Easy intensity',
	'tss-per-hour:easy': 'Easy load per hour',
	'total-km': 'The week, in km',
	'total-hours': 'The week, in hours',
	'total-tss': 'The week, in TSS',
}

const ZONE_STEP_NAMES: Record<string, (zone: 3 | 4 | 5) => string> = {
	'quality-hours': (zone) => `Time in ${QUALITY_ZONE_LABELS[zone]}`,
	'quality-km': (zone) => `Distance at ${QUALITY_ZONE_LABELS[zone]}`,
	'quality-tss': (zone) => `Load from ${QUALITY_ZONE_LABELS[zone]}`,
	if: (zone) => `${QUALITY_ZONE_LABELS[zone]} intensity`,
	'tss-per-hour': (zone) => `${QUALITY_ZONE_LABELS[zone]} load per hour`,
}

/**
 * A chain row's name. Zone-suffixed ids are worded from their zone rather than
 * enumerated, so a mix that adds zone 3 needs no new string here — and the zone
 * word itself comes from `labels.ts`, never spelled out twice.
 */
function stepName(step: DerivationStep): string {
	const known = STEP_NAMES[step.id]
	if (known) return known
	const zoned = /^(.+):z([345])$/.exec(step.id)
	if (zoned) {
		const template = ZONE_STEP_NAMES[zoned[1]!]
		if (template) return template(Number(zoned[2]) as 3 | 4 | 5)
	}
	return step.id
}

/** Where a number came from, as the clause that follows it. */
function sourceText(source: DerivationSource): string {
	switch (source.kind) {
		case 'authored':
			return ''
		case 'convention':
			return `from ${CONVERSION_CONVENTION_LABELS[source.convention]} — a convention, ${source.citation}`
		case 'threshold':
			return `from ${THRESHOLD_FIELD_LABELS[source.field]}`
		case 'recipe-band':
			return `from your ${source.recipeId} zone system, band ${source.band}${
				source.bandDescription ? ` (${source.bandDescription})` : ''
			}`
		case 'ride-window':
			return `from your ${source.rides} recorded rides in the ${source.weeks} weeks before your plan`
		case 'arithmetic':
			return 'worked out from the numbers below'
	}
}

/** A reading, or the reason it is an Unavailable Metric — never a dash alone. */
function readingText(
	reading: SeasonChartReading,
	currency: VolumeCurrency,
): string {
	return reading.available
		? formatWeeklyVolume(reading.value, currency)
		: `Unavailable — ${NO_CONTRIBUTION_LABELS[reading.reason]}`
}

function emphasisText(week: SeasonChartWeek): string {
	return week.emphasis.length === 0
		? formatEmphasisLabel([])
		: week.emphasis
				.map((reading) => formatEmphasisLabel(reading.terms))
				.join(' · ')
}

// ---------------------------------------------------------------------------
// The Form layer's refusal
// ---------------------------------------------------------------------------

/**
 * The layer that is offered and says no.
 *
 * Worded as what the *plan* is rather than as what the app cannot do: the plan
 * carries one number a week, and Form is a reading of how that week was arranged.
 * Nothing the athlete could enter here changes that, so the copy names no missing
 * datum — the same shape the two undeliverable readings in
 * `UNAVAILABLE_READING_LABELS` take.
 */
function FormRefusal() {
	return (
		<div
			className="border-border text-muted-foreground rounded-xl border p-3 text-sm"
			data-testid="form-layer-refusal"
		>
			<p className="text-foreground font-medium">Form does not draw here</p>
			<p className="mt-1">
				Your plan says how much a week holds and not which days hold it, so a
				replay has to spread each week evenly. Fitness survives that — it reads
				six weeks at a time — but Fatigue reads the last seven days, and Form is
				Fitness minus Fatigue. Spread flat, both would be shapes of the
				averaging rather than of your training, so this layer draws nothing
				rather than a curve your plan cannot support. Your real Form is on your
				home screen, from what you actually did.
			</p>
		</div>
	)
}
