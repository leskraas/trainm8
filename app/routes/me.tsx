import { redirect } from 'react-router'
import { requireUserId } from '#app/utils/auth.server.ts'
import { type Route } from './+types/me.ts'

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return redirect('/')
}
