import sys

p = sys.argv[1]
s = open(p).read()


def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:80], s.count(old))
    s = s.replace(old, new)


rep("""import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { cn } from '#app/utils/misc.tsx'
""", """import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Card } from '#app/components/ui/card.tsx'
import { Collapsible } from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { RUNNER_LABELS } from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
""")
rep("""export const meta: Route.MetaFunction = ({ data: loaderData }) => [
	{ title: `Log · ${loaderData?.sessionTitle ?? 'Session'} | Trainm8` },
]
""", """const L = RUNNER_LABELS

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
	{ title: L.metaTitle(loaderData?.sessionTitle ?? L.metaFallback) },
]
""")
rep("""const LOAD_KIND_LABELS: Record<LoadKind, string> = {
	external: 'Weight (kg)',
	bodyweight: 'Bodyweight',
	bodyweightPlus: 'Bodyweight + kg',
	assisted: 'Assisted (kg off)',
	stackLevel: 'Machine level',
	band: 'Band',
	unloaded: 'No load',
}
""", """const LOAD_KIND_LABELS: Record<LoadKind, string> = L.loadKinds
""")
rep("""const LOAD_VALUE_KIND_WORDS: Record<LoadValue['kind'], string> = {
	external: 'kilos',
	perSide: 'kilos per hand',
	bodyweight: 'bodyweight',
	bodyweightPlus: 'bodyweight plus kilos',
	assisted: 'assisted kilos',
	stackLevel: 'a machine level',
	band: 'a band',
	unloaded: 'no load',
}
""", """const LOAD_VALUE_KIND_WORDS: Record<LoadValue['kind'], string> = L.loadWords
""")
rep("""						finished.reason === 'nothing-logged'
							? 'Log a working set first — there is nothing to finish yet.'
							: 'That session is gone.',""", """						finished.reason === 'nothing-logged'
							? L.errors.nothingLogged
							: L.errors.gone,""")
rep("""		return cleared ? { ok: true as const } : data({ error: 'Not found' }, 404)""", """		return cleared
			? { ok: true as const }
			: data({ error: L.errors.notFound }, 404)""")
rep("""		return data({ error: 'That set did not make sense.' }, 400)""", """		return data({ error: L.errors.nonsense }, 400)""")
rep("""			{ error: `${LOAD_KIND_LABELS[input.loadKind]} needs a number.` },""", """			{ error: L.errors.needsNumber(LOAD_KIND_LABELS[input.loadKind]) },""")
rep("""					error: `That set is recorded as ${LOAD_VALUE_KIND_WORDS[result.recordedKind]}. It cannot be re-logged as something else from here.`,""", """					error: L.errors.kindLocked(
						LOAD_VALUE_KIND_WORDS[result.recordedKind],
					),""")
rep("""					result.reason === 'not-strength'
						? 'That step is not a lift.'
						: result.reason === 'no-count'
							? 'That set recorded no count.'
							: 'That session is gone.',""", """					result.reason === 'not-strength'
						? L.errors.notALift
						: result.reason === 'no-count'
							? L.errors.noCount
							: L.errors.gone,""")
rep("""					<p className="text-body-2xs text-muted-foreground">
						This session has no lifts to log.
					</p>""", """					<p className="text-footnote text-muted-foreground">{L.noLifts}</p>""")
rep("""				aria-label="Back to today\"""", """				aria-label={L.back}""")
rep("""				<p className="text-button text-primary truncate tracking-widest uppercase">
					{view.sessionTitle}
				</p>
				<h1 className="text-h6 truncate">Run your workout</h1>""", """				{/* The workout's name in full: a program's eyebrow cut to
				    "STRONGLIFTS 5×5 · W…" at 320px hid which workout it was
				    (story 32). It wraps instead. */}
				<p className="text-overline text-primary uppercase [overflow-wrap:anywhere]">
					{view.sessionTitle}
				</p>
				<h1 className="text-title">{L.heading}</h1>""")
rep("""				<Badge
					variant="secondary"
					className="bg-muted text-muted-foreground h-6 shrink-0 rounded-2xl"
				>
					Session {view.sessionNumber}
				</Badge>""", """				<Badge
					variant="secondary"
					className="bg-muted text-muted-foreground shrink-0 tabular-nums"
				>
					{L.sessionNumber(view.sessionNumber)}
				</Badge>""")
rep("""	/** **Collapsed by default**, because the screen has to stay quiet: the account
	 * of every number on this card exists and costs one tap to ask for. */
	const [helpOpen, setHelpOpen] = useState(false)""", """	/** **Collapsed by default**, because the screen has to stay quiet: the account
	 * of every number on this card exists and costs one tap to ask for. The
	 * `Collapsible` below owns the state; the toggle and the panel are its
	 * trigger and its panel. */
	const [helpOpen, setHelpOpen] = useState(false)""")
rep("""			<div className="flex items-start gap-2">
				<div className="min-w-0 flex-1">
					<h2 id={`lift-${exercise.stepId}`} className="text-h6 truncate">
						{exercise.name}
					</h2>
					{subline ? (
						<p className="text-body-2xs text-muted-foreground mt-0.5">
							{subline}
						</p>
					) : null}
				</div>
				{/* Every explanation this lift owes, one tap behind its name — never a
				    paragraph beside a control (#434's defect). */}
				<LiftHelpToggle
					liftName={exercise.name}
					panelId={panelId}
					open={helpOpen}
					onToggle={() => setHelpOpen((open) => !open)}
				/>
			</div>

			{helpOpen ? <LiftHelpPanel panelId={panelId} lines={help} /> : null}
""", """			<Collapsible
				open={helpOpen}
				onOpenChange={setHelpOpen}
				className="flex flex-col gap-3.5"
			>
				<div className="flex items-start gap-2">
					<div className="min-w-0 flex-1">
						{/* The lift's name wraps rather than truncating: two lifts
						    whose names differ at the end must not read the same. */}
						<h2
							id={`lift-${exercise.stepId}`}
							className="text-heading [overflow-wrap:anywhere]"
						>
							{exercise.name}
						</h2>
						{subline ? (
							<p className="text-footnote text-muted-foreground mt-0.5">
								{subline}
							</p>
						) : null}
					</div>
					{/* Every explanation this lift owes, one tap behind its name — never
					    a paragraph beside a control (#434's defect). */}
					<LiftHelpToggle liftName={exercise.name} />
				</div>

				<LiftHelpPanel panelId={panelId} lines={help} />
			</Collapsible>
""")
rep("""					<p className="text-button text-muted-foreground tracking-widest uppercase">
						Warm-up
					</p>""", """					<p className="text-overline text-muted-foreground uppercase">
						{L.warmup}
					</p>""")
rep("""					<p className="text-button text-muted-foreground tracking-widest uppercase">
						Working sets
					</p>
					{/* What is left, without counting circles. */}
					<p className="text-body-2xs text-muted-foreground">""", """					<p className="text-overline text-muted-foreground uppercase">
						{L.workingSets}
					</p>
					{/* What is left, without counting circles. */}
					<p className="text-footnote text-muted-foreground tabular-nums">""")
rep("""					<p className="text-body-2xs text-muted-foreground mt-2">{load.fix}</p>""", """					<p className="text-footnote text-muted-foreground mt-2">{load.fix}</p>""")
rep("""					<p className="text-destructive text-body-2xs mt-2" role="alert">
						{failure}
					</p>""", """					<p className="text-destructive text-footnote mt-2" role="alert">
						{failure}
					</p>""")
rep("""const UNEXPLAINED_FAILURE = 'That set did not save — tap it again.'""", """const UNEXPLAINED_FAILURE = L.unexplainedFailure""")
rep("""				'focus-visible:ring-ring text-body-md flex h-15 flex-1 items-center justify-center rounded-2xl border-2 bg-transparent font-bold outline-none focus-visible:ring-2',
				// The only two animations on this screen: the 120ms colour change and
				// the 80ms press-scale. The scale is 0.97, inside the 0.95–0.98 band
				// the motion pass set (#502) — 0.94 read as a flinch rather than as
				// the circle answering the tap.
				'[transition:background-color_120ms,border-color_120ms,color_120ms,transform_80ms] active:scale-[0.97]',""", """				'focus-visible:ring-ring text-heading flex h-15 min-w-11 flex-1 items-center justify-center rounded-3xl border-2 bg-transparent font-bold tabular-nums outline-none focus-visible:ring-2',
				// The only two animations on this screen besides the help panel:
				// the colour change and the press. Both are the app's `pressable`
				// (#505 round 2): scale 0.97 on `:active`, 160ms on `--ease-out`,
				// colours on the same curve, the scale dropped under reduced
				// motion. It was a hand-written `[transition:…120ms…80ms]` on the
				// browser's default `ease` — the one curve on the screen that was
				// not the app's. 0.94 (ADR 0064) read as a flinch (#502).
				'pressable',""")
rep("""				'text-body-2xs focus-visible:ring-ring flex min-h-11 items-center justify-center rounded-xl border px-2.75 py-2 font-semibold whitespace-nowrap outline-none focus-visible:ring-2',""", """				'text-footnote focus-visible:ring-ring pressable flex min-h-11 items-center justify-center rounded-3xl border px-2.75 py-2 font-semibold whitespace-nowrap tabular-nums outline-none focus-visible:ring-2',""")
rep("""				// The handoff's chip: radius 14px (`rounded-xl` against this repo's
				// 10px `--radius`), padding `8px 11px`, and **44px minimum** — the same
				// hit target as every other control on this screen, on an element that
				// only needs 28px to hold its text.""", """				// The handoff's chip: radius ~13px (`rounded-3xl`, the luma step for
				// controls), padding `8px 11px`, and **44px minimum** — the same hit
				// target as every other control on this screen, on an element that
				// only needs 28px to hold its text.""")
rep("""				Finish workout
			</Button>
			{error ? (
				<p className="text-destructive text-body-2xs mt-2" role="alert">
					{error}
				</p>
			) : null}
			{/* The one thing an athlete worried about losing work needs to read. */}
			<p className="text-body-2xs text-muted-foreground mt-2 text-center">
				Every set was saved as you tapped it. This only marks the day.
			</p>""", """				{L.finish}
			</Button>
			{error ? (
				<p className="text-destructive text-footnote mt-2" role="alert">
					{error}
				</p>
			) : null}
			{/* The one thing an athlete worried about losing work needs to read. */}
			<p className="text-footnote text-muted-foreground mt-2 text-center">
				{L.finishNote}
			</p>""")
rep("""			className="border-border bg-muted/40 mb-4 rounded-2xl border p-3"
		>
			<p className="text-body-2xs font-medium">Already recorded.</p>
			<p className="text-body-2xs text-muted-foreground mt-1">
				You finished this workout. Your sets are the record, and tapping one
				below still changes it — but nothing here is waiting to be filed.
			</p>
			{view.program ? (
				<Link
					to={`/training/programs/run/${view.program.instanceId}`}
					className="text-body-2xs mt-2 inline-flex min-h-11 items-center underline"
				>
					What {view.program.name} says you lift next
				</Link>
			) : null}""", """			className="bg-muted/60 mb-4 rounded-3xl px-4 py-3"
		>
			<p className="text-callout">{L.alreadyRecorded}</p>
			<p className="text-footnote text-muted-foreground mt-1">
				{L.alreadyRecordedNote}
			</p>
			{view.program ? (
				<Link
					to={`/training/programs/run/${view.program.instanceId}`}
					className="text-footnote text-foreground mt-1 inline-flex min-h-11 items-center underline underline-offset-2"
				>
					{L.nextFromProgram(view.program.name)}
				</Link>
			) : null}""")
open(p, 'w').write(s)
