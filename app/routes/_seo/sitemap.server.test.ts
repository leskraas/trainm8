import { expect, test } from 'vitest'
import { type ServerBuild } from 'react-router'
import { generateSitemap, getSitemapXml } from './sitemap.server.ts'

const request = new Request('https://example.com/sitemap.xml')

function routesFixture(): ServerBuild['routes'] {
	// A minimal server-build routes record: a root, a static page, an index, a
	// dynamic route (excluded), a resource route (no default export, excluded),
	// and a route opting out via handle.getSitemapEntries → null.
	return {
		root: {
			id: 'root',
			parentId: undefined,
			path: '',
			index: undefined,
			caseSensitive: undefined,
			module: { default: () => null } as any,
		},
		'routes/index': {
			id: 'routes/index',
			parentId: 'root',
			path: undefined,
			index: true,
			caseSensitive: undefined,
			module: { default: () => null } as any,
		},
		'routes/about': {
			id: 'routes/about',
			parentId: 'root',
			path: 'about',
			index: undefined,
			caseSensitive: undefined,
			module: { default: () => null } as any,
		},
		'routes/users.$id': {
			id: 'routes/users.$id',
			parentId: 'root',
			path: 'users/:id',
			index: undefined,
			caseSensitive: undefined,
			module: { default: () => null } as any,
		},
		'routes/healthcheck': {
			id: 'routes/healthcheck',
			parentId: 'root',
			path: 'healthcheck',
			index: undefined,
			caseSensitive: undefined,
			module: {} as any, // resource route — no default export
		},
		'routes/login': {
			id: 'routes/login',
			parentId: 'root',
			path: 'login',
			index: undefined,
			caseSensitive: undefined,
			module: {
				default: () => null,
				handle: { getSitemapEntries: () => null },
			} as any,
		},
	}
}

test('getSitemapXml includes static routes and the index', async () => {
	const xml = await getSitemapXml(request, routesFixture(), {
		siteUrl: 'https://example.com',
	})
	expect(xml).toContain('<loc>https://example.com</loc>')
	expect(xml).toContain('<loc>https://example.com/about</loc>')
})

test('getSitemapXml excludes dynamic, resource, and opted-out routes', async () => {
	const xml = await getSitemapXml(request, routesFixture(), {
		siteUrl: 'https://example.com',
	})
	expect(xml).not.toContain('users')
	expect(xml).not.toContain('healthcheck')
	expect(xml).not.toContain('login')
})

test('generateSitemap serves valid XML with the right headers', async () => {
	const response = await generateSitemap(request, routesFixture(), {
		siteUrl: 'https://example.com',
		headers: { 'Cache-Control': 'public, max-age=300' },
	})
	expect(response.headers.get('Content-Type')).toBe('application/xml')
	expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
	const body = await response.text()
	expect(body).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/)
	expect(body).toContain(
		'<urlset',
	)
	expect(body).toContain('</urlset>')
})
