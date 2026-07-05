// The quiet wordmark row (#178) — the only persistent chrome. Navigation is
// embedded in page elements, so this row carries just three entries: the
// wordmark (→ home), the Inbox chip with the pending Activity Import count
// (→ Activity Inbox; always visible so uploads stay reachable — the count
// badge appears only when imports are pending), and the avatar (→ Settings).
// It renders in normal flow —
// no fixed/sticky positioning — and stays a small self-contained component so
// #184's Dashboard header (decision strip + plan-arc chip) can compose under
// it.
import { Img } from 'openimg/react'
import { Link } from 'react-router'
import { ThemeSwitch } from '#app/routes/resources/theme-switch.tsx'
import { useRevalidateOnImportEvent } from '#app/utils/imports-events.ts'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { type Theme } from '#app/utils/theme.server.ts'
import { Icon } from './ui/icon.tsx'

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
	inboxCount,
}: {
	user: WordmarkRowUser
	userPreference?: Theme | null
	/** Pending (non-promoted) Activity Imports; the count badge hides at zero. */
	inboxCount: number
}) {
	// Keep the chip's count live: revalidate loader data when a new Activity
	// Import lands for this athlete (same SSE channel the inbox itself uses).
	useRevalidateOnImportEvent()

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
					<Link
						to="/imports"
						className="border-border/60 bg-card hover:bg-muted/40 focus-visible:outline-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2"
					>
						<Icon name="inbox" size="sm" aria-hidden />
						<span>Inbox</span>
						{inboxCount > 0 ? (
							<span
								aria-label={`${inboxCount} pending`}
								className="bg-foreground text-background inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums"
							>
								{inboxCount}
							</span>
						) : null}
					</Link>
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
