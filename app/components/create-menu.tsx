// I dag's one creation control (owner decision 6, round 2; ADR 0088). What
// was the "+ Ny" menu (#178) — Skriv en økt, Ny økt, Nytt løp, Ny plan — is a
// single _Ny økt_ that opens the session composer on today: two items wrote a
// session two ways, and a race and a plan are made where they are read, in
// Sesong (the plan page's and the events list's own links).
import { SESSION_COMPOSER_LABELS } from '#app/utils/labels.ts'
import { Button } from './ui/button.tsx'
import { Icon } from './ui/icon.tsx'

/**
 * A pill on I dag's top line. On a phone it is the plus alone, so the goal
 * beside it keeps the width; it is still named _Ny økt_. From `sm` the word
 * shows.
 */
export function NewSessionButton({ onClick }: { onClick: () => void }) {
	return (
		<Button
			type="button"
			size="sm"
			data-new-session
			onClick={onClick}
			aria-label={SESSION_COMPOSER_LABELS.newSession}
			className="flex-none rounded-full max-sm:w-8 max-sm:px-0 sm:pl-2.5"
		>
			<Icon name="plus" size="sm" aria-hidden />
			<span className="max-sm:sr-only">
				{SESSION_COMPOSER_LABELS.newSession}
			</span>
		</Button>
	)
}
