# Converts the PNG captures to WebP for embedding: phone shots at 2x (q70), desktop at 1x (q75).
import glob, os, io, json, base64, sys
from PIL import Image
ev = sys.argv[1]; out = {}; total = 0
for p in sorted(glob.glob(f'{ev}/shots/*/*.png')):
    label = p.split('/')[-2]; name = os.path.basename(p)[:-4]
    im = Image.open(p).convert('RGB')
    if name.endswith('desktop'): im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS); q = 75
    else: q = 70
    b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=6); data = b.getvalue(); total += len(data)
    out[f'{label}/{name}'] = {'src': 'data:image/webp;base64,' + base64.b64encode(data).decode(), 'w': im.width if name.endswith('desktop') else im.width // 2}
json.dump(out, open(f'{ev}/shots.json', 'w'))
print(len(out), 'images', round(total / 1e6, 2), 'MB')
