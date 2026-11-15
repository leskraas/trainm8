import { type CapabilityResult } from '#app/lab/engine/define.ts'

export const BASE = '/lab/tommel'

/**
 * Calls a capability over the contract's HTTP door (`POST /lab/api/<name>`).
 * Flows ask many different capabilities in a row, so one plain function fits
 * better than a hook per name. Loaders are revalidated by the deck when a
 * flow ends.
 */
const READS = new Set([
	'athlete',
	'today',
	'week',
	'plan',
	'session',
	'sessions',
	'progress',
	'proposals',
	'zones',
	'exercises',
	'exercise',
	'recordings',
	'get_setup',
	'start_options',
	'plan_preview',
	'goal',
	'connections',
	'import_status',
	'thresholds',
	'export_data',
	'link_options',
	'strength_session',
	'plates_for',
	'search_places',
])

/** Counts writes, so a deck knows when there is no going back. */
export const writes = { count: 0 }

export async function cap<O>(
	name: string,
	input: unknown = {},
): Promise<CapabilityResult<O>> {
	if (!READS.has(name)) writes.count++
	try {
		const res = await fetch(`/lab/api/${name}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(input ?? {}),
		})
		return (await res.json()) as CapabilityResult<O>
	} catch {
		return {
			ok: false,
			code: 'network',
			message: 'Fikk ikke kontakt. Prøv igjen.',
		}
	}
}

/** A failed write inside a flow: the deck shows `message` on an error card. */
export class FlowError extends Error {
	code: string
	constructor(message: string, code = 'error') {
		super(message)
		this.code = code
	}
}

/** The value, or a FlowError the deck turns into an error card. */
export async function must<O>(name: string, input: unknown = {}): Promise<O> {
	const r = await cap<O>(name, input)
	if (!r.ok) throw new FlowError(r.message, r.code)
	return r.value
}

export async function upload<O>(
	name: string,
	form: FormData,
): Promise<CapabilityResult<O>> {
	try {
		writes.count++
		const res = await fetch(`/lab/api/${name}`, { method: 'POST', body: form })
		return (await res.json()) as CapabilityResult<O>
	} catch {
		return {
			ok: false,
			code: 'network',
			message: 'Fikk ikke kontakt. Prøv igjen.',
		}
	}
}

// ── per-device memory: what was seen, asked, dismissed ────────────────────

const SEEN_KEY = 'tommel:seen'

function readSeen(): Record<string, string> {
	try {
		return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<
			string,
			string
		>
	} catch {
		return {}
	}
}

export function wasSeen(key: string): boolean {
	return key in readSeen()
}

export function seenAt(key: string): string | null {
	return readSeen()[key] ?? null
}

export function markSeen(key: string) {
	try {
		const all = readSeen()
		all[key] = new Date().toISOString()
		const entries = Object.entries(all)
			.sort((a, b) => b[1].localeCompare(a[1]))
			.slice(0, 300)
		localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(entries)))
	} catch {
		// Private mode: cards may come back. That is fine.
	}
}
