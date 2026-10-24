/**
 * The few string helpers more than one label module words with. Private to
 * `app/utils/labels/`: the `labels.ts` barrel does not re-export this file.
 */

/** Capitalize the first character; the fallback for open-ended enum sets. */
export function capitalize(value: string): string {
	return value ? value[0]!.toUpperCase() + value.slice(1) : value
}

/** `32%` → `32 %`: the English sentences wrote no space. */
export const pct = (digits: string | undefined) => `${digits ?? ''} %`

/** `a`, `a og b`, `a, b og c`. */
export function nbJoin(items: readonly string[]): string {
	if (items.length <= 1) return items.join('')
	return `${items.slice(0, -1).join(', ')} og ${items.at(-1)}`
}
