/**
 * The Effort Word vocabulary on its own (`effort-word.ts` reads one). It
 * imports nothing, so a module can build a schema from it as it loads
 * wherever it sits in an import cycle: `effort-word.ts` reaches Structure
 * Detection, which reaches `simple-activity.ts`, whose schema needs the words
 * before `effort-word.ts` has finished loading (#638).
 */
export const EFFORT_WORDS = ['rolig', 'middels', 'hard'] as const
export type EffortWord = (typeof EFFORT_WORDS)[number]

export function isEffortWord(value: unknown): value is EffortWord {
	return (EFFORT_WORDS as readonly unknown[]).includes(value)
}
