/**
 * **The deterministic season generator** — the implementation *behind* the
 * model-client seam, not a stub beside it (ADR 0053, #456).
 *
 * ADR 0016 designed a seam with a model on one side and "a deterministic stub that
 * made it testable" on the other. #386 inverted that: generation is **rules**, the
 * deterministic generator is the real implementation, and a model arrives later as
 * a *second* implementation of an interface that already has a working one. So
 * ADR 0037's cautionary precedent — a field shipped ahead of its consumer, sitting
 * unread through an entire map — does not apply here: the consumer ships in the
 * same commit as the seam.
 *
 * ## What "deterministic" means here, precisely
 *
 * Same inputs, same plan. Concretely:
 *
 * - **No clock.** Nothing in this file reads `Date.now()`. Every week is derived
 *   from the **Plan Start Week** the request carries.
 * - **No random source**, seeded or otherwise. Where a slot has several corpus
 *   candidates, the choice is an index into a list sorted by stable entry id
 *   (`retrieval.ts`).
 * - **No database.** The corpus arrives as an argument. This is the strict form of
 *   the property: the generator is reproducible even against a different database,
 *   which is what lets the approval step *re-run* generation server-side rather
 *   than trusting a payload the browser posted back.
 * - **No mutation of its inputs**, so calling it twice with one request cannot
 *   produce two answers.
 *
 * ## What it composes
 *
 * Nothing here re-derives what the manual planning foundation already owns. The
 * phases, rhythm, ramp, boundary step and mix are the chosen **Periodization
 * Preset**'s; the weekly volume is `weekTargets`, the same function that prices the
 * season once a plan exists; the days are `proposeStarterPattern`'s. What this
 * module adds is the one thing none of them does — **which session goes on which
 * day** — and it answers that by retrieval from the **Catalogue**.
 *
 * ## What it deliberately does not do
 *
 * **It does not rescale a retrieved session to hit the week's number.** A corpus
 * row is placed as its source published it. Stretching Daniels' `5 × 1000 m` to
 * `7 × 1000 m` because the derived week wanted more kilometres would be editing
 * the session and then still calling it Daniels'. The consequence is honest and
 * visible: the week's derived target and the sum of its placed sessions are two
 * different numbers, and the payload carries both rather than reconciling them
 * behind the athlete's back.
 *
 * **It does not resolve any intensity.** A retrieved row's **Intensity Target** is
 * copied as authored, and resolution happens per athlete at read time against
 * their current **Discipline Profile** and **Zone Recipe** — nothing is baked
 * (`CONTEXT.md`, **Intensity Target**). That is what makes "no **Threshold** means
 * no metric target" true by construction: generation never writes a pace or a
 * wattage, so there is none to invent, and an athlete with no threshold reads the
 * **Training Zone** label or the RPE the corpus row itself states.
 *
 * **It lays no strength track.** See {@link strengthUnavailable}.
 */
import { type CataloguePhase } from '../catalogue.ts'
import {
	phaseIndexForWeek,
	totalWeeks,
	weekRole,
	weekTargets,
	type PhaseSpec,
} from '../plan-outline/derive.ts'
import {
	presetFor,
	presetPhaseSpecs,
	presetSegmentSpecs,
	type PeriodizationPreset,
} from '../plan-outline/presets.ts'
import { emphasisTerms, type QualityZone } from '../plan-outline/quality-mix.ts'
import { proposeStarterPattern } from '../plan-outline/starter-pattern.ts'
import { weekKeyAt } from '../plan-outline/week-keys.ts'
import { type PatternWeekday } from '../plan-outline/week-pattern.ts'
import { type Discipline } from '../workout-schema.ts'
import { readSessionProvenance } from './provenance.ts'
import {
	archetypesForSlot,
	retrieveSession,
	type RetrievableEntry,
} from './retrieval.ts'
import {
	INTENT_LEVEL_FLOOR,
	type GeneratedPhase,
	type GeneratedSeason,
	type GeneratedSession,
	type GeneratedUnavailable,
	type GeneratedWeek,
	type SeasonRequest,
	type SessionSlot,
	type UnfilledSlot,
} from './season.ts'

/** Which implementation produced a payload. Stamped on every season it returns. */
export const DETERMINISTIC_GENERATOR_ID = 'deterministic-v1'

/**
 * Which **Catalogue Entry** phase facet each block of a preset retrieves under,
 * derived from the block's **position and shape** and never from its name.
 *
 * Phase names are free text (ADR 0044 §4) — a preset ships "Big base" and an
 * athlete may rename any block to "Grunntrening" — so a name-based mapping would
 * be a lookup table that silently stopped matching the moment somebody typed their
 * own word. Position and `tapers` are structural and survive renaming.
 *
 * The rule: a tapering block is `taper`; the first block is `base`; the last
 * non-tapering block is `peak`; everything between is `build`. A one-block season
 * is `base`, which is the honest reading of a shape that never sharpens.
 *
 * `race-week` is deliberately **not** produced here. It is a property of *the last
 * week of the plan* rather than of a block — the week the **Target Event** falls
 * in — so it is applied per week in {@link generateDeterministicSeason}.
 */
export function cataloguePhaseFor(
	phases: readonly { tapers: boolean }[],
	index: number,
): CataloguePhase {
	if (phases[index]?.tapers) return 'taper'
	if (index === 0) return 'base'
	const lastNonTapering = phases.reduce(
		(last, phase, at) => (phase.tapers ? last : at),
		0,
	)
	return index === lastNonTapering ? 'peak' : 'build'
}

/**
 * The **Unavailable Metric** a requested strength **Discipline** produces.
 *
 * Stated as its own function because it is the ticket's defining constraint and
 * deserves to be findable. **No preset carries a strength segment** — `presets.ts`
 * has no strength arm at all, by construction rather than by omission — and
 * `TrainingTrackSegment`'s strength arm requires a `startWeekKey`, a `weeks`, a
 * **Strength Goal** and a **Strength Frequency** (ADR 0047 §3, §4, §6). Nothing in
 * the request implies any of the four. A generated plan therefore shows the
 * endurance tracks generated and the strength track **empty, saying why** — never
 * a fabricated `sessionsPerWeek`.
 *
 * It is emitted as a payload member rather than by omitting the discipline,
 * because a plan that simply lacked a strength track would be indistinguishable
 * from one the athlete never asked for.
 */
export function strengthUnavailable(
	disciplines: readonly Discipline[],
): GeneratedUnavailable[] {
	return disciplines.map((discipline) => ({
		reading: 'strength-track' as const,
		discipline,
	}))
}

/**
 * The slot each of a week's training days holds, in weekday order.
 *
 * Three rules, and each is a statement rather than an implementation detail.
 *
 * **Quality only in loading weeks.** A recovery week is the week that recovers —
 * the derivation already cuts its volume — and a **Quality Session Mix** authored
 * "2 × zone 4 per week" is a claim about the block's loading weeks. Placing the
 * mix's sessions in the recovery week too would be the app disagreeing with the
 * rhythm the athlete picked the shape for. A tapering week is the same argument
 * from the other end, and the presets' taper blocks carry an empty mix anyway.
 *
 * **Quality leads the week, the long day closes it.** The mix's sessions go on the
 * earliest available days and the long day is the last one, which is the shape
 * every endurance week in the #363 survey has and the one `proposeStarterPattern`
 * already weights for. The athlete's own availability supplies the spacing.
 *
 * **Overflow eats the long day, and says so by what it returns.** Where the mix
 * asks for more quality sessions than the athlete has days, the long day is taken
 * too rather than a day being invented — availability is the athlete's statement
 * and generation does not overrule it.
 */
export function slotsForWeek(
	days: readonly { role: 'long' | 'ordinary' }[],
	zones: readonly QualityZone[],
	options: { isFinalWeek: boolean; isLoadingWeek: boolean },
): Array<{ slot: SessionSlot; zone: QualityZone | null }> {
	if (options.isFinalWeek) {
		return days.map(() => ({ slot: 'race-week' as const, zone: null }))
	}
	const quality = options.isLoadingWeek ? zones : []
	return days.map((day, index) => {
		const zone = quality[index]
		if (zone != null) return { slot: 'quality' as const, zone }
		return {
			slot: day.role === 'long' ? ('long' as const) : ('ordinary' as const),
			zone: null,
		}
	})
}

/**
 * The **Quality Session Mix** of one phase, expanded into one zone per session.
 *
 * Ascending by zone, which is `emphasisTerms`' order and therefore the order every
 * other surface already states a mix in. It matters here because the position in
 * this list is the day the session lands on, so a second ordering would put the
 * same mix on different days on two screens.
 */
export function mixZones(
	preset: PeriodizationPreset,
	phaseIndex: number,
): QualityZone[] {
	const phase = preset.phases[phaseIndex]
	if (!phase) return []
	return emphasisTerms(phase.mix).flatMap((term) =>
		Array.from({ length: term.sessionsPerWeek }, () => term.zone),
	)
}

/**
 * Generate a whole season from the six inputs and a corpus.
 *
 * Returns a payload and writes nothing — "nothing persisted until approved" is a
 * property of the function's *type* here, not a discipline the caller has to keep
 * (ADR 0016, carried forward).
 */
export function generateDeterministicSeason(
	request: SeasonRequest,
	corpus: readonly RetrievableEntry[],
): GeneratedSeason {
	const preset = presetFor(request.presetKey)
	const phaseSpecs: PhaseSpec[] = presetPhaseSpecs(preset)
	const segmentSpecs = presetSegmentSpecs(preset)
	const weekCount = totalWeeks(phaseSpecs)
	const level = INTENT_LEVEL_FLOOR[request.intent]

	const phases: GeneratedPhase[] = preset.phases.map((phase, index) => ({
		name: phase.name,
		weeks: phase.weeks,
		rhythm: phase.rhythm,
		tapers: phase.tapers,
		cataloguePhase: cataloguePhaseFor(preset.phases, index),
	}))

	// The same derivation the plan page reads once the season exists, so the
	// preview cannot promise weeks the applied plan does not deliver.
	const targetsByDiscipline = new Map(
		request.tracks.map((track) => [
			track.discipline,
			weekTargets(phaseSpecs, {
				currency: track.currency,
				// No anchor in force is the one state that prices every week `null` —
				// the derivation's own Unavailable Metric — and it is passed through as
				// an empty list rather than substituted with a number nobody authored.
				anchors:
					track.anchorValue == null
						? []
						: [{ fromWeekIndex: 0, value: track.anchorValue }],
				segments: segmentSpecs,
				overrides: [],
			}),
		]),
	)

	// One starter pattern for the whole season: the athlete's availability does not
	// change week to week, and re-proposing it per week would be one more place for
	// the days to disagree with themselves. Every track here is endurance, so every
	// one takes the athlete's available days (`sessionsPerWeek: null`).
	const starter = proposeStarterPattern({
		trainableWeekdays: request.trainableWeekdays,
		tracks: request.tracks.map((track) => ({
			trackId: track.discipline,
			discipline: track.discipline,
			sessionsPerWeek: null,
		})),
	})

	const weeks: GeneratedWeek[] = []
	const sessions: GeneratedSession[] = []
	const unfilled: UnfilledSlot[] = []

	for (let weekIndex = 0; weekIndex < weekCount; weekIndex++) {
		const weekKey = weekKeyAt(request.startWeekKey, weekIndex)
		const phaseIndex = phaseIndexForWeek(phaseSpecs, weekIndex) ?? 0
		const role = weekRole(phaseSpecs, weekIndex)
		const isFinalWeek = weekIndex === weekCount - 1

		weeks.push({
			weekIndex,
			weekKey,
			phaseIndex,
			role,
			isFinalWeek,
			targets: request.tracks.map((track) => ({
				discipline: track.discipline,
				currency: track.currency,
				value: targetsByDiscipline.get(track.discipline)?.[weekIndex] ?? null,
			})),
		})

		if (starter == null) continue

		const cataloguePhase = isFinalWeek
			? ('race-week' as const)
			: phases[phaseIndex]!.cataloguePhase
		const zones = mixZones(preset, phaseIndex)

		for (const track of request.tracks) {
			const days = starter.days
				.filter((day) => day.trackId === track.discipline)
				.sort((a, b) => a.weekday - b.weekday)
			const slots = slotsForWeek(days, zones, {
				isFinalWeek,
				isLoadingWeek: role === 'loading',
			})

			days.forEach((day, dayIndex) => {
				const { slot, zone } = slots[dayIndex]!
				const archetypes = archetypesForSlot(slot, zone)
				const weekday = day.weekday as PatternWeekday
				const entry = retrieveSession(corpus, {
					discipline: track.discipline,
					archetypes,
					cataloguePhase,
					goalEvent: request.goalEvent,
					level,
					// Week plus day: consecutive weeks walk the available rows rather
					// than repeating one, and two quality days in the same week draw
					// different rows. Reproducible by construction — both terms are
					// positions, not state.
					rotation: weekIndex + dayIndex,
				})
				if (entry == null) {
					unfilled.push({
						weekIndex,
						weekKey,
						weekday,
						discipline: track.discipline,
						slot,
						zone,
						archetypes,
						cataloguePhase,
					})
					return
				}
				sessions.push({
					weekIndex,
					weekKey,
					weekday,
					discipline: track.discipline,
					archetype: entry.archetype as GeneratedSession['archetype'],
					slot,
					zone,
					entryId: entry.entryId,
					workoutId: entry.workoutId,
					title: entry.title,
					provenance: readSessionProvenance(entry),
				})
			})
		}
	}

	// Season order — week, then weekday, then discipline — so the payload reads the
	// way a calendar does whatever order the loops above happened to fill it in.
	// A total order rather than a stable sort on a partial one: two runs must
	// produce the *same* array, not merely the same set.
	sessions.sort(
		(a, b) =>
			a.weekIndex - b.weekIndex ||
			a.weekday - b.weekday ||
			(a.discipline < b.discipline ? -1 : a.discipline > b.discipline ? 1 : 0),
	)

	return {
		generatorId: DETERMINISTIC_GENERATOR_ID,
		presetKey: request.presetKey,
		startWeekKey: request.startWeekKey,
		eventWeekKey: request.eventWeekKey,
		phases,
		tracks: request.tracks,
		weeks,
		sessions,
		unfilled,
		unavailable: strengthUnavailable(request.strengthDisciplines),
		weekdaySource: starter?.source ?? 'default',
		levelFloor: level,
		goalEvent: request.goalEvent,
	}
}
