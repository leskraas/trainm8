import { LayoutGroup, motion } from 'framer-motion'
import { Link, useLocation } from 'react-router'
import { cn } from '#app/utils/misc.tsx'
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuPortal,
	DropdownMenuContent,
	DropdownMenuItem,
} from './ui/dropdown-menu.tsx'
import { Icon } from './ui/icon.tsx'

type NavIcon =
	| 'home'
	| 'barbell'
	| 'settings'
	| 'download'
	| 'calendar'
	| 'bar-chart'
	| 'dots-horizontal'

type NavItem = {
	label: string
	href: string
	icon: NavIcon
	matchPrefix: string
}

const navItems: NavItem[] = [
	{ label: 'Home', href: '/', icon: 'home', matchPrefix: '/' },
	{
		label: 'Training',
		href: '/training/upcoming',
		icon: 'barbell',
		matchPrefix: '/training/upcoming',
	},
	{
		label: 'Settings',
		href: '/settings/profile',
		icon: 'settings',
		matchPrefix: '/settings',
	},
]

const moreItems: NavItem[] = [
	{
		label: 'Imports',
		href: '/imports',
		icon: 'download',
		matchPrefix: '/imports',
	},
	{
		label: 'Events',
		href: '/training/events',
		icon: 'calendar',
		matchPrefix: '/training/events',
	},
	{
		label: 'Load',
		href: '/training/load',
		icon: 'bar-chart',
		matchPrefix: '/training/load',
	},
]

function isActive(pathname: string, item: NavItem): boolean {
	if (item.matchPrefix === '/') return pathname === '/'
	return pathname.startsWith(item.matchPrefix)
}

type PillNavUser = { id: string } | null | undefined

export function PillNav({ user }: { user: PillNavUser }) {
	const location = useLocation()

	if (!user) return null

	const moreActive = moreItems.some((item) =>
		isActive(location.pathname, item),
	)

	return (
		<nav
			aria-label="Main navigation"
			className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 sm:top-6 sm:bottom-auto"
		>
			<LayoutGroup id="pill-nav">
				<motion.div
					layout
					transition={{ type: 'spring', stiffness: 380, damping: 32 }}
					className="border-border/40 bg-background/85 flex items-center gap-1 rounded-full border p-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:ring-white/5"
				>
					{navItems.map((item) => {
						const active = isActive(location.pathname, item)
						return <PillNavItem key={item.href} item={item} active={active} />
					})}
					<PillNavMore pathname={location.pathname} active={moreActive} />
					<span className="bg-border/60 mx-1 h-6 w-px" aria-hidden />
					<PillNewButton />
				</motion.div>
			</LayoutGroup>
		</nav>
	)
}

function PillActiveHighlight() {
	return (
		<motion.span
			layoutId="pill-active"
			className="bg-foreground absolute inset-0 rounded-full shadow-sm"
			transition={{ type: 'spring', stiffness: 380, damping: 32 }}
		/>
	)
}

function PillNavItem({ item, active }: { item: NavItem; active: boolean }) {
	return (
		<motion.div
			whileHover={{ scale: 1.06 }}
			whileTap={{ scale: 0.94 }}
			transition={{ type: 'spring', stiffness: 400, damping: 25 }}
			className="relative"
		>
			<Link
				to={item.href}
				aria-current={active ? 'page' : undefined}
				className={cn(
					'relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
					'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
					active
						? 'text-background'
						: 'text-muted-foreground hover:text-foreground',
				)}
			>
				{active ? <PillActiveHighlight /> : null}
				<span className="relative z-10 inline-flex items-center gap-2">
					<Icon name={item.icon} size="sm" aria-hidden />
					<span className="hidden sm:inline">{item.label}</span>
				</span>
			</Link>
		</motion.div>
	)
}

function PillNavMore({
	pathname,
	active,
}: {
	pathname: string
	active: boolean
}) {
	return (
		<DropdownMenu>
			<motion.div
				whileHover={{ scale: 1.06 }}
				whileTap={{ scale: 0.94 }}
				transition={{ type: 'spring', stiffness: 400, damping: 25 }}
				className="relative"
			>
				<DropdownMenuTrigger
					aria-label="More"
					className={cn(
						'relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
						'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
						active
							? 'text-background'
							: 'text-muted-foreground hover:text-foreground',
					)}
				>
					{active ? <PillActiveHighlight /> : null}
					<span className="relative z-10 inline-flex items-center gap-2">
						<Icon name="dots-horizontal" size="sm" aria-hidden />
						<span className="hidden sm:inline">More</span>
					</span>
				</DropdownMenuTrigger>
			</motion.div>
			<DropdownMenuPortal>
				<DropdownMenuContent align="center" sideOffset={12}>
					{moreItems.map((item) => {
						const itemActive = isActive(pathname, item)
						return (
							<DropdownMenuItem
								key={item.href}
								render={
									<Link
										to={item.href}
										aria-current={itemActive ? 'page' : undefined}
									/>
								}
							>
								<Icon name={item.icon} className="text-body-md">
									{item.label}
								</Icon>
							</DropdownMenuItem>
						)
					})}
				</DropdownMenuContent>
			</DropdownMenuPortal>
		</DropdownMenu>
	)
}

function PillNewButton() {
	return (
		<motion.div
			whileHover={{ scale: 1.06 }}
			whileTap={{ scale: 0.94 }}
			transition={{ type: 'spring', stiffness: 400, damping: 25 }}
		>
			<Link
				to="/training/sessions/new"
				aria-label="New session"
				className={cn(
					'bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
					'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
				)}
			>
				<Icon name="plus" size="sm" aria-hidden />
				<span className="hidden sm:inline">New</span>
			</Link>
		</motion.div>
	)
}
