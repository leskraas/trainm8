import { Outlet, useOutletContext } from 'react-router'
import { Sheet } from '../__overlay.tsx'

/** Oppslag: one sheet, its tabs switch the content inside it. */
export default function OppslagLayout() {
	const ctx = useOutletContext<{ today: string } | undefined>()
	const today = ctx?.today ?? new Date().toISOString().slice(0, 10)
	return (
		<Sheet today={today}>
			<Outlet context={ctx} />
		</Sheet>
	)
}
