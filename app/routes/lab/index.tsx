import { Form } from 'react-router'
import { getChosenVariant } from '#app/lab/variant.server.ts'
import { LAB_VARIANTS } from '#app/lab/variants.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { type Route } from './+types/index.ts'

export const meta: Route.MetaFunction = () => [{ title: 'App-lab · Trainm8' }]

export async function loader({ request }: Route.LoaderArgs) {
	await requireUserId(request)
	return { chosen: await getChosenVariant(request) }
}

/**
 * The App Lab's front door (ADR 0125): every app side by side, what each one
 * bets on, and one tap to live in it.
 */
export default function LabIndex({ loaderData }: Route.ComponentProps) {
	return (
		<main className="min-h-dvh bg-[#0b0b0c] px-4 pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] pb-16 text-white sm:px-8">
			<div className="mx-auto max-w-5xl">
				<p className="text-[12px] font-semibold tracking-[0.18em] text-white/45 uppercase">
					Trainm8 · App-lab
				</p>
				<h1 className="mt-3 max-w-3xl text-[clamp(2.4rem,7vw,5rem)] leading-[0.95] font-black tracking-[-0.03em]">
					Fem helt nye apper og den gamle. Bo i én om gangen.
				</h1>
				<p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-white/65">
					Hver app er en hel brukerreise med egen logikk, eget språk og eget
					utseende, over de samme treningsdataene dine. Velg en, bruk den noen
					dager, og bytt med bryteren øverst til høyre. Det du savner og det som
					irriterer deg er svaret.
				</p>
				<Form
					method="post"
					action="/resources/lab-app"
					className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
				>
					{LAB_VARIANTS.map((v, i) => {
						const chosen = v.key === loaderData.chosen
						return (
							<button
								key={v.key}
								type="submit"
								name="app"
								value={v.key}
								className="group relative flex min-h-56 touch-manipulation flex-col overflow-hidden rounded-[28px] p-5 text-left ring-1 ring-white/10 transition-transform duration-200 ease-out active:scale-[0.98] motion-reduce:transition-none"
								style={{
									background: `radial-gradient(120% 90% at 100% 0%, ${v.swatch}55, transparent 60%), #151517`,
								}}
							>
								<span className="flex items-center gap-2 pr-14">
									<span className="font-mono text-[12px] text-white/45">
										{String(i).padStart(2, '0')}
									</span>
									{chosen ? (
										<span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-black">
											Valgt
										</span>
									) : null}
								</span>
								<span className="mt-auto block text-[30px] leading-none font-black tracking-[-0.02em]">
									{v.name}
								</span>
								<span className="mt-2 block text-[15px] leading-snug font-semibold text-white/85">
									{v.idea}
								</span>
								<span className="mt-2 block text-[13px] leading-snug text-white/55">
									{v.bet}
								</span>
								<span className="mt-4 grid gap-1 border-t border-white/10 pt-3 text-[12px] leading-snug">
									<span className="font-mono text-white/45">
										Akse · {v.axis}
									</span>
									<span className="text-white/70">
										<span className="text-white/45">Vinner når </span>
										{v.winsWhen.charAt(0).toLowerCase() + v.winsWhen.slice(1)}
									</span>
									<span className="text-white/70">
										<span className="text-white/45">Koster: </span>
										{v.costs}
									</span>
								</span>
								<span
									aria-hidden
									className="absolute top-5 right-5 size-10 rounded-full opacity-90 transition-transform duration-300 ease-out group-hover:scale-110"
									style={{ background: v.swatch }}
								/>
							</button>
						)
					})}
				</Form>
				<p className="mt-10 text-[13px] text-white/40">
					Alle appene bruker de samme treningsdataene dine, og hver tar deg
					gjennom hele reisen fra første åpning. Tastene 1–6 bytter app hvor som
					helst.
				</p>
			</div>
		</main>
	)
}
