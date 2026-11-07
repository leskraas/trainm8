# Builds prototype.html: a self-contained flip-book of the REAL app (isolated copy on :3140), today's code
# against the "Role steps" sweep, plus a live zone ladder drawn with the token values.
# The picker is PICKER.md verbatim (Emil's prototype-ui). Images come from shots.json (webp.py).
import json, sys
EV = sys.argv[1]
shots = json.load(open(f'{EV}/shots.json'))
zones = json.load(open(f'{EV}/zones.json'))

PAGES = [
    ('plan-span', 'Plan · Hva planen består av'),
    ('plan-phase', 'Plan · fasekort'),
    ('plan-season-edit', 'Plan · Endre sesongen'),
    ('plan-weeks', 'Plan · Uke for uke'),
    ('session', 'Økt'),
    ('session-intensity', 'Økt · intensitet'),
    ('session-sets', 'Økt · sett'),
    ('session-strength', 'Økt · øvelse (worst case)'),
    ('meg', 'Meg'),
    ('lift', 'Meg · løftet'),
    ('zones', 'Sonefarger'),
]
TOKENS = {
    'light': {'bg': 'oklch(0.975 0.003 197)', 'card': 'oklch(1 0 0)', 'fg': 'oklch(0.148 0.004 228.8)', 'muted': 'oklch(0.52 0.016 213.5)', 'line': 'oklch(0.915 0.005 214.3)'},
    'dark': {'bg': 'oklch(0.148 0.004 228.8)', 'card': 'oklch(0.205 0.007 223.9)', 'fg': 'oklch(0.987 0.002 197.1)', 'muted': 'oklch(0.723 0.014 214.4)', 'line': 'oklch(1 0 0 / 10%)'},
}
ZONE_VALUES = {
    'today': {'light': [r['value'] for r in zones['today light']['rows']], 'dark': [r['value'] for r in zones['today dark']['rows']]},
    'role-steps': {'light': [r['value'] for r in zones['proposed light']['rows']], 'dark': [r['value'] for r in zones['proposed dark']['rows']]},
}
ZONE_NUMBERS = {
    'today': {'light': zones['today light'], 'dark': zones['today dark']},
    'role-steps': {'light': zones['proposed light'], 'dark': zones['proposed dark']},
}

PICKER_CSS = '''
.proto-picker {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.82);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  backdrop-filter: blur(12px) saturate(1.4);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 8px 24px rgba(0, 0, 0, 0.24),
    0 2px 6px rgba(0, 0, 0, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  -webkit-user-select: none;
}

.proto-picker-highlight {
  position: absolute;
  top: 4px;
  left: 0;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  will-change: transform;
}

/* The slide is enabled only after first paint (data-ready), so load doesn't animate. */
.proto-picker[data-ready] .proto-picker-highlight {
  transition:
    transform 250ms cubic-bezier(0.23, 1, 0.32, 1),
    width 250ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (prefers-reduced-motion: reduce) {
  .proto-picker[data-ready] .proto-picker-highlight { transition: none; }
}

.proto-picker-item {
  position: relative; /* sits above the highlight */
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font: inherit;
  cursor: pointer;
  transition: color 150ms ease-out;
}

.proto-picker-item:hover {
  color: rgba(255, 255, 255, 0.85);
}

.proto-picker-item:active {
  transform: scale(0.97);
}

.proto-picker-item:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.4);
  outline-offset: 2px;
}

.proto-picker-item[data-active] {
  color: #fff;
}

.proto-picker-divider {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.12);
}

.proto-picker-replay {
  padding: 0 10px;
  font-size: 14px;
}

.proto-picker[data-position="top"] {
  bottom: auto;
  top: 24px;
}
'''

html = f'''<!doctype html>
<html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Role steps prototype</title>
<style>
:root {{ --h-bg:#eef0f1; --h-fg:#15191b; --h-muted:#5d6a70; --h-chip:#ffffff; --h-line:#d5dadc; color-scheme: light; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --h-bg:#0e1113; --h-fg:#eef1f2; --h-muted:#9aa5aa; --h-chip:#1b2124; --h-line:#2b3236; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --h-bg:#0e1113; --h-fg:#eef1f2; --h-muted:#9aa5aa; --h-chip:#1b2124; --h-line:#2b3236; color-scheme: dark; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; background:var(--h-bg); color:var(--h-fg); font:14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding-bottom: 96px; }}
.harness {{ position: sticky; top: 0; z-index: 10; background: var(--h-bg); border-bottom: 1px solid var(--h-line); padding: 10px 16px; display:flex; flex-wrap:wrap; gap: 8px 16px; align-items:center; }}
.harness .group {{ display:flex; flex-wrap: wrap; gap:4px; align-items:center; min-width:0; }}
.harness .label {{ color: var(--h-muted); font-size: 12px; margin-right: 2px; }}
.harness button {{ font: inherit; font-size: 13px; min-height: 32px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--h-line); background: var(--h-chip); color: var(--h-fg); cursor: pointer; }}
.harness button[aria-pressed="true"] {{ background: var(--h-fg); color: var(--h-bg); border-color: var(--h-fg); }}
.harness select {{ font: inherit; font-size: 16px; min-height: 36px; border-radius: 10px; border:1px solid var(--h-line); background: var(--h-chip); color: var(--h-fg); padding: 2px 8px; max-width: 100%; }}
#stage {{ padding: 16px; display:flex; flex-direction: column; align-items:center; gap: 10px; }}
.shot {{ display:block; max-width: 100%; height: auto; border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.10); }}
.cap {{ color: var(--h-muted); font-size: 13px; max-width: 760px; text-align: center; }}
.note {{ max-width: 560px; padding: 16px; border-radius: 14px; background: var(--h-chip); border: 1px solid var(--h-line); }}
/* zone ladder: drawn with the app's own card and zone values for the chosen theme */
.zl {{ width: 100%; max-width: 760px; border-radius: 16px; padding: 16px; }}
.zl .card {{ border-radius: 15.6px; padding: 16px; margin-bottom: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / .1), 0 2px 4px -2px rgb(0 0 0 / .1); }}
.zl h3 {{ margin: 0 0 4px; font-size: 18px; line-height: 24px; font-weight: 600; letter-spacing: -0.012em; }}
.zl .fn {{ font-size: 13px; line-height: 18px; }}
.zl .row {{ display:flex; align-items:flex-end; gap: 2px; height: 42px; margin: 10px 0 4px; }}
.zl .bars {{ display:flex; align-items:flex-end; gap: 1px; height: 24px; margin: 10px 0 4px; }}
.zl .chips {{ display:flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }}
.zl .chip {{ border-radius: 999px; padding: 1px 8px; font-weight: 600; font-variant-caps: small-caps; font-size: 13px; font-variant-numeric: tabular-nums; }}
.zl .dots {{ display:flex; gap: 6px; margin-top: 10px; align-items:center; }}
.zl .dot {{ width: 6px; height: 6px; border-radius: 999px; }}
.zl table {{ width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }}
.zl th, .zl td {{ text-align: left; padding: 6px 4px; }}
.zl td.sw span {{ display:inline-block; width: 28px; height: 14px; border-radius: 3px; vertical-align: middle; }}
{PICKER_CSS}
</style></head><body>
<div class="harness" role="toolbar" aria-label="Prototype controls">
  <div class="group"><span class="label">Side</span><select id="page" aria-label="Side">{''.join(f'<option value="{k}">{v}</option>' for k, v in PAGES)}</select></div>
  <div class="group" data-ctl="theme"><span class="label">Tema</span><button data-v="light">Lys</button><button data-v="dark">Mørk</button></div>
  <div class="group" data-ctl="w"><span class="label">Bredde</span><button data-v="390">390</button><button data-v="1440">1440</button></div>
  <div class="group" data-ctl="data"><span class="label">Data</span><button data-v="demo">Demo data</button><button data-v="worst">Worst case</button></div>
</div>
<main id="stage" aria-live="polite"></main>
<nav class="proto-picker" aria-label="Prototype variants">
  <span class="proto-picker-highlight" aria-hidden="true"></span>
  <button class="proto-picker-item" data-active aria-current="true">Today</button>
  <button class="proto-picker-item">Role steps</button>
</nav>
<script>
const SHOTS = {json.dumps(shots)};
const TOKENS = {json.dumps(TOKENS)};
const ZONES = {json.dumps(ZONE_VALUES)};
const ZNUM = {json.dumps(ZONE_NUMBERS)};
const PAGES = {json.dumps(dict(PAGES), ensure_ascii=False)};
const WORST = ['session', 'session-sets', 'session-strength', 'lift', 'plan-span', 'plan-weeks'];
const DEMO = ['plan-span', 'plan-phase', 'plan-season-edit', 'plan-weeks', 'session', 'session-intensity', 'session-sets', 'meg', 'lift'];
const params = new URLSearchParams(location.search);
const state = {{ page: params.get('page') || 'session-sets', theme: params.get('theme') || 'light', w: params.get('w') || '390', data: params.get('data') || 'demo' }};
const LABEL = ['today', 'role-steps'];
const NAME = ['Today (origin/main 790ac7f)', 'Role steps'];
function esc(s) {{ return String(s).replace(/[&<>"]/g, (c) => ({{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }})[c]); }}
function shot(key, alt) {{
  const s = SHOTS[key];
  if (!s) return null;
  return `<img class="shot" alt="${{esc(alt)}}" src="${{s.src}}" style="width:${{s.w}}px">`;
}}
function zoneLadder(v) {{
  const t = TOKENS[state.theme], z = ZONES[LABEL[v]][state.theme], n = ZNUM[LABEL[v]][state.theme];
  const mix = [22, 22, 26, 24, 22];
  const strip = [[1, 12], ...Array.from({{ length: 5 }}, () => [[5, 3], [2, 2]]).flat(), [1, 8]];
  const prof = [1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 4, 3, 2, 2, 1, 1, 2, 3, 4, 5, 5, 4, 2, 1];
  const ph = {{ 1: 8, 2: 12, 3: 16, 4: 20, 5: 24 }};
  const names = ['Rolig', 'Langkjør', 'Moderat', 'Terskel', 'Maks'];
  return `<div class="zl" style="background:${{t.bg}};color:${{t.fg}}">
    <div class="card" style="background:${{t.card}}">
      <h3>Workout Shape strip</h3>
      <div class="row">${{strip.map(([zone, w]) => `<div style="flex:${{w}} 0 0;min-width:6px;height:${{zone * 20}}%;border-radius:3px 3px 0 0;background:${{z[zone - 1]}}"></div>`).join('')}}</div>
      <p class="fn" style="color:${{t.muted}};margin:0">5 × 3 min hard, like lang jogg</p>
      <h3 style="margin-top:16px">Profile bars</h3>
      <div class="bars">${{prof.map((zone) => `<div style="width:8px;height:${{ph[zone]}}px;border-radius:2px 2px 0 0;background:${{z[zone - 1]}}"></div>`).join('')}}</div>
      <h3 style="margin-top:16px">Intensity chips</h3>
      <div class="chips">${{z.map((c, i) => `<span class="chip" style="background:color-mix(in srgb, ${{c}} ${{mix[i]}}%, ${{t.card}})">${{names[i]}}</span>`).join('')}}</div>
      <h3 style="margin-top:16px">Season chart dots</h3>
      <div class="dots">${{[3, 3, 4, 5, 4, 5, 5, 3].map((zone) => `<span class="dot" style="background:${{z[zone - 1]}}"></span>`).join('')}}</div>
    </div>
    <div class="card" style="background:${{t.card}}">
      <table><thead><tr style="color:${{t.muted}}"><th>Sone</th><th></th><th>Verdi</th><th>mot card</th><th>mot side</th><th>chip-tekst</th></tr></thead><tbody>
      ${{n.rows.map((r) => `<tr style="border-top:1px solid ${{t.line}}"><td>${{r.zone}}</td><td class="sw"><span style="background:${{r.value}}"></span></td><td><code>${{esc(r.value)}}</code></td><td style="${{r.card < 3 ? 'color:#d33;font-weight:700' : ''}}">${{r.card.toFixed(2)}}</td><td>${{r.page.toFixed(2)}}</td><td>${{r.chip_text.toFixed(1)}}</td></tr>`).join('')}}
      </tbody></table>
      <p class="fn" style="color:${{t.muted}};margin:8px 0 0">Mark contrast (WCAG 1.4.11, 3:1). Ladder spread, brightest ÷ dimmest on card: ${{n.spread}}. ${{v === 0 && state.theme === 'dark' ? 'Today has no dark values: these are the light hexes.' : ''}}</p>
    </div></div>`;
}}
function render(v) {{
  if (state.page === 'zones') return zoneLadder(v) + `<p class="cap">${{NAME[v]}}: the Training Zone ladder in ${{state.theme === 'dark' ? 'dark' : 'light'}}, drawn with the app's card and zone values.</p>`;
  const size = state.w === '390' ? 'mobile' : 'desktop';
  const key = `${{state.page}}-${{state.theme}}-${{size}}`;
  if (state.data === 'worst') {{
    if (!WORST.includes(state.page)) return `<div class="note">No worst case drawn for this page. Worst case covers: ${{WORST.map((p) => PAGES[p]).join(', ')}}.</div>`;
    if (v === 0) {{
      const clip = state.page === 'session-strength' ? shot('clip/session-strength-light-mobile', 'Today: the exercise trigger clips a 40-character name') : null;
      return clip ? clip + `<p class="cap">Today, light, 390: the exercise picker trigger cuts “Bulgarsk splittknebøy, manualer og pause” to “Bulgarsk splittkneb”. Role steps lets it wrap.</p>`
        : `<div class="note">Worst case is drawn for the variant (Role steps). Switch to it with 2 or →.</div>`;
    }}
    const img = shot(`role-steps-worst/${{key}}`, `Role steps, worst case, ${{key}}`);
    return (img || `<div class="note">Not captured: ${{esc(key)}}</div>`) + `<p class="cap">Role steps with worst-case data: 80-character session titles, a 40-character exercise name, 1 055 km/uke as the running anchor.</p>`;
  }}
  if (!DEMO.includes(state.page)) return `<div class="note">This page is drawn with worst-case data only. Choose Worst case.</div>`;
  const img = shot(`${{LABEL[v]}}/${{key}}`, `${{NAME[v]}}, ${{key}}`);
  return (img || `<div class="note">Not captured: ${{esc(key)}}</div>`) + `<p class="cap">${{NAME[v]}} · ${{PAGES[state.page]}} · ${{state.theme === 'dark' ? 'mørk' : 'lys'}} · ${{state.w}} px. Real app, isolated instance, seeded athlete (kody).</p>`;
}}
const variants = [() => render(0), () => render(1)];
function syncControls() {{
  document.getElementById('page').value = state.page;
  for (const g of document.querySelectorAll('[data-ctl]')) for (const b of g.querySelectorAll('button')) b.setAttribute('aria-pressed', String(state[g.dataset.ctl] === b.dataset.v));
}}
function saveState() {{
  const url = new URL(location);
  for (const k of ['page', 'theme', 'w', 'data']) url.searchParams.set(k, state[k]);
  try {{ history.replaceState(null, '', url); }} catch {{}}
}}
document.getElementById('page').addEventListener('change', (e) => {{ state.page = e.target.value; if (state.page === 'session-strength') state.data = 'worst'; syncControls(); saveState(); mount(current); }});
for (const g of document.querySelectorAll('[data-ctl]')) g.addEventListener('click', (e) => {{
  const b = e.target.closest('button'); if (!b) return;
  state[g.dataset.ctl] = b.dataset.v; syncControls(); saveState(); mount(current);
}});
syncControls();

// `variants` is an array of render functions, one per variant, in picker order.
const stage = document.getElementById('stage');
const picker = document.querySelector('.proto-picker');
const highlight = picker.querySelector('.proto-picker-highlight');
const items = [...picker.querySelectorAll('.proto-picker-item:not(.proto-picker-replay)')];
const replay = picker.querySelector('.proto-picker-replay');
let current = 0;

function moveHighlight() {{
  const el = items[current];
  highlight.style.width = el.offsetWidth + 'px';
  highlight.style.transform = `translateX(${{el.offsetLeft}}px)`;
}}

function mount(i) {{
  stage.innerHTML = '';
  // Clear first, render next frame, so entrance animations re-run.
  requestAnimationFrame(() => {{ stage.innerHTML = variants[i](); }});
}}

function setActive(i) {{
  if (i < 0 || i >= variants.length) return;
  current = i;
  items.forEach((el, j) => {{
    el.toggleAttribute('data-active', j === i);
    if (j === i) el.setAttribute('aria-current', 'true');
    else el.removeAttribute('aria-current');
  }});
  moveHighlight();
  const url = new URL(location);
  url.searchParams.set('v', i + 1);
  try {{ history.replaceState(null, '', url); }} catch {{}}
  mount(i);
}}

items.forEach((el, i) => el.addEventListener('click', () => setActive(i)));
replay?.addEventListener('click', () => mount(current));
window.addEventListener('resize', moveHighlight);

document.addEventListener('keydown', (e) => {{
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= variants.length) setActive(num - 1);
  else if (e.key === 'ArrowRight') setActive((current + 1) % variants.length);
  else if (e.key === 'ArrowLeft') setActive((current - 1 + variants.length) % variants.length);
  else if (e.key === 'r' || e.key === 'R') mount(current);
}});

setActive((parseInt(params.get('v'), 10) || 1) - 1);
// Enable the slide only after first paint, so load doesn't animate.
requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute('data-ready', '')));
</script></body></html>'''
open(f'{EV}/prototype.html', 'w').write(html)
print('prototype.html', round(len(html) / 1e6, 2), 'MB')
