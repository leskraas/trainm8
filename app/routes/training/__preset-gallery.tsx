/**
 * The **preset gallery**: the three periodization presets, each chosen from *an
 * illustration of the load profile it lays down* rather than from a paragraph
 * describing it (#405, spec #399).
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
 *   stretching a duration.
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
import { formatPercent, formatSignedPercent } from '#app/utils/format.ts'
import { RHYTHM_LABELS, WEEK_ROLE_LABELS } from '#app/utils/labels.ts'
import {
	DEFAULT_RECOVERY_CUT,
	DEFAULT_TAPER_CUT,
	phaseIndexForWeek,
	weekRole,
	type PhaseSpec,
	type WeekRole,
} from '#app/utils/plan-outline/derive.ts'
import {
	PERIODIZATION_PRESETS,
	PRESET_PROFILE_ANCHOR,
	PRESET_RAMP,
	presetPhaseSpecs,
	presetProfile,
	presetWeeks,
	type PeriodizationPreset,
} from '#app/utils/plan-outline/presets.ts'

/**
 * The gallery: all three shapes, drawn against **one** ceiling and **one** week
 * width.
 *
 * Both are shared deliberately. Every preset's profile is indexed to the same
 * opening week (`PRESET_PROFILE_ANCHOR`), so scaling each card to its own peak
 * would draw a 148% season exactly as tall as a 171% one and quietly delete the
 * difference the athlete is choosing between. Giving every strip the same
 * per-week width does the same for length: a 21-week shape reads visibly longer
 * than an 18-week one instead of all three filling the card edge to edge.
 */
export function PresetGallery({ outlineId }: { outlineId: string }) {
	const profiles = PERIODIZATION_PRESETS.map((preset) => ({
		preset,
		profile: presetProfile(preset),
	}))
	// The tallest week anywhere in the gallery, and the longest season in it.
	const ceiling = Math.max(
		PRESET_PROFILE_ANCHOR,
		...profiles.flatMap(({ profile }) => profile),
	)
	const longest = Math.max(...profiles.map(({ profile }) => profile.length))

	return (
		<section aria-labelledby="preset-gallery" className="space-y-4">
			{/* The section's name lives on the `Disclosure` summary that opens it, so
			    this heading is the accessible name only — dropping it would leave the
			    region unnamed, and showing it would print the name twice. */}
			<h2 id="preset-gallery" className="sr-only">
				Start from a shape
			</h2>
			{/* The shapes come **first**, and the terms after them. #366 settled that a
			    template is picked from an illustration of what it produces rather than
			    from a sentence describing it, and five paragraphs ahead of the pictures
			    inverted exactly that. Nothing is cut: what an athlete must know *before*
			    tapping — that applying replaces the blocks they have — is on every card,
			    beside the button that does it. */}
			{/* One column on phones, two from `sm` — a picker card wants its
			    illustration wide enough to read a 21-week strip in (ADR 0028). */}
			<ul
				aria-label="Season shapes"
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

			<div className="text-muted-foreground space-y-2 text-sm">
				<p>
					Each shape is copied into your plan.{' '}
					<strong className="text-foreground font-medium">
						Applying one replaces the blocks you have now
					</strong>{' '}
					— and what lands is ordinary blocks, yours to rename, resize and
					re-time. Nothing stays linked to the shape you picked.
				</p>
				<p>
					A shape says how your season is built, never how big your weeks are.
					Your start week, your training tracks and the volume you start at are
					untouched.
				</p>
				<p>
					Every shape is a fixed length, so applying one to a shorter or longer
					run-in leaves your plan ending before or after your event rather than
					stretching a block to fit. The line above your blocks says which.
				</p>
				{/* The two convention paragraphs sit here rather than on each card,
				    because all three shapes ramp at the same rate and leave the same two
				    cuts unset — printing the identical sentences three times would be
				    three chances to read them as three different claims. What stays on a
				    card is what differs between the cards. */}
				<p>
					They all climb by the convention, about {formatPercent(PRESET_RAMP)} a
					loading week. That is where coaching practice sits rather than a
					safety limit: no volume rule has been shown to prevent injury, so it
					is a starting point and not a rule.
				</p>
				<p>
					Recovery weeks and the taper follow the documented convention too —{' '}
					{formatPercent(DEFAULT_RECOVERY_CUT)} off your last loading week and{' '}
					{formatPercent(DEFAULT_TAPER_CUT)} by your event. No shape chooses
					them, so they move if the convention does. Author your own on any
					block afterwards.
				</p>
			</div>
		</section>
	)
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

	return (
		<Card className="h-full">
			<CardHeader className="gap-1">
				<CardTitle className="text-base">{preset.name}</CardTitle>
				<p className="text-muted-foreground text-sm">{preset.provenance}</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<LoadProfile
					preset={preset}
					profile={profile}
					ceiling={ceiling}
					slots={slots}
				/>

				<div className="space-y-2 text-sm">
					<p>
						<span className="font-medium tabular-nums">{weeks} weeks</span>{' '}
						<span className="text-muted-foreground">
							·{' '}
							{preset.phases
								.map((phase) => `${phase.name} ${phase.weeks}`)
								.join(' · ')}
						</span>
					</p>
					{/* What differs between the cards, and only that. The ramp and the two
					    cuts are identical across all three shapes and are stated once, at
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
					<p className="text-muted-foreground text-sm">
						Replaces your current blocks.
					</p>
					<Button type="submit" className="w-full">
						Apply {preset.name}
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
function rhythmSentence(preset: PeriodizationPreset): string {
	const rhythms = [
		...new Set(
			preset.phases
				.map((phase) => phase.rhythm)
				.filter((rhythm) => rhythm !== 'none'),
		),
	]
	const rhythm =
		rhythms.length === 1
			? `Loads ${RHYTHM_LABELS[rhythms[0]!]}.`
			: 'The rhythm changes from block to block.'

	// Named where it exists, because an authored drop is intent and the picture
	// shows it as a fall the athlete would otherwise read as a mistake (ADR 0040 §4).
	const step = preset.phases.find((phase) => phase.boundaryStep != null)
	if (!step?.boundaryStep) return rhythm
	return `${rhythm} Volume steps ${formatSignedPercent(step.boundaryStep)} entering ${step.name}, deliberately, as the quality goes up.`
}

// ── The illustration ─────────────────────────────────────────────────────────

/** SVG user units per week, and the strip's drawn height. */
const SLOT = 10
const STRIP_HEIGHT = 48
const BAR_FRAC = 0.72

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
function LoadProfile({
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
				aria-label={profileSummary(preset, profile, peak)}
			>
				{profile.map((value, index) => {
					const role = weekRole(phases, index)
					const cx = SLOT * index + SLOT / 2
					// Every week has a value: `presetProfile` narrows `weekTargets`'
					// Unavailable Metric away at its own seam, because neither state that
					// produces one can arise from a preset. So there is no "no value" branch
					// to draw here — and no unreachable one either, which is the kind ADR 0030
					// rule 1 is hardest to satisfy honestly precisely because nobody sees it.
					const y = scaleY(value)
					return (
						<rect
							key={index}
							x={cx - barW / 2}
							y={y}
							width={barW}
							height={STRIP_HEIGHT - y}
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
				caption={`${preset.name}: the load profile it lays down, each week as a percentage of your opening week`}
				columns={['Week', 'Block', 'Role', 'Load']}
				rows={profile.map((value, index) => [
					`Week ${index + 1}`,
					blockName(preset, phases, index),
					WEEK_ROLE_LABELS[weekRole(phases, index)],
					share(value),
				])}
			/>
		</figure>
	)
}

/** A week's load as a share of the opening week — the profile's only unit. */
function share(value: number): string {
	return formatPercent(value / PRESET_PROFILE_ANCHOR)
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

/**
 * The one-line summary the `role="img"` strip carries: the length, the climb and
 * where the season recovers. It says the same thing the picture does, which is
 * what an alternative text is for — the per-week figures are the table's job.
 */
function profileSummary(
	preset: PeriodizationPreset,
	profile: number[],
	peak: { value: number; week: number },
): string {
	const roles = presetPhaseSpecs(preset)
	const count = (role: WeekRole) =>
		profile.filter((_, index) => weekRole(roles, index) === role).length
	const recovery = count('recovery')
	const taper = count('taper')
	// Phrased so no clause needs an article in front of a number — "a 21-week" and
	// "an 18-week" would both have to be produced from the same template.
	return [
		`${preset.name}: a load profile ${profile.length} weeks long.`,
		' It opens at the volume you start from',
		` and peaks at ${share(peak.value)} of it in week ${peak.week}.`,
		` ${recovery === 1 ? '1 recovery week' : `${recovery} recovery weeks`} along the way,`,
		` then it tapers over the last ${taper === 1 ? 'week' : `${taper} weeks`}.`,
		' Every week is in the table that follows.',
	].join('')
}
