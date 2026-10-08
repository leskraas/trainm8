// The four tabs (spec #505 stories 56–59, ADR 0083): I dag, Sesong, Bibliotek
// and Meg. It replaces #178's "the wordmark row is the only persistent chrome".
//
// **One bar, two placements.** On a phone (ADR 0028: the phone is the primary
// target) it is a bottom tab bar, fixed to the bottom edge and padded by the
// safe-area inset so the home indicator never sits on a label. From `md` up it
// stops being fixed and sits in the wordmark row as a row of links — a bottom
// bar on a desktop is a phone pattern stretched, not a layout. It is one
// element in both, so there is only ever one "Hovedmeny" in the page.
//
// `data-tab-bar` is what `tailwind.css` keys `--tab-bar-space` off: the height
// the bar takes from the bottom of a phone screen, which anything else pinned to
// that edge (the home frame, the rest timer) subtracts. It is `0` wherever the
// bar is not drawn or not fixed, so no page carries the bar's arithmetic itself.
import { Link, useLocation } from 'react-router'
import { Icon, type IconName } from '#app/components/ui/icon.tsx'
import {
	APP_TAB_HREFS,
	APP_TABS,
	type AppTab,
	appTabFor,
} from '#app/utils/app-tabs.ts'
import { APP_TAB_LABELS, APP_TABS_NAV_LABEL } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'

const TAB_ICONS: Record<AppTab, IconName> = {
	today: 'home',
	season: 'calendar',
	library: 'books',
	me: 'user',
}

export function TabBar({ className }: { className?: string }) {
	const { pathname } = useLocation()
	const current = appTabFor(pathname)

	return (
		<nav
			aria-label={APP_TABS_NAV_LABEL}
			data-tab-bar=""
			className={cn(
				// Phone: the bottom bar.
				'bg-background/95 border-border/60 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur',
				// md+: links in the wordmark row, in normal flow.
				'md:static md:z-auto md:border-0 md:bg-transparent md:pb-0 md:backdrop-blur-none',
				className,
			)}
		>
			<ul className="mx-auto grid h-14 max-w-md grid-cols-4 md:flex md:h-auto md:max-w-none md:gap-1">
				{APP_TABS.map((tab) => {
					const active = tab === current
					return (
						<li key={tab} className="flex">
							<Link
								to={APP_TAB_HREFS[tab]}
								aria-current={active ? 'page' : undefined}
								prefetch="intent"
								className={cn(
									'focus-visible:outline-ring flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px]/[1.1] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2',
									'md:h-9 md:flex-row md:gap-1.5 md:rounded-full md:px-3 md:text-sm',
									active
										? 'text-primary md:bg-primary/10'
										: 'text-muted-foreground hover:text-foreground',
								)}
							>
								<Icon
									name={TAB_ICONS[tab]}
									size="lg"
									className="md:size-4"
									aria-hidden="true"
								/>
								{APP_TAB_LABELS[tab]}
							</Link>
						</li>
					)
				})}
			</ul>
		</nav>
	)
}
