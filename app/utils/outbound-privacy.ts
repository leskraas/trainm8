/**
 * What error and performance monitoring may not keep about the open lookups
 * the server calls (ADR 0115 §2): Kartverket's query is the athlete's search
 * text, which is never logged, and MET's is the rounded Home Place. The
 * monitoring's own fetch instrumentation records each outgoing URL with its
 * query (breadcrumbs and `http.client` spans), so the query is cut from both
 * before anything leaves the server. The call itself (host, path, status,
 * timing) is kept.
 */

/** The hosts whose query carries an athlete's search text or point. */
export const PRIVATE_QUERY_HOSTS: readonly string[] = [
	'ws.geonorge.no',
	'api.met.no',
]

const QUERY_KEYS = ['http.query', 'url.query', 'http.fragment', 'url.fragment']

type Data = Record<string, unknown>

function privateHost(value: unknown): boolean {
	if (typeof value !== 'string') return false
	if (PRIVATE_QUERY_HOSTS.includes(value)) return true
	try {
		return PRIVATE_QUERY_HOSTS.includes(new URL(value).host)
	} catch {
		return false
	}
}

/** `text` with the query and fragment cut from every URL to a private host. */
function withoutQuery(text: string): string {
	return text.replace(/https?:\/\/[^\s?#]+[?#]\S*/g, (url) => {
		const bare = url.replace(/[?#].*$/, '')
		return privateHost(bare) ? bare : url
	})
}

function scrubData<T extends Data | undefined>(data: T): T {
	if (!data || !Object.values(data).some(privateHost)) return data
	const scrubbed: Data = {}
	for (const [key, value] of Object.entries(data)) {
		if (QUERY_KEYS.includes(key)) continue
		scrubbed[key] = typeof value === 'string' ? withoutQuery(value) : value
	}
	return scrubbed as T
}

/** For `beforeBreadcrumb`: a fetch or http breadcrumb without the query. */
export function scrubBreadcrumb<T extends { data?: Data }>(breadcrumb: T): T {
	const data = scrubData(breadcrumb.data)
	return data === breadcrumb.data ? breadcrumb : { ...breadcrumb, data }
}

/** For `beforeSendSpan`: an outgoing span without the query. */
export function scrubSpan<T extends { description?: string; data?: Data }>(
	span: T,
): T {
	const data = scrubData(span.data)
	const description =
		span.description == null ? span.description : withoutQuery(span.description)
	if (data === span.data && description === span.description) return span
	return { ...span, data, description }
}
