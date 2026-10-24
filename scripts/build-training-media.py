#!/usr/bin/env python3
"""Builds the Training Center media bundle from the Free Exercise DB (public domain, github.com/yuhonas/free-exercise-db).

  python3 scripts/build-training-media.py <path-to-free-exercise-db> <output-folder>

Output (copy both into the website's root folder):
  <output>/data/exercises.json            slim library used by the Training Center
  <output>/exercises/<id>/0.webp, 1.webp  start / end position photos, resized to 640px wide
Requires:  pip install Pillow
"""
import json, os, re, sys
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
WIDTH, QUALITY = 640, 72
data = json.load(open(os.path.join(src, 'dist', 'exercises.json'), encoding='utf-8'))
os.makedirs(os.path.join(out, 'data'), exist_ok=True)

slim, total_bytes, n_img = [], 0, 0
for e in data:
    frames = 0
    folder = os.path.join(out, 'exercises', e['id'])
    for i, rel in enumerate(e.get('images', [])[:2]):
        p = os.path.join(src, 'exercises', rel)
        if not os.path.exists(p):
            continue
        os.makedirs(folder, exist_ok=True)
        im = Image.open(p).convert('RGB')
        if im.width > WIDTH:
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        dest = os.path.join(folder, f'{i}.webp')
        im.save(dest, 'WEBP', quality=QUALITY, method=6)
        total_bytes += os.path.getsize(dest); n_img += 1; frames += 1
    slim.append({
        'id': e['id'], 'name': e['name'], 'category': e.get('category') or '', 'level': e.get('level') or '',
        'equipment': e.get('equipment') or '', 'force': e.get('force') or '', 'mechanic': e.get('mechanic') or '',
        'primaryMuscles': e.get('primaryMuscles') or [], 'secondaryMuscles': e.get('secondaryMuscles') or [],
        'instructions': e.get('instructions') or [], 'frames': frames,
    })

with open(os.path.join(out, 'data', 'exercises.json'), 'w', encoding='utf-8') as f:
    json.dump(slim, f, ensure_ascii=False, separators=(',', ':'))
print(f'{len(slim)} exercises, {n_img} images, {total_bytes/1024/1024:.1f} MB of images, '
      f'{os.path.getsize(os.path.join(out, "data", "exercises.json"))/1024:.0f} KB json')
