import { type ShouldRevalidateFunctionArgs, useLoaderData } from 'react-router'
import { type Route } from './+types/_layout.ts'
import { PRAT_CSS } from './__css.ts'
import { loadLayout } from './__loader.server.ts'
import { Shell } from './__shell.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: 'Prat' },
	{
		name: 'theme-color',
		media: '(prefers-color-scheme: light)',
		content: '#ffffff',
	},
	{
		name: 'theme-color',
		media: '(prefers-color-scheme: dark)',
		content: '#0b0d10',
	},
]

export async function loader({ request }: Route.LoaderArgs) {
	return loadLayout(request)
}

/** Only the thread's own data decides when the thread reloads. */
export function shouldRevalidate({
	currentUrl,
	nextUrl,
	formMethod,
	defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
	if (formMethod && formMethod !== 'GET') return true
	if (currentUrl.search !== nextUrl.search) return true
	if (currentUrl.pathname !== nextUrl.pathname) return false
	return defaultShouldRevalidate
}

export default function PratLayout() {
	const data = useLoaderData<typeof loader>()
	return (
		<div className="prat">
			<style dangerouslySetInnerHTML={{ __html: PRAT_CSS }} />
			<Shell data={data} />
		</div>
	)
}
