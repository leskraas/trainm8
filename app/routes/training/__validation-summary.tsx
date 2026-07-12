/**
 * Server validation errors on the token line (workout-editor spec §10, #259)
 * — the editor-side lifecycle around the pure mapping layer
 * (`workout-server-errors.ts`), plus the summary line.
 *
 * Two layers, token primary (§10.1): the offending token carries an error
 * tint/underline in the notation's own language and its normal popover leads
 * with the message; one quiet summary line below the sentence lists every
 * error in document order and retargets the editing instruments to each
 * anchor. There is never a second error system on the card.
 *
 * Lifecycle — edit-to-clear (§10.4): when a rejected save's error record
 * arrives, this hook snapshots the live form value behind each error path.
 * A marking clears locally the moment that value differs — no client re-run
 * of server rules, full truth returns on the next submit — and the summary
 * count follows live. On the 400 itself the host is told once (`onRejected`)
 * so it can move focus to the first anchor, and the polite live region
 * announces the rejection in human words.
 */
import { useEffect, useRef } from 'react'
import { cn } from '#app/utils/misc.tsx'
import {
	type TokenAddress,
	type TokenField,
	type WorkoutNotation,
} from '#app/utils/workout-notation.ts'
import {
	errorPathValue,
	mapServerErrors,
	type ServerErrorItem,
} from '#app/utils/workout-server-errors.ts'

export type ServerErrorRecord = Record<string, string[] | null | undefined>

export type ServerErrorMarkings = {
	/** The live (not locally cleared) items, in document order. */
	items: ServerErrorItem[]
	/** The message painted on a rendered token, or null. */
	tokenError: (address: TokenAddress) => string | null
	/** A step-anchored marking (absent facet / step-level rule), or null. */
	stepMarking: (
		blockIndex: number,
		stepIndex: number,
	) => { message: string; facet: TokenField | null } | null
	/** The message anchored on a block's gutter, or null. */
	blockError: (blockIndex: number) => string | null
}

/**
 * Map the last rejected save onto the current notation and keep the markings
 * live through edit-to-clear. `serverErrors` must be the error record of the
 * submission result itself (its object identity marks a new rejection);
 * `formValue` is the live Conform form value the snapshots read.
 */
export function useServerErrorMarkings({
	serverErrors,
	formValue,
	notation,
	announce,
	onRejected,
}: {
	serverErrors: ServerErrorRecord | null | undefined
	formValue: unknown
	notation: WorkoutNotation
	announce: (message: string) => void
	/** Called once per new rejection, after the markings painted — move focus
	 * to the first anchored item here. */
	onRejected: (items: ServerErrorItem[]) => void
}): ServerErrorMarkings {
	// Snapshot the value behind each error path the moment a new rejection
	// arrives (object identity), during render so this same pass already
	// filters against fresh snapshots. A null snapshot (unreadable path) never
	// clears locally — that item waits for the next submit's full truth.
	const snapshotRef = useRef<{
		source: ServerErrorRecord | null
		values: Map<string, string | null>
	}>({ source: null, values: new Map() })
	const source = serverErrors ?? null
	if (snapshotRef.current.source !== source) {
		const values = new Map<string, string | null>()
		for (const path of Object.keys(source ?? {})) {
			values.set(path, errorPathValue(path, formValue))
		}
		snapshotRef.current = { source, values }
	}

	const items = mapServerErrors(source, notation).filter((item) => {
		const snapshot = snapshotRef.current.values.get(item.path)
		if (snapshot == null) return true
		return errorPathValue(item.path, formValue) === snapshot
	})

	// Announce + focus once per rejection (§10.4): guarded by the result's
	// identity, run in an effect so the paint lands first.
	const handledRef = useRef<ServerErrorRecord | null>(null)
	const latest = useRef({ items, announce, onRejected })
	latest.current = { items, announce, onRejected }
	useEffect(() => {
		if (source == null || handledRef.current === source) return
		handledRef.current = source
		const current = latest.current
		if (current.items.length === 0) return
		const count = current.items.length
		current.announce(
			`${count === 1 ? '1 thing needs' : `${count} things need`} fixing — ${current.items[0]!.message}`,
		)
		current.onRejected(current.items)
	}, [source])

	return {
		items,
		tokenError: (address) => {
			const item = items.find(
				(candidate) =>
					candidate.anchor.level === 'token' &&
					candidate.anchor.address.blockIndex === address.blockIndex &&
					candidate.anchor.address.stepIndex === address.stepIndex &&
					candidate.anchor.address.field === address.field,
			)
			return item?.message ?? null
		},
		stepMarking: (blockIndex, stepIndex) => {
			const item = items.find(
				(candidate) =>
					candidate.anchor.level === 'step' &&
					candidate.anchor.blockIndex === blockIndex &&
					candidate.anchor.stepIndex === stepIndex,
			)
			return item && item.anchor.level === 'step'
				? { message: item.message, facet: item.anchor.facet }
				: null
		},
		blockError: (blockIndex) => {
			const item = items.find(
				(candidate) =>
					candidate.anchor.level === 'block' &&
					candidate.anchor.blockIndex === blockIndex,
			)
			return item?.message ?? null
		},
	}
}

/**
 * The one quiet summary line between sentence and strip (§10.1): the count in
 * human words, then every live item in document order. Anchored items are
 * buttons that retarget the editor's own instruments to the anchor; floor
 * items are plain text — no focus move, never a crash or a silent drop
 * (§10.5). Renders nothing when everything is fixed.
 */
export function ValidationSummaryLine({
	items,
	onActivate,
	className,
}: {
	items: ServerErrorItem[]
	onActivate: (item: ServerErrorItem) => void
	className?: string
}) {
	if (items.length === 0) return null
	return (
		<div
			data-validation-summary
			role="group"
			aria-label="Fix before saving"
			className={cn('text-body-xs mt-2 flex flex-col gap-1 pt-2', className)}
		>
			<p className="text-destructive font-medium">
				{items.length === 1
					? '1 thing needs fixing'
					: `${items.length} things need fixing`}
			</p>
			<ul className="flex flex-col gap-0.5">
				{items.map((item) => (
					<li key={item.path} data-validation-summary-item>
						{item.anchor.level === 'floor' ? (
							<span className="text-destructive/90">{item.message}</span>
						) : (
							<button
								type="button"
								onClick={() => onActivate(item)}
								className="text-destructive cursor-pointer text-left underline-offset-2 hover:underline focus-visible:underline"
							>
								{item.message}
							</button>
						)}
					</li>
				))}
			</ul>
		</div>
	)
}

/** The token-primary paint (§10.1): an error tint/underline in the
 * notation's own language — never a new chip. */
export const TOKEN_ERROR_CLASS =
	'bg-destructive/10 underline decoration-destructive decoration-wavy underline-offset-4'

/** The ⋮/⠿ chrome tint for step- and block-anchored errors (§10.2–10.3). */
export const CHROME_ERROR_CLASS =
	'text-destructive hover:text-destructive focus-visible:text-destructive'

/**
 * The message(s) a popover leads with (§10.1): quiet destructive prose above
 * the editing controls — the repair happens through the popover's own
 * instrument. A step's popover may carry both its token's own message and a
 * step-anchored one (an absent facet); both lead, in that order.
 */
export function PopoverErrorLead({
	messages,
}: {
	messages: Array<string | null | undefined>
}) {
	const present = messages.filter(Boolean) as string[]
	if (present.length === 0) return null
	return (
		<div data-slot="popover-error" className="flex flex-col gap-1">
			{present.map((message) => (
				<p key={message} className="text-destructive text-xs">
					{message}
				</p>
			))}
		</div>
	)
}
