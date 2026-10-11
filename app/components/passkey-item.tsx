import { Form } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { formatNbDate } from '#app/utils/format.ts'
import { MEG_PASSKEY_LABELS } from '#app/utils/labels.ts'
import { useAthleteTimezone } from '#app/utils/user.ts'

type PasskeyListItem = {
	id: string
	deviceType: string
	createdAt: Date | string
}

type PasskeyItemProps = {
	passkey: PasskeyListItem
}

/**
 * One passkey, as a row of Meg's passkeys list (round 2): what kind of key
 * and the day it was added, in Norwegian, with a quiet remove. The date is a
 * date rather than "3 days ago": a key's age is read once, to recognise it.
 */
export function PasskeyItem({ passkey }: PasskeyItemProps) {
	const timeZone = useAthleteTimezone()
	const L = MEG_PASSKEY_LABELS
	return (
		<li className="flex min-h-11 items-center justify-between gap-3 py-2">
			<div className="flex min-w-0 items-center gap-3">
				<Icon
					name="passkey"
					size="md"
					className="text-muted-foreground shrink-0"
					aria-hidden="true"
				/>
				<div className="min-w-0">
					<p className="text-callout">
						{passkey.deviceType === 'platform' ? L.device : L.securityKey}
					</p>
					<p className="text-footnote text-muted-foreground tabular-nums">
						{L.registered(formatNbDate(passkey.createdAt, timeZone))}
					</p>
				</div>
			</div>
			<Form method="POST">
				<input type="hidden" name="passkeyId" value={passkey.id} />
				<Button
					type="submit"
					name="intent"
					value="delete"
					variant="ghost"
					className="text-destructive"
				>
					<Icon name="trash" data-icon="inline-start" />
					{L.delete}
				</Button>
			</Form>
		</li>
	)
}
