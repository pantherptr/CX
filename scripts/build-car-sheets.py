"""Packs the Blender frames (scripts/render-car-sprites.py) into one WebP sprite sheet per colour.

  python3 scripts/build-car-sheets.py FRAMES_DIR public/car

Every sheet is a single row of N frames, all cropped to the same box so the car
stays centred as it turns."""
import glob
import os
import sys

from PIL import Image

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
colors = sorted({os.path.basename(f).rsplit('-', 1)[0] for f in glob.glob(os.path.join(src, '*-*.png'))})

# one crop box for everything, so every colour lines up the same way
box = None
for f in glob.glob(os.path.join(src, '*-*.png')):
    b = Image.open(f).convert('RGBA').split()[3].point(lambda v: 255 if v > 6 else 0).getbbox()
    if b:
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
pad = 4
size = max(box[2] - box[0], box[3] - box[1]) + pad * 2
cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
crop = (cx - size // 2, cy - size // 2, cx + size // 2, cy + size // 2)
print('frame', size, 'px')

for c in colors:
    files = sorted(glob.glob(os.path.join(src, f'{c}-*.png')))
    sheet = Image.new('RGBA', (size * len(files), size), (0, 0, 0, 0))
    for i, f in enumerate(files):
        sheet.paste(Image.open(f).convert('RGBA').crop(crop), (i * size, 0))
    path = os.path.join(out, f'{c}.webp')
    sheet.save(path, 'WEBP', quality=84, method=6)
    print(c, len(files), 'frames', os.path.getsize(path) // 1024, 'KB')
