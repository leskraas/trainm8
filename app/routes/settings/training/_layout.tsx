import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Outlet } from 'react-router'
import {
	PageHeader,
	useRoutePageHeader,
	type PageHeaderHandle,
} from '#app/components/page-header.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { type Route } from './+types/_layout.tsx'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: 'Training Settings',
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return {}
}

export default function TrainingSettingsLayout() {
	const { title, back } = useRoutePageHeader({ to: '/', label: 'Home' })

	return (
		<div className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader title={title} back={back} />
			{/* Content sits on the page background — no card wrap (#279). */}
			<main className="mt-6">
				<Outlet />
			</main>
		</div>
	)
}
