"""The 'Role steps' sweep, as a prototype codemod: applies the role -> luma step map to every
off-scale radius and raw text size in page code, plus the surface and zone changes.
Run against a COPY of the repo (never the checkout):  python3 -I sweep.py <repo> [--dry]
It is the drawing, not the build: the build re-does this by hand, file by file, with tests."""
import re, subprocess, sys
REPO = sys.argv[1]; DRY = '--dry' in sys.argv
SKIP_FILES = ('app/components/ui/', '__prototype', '.test.', '_marketing', '_auth', '/admin/', 'app/styles/',
              'app/routes/_home/index.tsx', 'app/components/auth-layout.tsx', 'app/components/dev-athlete-switcher.tsx',
              'app/components/prototype-switcher.tsx', 'app/components/floating-toolbar.tsx', 'app/routes/__design-tokens.tsx')
PAT = re.compile(r"rounded-(sm|md|lg|xl)\b|\btext-(xs|sm|base|lg|xl|2xl|3xl)\b")

def is_comment(line):
    s = line.strip(); return s.startswith(('*', '//', '/*', '{/*'))

def sweep(line, where):
    o = line
    # Mirrors of a primitive keep the primitive's own sizes (decision: eslint-disable with a reason).
    if 'exercise-combobox' in where: return line
    # --- type -------------------------------------------------------------------------------
    line = line.replace('text-xl font-semibold tracking-tight', 'text-heading')            # Plan span figure
    line = re.sub(r'\btext-lg font-semibold\b', 'text-heading', line)                       # page/overlay header
    line = re.sub(r'(<CardTitle className="[^"]*)\btext-base\b', r'\1text-heading', line)      # section headings
    line = re.sub(r'\btext-destructive\b(.*?)\btext-(xs|sm)\b', r'text-foreground-destructive\1text-footnote', line)
    line = re.sub(r'\btext-sm font-medium\b', 'text-callout', line)
    line = re.sub(r'\bfont-medium\b(.*?)\btext-sm\b', r'\1text-callout', line) if 'text-sm' in line and 'font-medium' in line and 'muted' not in line else line
    line = re.sub(r'\btext-xs\b', 'text-caption', line)
    line = re.sub(r'\bmd:text-base\b', 'md:text-body', line)
    line = re.sub(r'\bmd:text-sm\b', 'md:text-footnote', line)
    line = re.sub(r'\btext-sm\b', 'text-footnote', line)
    line = re.sub(r'\btext-base\b', 'text-body', line)
    line = re.sub(r'\btext-lg\b', 'text-heading', line)                                     # stepper glyphs
    # --- radius and surface -------------------------------------------------------------------
    if 'border-input bg-background' in line:                                                # popover fields -> luma field
        line = line.replace('border-input bg-background', 'bg-input/50 border-transparent')
        line = line.replace('focus-visible:ring-ring ', 'focus-visible:ring-ring/30 ').replace('focus-visible:ring-2', 'focus-visible:ring-3')
        line = re.sub(r'rounded-(lg|xl)\b', 'rounded-3xl', line)
    if re.search(r'border-border/70.*rounded-lg border p-', line):                          # bordered box in a card -> well
        line = line.replace('border-border/70 ', '').replace('bg-muted/20 ', '').replace('rounded-lg border p-', 'bg-muted/50 rounded-3xl p-')
    line = re.sub(r'(size-11 shrink-0) rounded-lg', r'\1 rounded-3xl', line)               # steppers beside a field
    if re.search(r'size-[23]\b', line): line = re.sub(r'rounded-sm\b', 'rounded-[3px]', line)  # legend swatches = marks
    if 'whitespace-nowrap rounded-md' in line or 'whitespace-nowrap tabular-nums' in line and 'rounded-lg px-1.5' in line:
        line = re.sub(r'rounded-(md|lg)\b', 'rounded-full', line)                           # chips
    line = re.sub(r'bg-muted rounded-sm px-1\.5', 'bg-muted rounded-full px-1.5', line)     # key chip on the empty state
    line = re.sub(r'rounded-xl\b', 'rounded-3xl', line)                                      # wells, controls
    line = re.sub(r'rounded-(sm|md|lg)\b', 'rounded-2xl', line)                              # items, focus targets
    line = line.replace('tracking-tight ', '')
    return line

files = subprocess.run(['grep', '-rlE', PAT.pattern.replace('\\b', '\\b'), 'app', '--include=*.tsx', '--include=*.ts'], cwd=REPO, capture_output=True, text=True).stdout.split()
changed = 0
for f in sorted(files):
    if any(s in f for s in SKIP_FILES): continue
    path = f'{REPO}/{f}'; src = open(path).read().split('\n'); out = []
    for i, line in enumerate(src, 1):
        if PAT.search(line) and not is_comment(line):
            new = sweep(line, f)
            if new != line:
                changed += 1
                if DRY: print(f'{f}:{i}\n  - {line.strip()[:220]}\n  + {new.strip()[:220]}')
            out.append(new)
        else: out.append(line)
    if not DRY: open(path, 'w').write('\n'.join(out))

# --- surfaces outside the regex: list groups on the card surface, rules at low opacity ---------
EXTRA = [
    ('app/routes/settings/__meg-ui.tsx', 'divide-border/70 divide-y rounded-4xl px-4 shadow-xs ring-1', 'divide-border/60 divide-y rounded-4xl px-4 shadow-md ring-1'),
    ('app/routes/settings/training/lifts.$exerciseId.tsx', 'divide-border/70 divide-y rounded-4xl px-4 shadow-xs ring-1', 'divide-border/60 divide-y rounded-4xl px-4 shadow-md ring-1'),
    ('app/routes/training/__library-section.tsx', 'divide-y overflow-hidden rounded-4xl shadow-xs', 'divide-y overflow-hidden rounded-4xl shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10'),
    ('app/routes/training/__week-pattern-editor.tsx', '"divide-border divide-y"', '"divide-border/60 divide-y"'),
    ('app/routes/training/sessions.$sessionId.tsx', 'divide-border mt-1 divide-y', 'divide-border/60 mt-1 divide-y'),
]
for f, a, b in EXTRA:
    p = f'{REPO}/{f}'; s = open(p).read()
    if a in s:
        changed += 1
        if DRY: print(f'{f}: {a} -> {b}')
        else: open(p, 'w').write(s.replace(a, b))
    else: print('MISSING', f, a)
# --- the Training Zone ladder: new light values, and dark values ---------------------------------
ZL = ['oklch(0.6 0.12 250)', 'oklch(0.59 0.12 160)', 'oklch(0.65 0.13 95)', 'oklch(0.61 0.14 58)', 'oklch(0.55 0.19 22)']
ZD = ['oklch(0.72 0.11 250)', 'oklch(0.72 0.12 160)', 'oklch(0.76 0.12 95)', 'oklch(0.74 0.14 58)', 'oklch(0.67 0.16 22)']
p = f'{REPO}/app/styles/tailwind.css'; s = open(p).read()
for i, old in enumerate(['#5f9fe0', '#3fae7d', '#d9b13b', '#e08a3c', '#d95757']):
    s = s.replace(f'--zone-{i+1}: {old};', f'--zone-{i+1}: {ZL[i]};')
dark = '\n'.join(f'\t--zone-{i+1}: {v};' for i, v in enumerate(ZD))
s = s.replace('\t--track-run-ink: oklch(0.74 0.13 32);', '\t--track-run-ink: oklch(0.74 0.13 32);\n' + dark, 1)
if not DRY: open(p, 'w').write(s)
print('changed', changed)
