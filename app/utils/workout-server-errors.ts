/**
 * Server validation errors on the token line (workout-editor spec §10, #259)
 * — the pure mapping layer between a rejected save and the editor's anchors.
 *
 * A 400's error record (Conform `SubmissionResult['error']`) carries two path
 * vocabularies: Conform field names from the form schema
 * (`blocks[0].steps[1].duration`) and dot-joined domain paths from the
 * second-pass `WorkoutAuthoringSchema` (`blocks.0.steps.1.durationSec`).
 * Both normalize here into one anchor model:
 *
 * - **token** — the offending value renders a token; the error paints on it
 *   and its normal popover leads with the message.
 * - **step** — the facet is absent, so no token exists to paint; the step's
 *   ⋮ mark carries the tint and `facet` names the repair (§10.2 — never a
 *   synthetic ghost token).
 * - **block** — block-level rules anchor in the gutter (⠿ menu, §10.3).
 * - **session** — workout-level fields anchor on the header.
 * - **floor** — manipulated or unmappable paths degrade to anchor-less
 *   summary items: plain text, no focus move, never a crash or silent drop
 *   (§10.5).
 *
 * Items sort into document order — header first, then blocks top to bottom,
 * a block's gutter before its steps, a step's tokens in notation order —
 * because the summary line lists them exactly as the card reads.
 */
import {
	type TokenAddress,
	type TokenField,
	type WorkoutNotation,
} from './workout-notation.ts'

export type ServerErrorAnchor =
	| { level: 'token'; address: TokenAddress }
	| {
			level: 'step'
			blockIndex: number
			stepIndex: number
			/** The absent facet whose introduction repairs the error, when the
			 * path names one — the neighbour popovers highlight its ＋ link. */
			facet: TokenField | null
	  }
	| { level: 'block'; blockIndex: number }
	| { level: 'session'; field: string }
	| { level: 'floor' }

export type ServerErrorItem = {
	/** The raw error-record key — the marking's identity across renders. */
	path: string
	/** The message(s) behind the path, re-worded out of Zod's generic voice. */
	message: string
	anchor: ServerErrorAnchor
}

/** Domain-schema field names → the form/token field they alias (ADR 0023:
 * canonical seconds/metres exist only past the form boundary). */
const FIELD_ALIASES: Record<string, TokenField> = {
	duration: 'duration',
	durationSec: 'duration',
	distance: 'distance',
	distanceM: 'distance',
	intensity: 'intensity',
	notes: 'notes',
	exerciseId: 'exerciseId',
	restBetweenSetsSec: 'restBetweenSetsSec',
	discipline: 'discipline',
}

/** Workout-level form fields, in header document order (§2.6): title, then
 * the metadata line. `blocks` (the whole-array rule) reads as session-level —
 * "add at least one block" is the workout's complaint, not any block's. */
const SESSION_FIELD_ORDER = [
	'title',
	'discipline',
	'intent',
	'scheduledAt',
	'scheduledAtDate',
	'scheduledAtTime',
	'duration',
	'distance',
	'structure',
	'blocks',
]

function parsePath(path: string): string[] {
	return path.split(/[.[\]]+/).filter(Boolean)
}

function parseIndex(segment: string | undefined): number | null {
	return segment != null && /^\d+$/.test(segment) ? Number(segment) : null
}

/** Zod's generic fallbacks re-worded (B5): the summary must never read like
 * a parser. Schema-authored messages pass through untouched. */
function humanize(message: string): string {
	const trimmed = message.trim()
	if (/^invalid input$/i.test(trimmed)) return 'This can’t be saved as written'
	if (/^required$/i.test(trimmed)) return 'This is required'
	return trimmed
}

function anchorFor(
	segments: string[],
	notation: WorkoutNotation,
): ServerErrorAnchor {
	const [head, ...rest] = segments
	if (head == null) return { level: 'floor' }
	if (head !== 'blocks') {
		return segments.length === 1 && SESSION_FIELD_ORDER.includes(head)
			? { level: 'session', field: head }
			: { level: 'floor' }
	}
	if (rest.length === 0) return { level: 'session', field: 'blocks' }

	const blockIndex = parseIndex(rest[0])
	const block = blockIndex != null ? notation.blocks[blockIndex] : undefined
	if (blockIndex == null || !block) return { level: 'floor' }
	const [, blockField, stepSegment, ...stepRest] = rest
	if (blockField == null) return { level: 'block', blockIndex }

	if (blockField === 'repeatCount') {
		// The repeat badge is the anchor when it renders (repeat > 1); a
		// badge-less block carries the error in its gutter.
		return block.repeat
			? { level: 'token', address: block.repeat.address }
			: { level: 'block', blockIndex }
	}
	// `name`, the `steps` min-1 rule, and any other block-scoped field all
	// repair through the ⠿ menu (§10.3).
	if (blockField !== 'steps' || stepSegment == null) {
		return { level: 'block', blockIndex }
	}

	const stepIndex = parseIndex(stepSegment)
	const step =
		stepIndex != null
			? block.steps.find((s) => s.stepIndex === stepIndex)
			: undefined
	if (stepIndex == null || !step) return { level: 'floor' }
	const [fieldSegment] = stepRest
	if (fieldSegment == null) {
		return { level: 'step', blockIndex, stepIndex, facet: null }
	}

	// Set sub-paths (`sets.0.weightKg`) all belong to the one sets token.
	const field = fieldSegment === 'sets' ? 'sets' : FIELD_ALIASES[fieldSegment]
	if (field == null) {
		// `kind` and unknown step fields: the step is the smallest unit
		// guaranteed to render (§10.2).
		return { level: 'step', blockIndex, stepIndex, facet: null }
	}
	const token = step.tokens.find(
		(positioned) => positioned.token.address.field === field,
	)
	return token
		? { level: 'token', address: token.token.address }
		: { level: 'step', blockIndex, stepIndex, facet: field }
}

/** Document-order sort key: [region, block, step-slot, token-slot]. */
function sortKey(
	anchor: ServerErrorAnchor,
	notation: WorkoutNotation,
): number[] {
	switch (anchor.level) {
		case 'session': {
			const rank = SESSION_FIELD_ORDER.indexOf(anchor.field)
			return [0, rank === -1 ? SESSION_FIELD_ORDER.length : rank, 0, 0]
		}
		case 'block':
			return [1, anchor.blockIndex, 0, 0]
		case 'token': {
			const { blockIndex, stepIndex, field } = anchor.address
			// Block-level tokens (the repeat badge) sit in the gutter, with the
			// block itself.
			if (stepIndex == null) return [1, blockIndex, 0, 0]
			const step = notation.blocks[blockIndex]?.steps.find(
				(s) => s.stepIndex === stepIndex,
			)
			const position =
				step?.tokens.findIndex(
					(positioned) => positioned.token.address.field === field,
				) ?? -1
			return [1, blockIndex, 1 + stepIndex, position === -1 ? 0 : position]
		}
		case 'step': {
			// Absent facets have no rendered position; they read after the
			// step's tokens.
			const step = notation.blocks[anchor.blockIndex]?.steps.find(
				(s) => s.stepIndex === anchor.stepIndex,
			)
			return [
				1,
				anchor.blockIndex,
				1 + anchor.stepIndex,
				(step?.tokens.length ?? 0) + 1,
			]
		}
		case 'floor':
			return [2, 0, 0, 0]
	}
}

/**
 * Map a rejected save's error record to anchored summary items in document
 * order. Total: every path lands somewhere (the floor at worst), null/empty
 * message lists are skipped, and nothing throws on manipulated input.
 */
export function mapServerErrors(
	error: Record<string, string[] | null | undefined> | null | undefined,
	notation: WorkoutNotation,
): ServerErrorItem[] {
	if (!error) return []
	const items: Array<ServerErrorItem & { order: number[] }> = []
	let inputIndex = 0
	for (const [path, messages] of Object.entries(error)) {
		const index = inputIndex++
		if (!messages?.length) continue
		const anchor = anchorFor(parsePath(path), notation)
		items.push({
			path,
			message: messages.map(humanize).join('; '),
			anchor,
			order: [...sortKey(anchor, notation), index],
		})
	}
	items.sort((a, b) => {
		for (let i = 0; i < a.order.length; i++) {
			const delta = a.order[i]! - b.order[i]!
			if (delta !== 0) return delta
		}
		return 0
	})
	return items.map(({ order: _order, ...item }) => item)
}

function asString(value: unknown): string {
	return typeof value === 'string' || typeof value === 'number'
		? String(value)
		: ''
}

/**
 * The live form value behind an error path — the edit-to-clear snapshot
 * (§10.4): a marking clears locally the moment this value differs from what
 * it was when the 400 landed. Structural paths read a shape that changes with
 * the structure (array lengths, the serialized step); set sub-paths read the
 * whole set list, so any set edit counts. Null means the path is unreadable —
 * that marking then only clears on the next submit's full truth.
 */
export function errorPathValue(path: string, formValue: unknown): string | null {
	if (formValue == null || typeof formValue !== 'object') return null
	const value = formValue as Record<string, unknown>
	const segments = parsePath(path)
	const [head, ...rest] = segments
	if (head == null) return null

	if (head !== 'blocks') {
		if (segments.length !== 1 || !SESSION_FIELD_ORDER.includes(head))
			return null
		if (head === 'scheduledAt') {
			return `${asString(value.scheduledAtDate)}T${asString(value.scheduledAtTime)}`
		}
		return asString(value[head])
	}

	const blocks = Array.isArray(value.blocks) ? value.blocks : []
	if (rest.length === 0) return String(blocks.length)
	const blockIndex = parseIndex(rest[0])
	const block =
		blockIndex != null
			? (blocks[blockIndex] as Record<string, unknown> | undefined)
			: undefined
	if (!block || typeof block !== 'object') return null
	const [, blockField, stepSegment, fieldSegment] = rest
	if (blockField == null) return JSON.stringify(block)
	if (blockField === 'name' || blockField === 'repeatCount') {
		return asString(block[blockField])
	}
	if (blockField !== 'steps') return null

	const steps = Array.isArray(block.steps) ? block.steps : []
	if (stepSegment == null) return String(steps.length)
	const stepIndex = parseIndex(stepSegment)
	const step =
		stepIndex != null
			? (steps[stepIndex] as Record<string, unknown> | undefined)
			: undefined
	if (!step || typeof step !== 'object') return null
	if (fieldSegment == null) return JSON.stringify(step)
	if (fieldSegment === 'sets') return JSON.stringify(step.sets ?? [])
	if (fieldSegment === 'kind') return asString(step.kind)
	const field = FIELD_ALIASES[fieldSegment]
	if (field == null) return null
	return asString(step[field])
}
