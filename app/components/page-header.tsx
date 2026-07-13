/**
 * The compact page header for non-top-level screens (mobile UI standard,
 * #282): a back button + the screen title, replacing breadcrumb trails,
 * "← Home" links, and floating Cancel links. The back target is always an
 * explicit parent route — never history — so deep links and refreshes get
 * the same, predictable affordance.
 */
import { type ReactNode } from 'react'
import { Link, useMatches } from 'react-router'
import { z } from 'zod'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { cn } from '#app/utils/misc.tsx'

export type PageHeaderBack = {
	/** Explicit parent route the back button navigates to. */
	to: string
	/** The parent screen's name, read out as "Back to {label}". */
	label: string
}

export function PageHeader({
	title,
	back,
	actions,
	className,
}: {
	title: string
	back: PageHeaderBack
	/** Optional action pinned to the right of the title row. */
	actions?: ReactNode
	className?: string
}) {
	return (
		<header className={cn('flex items-center gap-2', className)}>
			<Link
				to={back.to}
				aria-label={`Back to ${back.label}`}
				className={cn(
					buttonVariants({ variant: 'ghost', size: 'icon' }),
					// ~44px effective touch target on a 32px control (#280).
					'relative -ml-2 shrink-0 after:absolute after:-inset-1.5',
				)}
			>
				<Icon name="arrow-left" size="md" />
			</Link>
			<h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
			{actions ? (
				<div className="flex shrink-0 items-center gap-2">{actions}</div>
			) : null}
		</header>
	)
}

/**
 * Route-handle convention for layouts that host the header: a route exports
 * `handle.pageHeader` with its screen title, and the layout derives both the
 * title (deepest matched `pageHeader`) and the back target (the `pageHeader`
 * route above it, or `rootBack` when the layout's own page is the leaf).
 */
export const PageHeaderHandle = z.object({ pageHeader: z.string() })
export type PageHeaderHandle = z.infer<typeof PageHeaderHandle>

const PageHeaderHandleMatch = z.object({ handle: PageHeaderHandle })

export function useRoutePageHeader(rootBack: PageHeaderBack): {
	title: string
	back: PageHeaderBack
} {
	const matches = useMatches()
	const crumbs = matches.flatMap((match) => {
		const result = PageHeaderHandleMatch.safeParse(match)
		return result.success
			? [{ title: result.data.handle.pageHeader, pathname: match.pathname }]
			: []
	})
	const current = crumbs.at(-1)
	const parent = crumbs.at(-2)
	return {
		title: current?.title ?? '',
		back: parent ? { to: parent.pathname, label: parent.title } : rootBack,
	}
}
