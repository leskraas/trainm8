# Builds canvas.html (one self-contained file): overview, the variant board (prototype in an iframe),
# the worst-case board, earlier runs. Images are WebP data URIs from shots.json and pairs/.
import base64, html, io, json, sys
from PIL import Image
EV = sys.argv[1]
shots = json.load(open(f'{EV}/shots.json'))
zones = json.load(open(f'{EV}/zones.json'))

def webp(path, max_w=None, q=72):
    im = Image.open(path).convert('RGB')
    if max_w and im.width > max_w: im = im.resize((max_w, int(im.height * max_w / im.width)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()

def s(key): return shots[key]['src']

proto = open(f'{EV}/prototype.html').read()
proto = proto.replace('const params = new URLSearchParams(location.search);', "const params = new URLSearchParams('page=session-sets&v=2&theme=light&w=390&data=demo');")
frame = f'<iframe title="Role steps prototype: the real app, today against Role steps" loading="lazy" style="width:100%;height:1040px;border:1px solid var(--line);border-radius:16px;background:var(--card)" srcdoc="{html.escape(proto, quote=True)}"></iframe>'

def zone_rows(label):
    out = []
    for th in ('light', 'dark'):
        rows = zones[f'{label} {th}']['rows']
        cells = ''.join(f'<td><span class="sw" style="background:{r["hex"]}"></span> <code>{html.escape(r["value"])}</code><br><span class="{"bad" if r["card"] < 3 else ""}">{r["card"]:.2f}</span> on card</td>' for r in rows)
        out.append(f'<tr><th>{"Today" if label == "today" else "Role steps"}, {th}</th>{cells}<td>{zones[f"{label} {th}"]["spread"]}</td></tr>')
    return ''.join(out)

WORST = [('session', 'Økt: 80-character title'), ('session-strength', 'Økt: 40-character exercise'), ('lift', 'Meg · løftet: 40-character name'), ('plan-weeks', 'Plan · Uke for uke: 1 055 km/uke')]

page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Luma on every page</title>
<style>
:root {{ --bg:#f6f7f7; --fg:#15191b; --muted:#5d6a70; --line:#dfe3e5; --card:#fff; --chip:#eceff0; --accent:#0d7a68; --bad:#b42318; color-scheme: light; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#111416; --fg:#f4f6f6; --muted:#a3adb2; --line:#2a3033; --card:#1a1f22; --chip:#242a2d; --accent:#35b89c; --bad:#ff8a80; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --bg:#111416; --fg:#f4f6f6; --muted:#a3adb2; --line:#2a3033; --card:#1a1f22; --chip:#242a2d; --accent:#35b89c; --bad:#ff8a80; color-scheme: dark; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
.wrap {{ max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }}
h1 {{ font-size: 24px; line-height: 30px; margin: 0 0 8px; letter-spacing: -0.02em; text-wrap: balance; }}
h2 {{ font-size: 18px; margin: 40px 0 12px; }}
h3 {{ font-size: 15px; margin: 20px 0 8px; }}
.chips {{ display:flex; flex-wrap:wrap; gap:8px; margin: 8px 0 20px; }}
.chip {{ padding: 4px 10px; border-radius: 999px; background: var(--chip); font-size: 13px; font-weight: 600; }}
.chip.pending {{ background: color-mix(in oklab, var(--accent) 16%, transparent); color: var(--accent); }}
.status {{ display:inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: var(--chip); }}
.status.current {{ background: color-mix(in oklab, var(--accent) 16%, transparent); color: var(--accent); }}
figure {{ margin: 0; }} figure img {{ width: 100%; height: auto; display:block; border-radius: 12px; border: 1px solid var(--line); }}
figcaption, .muted {{ color: var(--muted); font-size: 13px; margin-top: 6px; }}
.hero {{ max-width: 820px; }}
.tablewrap {{ overflow-x: auto; -webkit-overflow-scrolling: touch; }}
table {{ width:100%; border-collapse: collapse; background: var(--card); border-radius: 12px; overflow: hidden; }}
th, td {{ text-align:left; vertical-align: top; padding: 8px 12px; border-bottom: 1px solid var(--line); font-size: 14px; }}
th {{ color: var(--muted); font-weight: 600; }}
.cmp th {{ width: 150px; }}
ul.dec {{ padding-left: 18px; }} ul.dec li {{ margin: 6px 0; }}
details {{ background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; margin-top: 12px; }}
summary {{ cursor: pointer; font-weight: 600; min-height: 32px; }}
code {{ font-size: 13px; overflow-wrap: anywhere; }}
.sw {{ display:inline-block; width: 22px; height: 12px; border-radius: 3px; vertical-align: middle; }}
.bad {{ color: var(--bad); font-weight: 700; }}
.grid {{ display:grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); gap: 16px; align-items: start; }}
.seg {{ display:inline-flex; gap: 4px; padding: 3px; border-radius: 999px; background: var(--chip); margin-bottom: 12px; }}
.seg button {{ font: inherit; font-size: 13px; min-height: 36px; padding: 0 14px; border: 0; border-radius: 999px; background: transparent; color: var(--fg); cursor: pointer; }}
.seg button[aria-pressed="true"] {{ background: var(--card); box-shadow: 0 1px 2px rgba(0,0,0,.15); }}
[data-worst] [data-set="worst"] {{ display: none; }} [data-worst="1"] [data-set="demo"] {{ display: none; }} [data-worst="1"] [data-set="worst"] {{ display: block; }}
</style></head><body><div class="wrap">
<h1>#528: the remaining pages on luma</h1>
<div class="chips" aria-label="Verdict"><span class="chip">Chosen: Role steps, with build fixes</span><span class="chip">run 1</span><span class="chip">11 decisions</span><span class="chip">one-way door: zone ladder</span><span class="chip">1 variant (unattended)</span></div>

<figure class="hero"><img alt="Before and after: the sets popover on the session page at 390 px, light" src="{webp(f'{EV}/pairs/session-sets-light-mobile.png', 1640)}"><figcaption>Økt with the sets popover open, 390 px, light. Left is today; right is Role steps. The 6 px bordered steppers and fields now use the 13 px field shape of the select under them. The chips are round, and the labels drop to caption.</figcaption></figure>

<h2>Comparison</h2>
<div class="tablewrap"><table class="cmp">
<tr><th></th><th>Role steps <span class="status current">Chosen</span></th></tr>
<tr><th>Axis (type mapping)</th><td><b>By role.</b> Each raw size maps to the step for what the text does: a row title goes to <code>callout</code> (15), a fact or description to <code>footnote</code> (13), a label to <code>caption</code> (12), a section or card title to <code>heading</code> (18). It does not map to the nearest pixel size. Radius goes by what the element is: a card, a control, an item inside one, a pill, or a data mark.</td></tr>
<tr><th>Gain</th><td>Plan's editors, the popovers, the session page and Meg now read like I dag. There is one field look, and the chips are round. Section, row title and fact are three steps a reader can see apart. The zone ladder reaches 3:1 on card in both themes (light 3.23–5.36, dark 5.55–8.36). The brightest zone no longer outshines the rest as much: the spread is 1.89 today, 1.66 in light and 1.51 in dark.</td></tr>
<tr><th>Cost</th><td>14 px text splits into 15 and 13, so a few lines wrap differently. The light zone hues get darker: zone 3 moves from sunny yellow to mustard <span class="sw" style="background:#a88d10"></span>. New light values are outside the Scope line (decision 7). The sweep touches 49 files. The spec's inventory missed 19 lines in shared components, among them <code>page-header</code> and the score chips.</td></tr>
<tr><th>Criteria held</th><td><b>Critic: holds 2 (AC6, AC9), partly 6 (AC1–5, AC8), build 2 (AC7, AC10).</b> Probes cover AC1–4 on the drawn pages, AC6 by computation and AC9 after one fix. For AC8, no captured state scrolls sideways at 390, and no size or motion class changed. The Plan empty state and the form errors (AC5) follow the map in code but are not captured. AC7 and AC10 (/design, the lint rule) are build work.</td></tr>
<tr><th>Worst case</th><td>An 80-character session title wraps to five lines at <code>title</code>. 1&nbsp;055&nbsp;km/uke fits the week row. Today the exercise picker clips a 40-character name to “Bulgarsk splittkneb”; in Role steps it wraps to three lines.</td></tr>
<tr><th>Build cost</th><td>None given (one variant)</td></tr>
<tr><th>Status</th><td>Chosen</td></tr>
</table></div>

<h2>Decisions</h2>
<ul class="dec">
<li><b>Raw size → step?</b> By role: a 14 px row title goes to <code>callout</code> and a 14 px fact to <code>footnote</code>. <code>text-xs</code> goes to <code>caption</code>, <code>text-base</code> to <code>body</code>, ± glyphs and <code>CardTitle</code> to <code>heading</code>.</li>
<li><b>A page's one title?</b> The content's own name (plan, session, lift) at <code>title</code>. <code>PageHeader</code>'s h1 goes to <code>heading</code>, as an inline navigation title.</li>
<li><b>Plan's span figure?</b> <code>heading</code> with tabular figures. At <code>title</code> it wraps mid-arrow and reads as a second title.</li>
<li><b>Bordered box inside a card or popover?</b> A muted well: <code>bg-muted/50 rounded-3xl</code> with no border.</li>
<li><b>Fields in popovers?</b> The <code>ui/input</code> look: <code>bg-input/50</code>, no border, <code>rounded-3xl</code>, <code>ring-ring/30 ring-3</code>. Steppers are <code>rounded-3xl</code>.</li>
<li><b>Data marks</b> (legend swatches, strip cells)? A 3 px mark radius, not a luma step.</li>
<li><b>Zone ladder?</b> New light values as well as dark ones. Today's light hues fail 3:1 on card (2.04–2.79 for zones 1–4), so AC6 cannot hold otherwise. This is a one-way door, and it contradicts the Scope line.</li>
<li><b>List groups</b> (Meg, the lift page, Bibliotek)? <code>shadow-md</code> like every card, not <code>shadow-xs</code>, with rows on <code>divide-border/60</code>.</li>
<li><b>Spec text?</b> One-line fix: Out of scope reads “the zone hues’ light and dark values”, and the Training Zone decision “set light and dark values”. AC6 wins over the Scope line.</li>
<li><b>Lift page title?</b> The exercise name at <code>text-title</code>; today it sits at the same size as the <code>PageHeader</code> above it.</li>
<li><b>Exercise picker trigger?</b> It wraps (<code>min-h-11</code>, no <code>line-clamp</code>). It keeps the select trigger's <code>text-base md:text-sm</code> under a lint exemption that names the primitive it mirrors.</li>
</ul>

<details><summary>Appendix</summary>
<h3>Critic's scoring</h3><table><tr><th>AC</th><th>Verdict</th><th>Seen</th></tr><tr><td>1 radius</td><td>partly</td><td>Holds on 9 captured states; first run, Bibliotek, events, imports not captured.</td></tr><tr><td>2 type</td><td>partly</td><td>Three steps read on Plan and Økt; the lift page stacks two heading-sized titles; picker keeps raw sizes under a lint exemption.</td></tr><tr><td>3 tabular</td><td>partly</td><td>Added only on Plan's span; week numbers, kg, sets × reps not audited.</td></tr><tr><td>4 surfaces</td><td>partly</td><td>Wells and list groups right; ~61 full-strength border/divide lines remain in page code.</td></tr><tr><td>5 empty, errors</td><td>partly</td><td>Right in code (errors on foreground-destructive); not captured.</td></tr><tr><td>6 zones</td><td>holds</td><td>With light values changed too: light 3.23–5.36, dark 5.55–8.36.</td></tr><tr><td>7 /design, docs</td><td>build</td><td>Not drawn.</td></tr><tr><td>8 390, 44px, motion</td><td>partly</td><td>0 overflow, no motion change; “+ notat”, “Ulike sett”, “+ blokk”, × look under 44px.</td></tr><tr><td>9 worst case</td><td>holds</td><td>40-char name wraps, 80-char title wraps, 1 373,8 km fits.</td></tr><tr><td>10 lint</td><td>build</td><td>Not drawn.</td></tr></table><p class="muted">Craft: lift name to title; muted ex-<code>text-xs</code> helper text keeps <code>font-normal</code> under caption; align the sets popover footer row; group the dark <code>--zone-*</code> under their own comment. Worst case: <code>PageHeader</code> h1 still truncates (fragile); the open week row in Plan was captured without values (re-check). Full scoring in critic.md.</p>
<h3>Designer's disagreement</h3><p class="muted">Same pick (Role steps). The designer would ship the light zone values only with the owner's yes or a spec fix; the critic records both the spec fix and a one-way decision taken under full autonomy, so the run does not wait.</p>
<h3>Role map: what the build must match</h3>
<div class="tablewrap"><table>
<tr><th>Role</th><th>Step</th><th>Example</th></tr>
<tr><td>The page's one title</td><td><code>text-title</code></td><td>The session name, the plan's name, the lift on its page</td></tr>
<tr><td>Inline page header, section, card or sheet title</td><td><code>text-heading</code></td><td><code>PageHeader</code> h1, <code>CardTitle</code>, <code>overlay-header</code></td></tr>
<tr><td>Row title, label over a figure</td><td><code>text-callout</code></td><td>“Løping” over the span, the week row, a set row value</td></tr>
<tr><td>Row fact, description, field error</td><td><code>text-footnote</code> (errors use <code>text-foreground-destructive</code>)</td><td>Phase readings, the validation summary</td></tr>
<tr><td>Label beside a figure, unit, legend</td><td><code>text-caption</code></td><td>“av”, “pause mellom settene”, the chart legend</td></tr>
<tr><td>Kicker</td><td><code>text-overline uppercase</code></td><td>SETT, INTENSITET (already in place)</td></tr>
<tr><td>Input value, CTA, running text</td><td><code>text-body</code></td><td>Popover fields, <code>h-12</code> CTAs, <code>md:text-base</code> on a trigger becomes <code>md:text-body</code></td></tr>
<tr><td>Card, sheet, list group</td><td><code>rounded-4xl</code> + <code>shadow-md</code> + <code>ring-foreground/5</code> (dark <code>/10</code>)</td><td>PlanCard, DisclosureCard, Meg groups</td></tr>
<tr><td>Field, popover, toggle, stepper, well</td><td><code>rounded-3xl</code></td><td>Sets and token fields, workout-editor groups</td></tr>
<tr><td>Item inside a control or card</td><td><code>rounded-2xl</code></td><td>Row press, link focus target, week-strip day</td></tr>
<tr><td>Pill, tab, chip</td><td><code>rounded-full</code></td><td>Intensity chip, ×5 repeat chip, key chip</td></tr>
<tr><td>Data mark</td><td><code>rounded-[3px]</code></td><td>Telemetry legend swatches (as the shape strip)</td></tr>
<tr><td>Rows in a card</td><td><code>divide-border/60</code></td><td>Week pattern, the session's not-measured list</td></tr>
</table></div>
<h3>Training Zone ladder</h3>
<div class="tablewrap"><table>
<tr><th></th><th>Zone 1</th><th>Zone 2</th><th>Zone 3</th><th>Zone 4</th><th>Zone 5</th><th>Spread</th></tr>
{zone_rows('today')}{zone_rows('proposed')}
</table></div>
<p class="muted">Settled by probe (<code>zones2.py</code>): WCAG 2 luminance from OKLCH, all in sRGB gamut. The OKLab distance between neighbours stays at 0.095 or more in light and 0.087 or more in dark (today's minimum is 0.097). The chip tint (the zone mixed 22–26 % into card) keeps foreground text at 10.2:1 or better. Hues are as today (blue, green, yellow, orange, red). Lightness is evened out per theme: L 0.55–0.65 in light and 0.67–0.76 in dark. Zone 5 in light sits close to <code>status-missed</code> (both red); the word beside each keeps them apart.</p>
<h3>Probes and method</h3>
<ul class="dec">
<li>Settled by probe: <i>what each page looks like</i>. A copy of the checkout ran on its own port and database with the seeded athlete. Every state was captured before the change, then <code>sweep.py</code> (the map above as a codemod) was applied to the copy and every state captured again: 9 states × 390/1440 × light/dark. The diff is <code>role-steps.diff</code>.</li>
<li>Settled by probe: <i>error colour</i>. <code>text-foreground-destructive</code> measures 6.28 on card in light and 4.75 in dark. <code>text-destructive</code> measures 4.44 on the light page, below AA.</li>
<li>Settled by probe: <i>worst case</i> (<code>worst.py</code>, written into the copy's database only). The exercise trigger clipped the name; the fix was drawn and captured.</li>
<li>Inventory gap: the spec's <code>leftover-classes.txt</code> lists 127 lines. A repo-wide grep with the same exclusions finds 142, plus <code>rounded-md</code> in <code>score-stanza</code>. The extra lines are in <code>page-header</code>, <code>overlay-header</code>, <code>score-stanza</code> (3), <code>token-popover</code>, <code>load-legend</code>, <code>load-metric-badge</code>, <code>forms</code>, <code>tab-bar</code> and <code>profile-bars</code>. All of these are shared app components, which are in scope.</li>
</ul>
<h3>Motion (review-animations)</h3>
<div class="tablewrap"><table><tr><th>Before</th><th>After</th><th>Why</th></tr>
<tr><td>Popovers open with <code>motion-popup</code></td><td>Unchanged; only radius, type and surface classes moved</td><td>AC8: no new animation</td></tr>
<tr><td>Field focus: <code>ring-2</code>, no transition</td><td><code>ring-3 ring-ring/30</code>, no transition (as <code>ui/input</code>)</td><td>One field look; a focus ring must not ease</td></tr>
</table></div><p class="muted">Verdict: no Block. No transition, keyframe or duration was added or changed.</p>
<h3>Mobile (mobile-native)</h3><p class="muted">Inputs stay 16 px on phones (<code>text-body</code>, plus the global coarse-pointer floor). No <code>h-</code>/<code>size-</code> class shrinks; the exercise trigger grows from <code>h-11</code> to <code>min-h-11</code>. No hover-only affordance was added. <b>Needs a real phone:</b> the darker light zone hues outdoors, the dark zones on OLED, the three-line exercise trigger under a thumb, and how much stronger <code>shadow-md</code> list groups feel on Meg.</p>
<h3>Rejected directions</h3>
<ul class="dec"><li>Size for size (<code>text-sm</code> → <code>footnote</code> everywhere): it flattens row titles and facts back into one step.</li><li>Keeping the light zone values: AC6 fails in light.</li><li>Bordered boxes at <code>rounded-3xl</code>: a box inside a card, which AC4 forbids.</li><li><code>PageHeader</code> at <code>title</code>: it gives Plan and Økt two titles.</li></ul>
<h3>Code the variant touches</h3>
<p class="muted"><code>app/styles/tailwind.css</code> (the zone values, light and <code>.dark</code>); 10 shared components (<code>page-header</code>, <code>overlay-header</code>, <code>score-stanza</code>, <code>profile-bars</code>, <code>token-popover</code>, <code>load-legend</code>, <code>load-metric-badge</code>, <code>forms</code>, <code>tab-bar</code>, <code>chart/chart</code>); 25 training routes (Plan editors, popovers, <code>sessions.$sessionId</code>, <code>plan</code>, <code>plan.new</code>, <code>__library-section</code>, <code>__exercise-combobox</code>); 4 settings routes; <code>start/niva</code>; 8 I dag files. Not drawn here: <code>/design</code>, <code>design-system.md</code>, ADR 0085 §2, the ESLint rule and admin.</p>
</details>

<h2>Role steps <span class="status current">Chosen</span></h2>
<p class="muted">The real app with today's code and with Role steps. Use the picker (1/2, ←/→) and choose page, theme, width and data. Every page in the list was captured from the running app; the zone page is drawn with the token values.</p>
{frame}

<h2>Worst case</h2>
<div data-worst="0" id="worst">
<div class="seg" role="group" aria-label="Data"><button aria-pressed="true" data-w="0">Demo data</button><button aria-pressed="false" data-w="1">Worst case</button></div>
<div class="grid">
{''.join(f'<figure data-set="demo"><img alt="Role steps, demo data: {html.escape(c)}" src="{s(f"role-steps/{k if k != 'session-strength' else 'session-sets'}-light-mobile")}"><figcaption>{html.escape(c.split(":")[0])}, demo data</figcaption></figure><figure data-set="worst"><img alt="Role steps, worst case: {html.escape(c)}" src="{s(f"role-steps-worst/{k}-light-mobile")}"><figcaption>{html.escape(c)}</figcaption></figure>' for k, c in WORST)}
<figure data-set="worst"><img alt="Today, worst case: the exercise trigger clips the name" src="{s("clip/session-strength-light-mobile")}"><figcaption>Today, the same data: the trigger cuts the name to “Bulgarsk splittkneb”. Role steps lets it wrap.</figcaption></figure>
</div>
<p class="muted">The worst case has 80-character session titles, a 40-character exercise name (“Bulgarsk splittknebøy, manualer og pause”), 1 055 km/uke as the running anchor, and æøå at caption size (“pause mellom settene”, “Løping”). Dark and 1440 px versions are in the prototype under Worst case. No captured state scrolls sideways at 390.</p>
</div>

<h2>Earlier runs</h2>
<details><summary>None</summary><p class="muted">This is the first design run on #528.</p></details>
</div>
<script>
const w = document.getElementById('worst');
w.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {{
  w.dataset.worst = b.dataset.w;
  w.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}}));
</script>
</body></html>'''
open(f'{EV}/canvas.html', 'w').write(page)
print('canvas.html', round(len(page) / 1e6, 2), 'MB')
