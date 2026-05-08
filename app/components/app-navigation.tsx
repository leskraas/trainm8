import { Link, useLocation } from 'react-router'
import { cn } from '#app/utils/misc.tsx'
import { Icon } from './ui/icon.tsx'

type NavItem = {
	label: string
	href: string
	icon: 'home' | 'barbell' | 'settings'
	matchPrefix: string
}

const navItems: NavItem[] = [
	{ label: 'Home', href: '/', icon: 'home', matchPrefix: '/' },
	{
		label: 'Training',
		href: '/training/upcoming',
		icon: 'barbell',
		matchPrefix: '/training',
	},
	{
		label: 'Settings',
		href: '/settings/profile',
		icon: 'settings',
		matchPrefix: '/settings',
	},
]

function isActive(pathname: string, item: NavItem): boolean {
	if (item.matchPrefix === '/') {
		return pathname === '/'
	}
	return pathname.startsWith(item.matchPrefix)
}

type AppNavigationUser = { id: string } | null | undefined

export function AppNavigation({ user }: { user: AppNavigationUser }) {
	const location = useLocation()

	if (!user) return null

	return (
		<>
			<nav
				aria-label="Top navigation"
				className="border-border bg-background hidden border-b sm:block"
			>
				<div className="container flex h-14 items-center gap-6">
					{navItems.map((item) => {
						const active = isActive(location.pathname, item)
						return (
							<Link
								key={item.href}
								to={item.href}
								aria-current={active ? 'page' : undefined}
								className={cn(
									'inline-flex items-center gap-2 px-2 py-1 text-sm font-medium transition-colors',
									'focus-visible:outline-ring rounded-md focus-visible:outline-2 focus-visible:outline-offset-2',
									active
										? 'text-foreground'
										: 'text-muted-foreground hover:text-foreground',
								)}
							>
								<Icon name={item.icon} size="md" />
								{item.label}
							</Link>
						)
					})}
				</div>
			</nav>

			<nav
				aria-label="Bottom tab bar"
				className="border-border bg-background fixed inset-x-0 bottom-0 z-50 border-t sm:hidden"
			>
				<div className="flex h-16 items-center justify-around">
					{navItems.map((item) => {
						const active = isActive(location.pathname, item)
						return (
							<Link
								key={item.href}
								to={item.href}
								aria-current={active ? 'page' : undefined}
								className={cn(
									'flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium transition-colors',
									'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
									active
										? 'text-foreground'
										: 'text-muted-foreground hover:text-foreground',
								)}
							>
								<Icon name={item.icon} size="lg" />
								{item.label}
							</Link>
						)
					})}
				</div>
			</nav>
		</>
	)
}
