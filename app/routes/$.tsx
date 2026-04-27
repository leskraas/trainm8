// This is called a "splat route" and as it's in the root `/app/routes/`
// directory, it's a catchall. If no other routes match, this one will and we
// can know that the user is hitting a URL that doesn't exist. By throwing a
// 404 from the loader, we can force the error boundary to render which will
// ensure the user gets the right status code and we can display a nicer error
// message for them than the Remix and/or browser default.

import { data, Link, useLoaderData, useLocation } from 'react-router'
import { Icon } from '#app/components/ui/icon.tsx'

export function loader({ request }: { request: Request }) {
	return data(
		{ pathname: new URL(request.url).pathname },
		{ status: 404, statusText: 'Not found' },
	)
}

export function action() {
	throw new Response('Not found', { status: 404 })
}

export default function NotFound() {
	const data = useLoaderData<typeof loader>()
	return <NotFoundContent pathname={data.pathname} />
}

export function ErrorBoundary() {
	const location = useLocation()
	return <NotFoundContent pathname={location.pathname} />
}

function NotFoundContent({ pathname }: { pathname: string }) {
	return (
		<div className="text-h2 container flex items-center justify-center p-20">
			<div className="flex flex-col gap-6">
				<div className="flex flex-col gap-3">
					<h1>We can't find this page:</h1>
					<pre className="text-body-lg break-all whitespace-pre-wrap">
						{pathname}
					</pre>
				</div>
				<Link to="/" className="text-body-md underline">
					<Icon name="arrow-left">Back to home</Icon>
				</Link>
			</div>
		</div>
	)
}
