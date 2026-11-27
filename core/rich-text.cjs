// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #1248 (2026-11-27, 制服カノジョ3, Unity + TextMeshPro: the reader showed 「今日は芹香の希望で<space=0.8767014>山中<space=0.8767014>にある、」).
   Rich-text markup the game's text renderer reads (TextMeshPro, uGUI, Unity IMGUI) is layout, never script: it is taken out
   before any line reaches the reader, the translator or the dedup keys, whatever engine the stream came from. Only tags of
   that markup are touched (a known tag name, or TMP's <#rrggbb> colour), so 「<3」, 「a < b」 or 「<<…>>」 stay as they are.
   <br> is a line break, <sprite…> an inline picture (no text), <noparse>…</noparse> keeps what it holds literally. */
const TAGS = [
  'align', 'allcaps', 'alpha', 'b', 'br', 'color', 'colour', 'cspace', 'font', 'font-weight', 'gradient', 'i', 'indent',
  'line-height', 'line-indent', 'link', 'lowercase', 'margin', 'margin-left', 'margin-right', 'mark', 'material', 'mspace',
  'nobr', 'page', 'pos', 'quad', 'rotate', 's', 'size', 'smallcaps', 'space', 'sprite', 'strikethrough', 'style', 'sub', 'sup',
  'u', 'underline', 'uppercase', 'voffset', 'width',
];
const TAG = new RegExp('</?(?:' + TAGS.map(t => t.replace(/-/g, '\\-')).join('|') + ')(?:\\s*=\\s*[^<>\\r\\n]*|\\s+[^<>\\r\\n]*)?\\s*/?>|</?#[0-9A-Fa-f]{3,8}>', 'gi');
const BR = /<br\s*\/?>/gi, NOPARSE = /<noparse>([\s\S]*?)(?:<\/noparse>|$)/gi;
function strip(s) { return s.replace(BR, '\n').replace(TAG, ''); }
function stripRichText(text) {
  const s = String(text ?? '');
  if (!s.includes('<')) return s;
  let out = '', at = 0, m;
  NOPARSE.lastIndex = 0;
  while ((m = NOPARSE.exec(s))) { out += strip(s.slice(at, m.index)) + m[1]; at = m.index + m[0].length; if (!m[0].length) NOPARSE.lastIndex++; }
  return out + strip(s.slice(at));
}
/* #148 (WHITE ALBUM2): ASCII text on a non-Unity stream (「a<b>c」, 「x<br>y」) is the game's own text and stays. Markup a game's
   renderer reads sits in its Japanese lines, so outside a Unity text setter only a line with Japanese in it is stripped */
const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/u;
function stripRichTextInJapanese(text) { const s = String(text ?? ''); return JAPANESE.test(s) ? stripRichText(s) : s; }
function hasRichText(text) { TAG.lastIndex = 0; const s = String(text ?? ''); return TAG.test(s) || /<\/?noparse>|<br\s*\/?>/i.test(s); }
module.exports = { stripRichText, stripRichTextInJapanese, hasRichText, RICH_TAGS: TAGS };
