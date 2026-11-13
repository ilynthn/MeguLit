// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Multilingual containers, for every engine (E243, 2026-11-09). Multilingual builds (KiriKiri Z: Maitetsu Pure Station,
   サノバウィッチ) keep every language of a line in one string and let the engine pick the track. A hook that sits before
   that split sees the whole container:
    - track separators the hook cannot decode arrive as runs of ？ / ? / U+FFFD / private-use characters:
      「jp」「jp」？？？？？？「jp」「jp」？？？？？？「简」「简」？？？？？？「繁」「繁」
    - inline alternatives are written as %l<ja>;<zh-Hans>;<zh-Hant>%l (the %l markers and ; leak as text).
   Only the Japanese track is kept. Nothing is cut unless the string proves it is a container: at least two tracks, one
   with kana, and another that repeats it or carries Han text without kana. Ordinary lines such as 「？？？」 pass. */
const KANA=/[ぁ-ゟァ-ヺー]/u,HAN=/[㐀-鿿]/u;
const SEP=/[?？�-￰-￿]{3,}/u,SEP_ALL=new RegExp(SEP.source,'gu');
const key=s=>s.replace(/\s+/g,'');

/* %l…%l groups: keep the first alternative with kana (else the first). Stray markers and the ; next to them go. */
function inlineAlternatives(text){
 if(!/%l[^%\r\n]*;[^%\r\n]*%l/.test(text)||!KANA.test(text))return text;
 let out=text.replace(/%l([^%\r\n]*?)%l/g,(all,body)=>{const alts=body.split(';');return alts.find(a=>KANA.test(a))??alts[0];});
 out=out.replace(/;?%l;?/g,'').replace(/^;|;(?=[。、．，」』）\s]|$)/g,'');
 return out;
}

/* Two halves of the same text (ignoring line breaks): keep the first, which carries the game's own breaks. */
function halve(s){const n=key(s);if(n.length<4||n.length%2)return s;const h=n.length/2;if(n.slice(0,h)!==n.slice(h))return s;
 let seen=0;for(let i=0;i<s.length;i++){if(!/\s/.test(s[i]))seen++;if(seen===h)return s.slice(0,i+1);}return s;}

function tracks(text){
 if(!SEP.test(text)||!KANA.test(text))return null;
 const parts=text.split(SEP_ALL).map(s=>s.trim()).filter(s=>key(s).length>=2);
 if(parts.length<2)return null;
 const jp=parts.filter(s=>KANA.test(s)),other=parts.filter(s=>!KANA.test(s)&&HAN.test(s));
 if(!jp.length)return null;
 const duplicated=jp.length>1&&jp.every(s=>key(s)===key(jp[0]));
 if(!duplicated&&!other.length)return null;
 /* The engine keeps each track twice (display + measure); one copy of the Japanese track is the line. */
 return halve(jp[0]);
}

/* Top-level ja;zh-Hans;zh-Hant: the first part has kana, every other part is Han without kana. */
function semicolonTracks(text){
 if(!text.includes(';')||!KANA.test(text))return null;
 const parts=text.split(';').map(s=>s.trim()).filter(Boolean);
 if(parts.length<2||!KANA.test(parts[0]))return null;
 return parts.slice(1).every(s=>!KANA.test(s)&&HAN.test(s))?parts[0]:null;
}

/* A whole line of Chinese (no kana, mostly Han, at least two characters only Chinese uses). Japanese lines written only in
   kanji are short and do not use these function characters. */
/* E501 (live 9-nine beta.24: 「…よかったわ」「大概是因為…」 stayed in the Japanese line): 了 的 很 夠/够 繫 also mark Chinese in a kana-free row */
const ZH_ONLY=/[這这麼么嗎吗您們们個个裡請请說说沒没還还讓让給给對对呢吧啊妳哪喔了的很夠够繫]/gu;
/* E270 (user, ATRI: a Traditional Chinese line still reached the reader as Japanese): also count Han forms that modern
   Japanese writes differently (traditional 從圖讓與學會實點經國關應歡聽讀賣錢樣黑處體發變邊氣當覺 and simplified 时为无开关长
   见头应问题电话书车门东亲爱欢谢语听读买卖钱样谁黑处发变边气觉), and the full-width comma ， that Japanese text does not use. */
const ZH_FORM=/[從圖讓與學會實點經國關應歡聽讀賣錢樣黑處體發變邊氣當覺爲无为时开关长见头应问题电话书车门东亲爱欢谢语听读买卖钱样谁处发变边气觉试图从实经]/gu;
function zhScore(t){return (t.match(ZH_ONLY)||[]).length+(t.match(ZH_FORM)||[]).length;}
function foreignLine(text){const t=String(text||'');if(KANA.test(t))return false;const han=(t.match(/[㐀-鿿]/gu)||[]).length;if(han<6)return false;const score=zhScore(t);return score>=2||(score>=1&&t.includes('，'));}
/* A line that arrives as Japanese rows plus a Chinese row of the same text keeps only the Japanese rows. */
// Chinese translation patches that "borrow" Shift-JIS code points (借码) store Chinese sentences as unrelated JIS kanji;
// only the patch's own font shows them as Chinese. Read back (an old save from the patched game, a patch launcher
// bypassed) they look like 根劃痩，扇晃顧顕亜錘廠笠… : long, kana-free, kanji-only, with Chinese full-width commas.
// Japanese dialogue of that length always carries kana and uses 、 (user report 2026-11-09, WHITE ALBUM2).
function borrowedCode(text){const t=String(text||'').replace(/\s+/g,'');if(KANA.test(t)||!t.includes('，'))return false;const han=(t.match(/[㐀-鿿]/gu)||[]).length;return han>=12&&han/[...t].length>=.7&&zhScore(t)<=1;}
/* E310 (live test 2026-11-13, 9-nine first line showed 「ハァイ…かしら」「嗨，午安啊。): the Chinese track can start on the same row
   the Japanese track ends on (「…かしら」「嗨，午安啊。 / 　还是说…」). When the next row is dropped as Chinese, a kana-free tail that
   opens with a bracket right after the Japanese closing bracket and reads as Chinese belongs to that track too. */
const TAIL=/^([\s\S]*[」』）”])([「『（“][^ぁ-ゟァ-ヺー]*)$/u;
function cutForeignTail(row){const m=TAIL.exec(row);if(!m||!KANA.test(m[1])||!HAN.test(m[2]))return row;return zhScore(m[2])>=1||m[2].includes('，')?m[1]:row;}
function foreignRows(text){const rows=String(text).split(/\r?\n/);if(rows.length<2||!rows.some(r=>KANA.test(r)))return text;
 const drop=rows.map(r=>foreignLine(r));if(!drop.some(Boolean))return text;
 const kept=[];for(let i=0;i<rows.length;i++){if(drop[i])continue;kept.push(drop[i+1]&&KANA.test(rows[i])?cutForeignTail(rows[i]):rows[i]);}
 return kept.length?kept.join('\n'):text;}
/* E296 (user, 2026-11-10, ライムライト・レモネードジャム: "%n;あの瞬間の…ない。あの瞬間の…ない。V" on screen): KiriKiri inline commands
   (%n; %p; %f0; …, colour #rrggbb; / #;) leak as text, and the engine hands a line over twice. Commands go; a line that is
   then two equal halves (a stray end marker letter allowed) keeps one. %l groups are left to inlineAlternatives. */
function inlineCommands(text){return text.replace(/%(?!l)[a-z][a-z0-9]*;/gi,'').replace(/#(?:[0-9a-f]{6,8})?;/gi,'');}
function halveLoose(s){const once=halve(s);if(once!==s)return once;const m=/^([\s\S]*?)[A-Za-z]{1,2}\s*$/.exec(s);if(m&&KANA.test(m[1])){const body=m[1].trimEnd(),h=halve(body);if(h!==body)return h;}return s;}
function japaneseTrack(text){
 if(typeof text!=='string'||!text)return text;
 let out=inlineAlternatives(text);
 if(/%(?!l)[a-z][a-z0-9]*;|#(?:[0-9a-f]{6,8})?;/i.test(out)){out=inlineCommands(out);out=halveLoose(out);}
 out=tracks(out)??out;
 out=semicolonTracks(out)??out;
 out=foreignRows(out);
 return out;
}
/* E312 (live test 2026-11-13, Summer Pockets: 10_プロローグ0725___for_summerpockets_language___for_summerpockets and a half-scrolled
   ト80_幻想パー were read and drawn as story lines): script/scene identifiers that pass through the text call. A line with no
   whitespace and no sentence punctuation that carries a number_ prefix or a double underscore is a name, not dialogue. */
function scriptIdentifier(text){const t=String(text||'').trim();if(!t||/\s/.test(t)||/[。、！？!?「」『』（）…―]/.test(t))return false;return t.includes('_');}
/* E500 (live test 2026-11-13, 千恋＊万花: a per-glyph draw stream sent 「『『『『『『『『おお『お『『おお客客…」 and the art path read it as a
   line; the sound-effect caption 「■自動車（車内／走行）」 came through the scenario stream as the first line). A typewriter frame where many
   characters repeat in place is never text to read, and a short line that opens with a block/marker symbol and has no
   sentence punctuation is a caption (sound effect, BGM, location), not dialogue. */
/* E501 (live 千恋＊万花 beta.24: the first line read 「『お客さん』『お客さん』『お客さん』『お客さん』『先生』…■自動車…」): redraw frames can repeat a
   whole quoted phrase in place, so four or more equal quoted units back to back are a frame dump, not a line */
function repeatedFrames(text){const u=String(text||'').replace(/\s+/g,'').match(/[『「“（(][^『「“（()）”」』]{1,40}[』」”）)]/gu)||[];if(u.length<3)return false;let run=1;for(let i=1;i<u.length;i++){run=u[i]===u[i-1]?run+1:1;if(run>=4)return true;}return false;}
function stuttered(text){if(repeatedFrames(text))return true;const c=[...String(text||'').replace(/\s+/g,'')];if(c.length<8)return false;let n=0;const kinds=new Set();for(let i=1;i<c.length;i++)if(c[i]===c[i-1]&&!/[ー…‥―・～—\-.。！？!?]/u.test(c[i])){n++;kinds.add(c[i]);}return kinds.size>=3&&n*4>=c.length;}
function soundCaption(text){const t=String(text||'').trim();return /^[■□◆◇▼▽★☆※◎●○]/u.test(t)&&[...t].length<=30&&!/[、。「」『』！？!?\r\n]/u.test(t);}
module.exports={stuttered,soundCaption,scriptIdentifier,inlineCommands,halveLoose,borrowedCode,foreignLine,foreignRows,japaneseTrack,inlineAlternatives,tracks,semicolonTracks};
