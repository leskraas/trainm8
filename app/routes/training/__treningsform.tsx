/**
 * _Bytt treningsform_, the lead's last slot (ADR 0101 §2, #581): the **Start
 * Options** again, as real weeks laid for the plan's tracks and days and the
 * athlete's level and preferences (`plan-start-options.server.ts`), with the
 * family the plan follows now marked.
 *
 * Picking one never switches by itself. _Velg denne_ posts the philosophy
 * switch's preview (`preview-philosophy`, ADR 0079 as built in #505 S7), which
 * writes nothing; the preview opens under the card that asked, and only its
 * confirm (`switch-philosophy`, with the preview's digest) switches. Both
 * carry `surface`, so the page's action answers here and not in _Avansert_.
 *
 * Closed until asked for, as _Legg til et løp_ above it is: the plan the
 * athlete has is a whole plan, and another way to train is an offer. An
 * answer — a preview, a refusal — opens it again.
 *
 * No motion of its own: the section opens with the app's collapse
 * (`motion-collapse`), and the preview is the answer to a tap that went to the
 * server, so it is there when the page is.
 */
import { useForm } from '@conform-to/react'
import { useEffect, useRef } from 'react'
import { Form, useNavigation } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { START_OPTION_LABELS, TRENINGSFORM_LABELS } from '#app/utils/labels.ts'
import { TRENINGSFORM_SURFACE } from '#app/utils/plan-outline/philosophy-schema.ts'
import { type PresetFamily } from '#app/utils/plan-outline/presets.ts'
import {
	type StartCard,
	StartOptionWeekView,
} from '../start/__start-option-card.tsx'
import {
	PhilosophyPreview,
	type PhilosophyPreviewView,
} from './__philosophy-switch.tsx'
import { CollapsibleSection } from './__plan-chrome.tsx'

type LastResult = Parameters<typeof useForm>[0]['lastResult']

/** What the lead shows of the options, every word from the labels module. */
export type TreningsformView = {
	cards: StartCard[]
	/** The family the plan follows now; its card is marked, not offered. */
	current: PresetFamily | null
	intro: string
	/** Why there are fewer than three, the level read, the family not shown. */
	notes: string[]
}

/** _Bytt treningsform_'s last answer: the preview form's, the confirm's. */
export type TreningsformReply = {
	result: LastResult
	confirmResult: LastResult
	preview: PhilosophyPreviewView | null
}

const ID = 'treningsform'

export function TreningsformOffer({
	outlineId,
	view,
	reply,
}: {
	outlineId: string
	view: TreningsformView
	reply: TreningsformReply | null
}) {
	const navigation = useNavigation()
	const asking =
		navigation.state !== 'idle' &&
		navigation.formData?.get('surface') === TRENINGSFORM_SURFACE &&
		navigation.formData.get('intent') === 'preview-philosophy'
			? String(navigation.formData.get('family') ?? '')
			: null
	// One form state for every card's _Velg denne_: a refusal of the preview
	// (the plan changed under it, no weeks left) is said once, above the cards.
	const [form] = useForm({ id: `${ID}-choose`, lastResult: reply?.result })

	// The preview lands under the card that asked: brought into view and
	// focused, so a screen reader hears that it came. Instantly, never with a
	// glide: it answers a press that may have been a key, and the round trip
	// already took its time.
	const previewRef = useRef<HTMLDivElement>(null)
	const digest = reply?.preview?.digest
	useEffect(() => {
		const node = previewRef.current
		if (!digest || !node) return
		node.focus({ preventScroll: true })
		node.scrollIntoView?.({ block: 'nearest' })
	}, [digest])

	return (
		<CollapsibleSection
			// Opened by an answer, keyed so a second answer opens it again.
			key={reply ? `answered-${digest ?? 'refused'}` : 'quiet'}
			summary={TRENINGSFORM_LABELS.open}
			detail={TRENINGSFORM_LABELS.detail}
			defaultOpen={reply != null}
			className="w-full text-left"
			contentClassName="pt-2"
		>
			<div className="space-y-4" data-treningsform>
				<p className="text-footnote text-muted-foreground">{view.intro}</p>
				{view.notes.map((note) => (
					<p key={note} className="text-footnote text-muted-foreground">
						{note}
					</p>
				))}
				{form.errors ? (
					<div role="alert">
						<ErrorList
							id={form.errorId}
							errors={form.errors as string[] | undefined}
						/>
					</div>
				) : null}

				<ul aria-label={START_OPTION_LABELS.rail} className="space-y-3">
					{view.cards.map((card) => {
						const isCurrent = card.family === view.current
						const preview =
							reply?.preview && reply.preview.to === card.family
								? reply.preview
								: null
						const nameId = `${ID}-${card.family}-name`
						return (
							<li
								key={card.family}
								aria-labelledby={nameId}
								data-treningsform-option={card.family}
								data-current={isCurrent ? '' : undefined}
								// `relative` keeps a row's screen-reader text inside the
								// card, never widening the page (the #566 rail's lesson).
								className="bg-muted/50 relative flex flex-col gap-3 rounded-3xl p-4"
							>
								<div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
									{isCurrent ? (
										<Badge data-treningsform-current>
											{TRENINGSFORM_LABELS.current}
										</Badge>
									) : card.badge ? (
										<Badge variant="secondary">{card.badge}</Badge>
									) : null}
									<span className="text-footnote text-muted-foreground">
										{card.familyName}
									</span>
								</div>
								<div className="space-y-1">
									<h3
										id={nameId}
										className="text-callout font-semibold text-balance"
									>
										{card.name}
									</h3>
									<p className="text-footnote text-muted-foreground">
										{card.why}
									</p>
								</div>

								<StartOptionWeekView card={card} />

								{isCurrent ? (
									<p className="text-footnote text-muted-foreground">
										{TRENINGSFORM_LABELS.currentNote}
									</p>
								) : preview ? null : (
									// Asked already: the preview below is the answer, and its
									// confirm the one action left on this card.
									<Form
										method="POST"
										preventScrollReset
										aria-describedby={form.errors ? form.errorId : undefined}
									>
										<input
											type="hidden"
											name="intent"
											value="preview-philosophy"
										/>
										<input type="hidden" name="outlineId" value={outlineId} />
										<input type="hidden" name="family" value={card.family} />
										<input
											type="hidden"
											name="surface"
											value={TRENINGSFORM_SURFACE}
										/>
										<StatusButton
											type="submit"
											variant="outline"
											aria-label={card.chooseLabel}
											className="text-callout w-full"
											status={asking === card.family ? 'pending' : 'idle'}
											disabled={asking != null}
										>
											{START_OPTION_LABELS.choose}
										</StatusButton>
									</Form>
								)}

								{preview ? (
									<div
										ref={previewRef}
										tabIndex={-1}
										className="scroll-mt-4 outline-none"
									>
										<PhilosophyPreview
											outlineId={outlineId}
											preview={preview}
											lastResult={reply?.confirmResult}
											surface={TRENINGSFORM_SURFACE}
											confirmLabel={TRENINGSFORM_LABELS.switchTo(card.name)}
											idPrefix={ID}
										/>
									</div>
								) : null}
							</li>
						)
					})}
				</ul>
			</div>
		</CollapsibleSection>
	)
}
