import { PRIVACY_NOTICE_LABELS as L } from '#app/utils/labels.ts'

/**
 * The Art. 13 privacy notice (#549, ADR 0105). Every word lives in
 * `labels.ts` (ADR 0081 §2); this route only lays it out as a plain,
 * readable document. A DRAFT until legal review.
 */
export const meta = () => [{ title: `${L.title} | Trainm8` }]

export default function PrivacyRoute() {
	return (
		// `lang="nb"`: the shell is English, and a screen reader must switch to
		// Norwegian for the legal text (ADR 0105 amends ADR 0081 §4).
		<main lang="nb" className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
			{/* Red border and tint mark the caution; the text stays `foreground`,
			    because `destructive` on the tint is 3.7:1 in light (AA needs 4.5). */}
			<p
				role="note"
				className="border-destructive/40 bg-destructive/10 text-foreground mb-8 rounded-lg border px-4 py-3 text-sm font-medium text-pretty"
			>
				{L.draft}
			</p>
			{/* One 19-letter word: with larger text on a 320px phone it is wider than
			    the column, so it hyphenates (Norwegian, from `lang`) or breaks. */}
			<h1 className="text-foreground text-3xl font-semibold tracking-tight text-balance break-words hyphens-auto">
				{L.title}
			</h1>
			<p className="text-muted-foreground mt-2 text-sm">{L.updated}</p>
			<p className="text-foreground mt-6 text-base leading-relaxed text-pretty">
				{L.intro}
			</p>
			{L.sections.map((section) => (
				<section key={section.heading} className="mt-10">
					<h2 className="text-foreground text-xl font-semibold tracking-tight">
						{section.heading}
					</h2>
					<div className="mt-3 space-y-3">
						{section.body.map((line) => (
							<p
								key={line}
								className="text-foreground/90 text-base leading-relaxed text-pretty break-words"
							>
								{line}
							</p>
						))}
					</div>
				</section>
			))}
		</main>
	)
}
