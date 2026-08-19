/**
 * **What you lift next time, as the panel draws it** — the presenter for the
 * outcome panel (#485, ADR 0060 §7, ADR 0064).
 *
 * It is a thin layer *over* {@link buildOutcomePanel} rather than a second copy
 * of it. Every sentence on the panel is still the shipped builder's, including
 * the rule that builder is audited against: a sentence about *where the lift now
 * stands* reads the lift state and never the weight this session was stamped at.
 * Nothing here restates that.
 *
 * What this file adds is what a *panel* needs and a sentence does not:
 *
 * - the **tone** each outcome is drawn in, read off the engine's own `kind`
 *   rather than sniffed out of the headline's words;
 * - the **lift** the panel is about, so "See Squat over time" can reach it;
 * - the **provenance** of a Stall Cut, in the percentage the engine actually
 *   cut — ADR 0060 §7's requirement that the athlete reads *"convention, no
 *   trial"* next to a 6 kg drop in their bench;
 * - whether the athlete's rack can make the weight the cut landed on.
 *
 * Pure: no clock, no random source, no `prisma`.
 */
import {
	type PlateInventory,
	type PlateOptions,
} from '#app/utils/strength/plates.ts'
import { type LiftOutcome } from '#app/utils/strength/program-engine.ts'
import {
	type OutcomeItem,
	buildOutcomePanel,
	buildPlateLine,
} from './__runner-presenter.ts'

/**
 * How a panel is drawn, and it is a **fact about the outcome, not about the
 * words**.
 *
 * Four of the five are the handoff's four kinds. `notice` is the fifth because
 * the engine has notices that are not cuts — a Stall Response it could not
 * apply, a session it could not read, a session logged lighter than it was
 * prescribed. Colouring those destructive would tell the athlete their weight
 * dropped when nothing moved at all, so they get the notice treatment and the
 * `role="status"` region, without the cut's red.
 */
export type OutcomeTone = 'progressed' | 'held' | 'notLogged' | 'cut' | 'notice'

export type OutcomePanelItem = OutcomeItem & {
	tone: OutcomeTone
	/** The catalogued lift this panel is about, for the link to its history. */
	exerciseId: string
	/** Where a **cut** landed, so the panel can ask the athlete's rack whether it
	 * can make that number. Null on every outcome that moved nothing. */
	movedToKg: number | null
	/**
	 * The program's own note about the cut it just took, or null.
	 *
	 * Only a cut carries one. It is not decoration: the percentage is program
	 * convention with no trial behind it, and an athlete reading a 10 % drop in
	 * their own squat is entitled to read that in the same breath.
	 */
	provenance: string | null
}

function toneOf(outcome: LiftOutcome): OutcomeTone {
	switch (outcome.kind) {
		case 'incremented':
			return 'progressed'
		case 'repeated':
			return 'held'
		case 'skipped':
			return 'notLogged'
		case 'stalled':
			return 'cut'
		default:
			return 'notice'
	}
}

/**
 * **The percentage that was actually cut**, from the two weights the engine
 * moved between.
 *
 * Read off the outcome rather than off the program's constant on purpose: the
 * sentence sits directly under *"60 kg → 54 kg"*, and a constant that had drifted
 * from the number beside it would be the panel contradicting itself. One decimal,
 * because 8 % and 10 % are the published figures and a third of a percent is
 * noise.
 */
function cutPercent(fromKg: number, toKg: number): string {
	const pct = ((fromKg - toKg) / fromKg) * 100
	return String(Math.round(pct * 10) / 10)
}

/** `StrongLifts 5×5` → `StrongLifts 5×5’s`, `StrongLifts` → `StrongLifts’`. */
function possessive(name: string): string {
	return name.endsWith('s') || name.endsWith('S') ? `${name}’` : `${name}’s`
}

/**
 * One panel per lift: the shipped builder's sentences, plus what the panel
 * needs to draw them.
 *
 * `programName` is null for a session that belongs to no running program — the
 * provenance then says *"the program's"*, because the convention is still
 * convention and dropping the sentence would be the one place a cut goes
 * unexplained.
 */
export function buildOutcomePanelView(
	outcomes: readonly LiftOutcome[],
	liftNames: Record<string, string>,
	programName: string | null,
): OutcomePanelItem[] {
	const items = buildOutcomePanel(outcomes, liftNames)
	return outcomes.map((outcome, index) => {
		// The two arrays are the same list in the same order — the builder maps
		// one-to-one — so the item beside this outcome is this outcome's.
		const item = items[index]!
		const tone = toneOf(outcome)
		const cut = outcome.kind === 'stalled' ? outcome : null
		return {
			...item,
			tone,
			exerciseId: outcome.exerciseId,
			movedToKg: cut ? cut.toKg : null,
			provenance: cut
				? `The ${cutPercent(cut.fromKg, cut.toKg)} % cut is ${
						programName ? possessive(programName) : 'the program’s'
					} own published convention. No trial supports it.`
				: null,
		}
	})
}

/**
 * **The weight the gym can make**, where it cannot make the one the cut landed
 * on.
 *
 * The same refusal the runner's plate line states, said one screen later about
 * the number the program just produced: a program that drops a 60 kg bench 10 %
 * asks for 54 kg, and a rack of 20/10/5/2.5 kg plates cannot build it. Saying
 * *"54 kg"* alone would send the athlete to a bar they cannot load.
 *
 * Null is the ordinary answer — no gym on file, nothing moved, or a rack that
 * makes the number exactly.
 */
export function buildCutFeasibilityNote(input: {
	kg: number | null
	inventory: PlateInventory | null
	options: PlateOptions | null
}): string | null {
	if (input.kg == null || !input.inventory || !input.options) return null
	const line = buildPlateLine({
		loadNumber: String(input.kg),
		inventory: input.inventory,
		options: input.options,
	})
	return line?.kind === 'nearest' ? line.note : null
}
