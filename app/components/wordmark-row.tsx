// The quiet wordmark row (#178) — the only persistent chrome. Navigation is
// embedded in page elements, so this row carries just the wordmark (→ home),
// the theme switch, and the avatar (→ Settings). The Inbox chip is gone with
// the Activity Inbox itself (ADR 0049): imports auto-save straight onto The
// Tape, so there is no pending count to badge and nothing to work through.
// It renders in normal flow —
// no fixed/sticky positioning — and stays a small self-contained component so
// #184's Dashboard header (decision strip + plan-arc chip) can compose under
// it.
import { Img } from 'openimg/react'
import { Link } from 'react-router'
import { ThemeSwitch } from '#app/routes/resources/theme-switch.tsx'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { type Theme } from '#app/utils/theme.server.ts'

type WordmarkRowUser =
	| {
			id: string
			name: string | null
			username: string
			image?: { objectKey: string } | null
	  }
	| null
	| undefined

export function WordmarkRow({
	user,
	userPreference,
}: {
	user: WordmarkRowUser
	userPreference?: Theme | null
}) {
	if (!user) return null

	return (
		<header className="border-border/40 border-b">
			<nav
				aria-label="Primary"
				className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3"
			>
				<Link to="/" className="leading-snug font-bold">
					Trainm8
				</Link>
				<div className="flex items-center gap-2">
					<ThemeSwitch userPreference={userPreference} />
					<Link
						to="/settings/profile"
						aria-label="Settings"
						className="focus-visible:outline-ring rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
					>
						<Img
							className="size-8 rounded-full object-cover"
							alt=""
							src={getUserImgSrc(user.image?.objectKey)}
							width={256}
							height={256}
							aria-hidden="true"
						/>
					</Link>
				</div>
			</nav>
		</header>
	)
}
