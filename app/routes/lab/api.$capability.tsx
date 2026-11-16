import { data } from 'react-router'
import {
	type CapabilityName,
	isCapabilityName,
	listCapabilities,
	runCapability,
} from '#app/lab/engine/registry.server.ts'
import { type Route } from './+types/api.$capability.ts'

/**
 * The Lab Engine over HTTP (ADR 0125), for Lab Apps calling from the browser.
 *
 * - `GET /lab/api/<read>?input=<json>` runs a read capability.
 * - `POST /lab/api/<name>` runs any capability. The body is JSON, or form
 *   data with an `input` field holding JSON, or (for file uploads) multipart
 *   form data the capability reads from the request itself.
 *
 * Answers `{ ok: true, value }` or `{ ok: false, code, message }` (422 when a
 * capability fails). Every answer is the athlete's own data, so none is
 * stored by the browser or anything in between.
 */
const NO_STORE = { 'Cache-Control': 'private, no-store' }

function capabilityOf(name: string | undefined): CapabilityName {
	if (!name || !isCapabilityName(name)) {
		throw data(
			{ ok: false, code: 'unknown', message: 'Ukjent handling.' },
			{ status: 404, headers: NO_STORE },
		)
	}
	return name
}

function parseJson(raw: string | null): unknown {
	if (raw == null || raw === '') return {}
	try {
		return JSON.parse(raw)
	} catch {
		return undefined
	}
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const name = capabilityOf(params.capability)
	const cap = listCapabilities().find((c) => c.name === name)
	if (cap?.kind !== 'read') {
		throw data(
			{ ok: false, code: 'method', message: 'Bruk POST.' },
			{ status: 405, headers: NO_STORE },
		)
	}
	const input = parseJson(new URL(request.url).searchParams.get('input'))
	const result = await runCapability(request, name, input as never)
	return Response.json(result, {
		status: result.ok ? 200 : 422,
		headers: NO_STORE,
	})
}

export async function action({ request, params }: Route.ActionArgs) {
	const name = capabilityOf(params.capability)
	const type = request.headers.get('content-type') ?? ''
	let input: unknown = {}
	if (type.includes('application/json')) {
		input = await request.json().catch(() => undefined)
	} else if (type.includes('application/x-www-form-urlencoded')) {
		const form = await request.formData()
		input = parseJson(form.get('input') as string | null)
	}
	// multipart: the capability reads the request body itself.
	const result = await runCapability(request, name, input as never)
	return Response.json(result, {
		status: result.ok ? 200 : 422,
		headers: NO_STORE,
	})
}
