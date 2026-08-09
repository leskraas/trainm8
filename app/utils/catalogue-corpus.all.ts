/**
 * The assembled **Catalogue** corpus — every discipline's rows in one list,
 * which is what the seed writes and what a test validates (#451).
 *
 * A separate file from `catalogue-corpus.ts` on purpose: the discipline files
 * import the builders from there, so assembling the list there too would make
 * the module import itself.
 */
import { RUN_CORPUS } from './catalogue-corpus.run.ts'
import { type CorpusSession } from './catalogue-corpus.ts'

export const CATALOGUE_CORPUS: CorpusSession[] = [...RUN_CORPUS]

/**
 * The **Stock Workout** id a corpus row seeds to. Deterministic, so re-running
 * the seed updates the same rows rather than duplicating them — and so a
 * `CatalogueSave`, a fork's `copiedFromId` and a progression edge all keep
 * pointing at the row they pointed at before.
 */
export function stockWorkoutId(key: string): string {
	return `stock_${key}`
}

/** The **Catalogue Entry** id a corpus row seeds to, on the same rule. */
export function stockEntryId(key: string): string {
	return `stockentry_${key}`
}
