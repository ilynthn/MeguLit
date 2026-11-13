// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 (user, beta.36, ダストマニア・グロテスク with a Chinese patch): the hook handed over Shift-JIS read as GBK
   (「偙偺儊僢僙乕僕偼…」 = 「このメッセージは…」). It went to the translator, which answered 「这句话看起来是乱码…请提供完整的
   游戏台词原文」, and that answer was drawn as the line's translation. Every engine and every translator goes through here:
   a Shift-JIS-as-GBK line is turned back into the Japanese it was, other garbage is never sent, and a translator's
   meta reply (asks for the original, says it is garbled, cannot translate) is never shown as a translation. */
const KANA=/[ぁ-ゟァ-ヺー]/g;
let gbk=null;
/* GBK encoder built once from the platform decoder (char -> two bytes); single bytes stay ASCII */
function gbkTable(){
 if(gbk)return gbk;gbk=new Map();let dec;try{dec=new TextDecoder('gbk',{fatal:true});}catch{return gbk;}
 for(let a=0x81;a<=0xfe;a++)for(let b=0x40;b<=0xfe;b++){if(b===0x7f)continue;let c;try{c=dec.decode(Uint8Array.of(a,b));}catch{continue;}if(c.length===1&&!gbk.has(c))gbk.set(c,[a,b]);}
 return gbk;}
const kanaCount=t=>(String(t).match(KANA)||[]).length;
const letters=t=>String(t).replace(/[\s\p{P}\p{S}0-9０-９]/gu,'');
/* Shift-JIS bytes decoded as GBK: no kana, CJK only, and the same bytes read as Shift-JIS are mostly kana Japanese.
   Real Chinese never comes back with hiragana (GB2312 bytes are all >= 0xA1, Shift-JIS hiragana needs lead 0x82). */
function repairShiftJisAsGbk(text){
 const t=String(text||'');if(t.length<2||t.length>4000||kanaCount(t)||!/[一-鿿]/.test(t))return null;
 const map=gbkTable();if(!map.size)return null;const bytes=[];
 for(const ch of t){const c=ch.codePointAt(0);if(c<0x80){bytes.push(c);continue;}const pair=map.get(ch);if(!pair)return null;bytes.push(pair[0],pair[1]);}
 let out;try{out=new TextDecoder('shift_jis',{fatal:true}).decode(Uint8Array.from(bytes));}catch{return null;}
 if(/[｡-ﾟ�]/.test(out))return null;
 const l=letters(out),k=kanaCount(out);if(!l.length||k<2||k/l.length<.25)return null;
 return out;}
/* text no translator should get: replacement characters, control codes, Chinese read as Shift-JIS (kanji mixed with
   half-width katakana and boxes), Shift-JIS read as GBK, UTF-8 read as Latin-1 */
function garbledSource(text){
 const t=String(text||'');const l=[...letters(t)];if(!l.length)return false;
 const bad=(t.match(/[�\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g)||[]).length;if(bad>=2||(bad&&bad>=l.length*.1))return true;
 if((t.match(/[｡-ﾟ□]/g)||[]).length>=3&&(t.match(/[一-鿿]/g)||[]).length>=4)return true;
 if((t.match(/[Â-ï][\u0080-¿‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g)||[]).length>=2)return true;
 return !!repairShiftJisAsGbk(t);}
/* a reply about the text instead of a translation of it, in Chinese, Japanese or English */
const META=[
 /乱码|亂碼|文字化け|mojibake|garbled|gibberish|encoding (error|issue)|编码(错误|问题)/i,
 /(请|麻烦|能否|可以)(您|你)?(再)?(提供|给出|发送|给我|告诉我|确认)[^。！？\n]{0,16}(原文|日文|日语|台词|文本|句子|内容)/,
 /(无法|不能|没法|难以)(准确)?(识别|辨认|理解|解析|翻译)(这|该|此|上述|以上)(段|句|个|些)?(文字|文本|内容|句子|台词|原文|字符)/,
 /(这|该|此|上述|以上)(段|句|个|些)?(文字|文本|内容|句子|台词|原文|字符)[^。！？\n]{0,12}(看起来|似乎|好像|不是|并非|无法|不像)/,
 /(不是|并非|不像)(有效|正常|完整|可读)?的?(日文|日语|日本语)/,
 /作为(一个)?(AI|人工智能|语言模型|翻译)/i,
 /(原文|テキスト|文章)を(ご)?(提供|教え|送っ)|翻訳(でき|出来)ません|日本語(では|として)(ありません|ない)/,
 /\b(as an ai|language model)\b/i,
 /\bI (can(not|'t)|am unable to|'m unable to|could ?n[o']t)\b[^.\n]{0,20}\b(translate|understand|identify|read|make sense)/i,
 /\bplease (provide|send|share|give)\b[^.\n]{0,30}\b(text|line|sentence|original|japanese)/i,
 /\b(does ?n[o']t|do not) (look|seem|appear) (like|to be)\b[^.\n]{0,20}\b(japanese|text|sentence)/i,
 /\bnot (a )?(valid|proper|readable|recognizable|real) japanese/i,
];
/* a line that itself talks about translation, garbled text or AI may translate into those words */
const SOURCE_TALKS=/翻訳|訳し|文字化け|化け|ＡＩ|AI|原文|テキスト|台詞|セリフ|日本語|translat|garbl|japanese/i;
function metaReply(translation,source=''){
 const tr=String(translation||'').trim();if(!tr)return false;if(SOURCE_TALKS.test(String(source||'')))return false;
 return META.some(r=>r.test(tr));}
module.exports={repairShiftJisAsGbk,garbledSource,metaReply};
