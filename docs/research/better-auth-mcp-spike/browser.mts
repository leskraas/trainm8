// PROTOTYPE, wipe me (#552). A headless user: follows the authorize redirects
// with a cookie jar, signs in (password, or an Epic session for the bridge),
// clicks Allow, and stops at the client's redirect_uri.
//
// It uses node:http(s), not fetch(): undici always sends `sec-fetch-mode: cors`,
// and Better Auth then answers JSON instead of the 302 a browser navigation gets.
export class Jar {
	cookies = new Map<string, string>()
	take(res: Response) {
		for (const c of res.headers.getSetCookie()) {
			const [pair] = c.split(';')
			const i = pair.indexOf('=')
			if (/max-age=0/i.test(c) || i === pair.length - 1)
				this.cookies.delete(pair.slice(0, i))
			else this.cookies.set(pair.slice(0, i), pair.slice(i + 1))
		}
	}
	header() {
		return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
	}
}

type Step = { method: string; url: string; status: number; location?: string }

export async function userAgentAuthorize(
	authorizationUrl: string,
	opts: {
		redirectUri: string
		login: 'password' | 'epic'
		jar?: Jar
		accept?: boolean
	},
) {
	const jar = opts.jar ?? new Jar()
	const trace: Step[] = []
	let url = authorizationUrl
	let method = 'GET'
	let body: string | undefined
	for (let i = 0; i < 20; i++) {
		const target = new URL(url)
		const redirect = new URL(opts.redirectUri)
		if (
			target.origin === redirect.origin &&
			target.pathname === redirect.pathname
		) {
			return { callbackUrl: target, trace, jar }
		}
		const res = await navigate(url, method, body, {
			cookie: jar.header(),
			accept: 'text/html',
			'sec-fetch-mode': 'navigate',
			...(body
				? {
						'content-type': 'application/x-www-form-urlencoded',
						origin: target.origin,
					}
				: {}),
		})
		jar.take(res)
		const location = res.headers.get('location') ?? undefined
		trace.push({
			method,
			url: url.replace(/\?.*/, '?…'),
			status: res.status,
			location: location?.replace(/\?.*/, '?…'),
		})
		body = undefined
		method = 'GET'
		if (location) {
			url = new URL(location, url).toString()
		} else if (
			res.status === 200 &&
			target.pathname === '/login' &&
			opts.login === 'epic'
		) {
			url = new URL(
				`/epic-login?u=${process.env.EPIC_USER ?? 'athlete'}&next=${encodeURIComponent(target.pathname + target.search)}`,
				url,
			).toString()
		} else if (res.status === 200 && target.pathname === '/login') {
			method = 'POST'
			body = new URLSearchParams({
				email: 'athlete@example.com',
				password: process.env.SPIKE_PASSWORD ?? 'spike-password-1',
			}).toString()
		} else if (res.status === 200 && target.pathname === '/consent') {
			method = 'POST'
			body = new URLSearchParams({
				accept: String(opts.accept ?? true),
			}).toString()
		} else {
			throw new Error(
				`stuck at ${url}: ${res.status} ${(await res.text()).slice(0, 300)}`,
			)
		}
	}
	throw new Error('too many redirects')
}

async function navigate(
	url: string,
	method: string,
	body: string | undefined,
	headers: Record<string, string>,
) {
	const { request } = await import(
		url.startsWith('https:') ? 'node:https' : 'node:http'
	)
	return new Promise<Response>((resolve, reject) => {
		const req = request(url, { method, headers }, (res: any) => {
			const chunks: Buffer[] = []
			res.on('data', (c: Buffer) => chunks.push(c))
			res.on('end', () => {
				const h = new Headers()
				for (const [k, v] of Object.entries(res.headers))
					for (const x of [v].flat()) h.append(k, String(x))
				resolve(
					new Response(res.statusCode === 204 ? null : Buffer.concat(chunks), {
						status: res.statusCode,
						headers: h,
					}),
				)
			})
		})
		req.on('error', reject)
		if (body) req.write(body)
		req.end()
	})
}

export function decodeJwt(token: string) {
	const [h, p] = token.split('.')
	return {
		header: JSON.parse(Buffer.from(h, 'base64url').toString()),
		payload: JSON.parse(Buffer.from(p, 'base64url').toString()),
	}
}
