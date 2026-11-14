/**
 * **The provenance slot** — one component, one wording, three surfaces (ADR
 * 0121 §4): the Catalogue card, the Plan Preview's row panel and the session
 * page. It words a `SessionProvenance` itself, from `labels.ts`, so the same
 * Catalogue row cannot read differently on any of them (#475).
 *
 * One position, four contents: a **Citation** on a corpus row, the convention or
 * hand-written notice on the two uncited kinds, and an **Attribution** with
 * trainm8's non-vouch on a community row. A Citation and an Attribution are
 * different branches of one union, so the slot cannot show both (ADR 0051 §4,
 * ADR 0052 §3).
 *
 * Line 1: `[Endret av deg · ]` + the sentence + `[ · publisert]` (community) +
 * `[ · locator]` (corpus, a link where it resolves to one) + `[ · Fjernet av en
 * moderator]` (community taken down). Line 2: the non-vouch, on a community row
 * only. Line 3: the Catalogue's "adapted from", where a caller passes one.
 */
import { type ComponentProps } from 'react'
import { formatCitation, type Citation } from '#app/utils/catalogue.ts'
import { formatNbDate } from '#app/utils/format.ts'
import { CATALOGUE_LABELS, NB_PROVENANCE_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type SessionProvenance } from '#app/utils/plan-generation/provenance.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'

/** The slot's first line, in Norwegian (`provenanceSentence`'s twin). */
export function nbProvenanceSentence(provenance: SessionProvenance): string {
	switch (provenance.kind) {
		case 'corpus':
			return NB_PROVENANCE_LABELS.source(formatCitation(provenance.citation))
		case 'convention':
			return NB_PROVENANCE_LABELS.convention
		case 'hand-written':
			return NB_PROVENANCE_LABELS.handWritten
		case 'community':
			return provenance.attribution
				? NB_PROVENANCE_LABELS.publishedBy(provenance.attribution.displayName)
				: NB_PROVENANCE_LABELS.unnamedPublisher
		case 'unsourced':
			return NB_PROVENANCE_LABELS.unsourced
	}
}

/** trainm8's non-vouch, on the one kind that needs it (ADR 0052 §3). */
export function nbProvenanceNonVouch(
	provenance: SessionProvenance,
): string | null {
	return provenance.kind === 'community' ? NB_PROVENANCE_LABELS.nonVouch : null
}

/**
 * Where a Citation's locator points, or `null` where it names no address (an
 * ISBN). `doi:` resolves through doi.org; a web address is its own link.
 */
export function locatorHref(locator: string): string | null {
	const doi = /^doi:\s*(.+)$/i.exec(locator.trim())
	if (doi) return `https://doi.org/${doi[1]}`
	if (/^https?:\/\//i.test(locator.trim())) return locator.trim()
	return null
}

function Sep() {
	return <span aria-hidden> · </span>
}

export function ProvenanceSlot({
	provenance,
	adopted = false,
	takenDown = false,
	adaptedFrom = null,
	className,
	...props
}: {
	provenance: SessionProvenance
	/** The athlete changed the session after it was placed (`adoptedAt`). */
	adopted?: boolean
	/** A moderator took the community row down. */
	takenDown?: boolean
	/** The Catalogue's "adapted from" on a Shared Workout (ADR 0052 §4). */
	adaptedFrom?: Citation | null
} & ComponentProps<'div'>) {
	const timeZone = useAthleteTimezone()
	const nonVouch = nbProvenanceNonVouch(provenance)
	const publishedAt =
		provenance.kind === 'community'
			? (provenance.attribution?.publishedAt ?? null)
			: null
	const locator =
		provenance.kind === 'corpus' ? provenance.citation.locator : null
	const href = locator ? locatorHref(locator) : null
	return (
		<div
			className={cn(
				'text-footnote text-muted-foreground space-y-1 [overflow-wrap:anywhere]',
				className,
			)}
			{...props}
		>
			<p>
				{adopted ? (
					<>
						<span data-adopted>{NB_PROVENANCE_LABELS.adopted}</span>
						<Sep />
					</>
				) : null}
				{nbProvenanceSentence(provenance)}
				{publishedAt ? (
					<>
						<Sep />
						<span className="whitespace-nowrap">
							{formatNbDate(publishedAt, timeZone)}
						</span>
					</>
				) : null}
				{locator ? (
					<>
						<Sep />
						{href ? (
							<a
								href={href}
								target="_blank"
								rel="noreferrer noopener"
								// A footnote-high link: an invisible hit area brings it to
								// 44px (ui-conventions §2.2).
								className="hover:text-foreground relative underline underline-offset-2 after:absolute after:inset-x-0 after:-inset-y-3.5"
							>
								{locator}
							</a>
						) : (
							locator
						)}
					</>
				) : null}
				{provenance.kind === 'community' && takenDown ? (
					<>
						<Sep />
						<span data-taken-down>
							{CATALOGUE_LABELS.publishState['taken-down']}
						</span>
					</>
				) : null}
			</p>
			{/* The non-vouch, in the slot a Citation would occupy. It is trainm8's
			    statement about itself, identical on every community row, which is
			    why it is a constant and not a column. */}
			{nonVouch ? <p data-non-vouch>{nonVouch}</p> : null}
			{adaptedFrom ? (
				<p>{CATALOGUE_LABELS.adaptedFrom(formatCitation(adaptedFrom))}</p>
			) : null}
		</div>
	)
}
