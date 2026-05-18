import { LayoutGroup, motion } from 'framer-motion'
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
	if (item.matchPrefix === '/') return pathname === '/'
	return pathname.startsWith(item.matchPrefix)
}

type PillNavUser = { id: string } | null | undefined

export function PillNav({ user }: { user: PillNavUser }) {
	const location = useLocation()

	if (!user) return null

	return (
		<nav
			aria-label="Main navigation"
			className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 sm:bottom-auto sm:top-6"
		>
			<LayoutGroup>
				<div className="bg-background/80 ring-border/50 flex items-center gap-0.5 rounded-full px-1.5 py-1.5 shadow-lg backdrop-blur-md ring-1">
					{navItems.map((item) => {
						const active = isActive(location.pathname, item)
						return (
							<Link
								key={item.href}
								to={item.href}
								aria-current={active ? 'page' : undefined}
								className={cn(
									'relative flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors',
									'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
									active
										? 'text-foreground'
										: 'text-muted-foreground hover:text-foreground',
								)}
							>
								{active && (
									<motion.span
										layoutId="pill-active"
										className="bg-muted absolute inset-0 rounded-full"
										style={{ zIndex: -1 }}
									/>
								)}
								<Icon name={item.icon} size="sm" aria-hidden />
								<span className="hidden sm:inline">{item.label}</span>
							</Link>
						)
					})}
					<Link
						to="/training/sessions/new"
						aria-label="New session"
						className={cn(
							'bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors',
							'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
						)}
					>
						<Icon name="plus" size="sm" aria-hidden />
						<span className="hidden sm:inline">New</span>
					</Link>
				</div>
			</LayoutGroup>
		</nav>
	)
}
