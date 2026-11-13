// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 (user, beta.36, ダストマニア・グロテスク / 解体插入新书 with a Chinese patch, gameplay.exe on a Chinese system):
   the game turned its Shift-JIS text into UTF-16 with the system code page (GBK), so the hook got 「墦偔偱堷偒…」 for
   「遠くで引き…」. The reader drew it, it went to the translator, which answered 「这句话看起来是乱码…请提供完整的游戏台词原文」,
   and that answer was drawn as the line's translation. Every engine and every translator goes through here: a
   Shift-JIS-as-GBK line is turned back into the Japanese it was (per hook stream, locked once clear), other garbage is never
   drawn or sent, and a translator's meta reply (asks for the original, says it is garbled, cannot translate) is never shown. */
const KANA=/[\u3041-\u309f\u30a1-\u30fa\u30fc]/g;
let gbk=null;
/* GBK encoder built once from the platform decoder (char -> two bytes); single bytes stay ASCII */
function gbkTable(){
 if(gbk)return gbk;gbk=new Map();let dec;try{dec=new TextDecoder('gbk',{fatal:true});}catch{return gbk;}
 for(let a=0x81;a<=0xfe;a++)for(let b=0x40;b<=0xfe;b++){if(b===0x7f)continue;let c;try{c=dec.decode(Uint8Array.of(a,b));}catch{continue;}if(c.length===1&&!gbk.has(c))gbk.set(c,[a,b]);}
 return gbk;}
const kanaCount=t=>(String(t).match(KANA)||[]).length;
const letters=t=>String(t).replace(/[\s\p{P}\p{S}0-9\uff10-\uff19]/gu,'');
/* Shift-JIS bytes decoded as GBK: no kana, CJK only, and the same bytes read as Shift-JIS are mostly kana Japanese.
   Real Chinese never comes back with hiragana (GB2312 bytes are all >= 0xA1, Shift-JIS hiragana needs lead 0x82).
   relaxed (a stream already locked as Shift-JIS-as-GBK): any clean read-back counts, also kanji-only lines and 「……」. */
function repairShiftJisAsGbk(text,{relaxed=false}={}){
 const t=String(text||'');if(!t.trim()||t.length>4000||kanaCount(t)||!/[\u3000-\u303f\u4e00-\u9fff\uff01-\uff60]/.test(t))return null;if(!relaxed&&t.length<2)return null;
 const map=gbkTable();if(!map.size)return null;const bytes=[];
 for(const ch of t){const c=ch.codePointAt(0);if(c<0x80){bytes.push(c);continue;}const pair=map.get(ch);if(!pair)return null;bytes.push(pair[0],pair[1]);}
 let out;try{out=new TextDecoder('shift_jis',{fatal:true}).decode(Uint8Array.from(bytes));}catch{return null;}
 if(/[\uff61-\uff9f\ufffd]/.test(out)||out===t)return null;
 if(relaxed)return out;
 const l=letters(out),k=kanaCount(out);if(!l.length||k<2||k/l.length<.25)return null;
 return out;}
/* Per hook stream: two lines that only make sense as Shift-JIS read as GBK lock the stream, after which every line of it
   is read back; two lines with real kana mark the stream as fine and it is never read back loosely. */
class StreamCodepage{
 constructor(){this.streams=new Map();}
 fix(stream,text){
  const key=String(stream||''),t=String(text||'');if(!t.trim())return {text:t,repaired:false,locked:false};
  let s=this.streams.get(key);if(!s){if(this.streams.size>200)this.streams.delete(this.streams.keys().next().value);s={native:0,repaired:0,mode:''};this.streams.set(key,s);}
  if(kanaCount(t)>=2){if(++s.native>=2&&!s.mode)s.mode='native';return {text:t,repaired:false,locked:false};}
  const strict=repairShiftJisAsGbk(t);
  if(strict){let locked=false;if(++s.repaired>=2&&!s.mode){s.mode='sjis-as-gbk';locked=true;}return {text:strict,repaired:true,locked};}
  if(s.mode==='sjis-as-gbk'){const loose=repairShiftJisAsGbk(t,{relaxed:true});if(loose)return {text:loose,repaired:true,locked:false};}
  return {text:t,repaired:false,locked:false};}
 mode(stream){return this.streams.get(String(stream||''))?.mode||'';}
}
/* text no one should read or translate: replacement characters, control codes, Chinese read as Shift-JIS (kanji mixed
   with half-width katakana and boxes), Shift-JIS read as GBK, UTF-8 read as Latin-1. controls:false for hook text,
   where engines may still carry their own control markup. */
function garbledSource(text,{controls=true}={}){
 const t=String(text||'');const l=[...letters(t)];if(!l.length)return false;
 const bad=(t.match(controls?/[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g:/\ufffd/g)||[]).length;if(bad>=2||(bad&&bad>=l.length*.1))return true;
 if((t.match(/[\uff61-\uff9f\u25a1]/g)||[]).length>=3&&(t.match(/[\u4e00-\u9fff]/g)||[]).length>=4)return true;
 if((t.match(/[\u00c2-\u00ef][\u0080-\u00bf\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/g)||[]).length>=2)return true;
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
module.exports={repairShiftJisAsGbk,StreamCodepage,garbledSource,metaReply};
