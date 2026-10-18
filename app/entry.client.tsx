import { startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'
import { installViewMorphs } from './utils/view-morph.ts'

if (ENV.MODE === 'production' && ENV.SENTRY_DSN) {
	void import('./utils/monitoring.client.tsx').then(({ init }) => init())
}

// The start's morphs ride on React Router's View Transitions (#582).
installViewMorphs()

startTransition(() => {
	hydrateRoot(document, <HydratedRouter />)
})
