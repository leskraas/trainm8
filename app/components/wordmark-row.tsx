// The quiet wordmark row (#178): the wordmark (→ home) and the theme switch. It
// renders in normal flow — no fixed/sticky positioning — and stays a small
// self-contained component.
//
// It also hosts the four tabs (ADR 0083). On a phone the `TabBar` pins itself
// to the bottom edge, so this row reads as it always did; from `md` up the
// tabs sit here, between the wordmark and the theme switch. The avatar that
// used to link to Settings is gone with that: Meg is where the account lives
// now, and two ways to the same place in one row is one too many.
//
// The Inbox chip is gone with the Activity Inbox itself (ADR 0049): imports
// auto-save straight onto The Tape, so there is no pending count to badge.
import { Link } from 'react-router'
import { TabBar } from '#app/components/tab-bar.tsx'
import { ThemeSwitch } from '#app/routes/resources/theme-switch.tsx'
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
			<div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
				<Link to="/" className="leading-snug font-bold">
					Trainm8
				</Link>
				<TabBar />
				<ThemeSwitch userPreference={userPreference} />
			</div>
		</header>
	)
}
