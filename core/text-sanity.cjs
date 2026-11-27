// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 (user, beta.36, ダストマニア・グロテスク / 解体插入新书 with a Chinese patch, gameplay.exe on a Chinese system):
   the game turned its Shift-JIS text into UTF-16 with the system code page (GBK), so the hook got 「墦偔偱堷偒…」 for
   「遠くで引き…」. The reader drew it, it went to the translator, which answered 「这句话看起来是乱码…请提供完整的游戏台词原文」,
   and that answer was drawn as the line's translation. Every engine and every translator goes through here: a
   line read with the wrong code page is turned back into the Japanese it was (per hook stream, locked once clear), other garbage is never
   drawn or sent, and a translator's meta reply (asks for the original, says it is garbled, cannot translate) is never shown. */
const KANA=/[\u3041-\u309f\u30a1-\u30fa\u30fc]/g;
const kanaCount=t=>(String(t).match(KANA)||[]).length;
const letters=t=>String(t).replace(/[\s\p{P}\p{S}0-9\uff10-\uff19]/gu,'');
/* Encoders built once per code page from the platform decoder (char -> its bytes). Windows hands undefined bytes of
   windows-1252 through as U+0080-U+009F, the WHATWG decoder does the same, so that one is lossless. */
const tables=new Map();
function table(codec){
 if(tables.has(codec))return tables.get(codec);const map=new Map();tables.set(codec,map);let dec;try{dec=new TextDecoder(codec,{fatal:true});}catch{return map;}
 for(let a=0x80;a<=0xff;a++){try{const c=dec.decode(Uint8Array.of(a));if(c.length===1&&!map.has(c))map.set(c,[a]);}catch{}}
 if(codec!=='windows-1252')for(let a=0x81;a<=0xfe;a++)for(let b=0x40;b<=0xfe;b++){if(b===0x7f)continue;let c;try{c=dec.decode(Uint8Array.of(a,b));}catch{continue;}if(c&&[...c].length===1&&!map.has(c))map.set(c,[a,b]);}
 return map;}
/* How the text was really stored, and the code page the game (or the system) wrongly read it with. Shift-JIS on a Chinese,
   Traditional Chinese, Korean or Western system, and UTF-8 read the same ways. Code pages that drop the bytes they do not
   know (Big5, Korean, GBK for UTF-8) can only give back lines that happened to survive whole. */
const PAIRS=[['gbk','shift_jis'],['big5','shift_jis'],['euc-kr','shift_jis'],['windows-1252','shift_jis'],['windows-1252','utf-8'],['gbk','utf-8'],['big5','utf-8'],['euc-kr','utf-8'],['shift_jis','utf-8']];
const pairName=(wrong,right)=>right+' read as '+wrong;
function readBack(t,wrong,right){
 const map=table(wrong);if(!map.size)return null;const bytes=[];
 for(const ch of t){const c=ch.codePointAt(0);if(c<0x80){bytes.push(c);continue;}const b=map.get(ch);if(!b)return null;bytes.push(...b);}
 let out;try{out=new TextDecoder(right,{fatal:true}).decode(Uint8Array.from(bytes));}catch{return null;}
 if(out===t||/[\uff61-\uff9f\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(out))return null;
 return out;}
const japanese=(out,before)=>{const l=letters(out),k=kanaCount(out);return l.length>0&&k>=2&&k>kanaCount(before)&&k/l.length>=.25;};
/* the Japanese line a mojibake line was, with the code pages that made it ({text,pair}), or null. Real Chinese, Korean or
   Western text never comes back as kana Japanese (their bytes never form Shift-JIS kana or valid UTF-8 kana).
   pair given (a stream already locked to it): any clean read-back counts, also kanji-only lines and 「……」. */
function repairMojibake(text,{pair=''}={}){
 const t=String(text||'');if(!t.trim()||t.length>4000||!/[^\x00-\x7f]/.test(t))return null;
 if(pair){const p=PAIRS.find(([w,r])=>pairName(w,r)===pair);if(!p||kanaCount(t)>=2)return null;const out=readBack(t,p[0],p[1]);return out?{text:out,pair}:null;}
 if(t.length<2||kanaCount(t)>=2)return null;
 for(const [wrong,right] of PAIRS){if(wrong==='shift_jis'&&!/[縺繧繝]/.test(t))continue;if(wrong==='windows-1252'&&/[^\x00-\u024f\u02c6\u02dc\u2000-\u20ff\u2122]/.test(t))continue;
  const out=readBack(t,wrong,right);if(out&&japanese(out,t))return {text:out,pair:pairName(wrong,right)};}
 return null;}
/* builds the encoders off the hot path, one code page per timer tick, so the first garbled line does not wait ~0.3 s */
function warmUp(){let i=0;const codecs=[...new Set(PAIRS.map(p=>p[0]))];const step=()=>{if(i>=codecs.length)return;table(codecs[i++]);const h=setTimeout(step,50);h.unref?.();};const h=setTimeout(step,2000);h.unref?.();}
function repairShiftJisAsGbk(text,{relaxed=false}={}){const r=relaxed?repairMojibake(text,{pair:pairName('gbk','shift_jis')}):repairMojibake(text);return r&&r.pair===pairName('gbk','shift_jis')?r.text:null;}
/* Per hook stream: two lines that read back the same way lock the stream to that pair, after which every line of it is
   read back that way, and a line that cannot be (its bytes were lost) is unreadable; two lines with real kana mark the
   stream as fine and it is never read back loosely. */
class StreamCodepage{
 constructor(){this.streams=new Map();}
 fix(stream,text){
  const key=String(stream||''),t=String(text||''),none={text:t,repaired:false,locked:false,unreadable:false};if(!t.trim())return none;
  let s=this.streams.get(key);if(!s){if(this.streams.size>200)this.streams.delete(this.streams.keys().next().value);s={native:0,counts:{},mode:''};this.streams.set(key,s);}
  if(kanaCount(t)>=2){if(++s.native>=2&&!s.mode)s.mode='native';return none;}
  if(s.mode&&s.mode!=='native'){const r=repairMojibake(t,{pair:s.mode})||repairMojibake(t);if(r)return {...none,text:r.text,repaired:true,pair:r.pair};
   return {...none,unreadable:/[^\x00-\x7f]/.test(t)};}
  const r=repairMojibake(t);if(!r)return none;
  let locked=false;if((s.counts[r.pair]=(s.counts[r.pair]||0)+1)>=2&&!s.mode){s.mode=r.pair;locked=true;}
  return {...none,text:r.text,repaired:true,locked,pair:r.pair};}
 mode(stream){return this.streams.get(String(stream||''))?.mode||'';}
}
/* text no one should read or translate: replacement characters, control codes, Chinese read as Shift-JIS (kanji mixed
   with half-width katakana and boxes), Japanese read with the wrong code page, UTF-8 read as Latin-1. controls:false for hook text,
   where engines may still carry their own control markup. */
function garbledSource(text,{controls=true,noise=true}={}){
 const t=String(text||'');const l=[...letters(t)];
 const bad=(t.match(controls?/[\ufffd\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g:/\ufffd/g)||[]).length;if(bad>=2||(bad&&bad>=l.length*.1))return true;if(!l.length)return false;
 /* Shift-JIS read as Big5 lands in the private use area (user-defined code points); a game's own gaiji are only a few */
 const pua=(t.match(/[-]/g)||[]).length;if(pua>=3&&pua>=l.length*.3)return true;
 /* UTF-8 kana (E3 81-83 ..) read as GBK starts 銇 銈 銉, read as Shift-JIS 縺 繧 繝: rare characters in real text */
 const kanaLeads=(t.match(/[銇銈銉縺繧繝]/g)||[]).length;if(kanaLeads>=3&&kanaLeads>=l.length*.15)return true;
 if((t.match(/[\uff61-\uff9f\u25a1]/g)||[]).length>=3&&(t.match(/[\u4e00-\u9fff]/g)||[]).length>=4)return true;
 if((t.match(/[\u00c2-\u00ef][\u0080-\u00bf\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/g)||[]).length>=2)return true;
 if(noise&&noiseLine(t))return true;
 return !!repairMojibake(t);}
/* 2026-11-15 (沙耶の唄: the game draws its monsters' speech as noise, 『二十Aﾅ像ナッテ初y(VQｳッテノハ…』): Japanese with half-width
   katakana glued to ASCII or kanji and ASCII runs wedged between wide characters. Same rule as EmbedTextPolicy.Unreadable
   (native/EmbedTextPolicy.cs), which keeps such a line the game's own (never hidden). A half-width word (ｱﾊﾊ) or 「AとB」 is not noise. */
function noiseLine(text){
 const t=String(text||'');const half=(t.match(/[\uff61-\uff9f]/g)||[]).length;if(!half)return false;
 if((t.match(/[\u4e00-\u9fff]/g)||[]).length<2||!/[\u3041-\u309f\u30a1-\u30fa]/.test(t))return false;
 const glued=(t.match(/(?<=[^\x00-\x7f\s])[\x21-\x7e]+(?=[^\x00-\x7f\s])/g)||[]).length;
 const touch=(t.match(/[\uff61-\uff9f](?=[\x21-\x7e\u4e00-\u9fff])|(?<=[\x21-\x7e\u4e00-\u9fff])[\uff61-\uff9f]/g)||[]).length;
 return glued>=2&&touch>=2;}
/* たいせつなきみのために、ぼくにできるいちばんのこと: the game logs through user32 wvsprintfA, whose hook hands over the format templates
   themselves ("%s%s%s%s%s%snone%s%s"). Two printf conversions in one string are a template, never a line the game shows; the same rule
   keeps such a stream from being auto-selected (native/EmbedTextPolicy.cs PrintfTemplate). One "%s" or "50%OFF" is ordinary text. */
function printfTemplate(text){return (String(text||'').match(/%(?:[-0]?\d{1,2})?(?:ll|l|h)?[sdxXuc](?![A-Za-z])|%S(?![A-Za-z])/g)||[]).length>=2;}
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
/* QQ #1116 (user: 「译文有时候出现神秘韩文」, a Chinese line that opened with one Hangul syllable): a Chinese or English
   translation never carries Hangul the Japanese line did not have. Such an answer is a model slipping into another
   script; it is no translation, so the chain goes on to the next source. */
const HANGUL=/[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿ﾠ-ￜ]/u;
function foreignScript(translation,source=''){
 const tr=String(translation||'');if(!tr.trim())return false;
 return HANGUL.test(tr)&&!HANGUL.test(String(source||''));}
module.exports={warmUp,repairMojibake,repairShiftJisAsGbk,StreamCodepage,garbledSource,noiseLine,printfTemplate,metaReply,foreignScript};
