/**
 * The action registry (ADR 0092 §10): what the athlete reads of it — each
 * action's title, refusals, failures and unavailable **Readings**. Part of
 * `labels.ts`: import from the barrel.
 */

// `import type`, for the runtime-leaf reason `labels.ts`'s header gives.
/* eslint-disable import/consistent-type-specifier-style */
import type {
	RefusalCode,
	UnavailableReason,
} from '../../actions/vocabulary.ts'
/* eslint-enable import/consistent-type-specifier-style */
import { NB_UNAVAILABLE_READING_LABELS } from './sesong.ts'
import { WEEK_CHANGE_REFUSAL_LABELS } from './week-change.ts'

/**
 * Each action's `title`, in the athlete's words (ADR 0092 §1, §10): the name a
 * host shows beside a tool call it asks the athlete to approve. Keyed by the
 * action's stable name; `app/actions/labels.test.ts` holds the keys and the
 * registry to each other.
 */
export const ACTION_TITLE_LABELS = {
	get_today: 'I dag',
	list_sessions: 'Øktene i en periode',
	get_session: 'Én økt',
	get_session_vs_plan: 'Økta mot planen',
	get_training_load: 'Belastning og form',
	get_season: 'Sesongen',
	get_week_change: 'Ukeskiftet',
	answer_proposal: 'Svar på et forslag',
	accept_round: 'Ok på neste blokk',
	ease_week: 'Gjør uka lettere',
} as const

/** Words an action's value carries where the data has none of its own. */
export const ACTION_VALUE_LABELS = {
	/** `get_season`'s plan name for an open-ended plan, which has no race. */
	openEndedPlan: 'Plan uten løp',
} as const

/**
 * A refusal's `message` (ADR 0092 §5): one sentence in the athlete's words
 * for every code, so whatever refuses, the reader has something true to say.
 * An action may say it more precisely for its own domain — Ukeskiftet's
 * answers keep `WEEK_CHANGE_REFUSAL_LABELS`, the sentence the card showed
 * before the registry — and this is the fallback when it does not.
 */
export const REFUSAL_LABELS: Record<RefusalCode, string> = {
	'invalid-input': 'Det som ble sendt, kan ikke brukes.',
	'not-found': 'Fant det ikke.',
	'not-allowed': 'Dette er ikke tillatt herfra.',
	'needs-athlete-yes': 'Dette må du svare på selv, i trainm8.',
	'needs-scope': 'Assistenten har ikke tilgang til dette ennå.',
	stale: 'Noe har endret seg siden. Se på det på nytt.',
	'too-late': 'Det er for sent nå.',
	'already-answered': 'Det er allerede besvart.',
	'not-undoable': 'Det kan ikke angres lenger.',
	'undo-expired': 'Tiden for å angre er ute.',
	'no-before-image': 'Det finnes ikke noe å gå tilbake til.',
	'already-applied': WEEK_CHANGE_REFUSAL_LABELS['already-applied'],
	'scope-not-a-move': WEEK_CHANGE_REFUSAL_LABELS['scope-not-a-move'],
	'scope-not-for-a-make-up':
		WEEK_CHANGE_REFUSAL_LABELS['scope-not-for-a-make-up'],
	'factor-not-a-round': WEEK_CHANGE_REFUSAL_LABELS['factor-not-a-round'],
	'factor-out-of-range': WEEK_CHANGE_REFUSAL_LABELS['factor-out-of-range'],
	'not-a-week': WEEK_CHANGE_REFUSAL_LABELS['not-a-week'],
	'not-the-coming-week': WEEK_CHANGE_REFUSAL_LABELS['not-the-coming-week'],
	'already-eased': WEEK_CHANGE_REFUSAL_LABELS['already-eased'],
	autopilot: WEEK_CHANGE_REFUSAL_LABELS.autopilot,
}

/**
 * What the athlete reads when an action failed while it ran (ADR 0092 §5),
 * where a form shows its error: `not-run` changed nothing, `unknown` may have.
 */
export const ACTION_FAILURE_LABELS = {
	'not-run': 'Det gikk ikke akkurat nå. Prøv igjen.',
	unknown:
		'Noe gikk galt, og svaret kan ha blitt lagret. Se på kortet før du prøver igjen.',
} as const

/**
 * A **Reading**'s `label` when it is unavailable (ADR 0092 §6): why the number
 * is not there, in the athlete's words — never a zero, never a blank. One
 * entry per reason, so a new reason fails type checking until it is worded.
 */
export const READING_UNAVAILABLE_LABELS: Record<UnavailableReason, string> = {
	'simple-activity': 'Ikke målt: en enkel aktivitet har bare tid og innsats.',
	'not-resolved': 'Ikke målt: det finnes ikke noe å regne tallet ut fra.',
	'hours-calendar-cost': NB_UNAVAILABLE_READING_LABELS['hours-calendar-cost'],
	'combined-cross-track-load':
		NB_UNAVAILABLE_READING_LABELS['combined-cross-track-load'],
	'strength-ctl': NB_UNAVAILABLE_READING_LABELS['strength-ctl'],
	'sets-has-no-reading':
		'Ikke målt: arbeidssett har ingen belastning, og regnes aldri om til en.',
	'not-an-endurance-discipline':
		'Ikke målt: styrketrening har ingen belastning, og regnes aldri om til en.',
	'no-zone-recipe': 'Ikke målt: ingen sonemodell er satt for den sporten.',
	'no-intensity-source': 'Ikke målt: sonemodellen gir ingen intensitet å lese.',
	'no-heart-rate-anchor':
		'Ikke målt: verken makspuls eller terskelpuls er lagret.',
	'no-threshold-pace': 'Ikke målt: ingen terskelfart er lagret.',
	'no-critical-swim-speed': 'Ikke målt: ingen kritisk svømmefart er lagret.',
	'no-ride-history': 'Ikke målt: ingen registrerte sykkeløkter å lese fra.',
	'no-season-anchor': 'Ikke målt: sporet har ikke noe startnivå.',
	'no-recording': 'Ikke registrert: ingen økt er tatt opp ennå.',
	'building-baseline':
		'Ikke ennå: formen leses først etter 42 dager med historikk.',
	'insufficient-data': 'Ikke målt: det er for lite historikk å lese fra.',
	'source-terms':
		'Holdt tilbake: vilkårene til plattformen dataene kom fra, tillater ikke at de sendes hit.',
	'outside-plan': 'Ikke satt: uka ligger utenfor planen.',
	'no-plan': 'Ikke satt: du har ingen aktiv plan.',
	'not-logged': 'Ikke logget.',
	'structure-not-verifiable':
		'Ikke målt: strukturen kunne ikke bekreftes fra opptaket.',
}
