import { Profile } from '@garmin/fitsdk'

/**
 * The FIT `file_id` message as the SDK decodes it: enums arrive as their
 * Profile names (`'garmin'`, `'activity'`) or, for a value the SDK has no name
 * for, as the raw number.
 */
export type FitFileId = {
	type?: string | number | null
	manufacturer?: string | number | null
	product?: number | null
	serialNumber?: number | null
	timeCreated?: Date | null
}

/** The FIT `file` enum's value for an activity file. */
const FIT_FILE_TYPE_ACTIVITY = 4

/**
 * The canonical identity of an original FIT activity file (ADR 0096 §1):
 * `fit:<manufacturer>:<product|->:<serial_number|->:<time_created>`, with
 * `time_created` in Unix seconds UTC and `-` for a missing optional field.
 * Null when the file is not an activity, or `manufacturer` or `time_created`
 * is missing. This is the one function every path computes it with, so the
 * same file always writes the same string.
 *
 * The manufacturer is written as its FIT number, not the SDK's name for it:
 * a manufacturer the SDK does not know yet decodes as a number and would gain
 * a name on an SDK upgrade, and the key must not change when that happens.
 * The FIT spec promises no uniqueness, so the key is strong, not certain.
 */
export function fitFileKey(
	fileId: FitFileId | null | undefined,
): string | null {
	if (!fileId) return null
	if (enumNumber('file', fileId.type) !== FIT_FILE_TYPE_ACTIVITY) return null

	const manufacturer = enumNumber('manufacturer', fileId.manufacturer)
	const created = fileId.timeCreated
	if (manufacturer == null || !(created instanceof Date)) return null
	const createdSec = Math.floor(created.getTime() / 1000)
	if (!Number.isFinite(createdSec)) return null

	return [
		'fit',
		manufacturer,
		wholeOrDash(fileId.product),
		wholeOrDash(fileId.serialNumber),
		createdSec,
	].join(':')
}

function wholeOrDash(value: number | null | undefined): string {
	return typeof value === 'number' && Number.isFinite(value)
		? String(value)
		: '-'
}

/** A Profile enum value back to its FIT number (names come from the SDK). */
function enumNumber(
	enumName: 'file' | 'manufacturer',
	value: string | number | null | undefined,
): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null
	if (typeof value !== 'string') return null
	const table = (Profile.types as Record<string, Record<string, string>>)[
		enumName
	]
	const entry = Object.entries(table ?? {}).find(([, name]) => name === value)
	return entry ? Number(entry[0]) : null
}
