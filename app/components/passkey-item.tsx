import { formatDistanceToNow } from 'date-fns'
import { Form } from 'react-router'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'

type PasskeyListItem = {
	id: string
	deviceType: string
	createdAt: Date | string
}

type PasskeyItemProps = {
	passkey: PasskeyListItem
}

export function PasskeyItem({ passkey }: PasskeyItemProps) {
	return (
		<li>
			<Card>
				<CardContent className="flex items-center justify-between gap-4">
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-2">
							<Icon name="lock-closed" />
							<span className="font-semibold">
								{passkey.deviceType === 'platform' ? 'Device' : 'Security Key'}
							</span>
						</div>
						<div className="text-muted-foreground text-sm">
							Registered {formatDistanceToNow(new Date(passkey.createdAt))} ago
						</div>
					</div>
					<Form method="POST">
						<input type="hidden" name="passkeyId" value={passkey.id} />
						<Button type="submit" name="intent" value="delete" variant="destructive" size="sm">
							<Icon name="trash" data-icon="inline-start" />
							Delete
						</Button>
					</Form>
				</CardContent>
			</Card>
		</li>
	)
}
