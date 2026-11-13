# SPDX-License-Identifier: GPL-3.0-or-later
# Adds a song to the website's background-music library (site/public/assets/audio/).
#   - with --soundcloud URL (the normal case): the song plays from its artist's SoundCloud page through SoundCloud's
#     embedded player; no audio is stored here. The local file is only used for the beats and the length.
#   - without it (only for music you may redistribute): 16 dB quieter, 96 kbps stereo MP3, metadata stripped
#   - with --netease ID: visitors in mainland China (where SoundCloud does not load) play the song from NetEase Cloud Music
#   - lyrics: the .lrc next to the song (or --lrc); Chinese translation lines are dropped automatically (a line with Han
#     characters but no kana, or a second line at the same timestamp that has no kana, is treated as a translation)
#   - beats: kicks and snares for the page's motion (beats.py); spectrum: 16 bands over time for the equalisers (spectrum.py)
#   - playlist.json: the song's entry is added or updated (title/artist from the file's tags unless given)
# Only add music you may share: the licence fields go into the credit the site shows while the song plays.
# Usage (from the repo root):
#   python -I site/tools/add-song.py "D:/MUSIC/Artist - Title.flac" --license "CC BY-NC 4.0" \
#     --license-url https://creativecommons.org/licenses/by-nc/4.0/ --artist-url https://... [--album ... --album-url ... --label ...]
import argparse, json, os, re, subprocess, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / 'site' / 'public' / 'assets' / 'audio'
PLAYLIST = AUDIO / 'playlist.json'
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
FFPROBE = os.environ.get('FFPROBE', str(Path(FFMPEG).with_name('ffprobe' + Path(FFMPEG).suffix)) if os.environ.get('FFMPEG') else 'ffprobe')

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('--lrc'); ap.add_argument('--id'); ap.add_argument('--title'); ap.add_argument('--artist')
ap.add_argument('--artist-url', default=''); ap.add_argument('--album', default=''); ap.add_argument('--label', default='')
ap.add_argument('--album-url', default=''); ap.add_argument('--license', default=''); ap.add_argument('--license-url', default='')
ap.add_argument('--bitrate', default='96k'); ap.add_argument('--gain', default='-16dB'); ap.add_argument('--soundcloud', default='')
ap.add_argument('--netease', type=int, default=0)   # the song's NetEase Cloud Music id: visitors in China play it from there
a = ap.parse_args()
src = Path(a.src)

tags = json.loads(subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format_tags', '-of', 'json', str(src)], capture_output=True, text=True, encoding='utf-8', errors='replace').stdout or '{}').get('format', {}).get('tags', {})
tags = {k.lower(): v for k, v in tags.items()}
title = a.title or tags.get('title') or src.stem
artist = a.artist or tags.get('artist') or ''
album = a.album or tags.get('album') or ''
slug = a.id or re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', f'{artist} {title}').encode('ascii', 'ignore').decode().lower()).strip('-')[:60] or 'song'

# audio: hosted only when there is no SoundCloud page
mp3 = AUDIO / f'{slug}.mp3'
if not a.soundcloud:
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', str(src), '-vn', '-map_metadata', '-1', '-af', f'volume={a.gain}', '-ac', '2', '-ar', '44100',
                    '-c:a', 'libmp3lame', '-b:a', a.bitrate, str(mp3)], check=True)
elif mp3.exists():
    mp3.unlink()
try: dur = float(subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(src)], capture_output=True, text=True, encoding='utf-8', errors='replace').stdout.strip() or 0)
except ValueError: dur = 0

# lyrics, without Chinese translation lines
lrc_src = Path(a.lrc) if a.lrc else src.with_suffix('.lrc')
has_lrc = False
if lrc_src.exists():
    raw = lrc_src.read_bytes()
    for enc in ('utf-8-sig', 'gb18030', 'shift_jis', 'utf-16'):
        try: text = raw.decode(enc); break
        except UnicodeDecodeError: continue
    KANA = re.compile(r'[\u3040-\u30ff]'); HAN = re.compile(r'[\u4e00-\u9fff]')
    out, seen, dropped = [], set(), 0
    for line in text.splitlines():
        m = re.match(r'^((?:\[\d+:\d+(?:\.\d+)?\])+)(.*)$', line.strip())
        if not m: continue
        stamps, words = m.group(1), m.group(2).strip()
        if not words: continue
        if HAN.search(words) and not KANA.search(words): dropped += 1; continue          # Chinese only: a translation
        if stamps in seen and not KANA.search(words): dropped += 1; continue           # second line at the same time
        seen.add(stamps); out.append(stamps + words)
    (AUDIO / f'{slug}.lrc').write_text('\n'.join(out) + '\n', 'utf8')
    has_lrc = bool(out)
    print(f'lyrics: {len(out)} lines kept, {dropped} translation lines dropped')

# beats
# (a local copy that cannot be decoded, e.g. an encrypted .ncm, just means no beats for this song)
try:
    subprocess.run([sys.executable, '-I', str(ROOT / 'site' / 'tools' / 'beats.py'), str(src), str(AUDIO / f'{slug}.beats.json')], check=True,
                   env={**os.environ, 'FFMPEG': FFMPEG}, capture_output=True)
except subprocess.CalledProcessError:
    print('beats: the local file could not be decoded, so this song has no beats')
# spectrum, for the equalisers and the spectrum scrollbar (spectrum.py)
try:
    subprocess.run([sys.executable, '-I', str(ROOT / 'site' / 'tools' / 'spectrum.py'), str(src), str(AUDIO / f'{slug}.spec')], check=True,
                   env={**os.environ, 'FFMPEG': FFMPEG}, capture_output=True)
except subprocess.CalledProcessError:
    print('spectrum: the local file could not be decoded, so this song has no spectrum')

# loudness: every song is levelled to -8 LUFS on the site (the player multiplies by 10^(trim/20))
lufs = None
try:
    o = subprocess.run([FFMPEG, '-hide_banner', '-nostats', '-i', str(src), '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8', errors='replace').stderr
    lufs = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', o)[-1])
except (IndexError, ValueError): print('loudness: could not be measured, so this song is not levelled')

# playlist
pl = json.loads(PLAYLIST.read_text('utf8')) if PLAYLIST.exists() else {'tracks': []}
entry = {'id': slug, 'title': title, 'artist': artist, 'artistUrl': a.artist_url, 'album': album, 'label': a.label, 'albumUrl': a.album_url,
         'license': a.license, 'licenseUrl': a.license_url, 'sc': a.soundcloud, 'ne': a.netease or None, 'lyrics': has_lrc, 'duration': round(dur, 1)}
if lufs is not None: entry.update(lufs=lufs, trim=round(-8 - lufs, 1))
pl['tracks'] = [t for t in pl.get('tracks', []) if t.get('id') != slug] + [entry]
PLAYLIST.write_text(json.dumps(pl, ensure_ascii=False, indent=2) + '\n', 'utf8')
print(f'{slug}: {"SoundCloud" if a.soundcloud else f"{mp3.stat().st_size / 1e6:.1f} MB"}, {dur:.0f} s, playlist now {len(pl["tracks"])} songs')
if not a.soundcloud and not a.license: print('warning: hosted audio without a licence; only add music you may redistribute')
