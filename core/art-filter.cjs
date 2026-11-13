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
 /* E578 (ダストマニア menu read mid-fade as 「ククメイイツツッセクク一ブドキ」): three or more doubled katakana in one read is OCR noise, not a word */
 if((t.match(/([゠-ヿ])\1/gu)||[]).length>=3)return true;
 const jp=(t.match(/[぀-ヿ㐀-鿿]/gu)||[]).length;
 return jp<[...t].length*0.6;
}
const REFUSAL=/^(抱歉|很抱歉|对不起|不好意思|无法|我无法|i'?m sorry|sorry|i cannot|i can't|unable to)|无法翻译|不能翻译|cannot translate|can't translate|not (a )?(valid|recognizable) japanese/i;
function artNoTranslation(source,translation){
 const tr=String(translation||'').trim();if(!tr)return true;
 if(REFUSAL.test(tr)||require('./text-sanity.cjs').metaReply(tr,source))return true;
 const a=plain(source),b=plain(tr);return !!a&&a===b;
}
/* E578 (ダストマニア right-click menu: クイックセーブ, クイックロード, … read as one group, given one translation and, through the script snap,
 a dialogue line's): a group of two or more short rows stacked one under another is a list (a menu, a credit roll); its rows are
 translated one by one and never snapped to a script line. Returns the row texts in order, or null. */
function artList(rows){
 if(!Array.isArray(rows)||rows.length<2||rows.length>16)return null;
 const r=rows.filter(x=>x&&typeof x.text==='string'&&Number.isFinite(+x.y)&&+x.h>0).slice().sort((a,b)=>a.y-b.y);if(r.length!==rows.length)return null;
 for(let i=0;i<r.length;i++){const t=plain(r[i].text),n=[...t].length;if(n<2||n>16||/[。！？!?]$/.test(r[i].text.trim()))return null;if(i&&r[i].y<r[i-1].y+r[i-1].h*.6)return null;}
 return rows.map(x=>x.text.trim());
}
module.exports={artJunk,artNoTranslation,artList};
