# SPDX-License-Identifier: GPL-3.0-or-later
# Builds the website's own icons (browser tab, search results, bookmarks, home screen) from site/tools/favicon/.
# The launcher (MeguLit.exe) keeps its own icon; nothing here reads or writes desktop/icons.
#   pixels-16.txt, pixels-32.txt  hand-placed pixel maps for 16 and 32 px (first line: palette "k=#170f11 ...")
#   icon.svg / icon-512.png       the vector mark on a transparent background, used for 48 px
#   touch.svg / touch-512.png     the same mark on an opaque square, used for apple-touch-icon and the web manifest
# Outputs in site/public: favicon.ico (16, 32, 48), favicon.svg, favicon-16.png, favicon-32.png,
#   apple-touch-icon.png (180, opaque), icon-192.png, icon-512.png
# Usage (from the repo root): python -I site/tools/build-favicon.py
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'site' / 'tools' / 'favicon'
PUB = ROOT / 'site' / 'public'


def read_map(n):
    lines = (SRC / f'pixels-{n}.txt').read_text('utf8').splitlines()
    pal = {k: v for k, v in (p.split('=') for p in lines[0].lstrip('# ').split())}
    rows = lines[1:1 + n]
    assert len(rows) == n and all(len(r) == n for r in rows), f'pixels-{n}.txt must be {n}x{n}'
    return pal, rows


def from_map(n):
    pal, rows = read_map(n)
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                c = pal[ch]
                im.putpixel((x, y), (int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16), 255))
    return im


def svg_from_map(n):
    # one rect per pixel, crisp edges: the 16 px drawing stays sharp at 16 and doubles cleanly on high-DPI tabs
    pal, rows = read_map(n)
    rects = ''
    for y, row in enumerate(rows):
        x = 0
        while x < n:   # one rect per horizontal run of the same colour
            ch, w = row[x], 1
            while x + w < n and row[x + w] == ch:
                w += 1
            if ch != '.':
                rects += f'<rect x="{x}" y="{y}" width="{w}" height="1" fill="{pal[ch]}"/>'
            x += w
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" width="{n}" height="{n}" '
            f'shape-rendering="crispEdges">{rects}</svg>\n')


p16, p32 = from_map(16), from_map(32)
p48 = Image.open(SRC / 'icon-512.png').convert('RGBA').resize((48, 48), Image.LANCZOS)
p16.save(PUB / 'favicon-16.png')
p32.save(PUB / 'favicon-32.png')
p48.save(PUB / 'favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)], append_images=[p16, p32])
(PUB / 'favicon.svg').write_text(svg_from_map(16), 'utf8')

touch = Image.open(SRC / 'touch-512.png').convert('RGB')   # opaque: iOS fills transparency with black
touch.resize((180, 180), Image.LANCZOS).save(PUB / 'apple-touch-icon.png')
touch.resize((192, 192), Image.LANCZOS).save(PUB / 'icon-192.png')
touch.save(PUB / 'icon-512.png')

ico = Image.open(PUB / 'favicon.ico')
print('favicon.ico sizes', sorted(ico.info.get('sizes', ico.ico.sizes())))
