import sys

stanza, bars = sys.argv[1], sys.argv[2]

s = open(stanza).read()


def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:80], s.count(old))
    s = s.replace(old, new)


rep(""" * tabular numerals; the intensity chip is the line's only chip-shaped
 * element (§7.2); notes are italic, quoted, ellipsized. Repeat parentheses""", """ * tabular numerals; the intensity chip is the line's only chip-shaped
 * element (§7.2); notes are italic and quoted, and wrap rather than being cut
 * with "…" (#505 story 32: the full text, never a half-read sentence; they
 * were cut at 11 characters on a phone). Repeat parentheses""")
rep("""						<span
							aria-hidden
							className="text-muted-foreground/50 select-none"
							data-stanza-grip
						>""", """						<span
							aria-hidden
							className="text-muted-foreground select-none"
							data-stanza-grip
						>""")
rep("""							<span aria-hidden className="text-muted-foreground/60">
								{NOTATION_SEPARATORS.step}
							</span>""", """							<span aria-hidden className="text-muted-foreground">
								{NOTATION_SEPARATORS.step}
							</span>""")
rep("""/**
 * One step as an unbreakable unit (§2.2, B2): the step's tokens never orphan
 * a mark onto its own line — under 640 px the unit may wrap, but only at
 * token boundaries (each token keeps `whitespace-nowrap` on its own text).
 */""", """/**
 * One step as an unbreakable unit (§2.2, B2): the step's tokens never orphan
 * a mark onto its own line — under 640 px the unit may wrap, but only at
 * token boundaries (each token keeps `whitespace-nowrap` on its own text).
 * A note is the one token that wraps inside itself, so the unit is held to
 * the line's width (`max-w-full`) and the note may shrink into it.
 */""")
rep("""			className="inline-flex items-baseline gap-x-1 whitespace-nowrap max-sm:flex-wrap max-sm:whitespace-normal\"""", """			className="inline-flex max-w-full items-baseline gap-x-1 whitespace-nowrap max-sm:flex-wrap max-sm:whitespace-normal\"""")
rep("""					<span key={index} className="inline-flex items-baseline gap-x-1">
						<span aria-hidden className="text-muted-foreground/60">
							{NOTATION_SEPARATORS.facet}
						</span>""", """					<span key={index} className="inline-flex items-baseline gap-x-1">
						<span aria-hidden className="text-muted-foreground">
							{NOTATION_SEPARATORS.facet}
						</span>""")
rep("""		<span aria-hidden className="text-muted-foreground/60">
			{children}
		</span>""", """		<span aria-hidden className="text-muted-foreground">
			{children}
		</span>""")
rep("""				<span
					data-token-type="notes"
					className="text-muted-foreground inline-block max-w-[22ch] truncate align-bottom italic max-sm:max-w-[11ch]"
				>""", """				<span
					data-token-type="notes"
					className="text-muted-foreground min-w-0 whitespace-normal italic [overflow-wrap:anywhere]"
				>""")
open(stanza, 'w').write(s)

s = open(bars).read()
rep("""const ZONE_COLOR: Record<TrainingZone, string> = {
	1: 'bg-sky-400 dark:bg-sky-500',
	2: 'bg-emerald-400 dark:bg-emerald-500',
	3: 'bg-amber-400 dark:bg-amber-500',
	4: 'bg-orange-500',
	5: 'bg-rose-500 dark:bg-rose-600',
}""", """/**
 * The zone hues are the app's `zone-1…5` tokens (#505 round 2), the same five
 * the Workout Shape strip and the sentence's intensity chip paint with. The
 * bars had their own Tailwind palette ramp (sky → rose), so a planned zone 2
 * was one green in the strip and another here, on the same card.
 */
const ZONE_COLOR: Record<TrainingZone, string> = {
	1: 'bg-zone-1',
	2: 'bg-zone-2',
	3: 'bg-zone-3',
	4: 'bg-zone-4',
	5: 'bg-zone-5',
}""")
rep("""		return <span className="text-muted-foreground/60 text-xs">—</span>""", """		return <span className="text-muted-foreground text-xs">—</span>""")
rep("""						<span className="text-muted-foreground/80 text-[9px] leading-none font-medium">""", """						<span className="text-muted-foreground text-[9px] leading-none font-medium tabular-nums">""")
open(bars, 'w').write(s)
