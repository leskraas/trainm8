/**
 * **Juster** on the today card (spec #558 S5, ADR 0100 §7): three chips right
 * above _Gjort_ — _For sliten i dag_, _Lite tid_, _Bytt dag_ — each changing
 * only today's session with one tap.
 *
 * One conform form on the resource route's one zod union; each chip is a
 * submit button naming its intent. The change lands as every write on I dag
 * does (ADR 0088): a toast that says what it did, with _Angre_ posting the
 * reply's token back (`useLandingWatch`), and the row it landed on tinted —
 * the card itself, or the week's row on the day _Bytt dag_ moved it to. A
 * chip that cannot act says why, under the chips, instead of doing nothing.
 *
 * The row ends with #579's _Bytt økt_ (Bibliotek as a picker; its pick goes
 * out through this same form and lands the same way) and _Avansert_ (the
 * power tools), `__bytt-okt.tsx`. The chips sit in one row that scrolls
 * sideways on a narrow phone rather than wrapping, so no chip ever moves
 * _Gjort_ under the thumb. Motion is the system's press only.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import { type action as sessionAdjustAction } from '#app/routes/resources/session-adjust.tsx'
import {
	JUSTER_INTENTS,
	SESSION_ADJUST_ACTION,
	type SwapSource,
} from '#app/utils/juster.ts'
import { JUSTER_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { AvansertChip, ByttOktChip, CHIP } from './__bytt-okt.tsx'
import {
	type LandedWrite,
	useLandingWatch,
} from './timeline/composer-context.tsx'

type JusterReply = ReturnType<
	typeof useFetcher<typeof sessionAdjustAction>
>['data']

export function JusterChips({
	sessionId,
	title,
	discipline,
	sessionTo,
	todayKey,
}: {
	sessionId: string
	/** The session's title, for the chips' names and the toast. */
	title: string
	/** Today's sport: _Bytt økt_'s Catalogue lists it first. */
	discipline: string
	/** The session's own page, for _Avansert_. */
	sessionTo: string
	todayKey: string
}) {
	// One fetcher key per mounted card, so the reply is read where the landing
	// lives after a _Bytt dag_ has taken the card's session away.
	const [fetcherKey] = useState(
		() => `juster-${Math.random().toString(36).slice(2)}`,
	)
	const watch = useLandingWatch()
	const fetcher = useFetcher<typeof sessionAdjustAction>({ key: fetcherKey })
	const [form, fields] = useForm({
		id: `juster-${sessionId}`,
		lastResult: fetcher.state === 'idle' ? fetcher.data?.submission : null,
		defaultValue: { sessionId },
	})
	const formProps = getFormProps(form)
	const busy = fetcher.state !== 'idle'
	const pressed = busy ? fetcher.formData?.get('intent') : null
	const errorId = `${form.id}-reason`
	const reason = busy ? null : (form.errors?.[0] ?? null)
	const startWatch = () => {
		watch?.({
			fetcherKey,
			toWrite: (reply) => justerLanding(reply as JusterReply, sessionId),
		})
	}
	return (
		<fetcher.Form
			method="post"
			action={SESSION_ADJUST_ACTION}
			{...formProps}
			onSubmit={(event) => {
				formProps.onSubmit(event)
				if (event.defaultPrevented) return
				startWatch()
			}}
			className="flex min-w-0 flex-col gap-1.5"
		>
			<input {...getInputProps(fields.sessionId, { type: 'hidden' })} />
			<div
				role="group"
				aria-label={JUSTER_LABELS.group}
				aria-describedby={reason ? errorId : undefined}
				data-juster
				// Bleeds to the card's edge so a chip scrolled off reads as more,
				// not as cut; the row never pulls the page sideways.
				className="-mx-5 flex gap-2 overflow-x-auto overscroll-x-contain px-5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{JUSTER_INTENTS.map((intent) => {
					const label = JUSTER_LABELS.chip[intent]
					return (
						<button
							key={intent}
							type="submit"
							name="intent"
							value={intent}
							data-juster-chip={intent}
							disabled={busy}
							aria-busy={pressed === intent || undefined}
							aria-label={JUSTER_LABELS.chipFor(label, title)}
							className={cn(
								CHIP,
								// The tapped chip stays as it is while its change goes out;
								// the others step back, so a second tap has nowhere to land.
								pressed === intent && 'disabled:opacity-100',
							)}
						>
							{label}
						</button>
					)
				})}
				<ByttOktChip
					title={title}
					discipline={discipline}
					disabled={busy}
					onPick={(from: SwapSource, pickId: string) => {
						startWatch()
						void fetcher.submit(
							{ intent: 'swap', sessionId, from, pickId },
							{ method: 'post', action: SESSION_ADJUST_ACTION },
						)
					}}
				/>
				<AvansertChip title={title} sessionTo={sessionTo} todayKey={todayKey} />
			</div>
			<p
				id={errorId}
				aria-live="polite"
				data-juster-reason
				className={cn(
					'text-footnote text-muted-foreground [text-wrap:pretty]',
					reason ? null : 'sr-only',
				)}
			>
				{reason}
			</p>
		</fetcher.Form>
	)
}

/** A Juster's reply as its landing: today's session, wherever it is now. */
function justerLanding(
	reply: JusterReply,
	sessionId: string,
): LandedWrite | null {
	const result = reply?.result
	if (!result?.ok) return null
	return {
		sessionId,
		line: result.toast,
		title: result.title || undefined,
		undo: {
			action: SESSION_ADJUST_ACTION,
			post: { intent: 'undo', adjustmentId: result.undo.adjustmentId },
		},
	}
}
