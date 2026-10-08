// The single "+ Ny" creation menu (#178), in I dag's Norwegian (ADR 0081). With the pill nav gone, everything
// the athlete creates lives behind this one control — currently rendered in
// the Dashboard header, next to where #184's decision strip will land.
import { Link } from 'react-router'
import { CREATE_MENU_LABELS } from '#app/utils/labels.ts'
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
	{
		label: CREATE_MENU_LABELS.session,
		href: '/training/sessions/new',
		icon: 'barbell',
	},
	{
		label: CREATE_MENU_LABELS.event,
		href: '/training/events/new',
		icon: 'calendar',
	},
	// Authoring a season is a creation act like the other two, and it is the only
	// producer of a Plan Outline now that Plan Generation is retired (ADR 0039).
	{
		label: CREATE_MENU_LABELS.plan,
		href: '/training/plan/new',
		icon: 'bar-chart',
	},
]

export function CreateMenu() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				// `transition-none`, because this control lives on the home timeline
				// and nowhere else, and the timeline declares four animations in CSS
				// (#502, ADR 0077 §2).
				// The shared Button's `transition-all` is the app's default for every
				// other surface; here it would be a fifth animation nobody chose, on
				// a built-in curve, over `all`.
				render={
					<Button variant="default" size="sm" className="transition-none" />
				}
				aria-label={CREATE_MENU_LABELS.name}
			>
				<Icon name="plus" size="sm" aria-hidden />
				{CREATE_MENU_LABELS.trigger}
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
