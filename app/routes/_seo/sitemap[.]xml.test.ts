import { type AppLoadContext, type ServerBuild } from 'react-router'
import { expect, test } from 'vitest'
import { BASE_URL } from '#tests/utils.ts'
import { loader } from './sitemap[.]xml.ts'

const ROUTE_PATH = '/sitemap.xml'

// getDomainUrl falls back to `http://` + the request URL's host when no
// forwarding headers are present, so that's the site URL the sitemap emits.
const SITE_URL = `http://${new URL(BASE_URL).host}`

/**
 * A minimal server-build route manifest shaped like the real
 * `virtual:react-router/server-build` one the express server passes in via
 * `getLoadContext` (see `server/app.ts`): public static routes, an index
 * route, a dynamic route, an opted-out route, and a resource route.
 */
const routes = {
	root: {
		id: 'root',
		path: '',
		module: { default: () => null },
	},
	'routes/_home/index': {
		id: 'routes/_home/index',
		parentId: 'root',
		index: true,
		module: { default: () => null },
	},
	'routes/_auth/login': {
		id: 'routes/_auth/login',
		parentId: 'root',
		path: 'login',
		module: { default: () => null },
	},
	// Opted out of the sitemap via the SEO handle (like the settings routes).
	'routes/settings/profile': {
		id: 'routes/settings/profile',
		parentId: 'root',
		path: 'settings/profile',
		module: { default: () => null, handle: { getSitemapEntries: () => null } },
	},
	// Dynamic routes can't be enumerated, so they're excluded.
	'routes/users.$username': {
		id: 'routes/users.$username',
		parentId: 'root',
		path: 'users/:username',
		module: { default: () => null },
	},
	// Resource routes (no default export) are excluded.
	'routes/_seo/sitemap[.]xml': {
		id: 'routes/_seo/sitemap[.]xml',
		parentId: 'root',
		path: 'sitemap.xml',
		module: {},
	},
} as unknown as ServerBuild['routes']

const context = { serverBuild: { routes } } as AppLoadContext

test('serves the sitemap as cacheable XML built from the server build routes', async () => {
	const request = new Request(new URL(ROUTE_PATH, BASE_URL).toString())
	const response = await loader({
		request,
		params: {},
		context,
		unstable_pattern: ROUTE_PATH,
	})

	expect(response.status).toBe(200)
	expect(response.headers.get('content-type')).toBe('application/xml')
	expect(response.headers.get('cache-control')).toBe(
		`public, max-age=${60 * 5}`,
	)

	const xml = await response.text()
	expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
	expect(xml).toContain('<urlset')
	// Public static routes are listed against the request's domain…
	expect(xml).toContain(`<loc>${SITE_URL}</loc>`)
	expect(xml).toContain(`<loc>${SITE_URL}/login</loc>`)
	// …while opted-out, dynamic, and resource routes are not.
	expect(xml).not.toContain('settings/profile')
	expect(xml).not.toContain('users/')
	expect(xml).not.toContain('sitemap.xml</loc>')
})
