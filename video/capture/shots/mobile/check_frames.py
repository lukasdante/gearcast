"""Contact sheet for a capture: frames at every tap/type event (with the logged point drawn as a red ring) and at each mark.
   usage: python3 check_frames.py <shot> <out.png> [extra seconds...]"""
import json, subprocess, sys, os, tempfile
from PIL import Image, ImageDraw
shot, out = sys.argv[1], sys.argv[2]
cap = os.path.join(os.path.dirname(__file__), '../../../public/captures')
j = json.load(open(f'{cap}/{shot}.json'))
k = j['videoSize']['w'] / j['viewport']['w']
items = [(e['t'] + 0.05, e.get('label', e['type'])[:22], (e['x'], e['y'])) for e in j['events'] if e['type'] in ('click', 'type')]
items += [(m['t'], m['name'], None) for m in j['marks']] + [(float(x), f'{x}s', None) for x in sys.argv[3:]]
items.sort()
th = 640; tiles = []
d = tempfile.mkdtemp()
for i, (t, name, pt) in enumerate(items):
    f = f'{d}/{i}.png'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', f'{cap}/{shot}.webm', '-frames:v', '1', f], check=True)
    im = Image.open(f).convert('RGB')
    if pt:
        dr = ImageDraw.Draw(im); x, y = pt[0] * k, pt[1] * k; r = 14 * k
        dr.ellipse([x - r, y - r, x + r, y + r], outline=(255, 0, 0), width=int(2 * k))
    im = im.resize((round(im.width * th / im.height), th))
    ImageDraw.Draw(im).rectangle([0, 0, im.width, 18], fill=(0, 0, 0)); ImageDraw.Draw(im).text((3, 3), f'{t:.2f} {name}', fill=(255, 255, 0))
    tiles.append(im)
cols = min(len(tiles), 6 if tiles[0].width < tiles[0].height else 3)
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tiles[0].width, rows * th), (40, 40, 40))
for i, im in enumerate(tiles): sheet.paste(im, ((i % cols) * tiles[0].width, (i // cols) * th))
sheet.save(out); print(out, len(tiles), 'tiles')
