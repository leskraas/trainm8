"""Exact, unique string replacements: python3 rep.py <file> <pairs.py>.

pairs.py defines PAIRS = [(old, new), ...] and optionally ALL = [(old, new)]
for replacements that may occur more than once.
"""
import sys

path, pairs_path = sys.argv[1], sys.argv[2]
ns: dict = {}
exec(open(pairs_path).read(), ns)
s = open(path).read()
errors = []
for old, new in ns.get('PAIRS', []):
    n = s.count(old)
    if n != 1:
        errors.append(f'{n}x: {old[:90]!r}')
        continue
    s = s.replace(old, new)
for old, new in ns.get('ALL', []):
    if old not in s:
        errors.append(f'0x (ALL): {old[:90]!r}')
        continue
    s = s.replace(old, new)
if errors:
    print('\n'.join(errors))
    sys.exit(1)
open(path, 'w').write(s)
print('ok')
