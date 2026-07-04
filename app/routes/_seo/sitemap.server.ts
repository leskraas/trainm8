/**
 * Sitemap generation for the React Router server build.
 *
 * Adapted from `@nasa-gcn/remix-seo` (MIT), whose `generateSitemap` is typed
 * against `@remix-run/server-runtime`'s `ServerBuild` — a leftover dependency
 * from before the React Router migration that forced a `@ts-expect-error` in
 * the sitemap route (#183). This port types the same logic against
 * `react-router`'s own `ServerBuild`, so the route typechecks cleanly and the
 * runtime dependency could be dropped. Route modules keep opting in/out via
 * the same `SEOHandle` (`handle.getSitemapEntries`).
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { type ServerBuild } from 'react-router'

type SitemapEntry = NonNullable<
	Awaited<ReturnType<NonNullable<SEOHandle['getSitemapEntries']>>>
>[number]

type SitemapOptions = {
	siteUrl: string
	headers?: HeadersInit
}

function removeTrailingSlash(s: string) {
	return s.endsWith('/') ? s.slice(0, -1) : s
}

function getEntryXml({ route, lastmod, changefreq, priority = 0.7 }: NonNullable<SitemapEntry>, siteUrl: string) {
	return `
  <url>
    <loc>${siteUrl}${route}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    ${changefreq ? `<changefreq>${changefreq}</changefreq>` : ''}
    ${typeof priority === 'number' ? `<priority>${priority}</priority>` : ''}
  </url>
    `.trim()
}

export async function getSitemapXml(
	request: Request,
	routes: ServerBuild['routes'],
	options: Pick<SitemapOptions, 'siteUrl'>,
) {
	const { siteUrl } = options

	const rawSitemapEntries = (
		await Promise.all(
			Object.entries(routes).map(async ([id, route]) => {
				if (id === 'root') return
				if (!route) return
				const mod = route.module

				const handle = mod.handle as SEOHandle | undefined
				if (handle?.getSitemapEntries) {
					return handle.getSitemapEntries(request)
				}

				// exclude resource routes from the sitemap
				// (these are an opt-in via the getSitemapEntries method)
				if (!('default' in mod)) return

				let path
				if (route.path) {
					path = removeTrailingSlash(route.path)
				} else if (route.index) {
					path = ''
				} else {
					return
				}

				let parentId = route.parentId
				let parent = parentId ? routes[parentId] : null
				while (parent) {
					// the root path is '/', so it messes things up if we add another '/'
					const parentPath = parent.path
						? removeTrailingSlash(parent.path)
						: ''
					path = `${parentPath}/${path}`
					parentId = parent.parentId
					parent = parentId ? routes[parentId] : null
				}

				// we can't handle dynamic routes without a getSitemapEntries handle
				if (path.includes(':')) return

				return [{ route: removeTrailingSlash(path) }]
			}),
		)
	)
		.flatMap((entries) => entries)
		.filter((entry): entry is NonNullable<SitemapEntry> => Boolean(entry))

	const sitemapEntries: Array<NonNullable<SitemapEntry>> = []
	for (const entry of rawSitemapEntries) {
		const existing = sitemapEntries.find((e) => e.route === entry.route)
		if (!existing) sitemapEntries.push(entry)
	}

	return `
<?xml version="1.0" encoding="UTF-8"?>
<urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml"
    xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0"
    xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
    xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"
    xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  >
    ${sitemapEntries.map((entry) => getEntryXml(entry, siteUrl)).join('')}
  </urlset>
    `.trim()
}

export async function generateSitemap(
	request: Request,
	routes: ServerBuild['routes'],
	options: SitemapOptions,
) {
	const { siteUrl, headers } = options
	const sitemap = await getSitemapXml(request, routes, { siteUrl })
	const bytes = new TextEncoder().encode(sitemap).byteLength

	return new Response(sitemap, {
		headers: {
			...headers,
			'Content-Type': 'application/xml',
			'Content-Length': String(bytes),
		},
	})
}
