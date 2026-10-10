// The single "+ Ny" creation menu (#178), in I dag's Norwegian (ADR 0081). With
// the pill nav gone, everything the athlete creates lives behind this one
// control — on I dag's top line (ADR 0086), as a compact pill.
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

/**
 * `onWrite` adds the **writing line**'s way in (#505 story 40) — I dag's own
 * item, first, because it is the one that never leaves the list.
 */
export function CreateMenu({
	onWrite,
	compact = false,
}: {
	onWrite?: () => void
	/**
	 * Icon only — I dag's top line, where the plan's goal needs the width. The
	 * control keeps its name (`Lag ny`), so nothing that finds it by name moves.
	 */
	compact?: boolean
} = {}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				// The shared Button's press (`pressable`, ADR 0085) — a trigger that
				// owns a popup keeps its colours and skips the scale. A pill, as the
				// top line's other controls are.
				render={
					compact ? (
						<Button variant="default" size="icon-sm" className="rounded-full" />
					) : (
						<Button
							variant="default"
							size="sm"
							className="rounded-full pl-2.5"
						/>
					)
				}
				aria-label={CREATE_MENU_LABELS.name}
			>
				<Icon name="plus" size="sm" aria-hidden />
				{compact ? null : CREATE_MENU_LABELS.trigger}
			</DropdownMenuTrigger>
			<DropdownMenuPortal>
				<DropdownMenuContent align="end" sideOffset={8}>
					{onWrite ? (
						<DropdownMenuItem onClick={onWrite}>
							<Icon name="pencil-1" className="text-body-md">
								{CREATE_MENU_LABELS.write}
							</Icon>
						</DropdownMenuItem>
					) : null}
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
