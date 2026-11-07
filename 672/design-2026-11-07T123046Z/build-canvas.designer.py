# Builds canvas.html: one self-contained file, images as data URIs, prototype in an iframe srcdoc.
import base64, html, sys
EV = sys.argv[1]
def img(name): return 'data:image/png;base64,' + base64.b64encode(open(f'{EV}/{name}', 'rb').read()).decode()
proto = html.escape(open(f'{EV}/prototype.html').read(), quote=True)
def iframe(q, h): return f'<iframe title="Prototype" style="width:100%;height:{h}px;border:1px solid var(--line);border-radius:12px;background:#fff" srcdoc="{proto.replace("const params = new URLSearchParams(location.search)", f"const params = new URLSearchParams({q!r})".replace("&#x27;", "&#x27;"))}"></iframe>'
# srcdoc pages cannot read a query string: inject the starting state.
def frame(q, h):
    src = open(f'{EV}/prototype.html').read().replace("const params = new URLSearchParams(location.search)", f"const params = new URLSearchParams('{q}')")
    src = src.replace("history.replaceState(null, '', u)", "try { history.replaceState(null, '', u) } catch {}")
    return f'<iframe title="Prototype: {q}" loading="lazy" style="width:390px;max-width:100%;height:{h}px;border:1px solid var(--line);border-radius:16px;background:#fff" srcdoc="{html.escape(src, quote=True)}"></iframe>'

page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan guards in the lead</title>
<style>
:root {{ --bg:#f6f7f7; --fg:#15191b; --muted:#5d6a70; --line:#dfe3e5; --card:#fff; --chip:#eceff0; --accent:#0d7a68; color-scheme: light; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#111416; --fg:#f4f6f6; --muted:#a3adb2; --line:#2a3033; --card:#1a1f22; --chip:#242a2d; --accent:#35b89c; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --bg:#111416; --fg:#f4f6f6; --muted:#a3adb2; --line:#2a3033; --card:#1a1f22; --chip:#242a2d; --accent:#35b89c; color-scheme: dark; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
.wrap {{ max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }}
h1 {{ font-size: 24px; margin: 0 0 8px; letter-spacing: -0.02em; }}
h2 {{ font-size: 18px; margin: 40px 0 12px; }}
.chips {{ display:flex; flex-wrap:wrap; gap:8px; margin: 8px 0 20px; }}
.chip {{ padding: 4px 10px; border-radius: 999px; background: var(--chip); font-size: 13px; font-weight: 600; }}
.chip.pending {{ background: color-mix(in oklab, var(--accent) 16%, transparent); color: var(--accent); }}
.status {{ display:inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--chip); }}
.status.current {{ background: color-mix(in oklab, var(--accent) 16%, transparent); color: var(--accent); }}
.pics {{ display:grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 16px; align-items: start; }}
.pics figure {{ margin:0; }} .pics img {{ width:100%; border:1px solid var(--line); border-radius: 12px; display:block; }}
figcaption, .muted {{ color: var(--muted); font-size: 13px; }}
table {{ width:100%; border-collapse: collapse; background: var(--card); border-radius: 12px; overflow: hidden; }}
th, td {{ text-align:left; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid var(--line); font-size: 14px; }}
th {{ width: 160px; color: var(--muted); font-weight: 600; }}
.tablewrap {{ overflow-x: auto; }}
ul.dec {{ padding-left: 18px; }} ul.dec li {{ margin: 6px 0; }}
details {{ background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; margin-top: 12px; }}
summary {{ cursor: pointer; font-weight: 600; min-height: 32px; }}
.board {{ display:flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }}
.board img {{ width: 390px; max-width: 100%; border: 1px solid var(--line); border-radius: 12px; }}
code {{ font-size: 13px; }}
@media (max-width: 720px) {{ .pics {{ grid-template-columns: 1fr; }} }}
</style></head><body><div class="wrap">
<h1>Plan's guards in the lead (#672)</h1>
<div class="chips" aria-label="Verdict"><span class="chip pending">Critique pending</span><span class="chip">run 1</span><span class="chip">4 decisions</span><span class="chip">two-way doors</span><span class="chip">1 variant (unattended)</span></div>

<div class="pics">
<figure><img alt="Today: the lead card, Bibliotek and a closed Avansert; no notice in sight" src="{img('shots/today-demo-light-mobile-fold.png')}"><figcaption>Before: at 390×844 Plan shows no warning. They are in Avansert → Blokker, which starts closed.</figcaption></figure>
<figure><img alt="Under the card: the ramp notice starts right under the lead card" src="{img('shots/under-the-card-demo-light-mobile-fold.png')}"><figcaption>Under the card: the same three notices sit directly under the lead card. The first one starts above the tab bar.</figcaption></figure>
</div>

<h2>Comparison</h2>
<div class="tablewrap"><table>
<tr><th></th><th>Under the card <span class="status current">Current</span></th></tr>
<tr><th>Axis (layout)</th><td>Notices get their own stack inside the lead section, right under the lead card and the resting line, above Bibliotek. They are not inside the card and not above it.</td></tr>
<tr><th>Gain</th><td>The athlete reads every guard without a tap. The card still reads at a glance. There is no card inside a card. The notices keep the <code>Alert</code> they already have, so they keep the same standing.</td></tr>
<tr><th>Cost</th><td>On a phone the notices begin near the fold, after <em>Bytt treningsform</em>. A plan with many warnings pushes Bibliotek and Avansert down by up to about 1,750 px. A ramp line no longer sits next to the phase card where it is fixed.</td></tr>
<tr><th>Criteria held</th><td>9 of 9 in the prototype. 390, 320 and 200 % zoom have no overflow. Every target measures 44 px. Text is 16 px on a phone and 14 px from <code>md</code>. Opening Avansert shows each notice once. Dismissing a notice moves focus to its line, and a reload brings the notice back. With no warnings the stack, the heading and the gap are all absent.</td></tr>
<tr><th>Worst case</th><td>4 ramp lines (a 44-character phase name and a lifting line), 2 day lines, the no-capacity line, 2 clashes, 4 band sessions and the resting line. The first notice starts at 653 px, so about 127 px of it shows above the tab bar. It reads and does not break. See the worst-case board.</td></tr>
<tr><th>Build cost</th><td>(part 2)</td></tr>
<tr><th>Status</th><td>Current</td></tr>
</table></div>

<h2>Decisions</h2>
<ul class="dec">
<li><b>Where in the lead?</b> Put them directly under the lead card (after the resting line), as one stack with a 12 px gap, before Bibliotek.</li>
<li><b>Add a fix link to the ramp notice?</b> No. The content is out of scope, and the only links today (<code>/settings/profile</code> and the band sessions) work from anywhere. A deep link from each ramp line to its phase in Avansert is a follow-up: it needs phase anchors and open-on-hash.</li>
<li><b>Hierarchy inside a notice?</b> The fact lines are <code>foreground</code> and the explanation stays <code>muted-foreground</code>, so the lead says what the warning is before why. The words do not change.</li>
<li><b>44 px links inside a sentence?</b> Use an invisible <code>::after</code> hit area (−13 px, or −14 px from <code>md</code>), not <code>inline-flex min-h-11</code>. The second leaves a 20 px gap in the middle of a sentence (probe below).</li>
</ul>

<details><summary>Appendix</summary>
<p><b>Critic's scoring:</b> pending.</p>
<p><b>Method:</b> Emil's prototype (standalone branch). One self-contained HTML file uses the project's tokens and Public Sans. The real copy comes from the repo's own <code>labels.ts</code> and <code>format.ts</code> functions, run with <code>tsx</code> (<code>gen-copy.ts</code> → <code>copy.json</code>). Playwright measured overflow, tap targets, text size, the fold and dismissal (<code>shoot.mjs</code> → <code>measure.json</code>). I did not run the real app: the checkout is read-only for this run, and seeding needs writes. The curve is an approximation of <code>SeasonCurveView</code>.</p>
<p><b>Settled by probe:</b> "Do 44 px inline links survive in a sentence?" I rendered <code>inline-flex min-h-11</code>: it opened a 20 px gap in the middle of the line. An <code>::after</code> at −10 px measured 39 px, because the inline box is the font's content area (~19 px), not the 24 px line. At −13 px / −14 px it measures 44 px.</p>
<p><b>Settled by probe:</b> "Is the lead's first notice visible without scrolling on a phone?" At 390×844 the demo lead card ends at 567 px and the first notice starts at 579 px, so about 200 px shows above the 64 px tab bar. In the worst case it starts at 653 px (about 127 px shows). At 320×700 it starts at 737 px, below the fold.</p>
<p><b>Rejected directions:</b> (1) Inside the card, between the curve and the next easy week. That is a card in a card, and three long notices push <em>Endre løpet</em> and <em>Bytt treningsform</em> off the first screen. (2) Above the card. The warnings would come before the plan's own name, against ADR 0101 §2's order, and on every visit. (3) A one-line count in the card ("2 merknader ↓") with the full notices below. It is a second place to say the same thing, and it is new copy. Revisit only if a real phone shows the peek is missed. (4) A group heading ("Merknader om planen"). Each notice opens with its own fact, so a heading adds words and not meaning.</p>
<p><b>Code it touches:</b> <code>app/routes/training/plan.tsx</code> (render the guards in the lead and pass them in). <code>__plan-lead-card.tsx</code> (a new <code>notices</code> slot after <code>resting</code>, inside <code>[data-plan-lead]</code>). <code>__blocks-reading.tsx</code> (remove the three notices, the derived warnings and the imports). <code>__season-notices.tsx</code> (a <code>PlanGuardNotices({{season}})</code> owning the ramp flatMap and the three conditions in <code>flex flex-col gap-3</code>; <code>DismissibleNotice</code> drops <code>mb-4</code>; <code>AlertDescription</code> gets <code>text-base md:text-sm</code>; fact lines get <code>text-foreground</code>; links get the hit area). <code>docs/adr/0101…</code> §2 (the amendment). The <code>mobile-overflow</code> e2e (a plan with all three warnings). <code>plan.route.test.tsx</code> (notices inside <code>[data-plan-lead]</code>, none in Blokker, the <code>?outline=</code> plan's own warnings). <code>labels.ts</code> does not change.</p>
<p><b>Motion:</b> none is added. Dismissal stays instant, as today: the space closing up is how a sighted reader sees the dismissal. The flex gap means a dismissed notice's sr-only line leaves no gap behind.</p>
<p><b>Needs a real phone:</b> whether the peek above the tab bar is enough to read as "there is more", and how the invisible hit areas feel on the band session links.</p>
</details>

<h2>Under the card <span class="status current">Current</span></h2>
<p class="muted">Working prototype. Use the picker (top) to flip between "I dag (før)" and "Under kortet". The controls on the right switch the data (Demo, Worst case, Ingen merknader) and the theme. Close a notice; open Avansert to see that Blokker no longer repeats the notices.</p>
<div class="board">{frame('v=2&data=demo', 844)}
<figure style="margin:0"><img alt="Under the card at 1440 wide" src="{img('under-the-card-desktop.png')}" style="width:560px"><figcaption>1440 px: the lead column stays 672 px wide, and the notices take its width.</figcaption></figure></div>

<h2>Worst case</h2>
<p class="muted">The same prototype with the worst-case data (toggle inside). It shows long phase and event names, the lifting line, two day spans, a "Uke 52–1" wrap, the no-capacity link, clashes, four band sessions and the resting line.</p>
<div class="board">{frame('v=2&data=worst', 844)}
<figure style="margin:0"><img alt="Worst case, full page, light" src="{img('shots/under-the-card-worst-light-mobile-full.png')}"><figcaption>390 px, full page. Nothing overflows, and the notices run about 1,750 px.</figcaption></figure>
<figure style="margin:0"><img alt="Worst case, full page, dark" src="{img('shots/under-the-card-worst-dark-mobile-full.png')}"><figcaption>Dark mode.</figcaption></figure></div>

<h2>Earlier runs</h2>
<details><summary>None: this is run 1.</summary><p class="muted">No earlier canvas and no comments on #672.</p></details>
</div></body></html>'''
open(f'{EV}/canvas.html', 'w').write(page)
print(len(page))
