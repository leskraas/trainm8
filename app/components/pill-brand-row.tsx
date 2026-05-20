import { Link } from 'react-router'
import { ThemeSwitch } from '#app/routes/resources/theme-switch.tsx'
import { cn } from '#app/utils/misc.tsx'
import { type Theme } from '#app/utils/theme.server.ts'
import { UserDropdown } from './user-dropdown.tsx'

type PillBrandRowUser =
	| {
			id: string
			name: string | null
			username: string
	  }
	| null
	| undefined

export function PillBrandRow({
	user,
	userPreference,
}: {
	user: PillBrandRowUser
	userPreference?: Theme | null
}) {
	if (!user) return null

	return (
		<div
			className={cn(
				// Mobile: solid top bar with brand left, theme + avatar right.
				'border-border/40 bg-background/70 fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b px-4 py-3 backdrop-blur-md',
				// Desktop: align with the pill at top-6, transparent chrome so
				// brand + pill + avatar read as a single horizontal row.
				'sm:top-6 sm:border-0 sm:bg-transparent sm:px-6 sm:py-0 sm:backdrop-blur-none',
			)}
		>
			<Link to="/" className="leading-snug font-bold">
				Trainm8
			</Link>
			<div className="flex items-center gap-2">
				<ThemeSwitch userPreference={userPreference} />
				<UserDropdown />
			</div>
		</div>
	)
}
