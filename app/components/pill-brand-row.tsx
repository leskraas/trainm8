import { Link } from 'react-router'
import { ThemeSwitch } from '#app/routes/resources/theme-switch.tsx'
import { type Theme } from '#app/utils/theme.server.ts'

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

	const initial = (user.name ?? user.username ?? '?')[0]?.toUpperCase() ?? '?'

	return (
		<div className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 py-3">
			<Link to="/" className="leading-snug font-bold">
				Trainm8
			</Link>
			<div className="flex items-center gap-2">
				<ThemeSwitch userPreference={userPreference} />
				<Link
					to="/settings/profile"
					aria-label="Profile settings"
					className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-ring flex size-8 items-center justify-center rounded-full text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
				>
					{initial}
				</Link>
			</div>
		</div>
	)
}
