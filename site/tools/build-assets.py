# SPDX-License-Identifier: GPL-3.0-or-later
# Builds the website's images and the heading font from repository sources.
#   images: docs/screenshots/*.jpg and docs/assets/* -> site/public/assets/img/*.webp (two widths each)
#   font:   Noto Serif SC (OFL, installed with Windows 11) subset to the characters the site's headings use
# Usage (from the repo root): python -I site/tools/build-assets.py
import json, os, re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / 'site' / 'public'
IMG = PUB / 'assets' / 'img'
IMG.mkdir(parents=True, exist_ok=True)

SHOTS = ['home', 'library', 'game-detail', 'words', 'anki', 'stats', 'stats-trend', 'history', 'dialogue', 'auto-update', 'kana-home', 'kana-lesson']

def webp(src, name, widths, quality=82):
    im = Image.open(src)
    im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
    for w in widths:
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(IMG / f'{name}-{w}.webp', 'WEBP', quality=quality, method=6)
    print(name, im.size)

for s in SHOTS:
    webp(ROOT / 'docs' / 'screenshots' / f'{s}.jpg', s, (1360, 720) if s != 'auto-update' else (1600, 800))
webp(ROOT / 'docs' / 'assets' / 'logo.png', 'logo', (720, 360), quality=90)
webp(ROOT / 'docs' / 'assets' / 'sponsor' / 'support-card.png', 'support-card', (720,), quality=88)

# The site's icons (favicon, apple-touch-icon, manifest icons) have their own design and script: site/tools/build-favicon.py
# Social preview: the logo on the site's dark page colour
og = Image.new('RGB', (1200, 630), (23, 15, 17))
logo = Image.open(ROOT / 'docs' / 'assets' / 'logo.png').convert('RGBA')
logo = logo.resize((900, round(logo.height * 900 / logo.width)), Image.LANCZOS)
og.paste(logo, ((1200 - logo.width) // 2, (630 - logo.height) // 2), logo)
og.save(IMG / 'og.jpg', quality=88)

# ---- heading font subset ----------------------------------------------------------------------------------------------
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

src = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / 'NotoSerifSC-VF.ttf'
if not src.exists():
    sys.exit(f'missing {src}: install Noto Serif SC (OFL) or point WINDIR elsewhere')
# Every character the pages can show, in all three languages: the text of the pages themselves, every string in the
# scripts (i18n.js holds Japanese and English, the others hold dynamic text) and the song data. Subsetting only the
# headings left body lines in the serif mixing in the visitor's own system font wherever a character was missing.
# Release notes come from the data snapshots; notes published later may add a character or two, which then falls back.
text = 'MeguLit v0123456789'
for html in PUB.glob('*.html'):
    page = html.read_text('utf8')
    page = re.sub(r'<script[^>]*>.*?</script>|<style[^>]*>.*?</style>', '', page, flags=re.S)
    text += re.sub(r'<[^>]+>', ' ', page)
for js in (PUB / 'assets' / 'js').glob('*.js'):
    # the whole file: its strings plus a few extra characters from comments, which costs little
    text += ''.join(re.findall(r'[　-ヿ㐀-鿿＀-￯]', js.read_text('utf8')))
# release notes: the snapshots shipped with the site (their headings are set in the serif)
for data in [*(PUB / 'data').glob('*.json'), *(PUB / 'assets' / 'audio').glob('*.json')]:
    text += data.read_text('utf8')
chars = set(text) | set(chr(c) for c in range(0x20, 0x7f)) | set('、。，．・「」『』（）！？〜ー…—–　')
chars.update(chr(c) for c in range(0x3041, 0x3097))  # hiragana
chars.update(chr(c) for c in range(0x30a1, 0x30fb))  # katakana
font = TTFont(src, lazy=False)
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['kern', 'liga', 'palt', 'vert', 'ruby']
opts.name_IDs = ['*']
sub = subset.Subsetter(opts)
sub.populate(text=''.join(sorted(chars)))
sub.subset(font)
# One static weight (600) is all the headings use; subset first, the instancer is much faster on a small font.
font = instancer.instantiateVariableFont(font, {'wght': 600})
dst = PUB / 'assets' / 'fonts' / 'megulit-serif.woff2'
font.flavor = 'woff2'
font.save(dst)
print('font', len(chars), 'chars', dst.stat().st_size // 1024, 'KB')

# ---- hero fonts from the megu-edit template (all OFL): Cormorant, IBM Plex Mono, Source Han Serif ------------------
# Sources live outside the repo (they are large); only the subsets are committed. MEGU_FONTS overrides the folder.
MEGU = Path(os.environ.get('MEGU_FONTS', 'E:/Apps/MeguLit-Tutorial/megu-edit/public/fonts'))
def subset_to(src, dst, chars, instance=None):
    f = TTFont(src, lazy=False)
    o = subset.Options(); o.flavor = 'woff2'; o.layout_features = ['kern', 'liga', 'palt']; o.name_IDs = ['*']
    sb = subset.Subsetter(o); sb.populate(text=''.join(sorted(set(chars)))); sb.subset(f)
    f.flavor = 'woff2'; f.save(dst); print('font', dst.name, dst.stat().st_size // 1024, 'KB')
if MEGU.exists():
    ascii_ = ''.join(chr(c) for c in range(0x20, 0x7f)) + '▮·—–✦↓→←…’'
    FD = PUB / 'assets' / 'fonts'
    subset_to(MEGU / 'IBMPlexMono-Light.ttf', FD / 'plex-mono.woff2', ascii_)
    subset_to(MEGU / 'Cormorant-Italic.ttf', FD / 'cormorant-italic.woff2', ascii_)
    hero_text = '玩学日语日本語を学ぼう下载备用免费开源続きを読もうがくにちごにほんごギャルゲーで、，。' + ascii_
    for html in PUB.glob('*.html'):
        m = re.search(r'<h1[^>]*hero-type.*?</h1>', html.read_text('utf8'), re.S)
        if m: hero_text += re.sub(r'<[^>]+>', '', m.group(0))
    for key in ('hero.title', 'dl.button', 'dl.alt'):
        for v in re.findall(r"'" + re.escape(key) + r"': '((?:[^'\\]|\\.)*)'", (PUB / 'assets' / 'js' / 'i18n.js').read_text('utf8')):
            hero_text += re.sub(r'<[^>]+>', '', v)
    subset_to(MEGU / 'SourceHanSerifCN-SemiBold.otf', FD / 'han-serif-hero.woff2', hero_text)
else:
    print('megu-edit fonts not found, hero fonts unchanged')

# ---- black serif for the Chinese hero title: Noto Serif SC (OFL, the same variable font as above) at weight 900 -------
hero_black = TTFont(src, lazy=False)
o = subset.Options(); o.flavor = 'woff2'; o.layout_features = ['kern', 'liga', 'palt']; o.name_IDs = ['*']
sb = subset.Subsetter(o); sb.populate(text='学日语玩，, Galgame'); sb.subset(hero_black)
hero_black = instancer.instantiateVariableFont(hero_black, {'wght': 900})
hero_black.flavor = 'woff2'
hero_black.save(PUB / 'assets' / 'fonts' / 'hero-black.woff2')
print('font hero-black', (PUB / 'assets' / 'fonts' / 'hero-black.woff2').stat().st_size // 1024, 'KB')

# ---- logo split into cape and the rest (hat + letters), from the megu-edit template, for the entrance's cape unfurl ----
MEGU_PUB = Path(os.environ.get('MEGU_PUBLIC', 'E:/Apps/MeguLit-Tutorial/megu-edit/public'))
if (MEGU_PUB / 'logo_cape.png').exists():
    webp(MEGU_PUB / 'logo_cape.png', 'logo-cape', (720,), quality=90)
    webp(MEGU_PUB / 'logo_rest.png', 'logo-rest', (720,), quality=90)

# ---- Anki deck backs: the exact frame where each card's line is on screen, from the template's game recordings ------
import subprocess, tempfile
REC = MEGU_PUB / 'rec'
FFMPEG = os.environ.get('FFMPEG', 'E:/Apps/MeguLit-Tutorial/.tools/bin/ffmpeg.exe')
CARDS = [('card', 2.0), ('lookup-long', 13.2), ('lookup-long', 4.0), ('ruby', 4.3), ('hook', 4.5), ('translate', 3.5)]
if REC.exists() and Path(FFMPEG).exists():
    with tempfile.TemporaryDirectory() as tmp:
        for k, (name, at) in enumerate(CARDS):
            png = Path(tmp) / f'{k}.png'
            subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(at), '-i', str(REC / f'{name}.webm'), '-frames:v', '1', str(png)], check=True)
            im = Image.open(png).convert('RGB')   # 1280x720; the last one keeps clear of the settings panel on the right
            box = (0, 138, 1000, 700) if k == 5 else (0, 0, 1244, 700)
            im.crop(box).resize((800, 450), Image.LANCZOS).save(IMG / f'card-{k}-800.webp', 'WEBP', quality=80, method=6)

# ---- cache busting: fonts are cached for 30 days, so site.css names each one with a hash of its bytes ------------------
import hashlib
css_path = PUB / 'assets' / 'css' / 'site.css'
css = css_path.read_text('utf8')
for f in (PUB / 'assets' / 'fonts').glob('*.woff2'):
    v = hashlib.sha256(f.read_bytes()).hexdigest()[:10]
    css = re.sub(r'(url\("/assets/fonts/' + re.escape(f.name) + r')(\?v=[0-9a-f]+)?"', r'\1?v=' + v + '"', css)
css_path.write_text(css, 'utf8', newline='\n')
# the pages preload the heading font: same versioned address, or it downloads twice
for html in PUB.glob('*.html'):
    page = html.read_text('utf8')
    for f in (PUB / 'assets' / 'fonts').glob('*.woff2'):
        v = hashlib.sha256(f.read_bytes()).hexdigest()[:10]
        page = re.sub(r'(href="/assets/fonts/' + re.escape(f.name) + r')(\?v=[0-9a-f]+)?"', r'\1?v=' + v + '"', page)
    html.write_text(page, 'utf8', newline='\n')
print('font links versioned')
