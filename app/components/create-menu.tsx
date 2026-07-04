// The single "+ New" creation menu (#178). With the pill nav gone, everything
// the athlete creates lives behind this one control — currently rendered in
// the Dashboard header, next to where #184's decision strip will land.
import { Link } from 'react-router'
import { Button } from './ui/button.tsx'
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuPortal,
	DropdownMenuContent,
	DropdownMenuItem,
} from './ui/dropdown-menu.tsx'
import { Icon, type IconName } from './ui/icon.tsx'

const createItems: { label: string; href: string; icon: IconName }[] = [
	{ label: 'New session', href: '/training/sessions/new', icon: 'barbell' },
	{ label: 'Generate plan', href: '/training/plan/new', icon: 'bar-chart' },
	{ label: 'New event', href: '/training/events/new', icon: 'calendar' },
]

export function CreateMenu() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<Button variant="default" size="sm" />}
				aria-label="Create"
			>
				<Icon name="plus" size="sm" aria-hidden />
				New
			</DropdownMenuTrigger>
			<DropdownMenuPortal>
				<DropdownMenuContent align="end" sideOffset={8}>
					{createItems.map((item) => (
						<DropdownMenuItem key={item.href} render={<Link to={item.href} />}>
							<Icon name={item.icon} className="text-body-md">
								{item.label}
							</Icon>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenuPortal>
		</DropdownMenu>
	)
}
