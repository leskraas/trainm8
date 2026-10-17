/**
 * **Styrkeøkter i uka** — the athlete's **Strength Frequency** answer (#574,
 * ADR 0103): the 1, 2 or 3 strength sessions a week they tapped when they
 * picked _styrke_ in the First Run, changed here. It is their own answer and
 * the app never guesses it, so an athlete who never answered sees that they
 * have not, and one tap answers.
 *
 * It changes the answer, not a plan already made: that plan's lifting days
 * stay as they are and move in _Plan_, and the page says so.
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useState } from 'react'
import { data, useFetcher } from 'react-router'
import { z } from 'zod/v3'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	SegmentedControl,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import { updateAthleteProfile } from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	STRENGTH_PER_WEEK_CHOICES,
	type StrengthPerWeek,
} from '#app/utils/first-run/start-draft.ts'
import { StrengthPerWeekSchema } from '#app/utils/first-run/start-schema.ts'
import { MEG_STRENGTH_LABELS, SIMPLE_START_LABELS } from '#app/utils/labels.ts'
import { MegFormErrors, MegNote } from '../__meg-ui.tsx'
import { type Route } from './+types/styrke.ts'

const L = MEG_STRENGTH_LABELS

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: L.title,
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { strengthPerWeek: true },
	})
	return { strengthPerWeek: profile?.strengthPerWeek ?? null }
}

const StrengthAnswerSchema = z.object({ strength: StrengthPerWeekSchema })

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const parsed = StrengthAnswerSchema.safeParse(
		Object.fromEntries(await request.formData()),
	)
	if (!parsed.success) {
		return data({ ok: false as const, error: L.invalid }, { status: 400 })
	}
	await updateAthleteProfile(userId, { strengthPerWeek: parsed.data.strength })
	return { ok: true as const, error: null }
}

export default function StrengthFrequencySettings({
	loaderData,
}: Route.ComponentProps) {
	const fetcher = useFetcher<typeof action>()
	const stored = loaderData.strengthPerWeek
	const [value, setValue] = useState<StrengthPerWeek | null>(
		STRENGTH_PER_WEEK_CHOICES.find((count) => count === stored) ?? null,
	)
	const saved =
		fetcher.state === 'idle' && fetcher.data?.ok === true && value === stored
	return (
		<fetcher.Form method="POST" className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<p className="text-body">{L.intro}</p>
				<MegNote>{stored == null ? L.unanswered : L.answered(stored)}</MegNote>
			</div>
			<div className="space-y-2">
				<p className="text-callout" id="meg-strength-legend">
					{SIMPLE_START_LABELS.strength.legend}
				</p>
				<SegmentedControl
					value={value == null ? '' : String(value)}
					onValueChange={(next) => {
						const picked = STRENGTH_PER_WEEK_CHOICES.find(
							(count) => String(count) === next,
						)
						if (picked) setValue(picked)
					}}
					aria-labelledby="meg-strength-legend"
					className="w-full"
				>
					{STRENGTH_PER_WEEK_CHOICES.map((count) => (
						<ToggleGroupItem
							key={count}
							value={String(count)}
							aria-label={SIMPLE_START_LABELS.strength.choiceLabel(count)}
							className="text-callout h-11 flex-1 tabular-nums"
						>
							{count}
						</ToggleGroupItem>
					))}
				</SegmentedControl>
				{value != null ? (
					<input type="hidden" name="strength" value={value} />
				) : null}
				<MegNote>{L.planNote}</MegNote>
			</div>
			<MegFormErrors
				errors={fetcher.data?.error ? [fetcher.data.error] : undefined}
			/>
			<StatusButton
				type="submit"
				className="text-callout w-full sm:w-auto sm:self-start"
				disabled={value == null || value === stored}
				status={
					fetcher.state !== 'idle' ? 'pending' : saved ? 'success' : 'idle'
				}
			>
				{L.save}
			</StatusButton>
		</fetcher.Form>
	)
}
