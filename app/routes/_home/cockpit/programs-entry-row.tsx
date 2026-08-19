// The strength section's entry row (#477), sitting directly below the decision
// strip.
//
// The whole program module — browse, start, run, and the outcome-indexed
// progression behind it — was reachable from one small header chip, and a
// strength session that is *not* due had no way in at all. This row is the way
// in: a destination, on the page, in the reading order an athlete opens the app
// in (decide → then go somewhere).
//
// It is **not chrome**. `app/root.tsx` states that `WordmarkRow` is the only
// persistent chrome and that every destination is reached through on-page
// elements; the design handoff's bottom tab bar is scaffolding and is not built.
// This row is one on-page link on one surface, so that rule is intact.
//
// It is a **label and a destination, and nothing else**. It states no count —
// that would need a number this row does not have — and it does not explain what
// a program runs on: the handoff puts that sentence at the top of the programs
// list, one tap away, and a second copy here is a second place to change it and a
// second place for it to go stale.
import { Link } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'

export function ProgramsEntryRow() {
	return (
		<Link
			to="/training/programs"
			className="border-border/60 bg-card hover:border-border focus-visible:ring-ring flex min-h-11 items-center gap-4 rounded-xl border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
		>
			<span className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
				<Icon name="barbell" size="sm" />
			</span>
			<span className="text-foreground min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
				Strength programs
			</span>
			<Icon
				name="chevron-right"
				size="sm"
				className="text-muted-foreground shrink-0"
			/>
		</Link>
	)
}
