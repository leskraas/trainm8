/**
 * PROTOTYPE — throwaway. The one in-memory store all four variants edit, so a
 * change made in the Apple variant survives a switch to the TrainingPeaks one
 * and the reviewer can compare the *same* plan through four design languages.
 * Nothing persists. Delete with the route.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	type Anchor,
	type BlockTemplate,
	blockFromTemplate,
	type Currency,
	derivePlan,
	type DerivedPlan,
	type Focus,
	phaseId,
	type Phase,
	type Plan,
	planFromSeasonTemplate,
	type Rhythm,
	type SeasonTemplate,
	SEASON_TEMPLATES,
	WEEK_TEMPLATES,
	toHours,
} from './__manual-prototype-x-model.ts'

export type SeedEvent = {
	name: string
	date: string | null
}

/** A short-lived line explaining what an edit just did — apply-then-own, etc. */
export type Whisper = { id: number; text: string } | null

export type PlanStore = {
	plan: Plan
	derived: DerivedPlan
	today: Date
	whisper: Whisper
	seedEvent: SeedEvent
	setCurrency: (c: Currency) => void
	toggleAlsoTrack: (c: Currency) => void
	setAnchor: (a: Anchor) => void
	goOngoing: () => void
	attachRace: (name: string, date: string) => void
	setCyclesShown: (n: number) => void
	setTaperWeeks: (n: number) => void
	applySeasonTemplate: (key: string) => void
	appendBlockTemplate: (t: BlockTemplate) => void
	replacePhaseWithTemplate: (id: string, t: BlockTemplate) => void
	updatePhase: (id: string, patch: Partial<Phase>) => void
	nudgePhaseVolume: (id: string, deltaInCurrency: number) => void
	setPhaseFocus: (id: string, focus: Focus) => void
	setPhaseRhythm: (id: string, rhythm: Rhythm) => void
	setPhaseCurrency: (id: string, c: Currency) => void
	setWeekOverrideHours: (
		phaseIdValue: string,
		weekInPhase: number,
		hours: number,
	) => void
	stampPattern: (id: string, patternKey: string) => void
	stampPatternEverywhere: (patternKey: string) => void
	clearPattern: (id: string) => void
	movePhase: (id: string, dir: -1 | 1) => void
	removePhase: (id: string) => void
	setWeekOverride: (
		phaseIdValue: string,
		weekInPhase: number,
		valueInCurrency: number,
	) => void
	clearWeekOverride: (phaseIdValue: string, weekInPhase: number) => void
	reset: () => void
}

function initialPlan(seed: SeedEvent): Plan {
	const anchor: Anchor = {
		kind: 'event',
		name: seed.name,
		date: seed.date,
	}
	const classic = SEASON_TEMPLATES[0] as SeasonTemplate
	return planFromSeasonTemplate(classic, anchor)
}

export function usePlanStore(seedEvent: SeedEvent, today: Date): PlanStore {
	const [plan, setPlan] = useState<Plan>(() => initialPlan(seedEvent))
	const [whisper, setWhisper] = useState<Whisper>(null)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	const say = useCallback((text: string) => {
		setWhisper({ id: Date.now(), text })
		if (timer.current) clearTimeout(timer.current)
		timer.current = setTimeout(() => setWhisper(null), 5000)
	}, [])

	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current)
		},
		[],
	)

	const derived = useMemo(() => derivePlan(plan, today), [plan, today])

	const patch = useCallback((fn: (p: Plan) => Plan) => setPlan(fn), [])

	const store: PlanStore = {
		plan,
		derived,
		today,
		whisper,
		seedEvent,
		setCurrency: (c) =>
			patch((p) => ({
				...p,
				currency: c,
				alsoTrack: p.alsoTrack.filter((x) => x !== c),
			})),
		toggleAlsoTrack: (c) =>
			patch((p) => ({
				...p,
				alsoTrack: p.alsoTrack.includes(c)
					? p.alsoTrack.filter((x) => x !== c)
					: [...p.alsoTrack, c],
			})),
		setAnchor: (a) => patch((p) => ({ ...p, anchor: a })),
		goOngoing: () => {
			patch((p) => ({
				...p,
				anchor: { kind: 'ongoing', name: 'Ongoing training', date: null },
				taperWeeks: 0,
			}))
			say('No finish line. The blocks now repeat — attach a race any time.')
		},
		attachRace: (name, date) => {
			patch((p) => ({
				...p,
				anchor: { kind: 'event', name, date },
				taperWeeks: p.taperWeeks || 2,
			}))
			say(`${name} attached — the loop straightens out and a taper appears.`)
		},
		setCyclesShown: (n) =>
			patch((p) => ({ ...p, cyclesShown: Math.max(1, Math.min(6, n)) })),
		setTaperWeeks: (n) =>
			patch((p) => ({ ...p, taperWeeks: Math.max(0, Math.min(3, n)) })),
		applySeasonTemplate: (key) => {
			const t = SEASON_TEMPLATES.find((x) => x.key === key)
			if (!t) return
			patch((p) => ({
				...planFromSeasonTemplate(t, p.anchor),
				currency: p.currency,
				alsoTrack: p.alsoTrack,
			}))
			say(`“${t.name}” copied into your plan. It’s yours now — edit anything.`)
		},
		appendBlockTemplate: (t) => {
			patch((p) => ({ ...p, phases: [...p.phases, blockFromTemplate(t)] }))
			say(`“${t.name}” copied in. No link back to the template.`)
		},
		replacePhaseWithTemplate: (id, t) => {
			patch((p) => ({
				...p,
				phases: p.phases.map((ph) =>
					ph.id === id ? { ...blockFromTemplate(t), id: ph.id } : ph,
				),
			}))
			say(`Block swapped for “${t.name}” — copied, not linked.`)
		},
		updatePhase: (id, phasePatch) =>
			patch((p) => ({
				...p,
				phases: p.phases.map((ph) =>
					ph.id === id ? { ...ph, ...phasePatch } : ph,
				),
			})),
		nudgePhaseVolume: (id, deltaInCurrency) =>
			patch((p) => ({
				...p,
				phases: p.phases.map((ph) =>
					ph.id === id
						? {
								...ph,
								baseHours: Math.max(
									0.5,
									Math.round(
										(ph.baseHours + toHours(deltaInCurrency, p.currency)) * 10,
									) / 10,
								),
							}
						: ph,
				),
			})),
		setPhaseFocus: (id, focus) =>
			patch((p) => ({
				...p,
				phases: p.phases.map((ph) => (ph.id === id ? { ...ph, focus } : ph)),
			})),
		setPhaseRhythm: (id, rhythm) =>
			patch((p) => ({
				...p,
				phases: p.phases.map((ph) => (ph.id === id ? { ...ph, rhythm } : ph)),
			})),
		setPhaseCurrency: (id, c) =>
			patch((p) => ({
				...p,
				phases: p.phases.map((ph) =>
					ph.id === id ? { ...ph, currency: c } : ph,
				),
			})),
		setWeekOverrideHours: (pid, weekInPhase, hours) =>
			patch((p) => ({
				...p,
				overrides: {
					...p.overrides,
					[`${pid}#${weekInPhase}`]: Math.max(
						0.1,
						Math.round(hours * 10) / 10,
					),
				},
			})),
		stampPattern: (id, patternKey) => {
			const t = WEEK_TEMPLATES.find((x) => x.key === patternKey)
			patch((p) => ({
				...p,
				phases: p.phases.map((ph) =>
					ph.id === id ? { ...ph, pattern: patternKey } : ph,
				),
			}))
			const phase = plan.phases.find((ph) => ph.id === id)
			say(
				`“${t?.name ?? 'Pattern'}” stamped across every week of ${phase?.name ?? 'the block'} — copied into standalone sessions, no link back.`,
			)
		},
		stampPatternEverywhere: (patternKey) => {
			const t = WEEK_TEMPLATES.find((x) => x.key === patternKey)
			patch((p) => ({
				...p,
				phases: p.phases.map((ph) => ({ ...ph, pattern: patternKey })),
			}))
			say(
				`“${t?.name ?? 'Pattern'}” stamped across every block. Each block owns its own copy now — change one without touching the rest.`,
			)
		},
		clearPattern: (id) =>
			patch((p) => ({
				...p,
				phases: p.phases.map((ph) =>
					ph.id === id ? { ...ph, pattern: null } : ph,
				),
			})),
		movePhase: (id, dir) =>
			patch((p) => {
				const i = p.phases.findIndex((ph) => ph.id === id)
				const j = i + dir
				if (i < 0 || j < 0 || j >= p.phases.length) return p
				const next = [...p.phases]
				const a = next[i] as Phase
				const b = next[j] as Phase
				next[i] = b
				next[j] = a
				return { ...p, phases: next }
			}),
		removePhase: (id) =>
			patch((p) => ({ ...p, phases: p.phases.filter((ph) => ph.id !== id) })),
		setWeekOverride: (pid, weekInPhase, valueInCurrency) =>
			patch((p) => ({
				...p,
				overrides: {
					...p.overrides,
					[`${pid}#${weekInPhase}`]:
						Math.round(toHours(valueInCurrency, p.currency) * 10) / 10,
				},
			})),
		clearWeekOverride: (pid, weekInPhase) =>
			patch((p) => {
				const next = { ...p.overrides }
				delete next[`${pid}#${weekInPhase}`]
				return { ...p, overrides: next }
			}),
		reset: () => {
			setPlan(initialPlan(seedEvent))
			say('Back to the seeded plan.')
		},
	}
	return store
}

/** Convenience for variants that want a fresh block not from a template. */
export function blankPhase(name: string): Phase {
	return {
		id: phaseId(),
		name,
		focus: 'endurance',
		weeks: 3,
		rhythm: '3:1',
		baseHours: 6,
		origin: null,
		pattern: 'polarized',
		currency: 'km',
	}
}
