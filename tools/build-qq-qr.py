# SPDX-License-Identifier: GPL-3.0-or-later
"""QQ 交流群 QR code in MeguLit's colours (2026-11-28).

The group's join link was read once from the QR card QQ gave the owner; the code is generated again from that link rather
than copied from the picture: round modules in a crimson-to-garnet gradient on warm white, rounded finder patterns,
MeguLit's icon in the middle, error correction H. Writes

  web/assets/qq-group-qr.svg              the home page card (web/qq-group.js)
  site/public/assets/img/qq-group-qr.svg  the website
  docs/assets/qq-group-qr.png             the README

and then reads every PNG it made back, at full size and at the sizes a phone camera sees, and stops with an error unless
each one gives the same link. Needs Python with numpy, opencv-python (4.x, QRCodeEncoder) and Pillow:

  python tools/build-qq-qr.py
"""
import pathlib, re, sys
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINK = 'https://qm.qq.com/q/C95LXYb5Sg'
GROUP = '1131267542'
TOP, BOTTOM, PAPER = '#e0495a', '#7a1225', '#fbf6ee'
QUIET, LOGO, DOT = 2, 9, .43  # modules of margin, modules the icon covers, dot radius in modules
# corner radii of a finder's outside, its hole and its centre, in modules. The outside stays nearly square: a round outer
# corner is what stops OpenCV (and older phone scanners) from finding the code; the hole and the centre carry the rounding
FINDER = (.5, 1.4, 1)


def matrix():
    p = cv2.QRCodeEncoder_Params()
    p.correction_level = cv2.QRCodeEncoder_CORRECT_LEVEL_H
    img = cv2.QRCodeEncoder.create(p).encode(LINK)
    dark = img == 0
    ys, xs = np.where(dark)
    m = dark[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    if m.shape[0] != m.shape[1]:
        sys.exit('unexpected QR shape %r' % (m.shape,))
    return m


def zones(n):
    finders = [(0, 0), (0, n - 7), (n - 7, 0)]
    start = (n - LOGO) // 2
    def in_finder(r, c):
        return any(r0 <= r < r0 + 7 and c0 <= c < c0 + 7 for r0, c0 in finders)
    def in_logo(r, c):
        return start <= r < start + LOGO and start <= c < start + LOGO
    return finders, start, in_finder, in_logo


def icon_inner():
    text = (ROOT / 'desktop' / 'icons' / 'source' / 'icon.svg').read_text(encoding='utf-8')
    return re.sub(r'^\s*<svg[^>]*>|</svg>\s*$', '', text.strip()).strip()


def rrect(x, y, w, h, r):
    return f'M{x+r:g} {y:g}H{x+w-r:g}A{r:g} {r:g} 0 0 1 {x+w:g} {y+r:g}V{y+h-r:g}A{r:g} {r:g} 0 0 1 {x+w-r:g} {y+h:g}H{x+r:g}A{r:g} {r:g} 0 0 1 {x:g} {y+h-r:g}V{y+r:g}A{r:g} {r:g} 0 0 1 {x+r:g} {y:g}Z'


def svg(m):
    n = len(m)
    size = n + 2 * QUIET
    finders, start, in_finder, in_logo = zones(n)
    parts = []
    for r in range(n):
        for c in range(n):
            if m[r, c] and not in_finder(r, c) and not in_logo(r, c):
                parts.append(f'<circle cx="{c + QUIET + .5:g}" cy="{r + QUIET + .5:g}" r="{DOT}"/>')
    for r0, c0 in finders:
        x, y = c0 + QUIET, r0 + QUIET
        parts.append(f'<path fill-rule="evenodd" d="{rrect(x, y, 7, 7, FINDER[0])}{rrect(x + 1, y + 1, 5, 5, FINDER[1])}"/>')
        parts.append(f'<path d="{rrect(x + 2, y + 2, 3, 3, FINDER[2])}"/>')
    lx = start + QUIET + .15
    lw = LOGO - .3
    pad = .7
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size * 10}" height="{size * 10}" role="img" '
            f'aria-label="MeguLit QQ 群 {GROUP}">\n'
            f'<defs><linearGradient id="qq-ink" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{size}" y2="{size}">'
            f'<stop offset="0" stop-color="{TOP}"/><stop offset="1" stop-color="{BOTTOM}"/></linearGradient></defs>\n'
            f'<rect width="{size}" height="{size}" rx="2" fill="{PAPER}"/>\n'
            f'<g fill="url(#qq-ink)">{"".join(parts)}</g>\n'
            f'<path d="{rrect(lx, lx, lw, lw, 1.8)}" fill="{PAPER}"/>\n'
            f'<svg x="{lx + pad:g}" y="{lx + pad:g}" width="{lw - 2 * pad:g}" height="{lw - 2 * pad:g}" viewBox="0 0 256 256">{icon_inner()}</svg>\n'
            '</svg>\n')


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def png(m, px):
    n = len(m)
    size = n + 2 * QUIET
    k = 4 * px / size  # supersampled pixels per module
    big = round(size * k)
    finders, start, in_finder, in_logo = zones(n)
    mask = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(mask)
    for r in range(n):
        for c in range(n):
            if m[r, c] and not in_finder(r, c) and not in_logo(r, c):
                cx, cy = (c + QUIET + .5) * k, (r + QUIET + .5) * k
                d.ellipse([cx - DOT * k, cy - DOT * k, cx + DOT * k, cy + DOT * k], fill=255)
    for r0, c0 in finders:
        x, y = (c0 + QUIET) * k, (r0 + QUIET) * k
        d.rounded_rectangle([x, y, x + 7 * k, y + 7 * k], radius=FINDER[0] * k, fill=255)
        d.rounded_rectangle([x + k, y + k, x + 6 * k, y + 6 * k], radius=FINDER[1] * k, fill=0)
        d.rounded_rectangle([x + 2 * k, y + 2 * k, x + 5 * k, y + 5 * k], radius=FINDER[2] * k, fill=255)
    yy, xx = np.mgrid[0:big, 0:big]
    t = ((xx + yy) / (2 * (big - 1)))[..., None]
    grad = (np.array(hex_rgb(TOP)) * (1 - t) + np.array(hex_rgb(BOTTOM)) * t).astype(np.uint8)
    paper = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(paper).rounded_rectangle([0, 0, big - 1, big - 1], radius=2 * k, fill=hex_rgb(PAPER) + (255,))
    out = Image.composite(Image.fromarray(grad).convert('RGBA'), paper, mask)
    lx, lw, pad = (start + QUIET + .15) * k, (LOGO - .3) * k, .7 * k
    ImageDraw.Draw(out).rounded_rectangle([lx, lx, lx + lw, lx + lw], radius=1.8 * k, fill=hex_rgb(PAPER) + (255,))
    ico = Image.open(ROOT / 'desktop' / 'icons' / 'icon.ico')
    ico.size = max(ico.ico.sizes())
    icon = ico.convert('RGBA').resize((round(lw - 2 * pad),) * 2, Image.LANCZOS)
    out.alpha_composite(icon, (round(lx + pad), round(lx + pad)))
    return out.resize((px, px), Image.LANCZOS)


def read(img):
    gray = cv2.cvtColor(np.array(img.convert('RGB')), cv2.COLOR_RGB2GRAY)
    # a phone scanner binarises the camera frame first; try the plain picture and the binarised one with both detectors
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    for frame in (gray, binary):
        for det in (cv2.QRCodeDetector(), cv2.QRCodeDetectorAruco()):
            text, _, _ = det.detectAndDecode(frame)
            if text:
                return text
    return ''


def main():
    m = matrix()
    picture = svg(m)
    for rel in ('web/assets/qq-group-qr.svg', 'site/public/assets/img/qq-group-qr.svg'):
        (ROOT / rel).write_text(picture, encoding='utf-8', newline='\n')
    readme = png(m, 480)
    readme.save(ROOT / 'docs' / 'assets' / 'qq-group-qr.png', optimize=True)
    # what a phone camera gets: the README picture at its size, and smaller (a screen across the room), on white
    checks = {'480 px': readme}
    for px in (240, 160, 120):
        checks[f'{px} px'] = readme.resize((px, px), Image.LANCZOS)
    failed = []
    for name, img in checks.items():
        flat = Image.new('RGB', img.size, 'white')
        flat.paste(img, mask=img.split()[3])
        pad = Image.new('RGB', (img.width + 40, img.height + 40), 'white')
        pad.paste(flat, (20, 20))
        got = read(pad)
        print(f'{name}: {got or "(no code found)"}')
        if got != LINK:
            failed.append(name)
    print(f'{len(m)}x{len(m)} modules, error correction H, icon covers {LOGO}x{LOGO}')
    if failed:
        sys.exit('QR check failed at ' + ', '.join(failed))


if __name__ == '__main__':
    main()
