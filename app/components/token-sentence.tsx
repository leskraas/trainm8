import { Fragment, type ReactNode } from 'react'
import { cn } from '#app/utils/misc.tsx'
import {
	notationSegments,
	type NotationToken,
	type SentenceSegment,
	type WorkoutNotation,
} from '#app/utils/workout-notation.ts'

/** A token segment of the sentence — what the interaction hook receives. */
export type TokenSentenceSegment = Extract<SentenceSegment, { kind: 'token' }>

/**
 * Per-token-type styling. Values (quantities, intensity, repeat counts, set
 * notation, exercise names) read as the sentence's ink; connective tissue
 * (rests, block labels, note markers) recedes like the glue around it.
 */
const TOKEN_CLASS: Record<NotationToken['type'], string> = {
	quantity: 'text-foreground font-medium',
	repeat: 'text-foreground font-medium',
	intensity: 'text-foreground font-medium',
	sets: 'text-foreground font-medium',
	exercise: 'text-foreground font-medium',
	rest: 'text-muted-foreground',
	label: 'text-muted-foreground',
	notes: 'text-muted-foreground',
}

export type TokenSentenceProps = {
	/** The derived token model (`deriveWorkoutNotation`); never free text. */
	notation: WorkoutNotation
	className?: string
	/**
	 * The seam for the editor slice: wrap a token's default rendering (e.g. in
	 * a popover trigger). Omitted → the sentence is inert, plain text in real
	 * elements — the read-only detail view passes nothing here.
	 */
	renderToken?: (
		segment: TokenSentenceSegment,
		children: ReactNode,
	) => ReactNode
}

/**
 * The **Token Sentence** (ADR 0027): a workout's whole prescription as one
 * dense notation line, rendered from the Workout Notation's segment model.
 * Every token is a real element (`data-token-type`), so it reads naturally to
 * screen readers — the visible text is the label, no aria overlay — and a
 * later slice can make tokens interactive via `renderToken` without touching
 * the sentence's layout. Separators and parenthesization come verbatim from
 * the model's glue segments; this component never re-derives them.
 */
export function TokenSentence({
	notation,
	className,
	renderToken,
}: TokenSentenceProps) {
	const segments = notationSegments(notation)
	if (segments.length === 0) return null
	return (
		<span
			data-token-sentence
			className={cn('leading-relaxed break-words', className)}
		>
			{segments.map((segment, index) =>
				segment.kind === 'glue' ? (
					<span key={index} className="text-muted-foreground/80">
						{segment.text}
					</span>
				) : (
					<Fragment key={index}>
						{renderToken ? (
							renderToken(segment, <Token segment={segment} />)
						) : (
							<Token segment={segment} />
						)}
					</Fragment>
				),
			)}
		</span>
	)
}

function Token({ segment }: { segment: TokenSentenceSegment }) {
	const { token } = segment
	return (
		<span data-token-type={token.type} className={TOKEN_CLASS[token.type]}>
			{segment.text}
			{token.type === 'notes' ? (
				// The visible marker is `*`; the note itself still reads out.
				<span className="sr-only"> note: {token.note}</span>
			) : null}
		</span>
	)
}
