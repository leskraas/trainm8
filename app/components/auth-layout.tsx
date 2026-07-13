import { type ReactNode } from 'react'

/**
 * Shared shell for the auth entry screens (login, signup, verify, forgot/reset
 * password, onboarding). Auth flows are top-level surfaces (ui-conventions
 * §3.3): no back affordance, page-title rules at the narrow tier (§1.2/§1.3).
 * Owning the wrapper here keeps every auth screen on the same spacing ladder
 * (§1.4) instead of drifting per file.
 */
export function AuthLayout({
	title,
	subtitle,
	children,
}: {
	title: ReactNode
	subtitle?: ReactNode
	children: ReactNode
}) {
	return (
		<div className="container flex min-h-full flex-col justify-center py-8">
			<div className="mx-auto w-full max-w-md space-y-8">
				<div className="space-y-2 text-center">
					<h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
					{subtitle ? (
						<p className="text-muted-foreground text-balance">{subtitle}</p>
					) : null}
				</div>
				{children}
			</div>
		</div>
	)
}
