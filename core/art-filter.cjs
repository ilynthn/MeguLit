// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E540 (WHITE ALBUM2 opening, live 2026-11-13): the art scan reads whatever looks Japanese on screen. A logo read as
   「ミき=ミミミ」 went to the translator, which answered with an apology drawn in the logo's size; the Chinese-patched title
   menu (开始游戏, a "kanji card" to the Japanese OCR) came back translated into itself. Neither is a line or a translation. */
const PUNCT=/[\s　、。，,．.・…‥ー―─—~〜！!？?「」『』（）()【】〈〉《》"'“”‘’：:；;]/gu;
const plain=s=>String(s||'').normalize('NFKC').replace(PUNCT,'');
/* a row taller than a sixth of the picture is a logo the OCR guessed at (WA2 title: 「、ーをやま」 at 22% of the height) */
function artJunk(text,rows,sh){
 if(Array.isArray(rows)&&+sh>0&&rows.some(r=>+r?.h>sh/6))return true;
 const t=plain(text);if([...t].length<2)return true;
 if(/[=|<>{}[\]#*_^\\/@$%&+]/.test(t))return true;
 if(/([゠-ヿ])\1\1/u.test(t)||/(.)\1\1\1/u.test(t))return true;
 const jp=(t.match(/[぀-ヿ㐀-鿿]/gu)||[]).length;
 return jp<[...t].length*0.6;
}
const REFUSAL=/^(抱歉|很抱歉|对不起|不好意思|无法|我无法|i'?m sorry|sorry|i cannot|i can't|unable to)|无法翻译|不能翻译|cannot translate|can't translate|not (a )?(valid|recognizable) japanese/i;
function artNoTranslation(source,translation){
 const tr=String(translation||'').trim();if(!tr)return true;
 if(REFUSAL.test(tr))return true;
 const a=plain(source),b=plain(tr);return !!a&&a===b;
}
module.exports={artJunk,artNoTranslation};
