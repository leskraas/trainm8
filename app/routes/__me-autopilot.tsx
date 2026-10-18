/**
 * The Autopilot setting in Meg (#576, ADR 0100 §1 and §6): two choices —
 * _Autopilot_, the app lays out each week by itself, or _Spør meg først_, it
 * proposes in Ukeskiftet and waits for a yes. A tap saves at once with its own
 * fetcher (no save button: one choice, nothing to confirm), and the line under
 * the choices says it applies from the next close — it never touches a week
 * already written.
 *
 * The choice shows what was tapped while the post is in flight, and falls
 * back to what is stored if the post fails, said in the status line.
 */
import { useFetcher } from 'react-router'
import {
	FieldDescription,
	FieldLegend,
	FieldSet,
} from '#app/components/ui/field.tsx'
import { RadioGroup } from '#app/components/ui/radio-group.tsx'
import { type action as autopilotAction } from '#app/routes/resources/autopilot.tsx'
import { AUTOPILOT_SETTING_LABELS as L } from '#app/utils/labels.ts'
import {
	AUTOPILOT_ACTION,
	AUTOPILOT_MODES,
	type AutopilotMode,
} from '#app/utils/load/autopilot-schema.ts'
import { MeSectionHeading } from './__me-form-records.tsx'
import { ChoiceCard } from './training/__plan-new-parts.tsx'

function isMode(value: unknown): value is AutopilotMode {
	return AUTOPILOT_MODES.includes(value as AutopilotMode)
}

export function AutopilotSetting({ autopilot }: { autopilot: boolean }) {
	const fetcher = useFetcher<typeof autopilotAction>()
	const stored: AutopilotMode = autopilot ? 'autopilot' : 'ask'
	const posting = fetcher.formData?.get('mode')
	const mode = isMode(posting) ? posting : stored
	const failed = fetcher.state === 'idle' && fetcher.data?.ok === false
	const status =
		fetcher.state !== 'idle'
			? L.saving
			: failed
				? L.failed
				: fetcher.data?.ok
					? `${L.saved} ${L.fromNextClose}`
					: L.fromNextClose

	return (
		<section aria-labelledby="me-autopilot" className="mt-8">
			<MeSectionHeading id="me-autopilot">{L.title}</MeSectionHeading>
			<FieldSet className="gap-2">
				<FieldLegend className="sr-only">{L.legend}</FieldLegend>
				<RadioGroup
					name="mode"
					value={mode}
					onValueChange={(next) => {
						if (!isMode(next) || next === mode) return
						void fetcher.submit(
							{ intent: 'mode', mode: next },
							{ method: 'POST', action: AUTOPILOT_ACTION },
						)
					}}
					className="gap-2"
				>
					<ChoiceCard
						value="autopilot"
						title={L.autopilot}
						detail={L.autopilotDetail}
					/>
					<ChoiceCard value="ask" title={L.ask} detail={L.askDetail} />
				</RadioGroup>
				<FieldDescription
					data-autopilot-status
					aria-live="polite"
					className={
						failed
							? 'text-footnote text-destructive'
							: 'text-footnote text-muted-foreground'
					}
				>
					{status}
				</FieldDescription>
			</FieldSet>
		</section>
	)
}
