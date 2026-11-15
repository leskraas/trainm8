import { Outlet, isRouteErrorResponse, useRouteError } from 'react-router'
import { STYLES } from './__styles.ts'
import { UndoProvider } from './__undo.tsx'

export const meta = () => [{ title: 'Tommel' }]

function Head() {
	return (
		<>
			<meta
				name="viewport"
				content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
			/>
			<meta
				name="theme-color"
				media="(prefers-color-scheme: dark)"
				content="#0e0e0e"
			/>
			<meta
				name="theme-color"
				media="(prefers-color-scheme: light)"
				content="#e9e9e4"
			/>
			<meta name="color-scheme" content="dark light" />
			<style dangerouslySetInnerHTML={{ __html: STYLES }} />
		</>
	)
}

export default function TommelLayout() {
	return (
		<div className="tm">
			<Head />
			<UndoProvider>
				<Outlet />
			</UndoProvider>
		</div>
	)
}

export function ErrorBoundary() {
	const error = useRouteError()
	const message = isRouteErrorResponse(error)
		? typeof error.data === 'string'
			? error.data
			: 'Noe gikk galt hos oss.'
		: 'Noe gikk galt hos oss.'
	return (
		<div className="tm">
			<Head />
			<div className="tm-deck">
				<div className="tm-top" />
				<div className="tm-cardzone">
					<div className="tm-card" style={{ width: '100%' }}>
						<div className="tm-topic">Det gikk ikke</div>
						<h2 className="tm-q">Jeg fikk ikke hentet det jeg trengte.</h2>
						<p className="tm-reason">{message}</p>
						<div className="tm-spacer" />
						<a className="tm-wide ink" href="/lab/tommel">
							Prøv igjen
						</a>
					</div>
				</div>
				<div className="tm-stack" />
			</div>
		</div>
	)
}
