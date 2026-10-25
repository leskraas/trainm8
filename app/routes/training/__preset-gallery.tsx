/**
 * The **preset gallery**: every periodization preset the app ships — three
 * families at three lengths each — chosen from *an illustration of the load
 * profile it lays down* rather than from a paragraph describing it (#405,
 * spec #399).
 *
 * Split out of `plan.tsx` the way `__phase-editor.tsx` is: the route owns the
 * loader, the action and the two readings; this module owns one section of one of
 * them. It knows a preset and an `outlineId` and nothing else about the season —
 * which is the same shape/size separation the presets themselves keep (ADR 0043
 * §1), held at the module boundary.
 *
 * Four rules the copy in here is bound by, each of them a claim the app is not
 * allowed to make loosely:
 *
 * - **The ramp is a convention and never an injury claim.** `PRESET_RAMP` is
 *   +5% a loading week because that is where the planning platforms in the #374
 *   survey converge, and the 10% rule it descends from has a failed RCT behind it
 *   (Buist 2008, P=.90). `RAMP_GUARD_MAX`'s own doc comment binds every surface
 *   that states a rate: a convention may be named as a convention and no more.
 * - **The two cuts read as the convention's, never as the preset's.** A preset
 *   stores neither (ADR 0044 §4), so the card says the recovery week and the taper
 *   *follow the documented convention* and names the convention's own figures as
 *   the convention's. A shape that appeared to have chosen −30% would freeze a
 *   number the athlete never authored.
 * - **Applying replaces the blocks that are there.** Said on the card and beside
 *   the button. This repo warns and never blocks (ADR 0040 §12 sets the habit), so
 *   there is no confirmation dialog in the way of a picker whose whole job is to be
 *   picked from.
 * - **A shape carries no size and no horizon.** The **Plan Start Week**, the
 *   tracks, their **Volume Currencies** and their **Season Anchors** all survive
 *   applying, and the phases land at the length the preset recommends. Whether the
 *   plan then ends before or after the Event is a *reading* — `season.fit`, said
 *   once at the top of the page — and never something applying corrects by
 *   stretching a duration. What closes the gap is the athlete's tap on the
 *   **Season Fit** offer, under a rule stated in words before it runs: the base
 *   absorbs the difference first and the taper is never shortened
 *   (`fit-proposal.ts`, ADR 0048 §3).
 */
import { Form } from 'react-router'
import { ChartDataTable } from '#app/components/chart/chart.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { formatNbPercent, formatNbSignedPercent } from '#app/utils/format.ts'
import {
	NB_RHYTHM_CHOICE_LABELS,
	NB_WEEK_ROLE_CELL_LABELS,
	nbPhaseName,
	PHILOSOPHY_DESCRIPTIONS,
	PHILOSOPHY_LABELS,
	SESONG_PAGE_LABELS,
	SESONG_SHAPE_LABELS,
} from '#app/utils/labels.ts'
import {
	DEFAULT_RECOVERY_CUT,
	DEFAULT_TAPER_CUT,
	phaseIndexForWeek,
	weekRole,
	type PhaseSpec,
	type WeekRole,
} from '#app/utils/plan-outline/derive.ts'
import {
	familyOfPreset,
	PERIODIZATION_PRESETS,
	PRESET_PROFILE_ANCHOR,
	PRESET_RAMP,
	presetPhaseSpecs,
	presetProfile,
	presetWeeks,
	type PeriodizationPreset,
	type PresetKey,
} from '#app/utils/plan-outline/presets.ts'

/** Which of a family's three lengths a shape is, read off its key. */
function presetLength(key: PresetKey): 'short' | 'standard' | 'long' {
	return key.endsWith('-short')
		? 'short'
		: key.endsWith('-long')
			? 'long'
			: 'standard'
}

/**
 * A shape by the name the Filosofi card gives its family, and its length:
 * `Klassisk 3:1`, `Klassisk 3:1, lang innkjøring` — one name for one method on
 * Sesong and in the creation flow (audit B7). `preset.name` and
 * `preset.provenance` are the domain's English and are never shown.
 */
export function nbPresetName(key: PresetKey): string {
	return `${PHILOSOPHY_LABELS[familyOfPreset(key)]}${SESONG_SHAPE_LABELS.lengthSuffix[presetLength(key)]}`
}

/**
 * The line under a shape's name: what its family is, or — for a short or long
 * variant — that it is the same season over fewer or more weeks. Shared by the
 * gallery and the creation flow's shape step, so a shape describes itself the
 * same way wherever it is picked.
 */
export function nbPresetNote(key: PresetKey): string {
	return (
		SESONG_SHAPE_LABELS.lengthNote[presetLength(key)] ??
		PHILOSOPHY_DESCRIPTIONS[familyOfPreset(key)]
	)
}

/**
 * The gallery: every shape the app ships, drawn against **one** ceiling and
 * **one** week width.
 *
 * Both are shared deliberately. Every preset's profile is indexed to the same
 * opening week (`PRESET_PROFILE_ANCHOR`), so scaling each card to its own peak
 * would draw a 148% season exactly as tall as a 171% one and quietly delete the
 * difference the athlete is choosing between. Giving every strip the same
 * per-week width does the same for length: an 11-week shape reads visibly shorter
 * than a 27-week one instead of all nine filling the card edge to edge. That
 * matters more now that three of the nine differ from another three in **length
 * alone** — a per-card scale would draw a family's short, standard and long
 * seasons as the same picture.
 */
export function PresetGallery({ outlineId }: { outlineId: string }) {
	const { profiles, ceiling, longest } = presetProfiles()

	return (
		<section aria-labelledby="preset-gallery" className="space-y-4">
			{/* The section's name lives on the `Disclosure` summary that opens it, so
			    this heading is the accessible name only — dropping it would leave the
			    region unnamed, and showing it would print the name twice. */}
			<h2 id="preset-gallery" className="sr-only">
				{SESONG_PAGE_LABELS.shapeTitle}
			</h2>
			{/* The shapes come **first**, and the terms after them. #366 settled that a
			    template is picked from an illustration of what it produces rather than
			    from a sentence describing it, and five paragraphs ahead of the pictures
			    inverted exactly that. Nothing is cut: what an athlete must know *before*
			    tapping — that applying replaces the blocks they have — is on every card,
			    beside the button that does it. */}
			{/* One column on phones, two from `sm` — a picker card wants its
			    illustration wide enough to read a 27-week strip in (ADR 0028). The list
			    is long: nine cards, ordered family-first so the three lengths of one
			    season sit together rather than being scattered by week count. It sits
			    behind a closed disclosure on this page, which is what keeps the length
			    off the plan surface. */}
			<ul
				aria-label={SESONG_SHAPE_LABELS.list}
				className="grid grid-cols-1 gap-4 sm:grid-cols-2"
			>
				{profiles.map(({ preset, profile }) => (
					<li key={preset.key}>
						<PresetCard
							preset={preset}
							profile={profile}
							ceiling={ceiling}
							slots={longest}
							outlineId={outlineId}
						/>
					</li>
				))}
			</ul>

			<div className="text-muted-foreground text-footnote space-y-2">
				<p>{SESONG_SHAPE_LABELS.copied}</p>
				<p>{SESONG_SHAPE_LABELS.notSize}</p>
				<p>{SESONG_SHAPE_LABELS.fixedLength}</p>
				{/* The two convention paragraphs sit here rather than on each card,
				    because every shape ramps at the same rate and leaves the same two
				    cuts unset — printing the identical sentences three times would be
				    three chances to read them as three different claims. What stays on a
				    card is what differs between the cards. */}
				<p>{SESONG_SHAPE_LABELS.climb(formatNbPercent(PRESET_RAMP))}</p>
				<p>
					{SESONG_SHAPE_LABELS.cuts(
						formatNbPercent(DEFAULT_RECOVERY_CUT),
						formatNbPercent(DEFAULT_TAPER_CUT),
					)}
				</p>
				{/* The cadence is the one thing that differs between the cards, so by this
				    section's own rule it would live on them — but what is shared is that
				    *having* a fixed cadence is a convention at all. No controlled trial
				    establishes three-on-one-off over two-on-one-off or over recovering when
				    you need to, and a picker that offers two cadences and says nothing
				    implies the choice is settled science. Stated once, with the other two
				    conventions, and with no injury claim attached. */}
				<p>{SESONG_SHAPE_LABELS.rhythms}</p>
			</div>
		</section>
	)
}

/**
 * Every shape with its profile, plus the **shared** ceiling and week width the
 * strips are drawn against.
 *
 * Exported because a second surface draws the same pictures — the shape
 * step of authoring a plan (`plan.new.$eventId.tsx`) — and the two scales are the
 * whole reason the pictures can be compared at all. A caller computing its own
 * ceiling would draw a 148% season exactly as tall as a 171% one, which is the
 * difference the athlete is choosing between.
 */
export function presetProfiles() {
	const profiles = PERIODIZATION_PRESETS.map((preset) => ({
		preset,
		profile: presetProfile(preset),
	}))
	return {
		profiles,
		ceiling: Math.max(
			PRESET_PROFILE_ANCHOR,
			...profiles.flatMap(({ profile }) => profile),
		),
		longest: Math.max(...profiles.map(({ profile }) => profile.length)),
	}
}

/**
 * One shape on offer: its picture first, then what the picture is made of, then
 * the button.
 *
 * The order is the point — the illustration is what the athlete chooses from and
 * the prose sits beside it rather than instead of it, which is the reading
 * `presets.ts` is written against.
 */
function PresetCard({
	preset,
	profile,
	ceiling,
	slots,
	outlineId,
}: {
	preset: PeriodizationPreset
	profile: number[]
	ceiling: number
	slots: number
	outlineId: string
}) {
	const weeks = presetWeeks(preset)
	const name = nbPresetName(preset.key)
	const note = nbPresetNote(preset.key)

	return (
		<Card className="h-full" size="sm">
			<CardHeader className="gap-1">
				<CardTitle className="text-callout font-semibold">{name}</CardTitle>
				<p className="text-muted-foreground text-footnote">{note}</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<LoadProfile
					preset={preset}
					profile={profile}
					ceiling={ceiling}
					slots={slots}
				/>

				<div className="text-footnote space-y-2">
					<p>
						<span className="font-medium tabular-nums">
							{SESONG_SHAPE_LABELS.weeks(weeks)}
						</span>{' '}
						<span className="text-muted-foreground">
							·{' '}
							{preset.phases
								.map((phase) => `${nbPhaseName(phase.name)} ${phase.weeks}`)
								.join(' · ')}
						</span>
					</p>
					{/* What differs between the cards, and only that. The ramp and the two
					    cuts are identical across every shape and are stated once, at
					    the top of the gallery — a convention named as a convention, per
					    `RAMP_GUARD_MAX` and ADR 0044 §4. */}
					<p className="text-muted-foreground">{rhythmSentence(preset)}</p>
				</div>

				<Form method="POST" className="space-y-2">
					<input type="hidden" name="intent" value="apply-preset" />
					<input type="hidden" name="outlineId" value={outlineId} />
					<input type="hidden" name="presetKey" value={preset.key} />
					{/* The destructive edge, said where the finger is — a warning and not a
					    dialog, because this repo warns and never blocks. */}
					<p className="text-muted-foreground text-footnote">
						{SESONG_SHAPE_LABELS.replaces}
					</p>
					<Button type="submit" className="w-full">
						{SESONG_SHAPE_LABELS.apply(name)}
					</Button>
				</Form>
			</CardContent>
		</Card>
	)
}

/**
 * The one sentence that differs between the cards: the shape's own loading
 * rhythm, and the step down at a block opening where it authors one.
 *
 * Read off the preset rather than written beside it, so a shape whose rhythm or
 * step changed could not go on carrying a sentence describing the old one.
 */
export function rhythmSentence(preset: PeriodizationPreset): string {
	const rhythms = [
		...new Set(
			preset.phases
				.map((phase) => phase.rhythm)
				.filter((rhythm) => rhythm !== 'none'),
		),
	]
	const rhythm =
		rhythms.length === 1
			? SESONG_SHAPE_LABELS.loads(NB_RHYTHM_CHOICE_LABELS[rhythms[0]!])
			: SESONG_SHAPE_LABELS.rhythmChanges
	// Named where it exists, because an authored drop is intent and the picture
	// shows it as a fall the athlete would otherwise read as a mistake (ADR 0040 §4).
	const step = preset.phases.find((phase) => phase.boundaryStep != null)
	if (!step?.boundaryStep) return rhythm
	return `${rhythm}${SESONG_SHAPE_LABELS.step(
		formatNbSignedPercent(step.boundaryStep),
		nbPhaseName(step.name),
	)}`
}

// ── The illustration ─────────────────────────────────────────────────────────

/** SVG user units per week, and the strip's drawn height. */
const SLOT = 10
const STRIP_HEIGHT = 48
const BAR_FRAC = 0.72

/**
 * Quantise a coordinate to two decimals where it becomes an attribute (#462).
 * React hydrates by comparing attribute strings, so a raw `48 - (1 / 7) * 48`
 * or `25 - 3.6` must not reach the markup; a hundredth of a user unit is far
 * below a device pixel on a 56px strip.
 */
const svgUnit = (value: number) => Math.round(value * 100) / 100

/**
 * The load profile a preset lays down, as a bar per Training Week.
 *
 * **Why a bespoke strip and not `ChartFigure`.** ADR 0029 keeps charts
 * hand-rolled on the shared **Chart Primitive** and names the exception this
 * falls under: the **Workout Shape** strip and the **Route Sketch** stay bespoke
 * because they are *pre-attentive glyphs, not data charts*. This is one of those.
 * Nothing here is inspected — there is no per-week value to read out, because a
 * preset carries no **Volume Currency** and no **Season Anchor**, so every bar is
 * a ratio and the only question the picture answers is "what shape is this?".
 * Mounting `ChartFigure` would put three focusable plot surfaces, three
 * `aria-live` inspect panels and a keyboard cursor into a section whose one
 * affordance is Apply, and would stack three 56px plots plus three inspect panels
 * on a 390px screen (ADR 0028). ADR 0030 rule 2 still binds — a picture carrying
 * numbers owes an accessible equivalent — and it is paid with the primitive's own
 * `ChartDataTable` rather than a second hand-rolled copy of one. Rule 1's
 * Unavailable marker has nothing to mark: `presetProfile` narrows the Unavailable
 * Metric away at its own seam, because a preset's anchor holds from week 0 and
 * every week is inside the plan by construction. If a preset preview ever grows a
 * per-week reading, it graduates onto `ChartFigure` and inherits the rest.
 *
 * **The numbers are reachable, not just the pixels.** The `<svg>` is a single
 * `role="img"` with a summary, and every week — its block, its role and its load
 * — is in the visually-hidden table underneath.
 */
export function LoadProfile({
	preset,
	profile,
	ceiling,
	slots,
}: {
	preset: PeriodizationPreset
	profile: number[]
	ceiling: number
	slots: number
}) {
	const phases = presetPhaseSpecs(preset)
	const width = slots * SLOT
	const barW = SLOT * BAR_FRAC
	// Straight to the gallery's shared ceiling rather than through
	// `niceLinearTicks`: there is no axis and there are no gridlines to land on, so
	// a "nice" top would only shrink every bar for a tick nobody reads.
	const scaleY = (value: number) =>
		STRIP_HEIGHT - (value / ceiling) * STRIP_HEIGHT

	const peak = profile.reduce<{ value: number; week: number }>(
		(best, value, index) =>
			value > best.value ? { value, week: index + 1 } : best,
		{ value: profile[0]!, week: 1 },
	)

	return (
		<figure className="m-0">
			<svg
				viewBox={`0 0 ${width} ${STRIP_HEIGHT}`}
				preserveAspectRatio="none"
				className="h-14 w-full"
				role="img"
				// The one-line summary: the length, the climb and where the season
				// recovers. It says what the picture does, which is what an
				// alternative text is for — the per-week figures are the table's job.
				aria-label={SESONG_SHAPE_LABELS.summary(
					nbPresetName(preset.key),
					profile.length,
					formatNbPercent(peak.value / PRESET_PROFILE_ANCHOR),
					peak.week,
					countRole(phases, profile, 'recovery'),
					countRole(phases, profile, 'taper'),
				)}
			>
				{profile.map((value, index) => {
					const role = weekRole(phases, index)
					const cx = SLOT * index + SLOT / 2
					// Every week has a value: `presetProfile` narrows `weekTargets`'
					// Unavailable Metric away at its own seam, because neither state that
					// produces one can arise from a preset. So there is no "no value" branch
					// to draw here — and no unreachable one either, which is the kind ADR 0030
					// rule 1 is hardest to satisfy honestly precisely because nobody sees it.
					const y = svgUnit(scaleY(value))
					return (
						<rect
							key={index}
							x={svgUnit(cx - barW / 2)}
							y={y}
							width={svgUnit(barW)}
							height={svgUnit(STRIP_HEIGHT - y)}
							rx={1}
							// Loading weeks carry the season's climb; recovery weeks and the
							// taper are drawn back, so the rhythm reads as rhythm and not as a
							// jagged line. Redundant with the bars' own heights on purpose —
							// colour alone is never the carrier.
							className={
								role === 'loading' ? 'fill-primary/80' : 'fill-primary/30'
							}
						/>
					)
				})}
			</svg>
			<ChartDataTable
				caption={SESONG_SHAPE_LABELS.tableCaption(nbPresetName(preset.key))}
				columns={[
					SESONG_SHAPE_LABELS.columns.week,
					SESONG_SHAPE_LABELS.columns.block,
					SESONG_SHAPE_LABELS.columns.role,
					SESONG_SHAPE_LABELS.columns.load,
				]}
				rows={profile.map((value, index) => [
					SESONG_SHAPE_LABELS.week(index + 1),
					nbPhaseName(blockName(preset, phases, index)),
					NB_WEEK_ROLE_CELL_LABELS[weekRole(phases, index)],
					formatNbPercent(value / PRESET_PROFILE_ANCHOR),
				])}
			/>
		</figure>
	)
}

/** How many of a profile's weeks play `role`. */
function countRole(
	phases: PhaseSpec[],
	profile: number[],
	role: WeekRole,
): number {
	return profile.filter((_, index) => weekRole(phases, index) === role).length
}

/** The block a week sits in. Takes the specs the caller already derived, rather
 * than re-deriving them once per row of the table. */
function blockName(
	preset: PeriodizationPreset,
	phases: PhaseSpec[],
	weekIndex: number,
): string {
	const phaseIndex = phaseIndexForWeek(phases, weekIndex)
	return phaseIndex == null ? '—' : preset.phases[phaseIndex]!.name
}
