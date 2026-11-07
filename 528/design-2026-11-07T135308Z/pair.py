# Side-by-side before/after image for one state: python3 -I pair.py <ev> <state-theme-size>
import sys
from PIL import Image
ev, name = sys.argv[1], sys.argv[2]
a = Image.open(f'{ev}/shots/today/{name}.png'); b = Image.open(f'{ev}/shots/role-steps/{name}.png')
h = max(a.height, b.height); out = Image.new('RGB', (a.width + b.width + 40, h), (128, 128, 128))
out.paste(a, (0, 0)); out.paste(b, (a.width + 40, 0))
s = 1000 / out.height if out.height > 1000 else 1
out = out.resize((int(out.width * s), int(out.height * s)))
out.save(f'{ev}/pairs/{name}.png')
