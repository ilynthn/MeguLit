// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E560 desensitizer for adapter probes (user 2026-11-13: never upload game content; probe locally, upload a desensitized
   structure, push adapter packs back).

   desensitize(buffer) keeps every byte offset: each natural-language character (Japanese, Chinese, Korean, full-width
   letters, accented Latin, English prose) is replaced in place by a placeholder of the same byte class and the same encoded
   length, in every encoding a script may use (Shift-JIS, GBK, UTF-8, UTF-16LE). Opcodes, control codes, headers, index
   tables, ASCII commands and lengths are left as they are, so a parser written against the sample reads the real file.
     Shift-JIS  hiragana → あ 82A0, katakana and ー → ア 8341, kanji → 亜 889F, full-width letters/digits → Ａ 8260 / ０ 824F,
                other symbols → □ 81A0, half-width katakana (inside a text run) → ｱ B1
     GBK        hanzi → 啊 B0A1, other double-byte → □ A1F5
     UTF-8      3-byte → あ / ア / 亜 / □ (all 3 bytes), 2-byte → Ā C480, 4-byte → 𠀀 F0A08080
     UTF-16LE   あ 3042, ア 30A2, 亜 4E9C, Ａ FF21, □ 25A1, 가 AC00
   A small set of structural punctuation (「」『』（）【】、。！？…―　) is kept: it marks where dialogue starts and ends and
   carries no wording.
   Blocks with entropy above 7.2 bits/byte (encrypted or compressed data) are never part of a sample: sample() keeps the
   plaintext head, drops opaque blocks and lists their ranges and entropy instead. keyCandidates() derives decrypt
   parameters (xor keys, index-xor, add/sub, zlib after decrypt) from such data on this PC; only the parameters go up.
   verify(original, output) is the gate before anything is uploaded: every character any detector finds in the original
   must be gone from the output at its offset, and the output may contain no text run of its own. */
const zlib=require('node:zlib');

const KEPT=new Set([...'「」『』（）【】〔〕〈〉《》、。，．！？…‥―─　・：；～〜']);
const isHira=c=>c>=0x3041&&c<=0x309f;
const isKata=c=>c>=0x30a0&&c<=0x30ff||c>=0x31f0&&c<=0x31ff||c===0x30fc;
const isHan=c=>c>=0x4e00&&c<=0x9fff||c>=0x3400&&c<=0x4dbf||c>=0xf900&&c<=0xfaff||c===0x3005||c===0x3006||c===0x3007;
const isFullAlnum=c=>c>=0xff10&&c<=0xff19||c>=0xff21&&c<=0xff3a||c>=0xff41&&c<=0xff5a;
const isHalfKana=c=>c>=0xff61&&c<=0xff9f;
const isHangul=c=>c>=0xac00&&c<=0xd7af||c>=0x1100&&c<=0x11ff||c>=0x3130&&c<=0x318f;
/* a code point that is part of natural language (not ASCII, not kept punctuation) */
function isText(c){if(c<0x80)return false;if(KEPT.has(String.fromCodePoint(c)))return false;return isHira(c)||isKata(c)||isHan(c)||isFullAlnum(c)||isHalfKana(c)||isHangul(c)||c>=0xc0&&c<=0x24f||c>=0x370&&c<=0x52f||c>=0x3000&&c<=0x303f||c>=0xff00&&c<=0xffef||c>=0x2e80&&c<=0x2fdf||c>=0x20000&&c<=0x3ffff;}
function cls(c){if(isHira(c))return 'hira';if(isKata(c))return 'kata';if(isHan(c)||c>=0x20000)return 'han';if(isFullAlnum(c))return c<=0xff19?'digit':'alpha';if(isHalfKana(c))return 'half';if(isHangul(c))return 'hangul';return 'other';}

/* ---- per-encoding scanners ---------------------------------------------------------------------------------------
   Each returns the characters of text runs as {at,len,cp}: a run is two or more text characters in a row (one is enough
   for a double-byte character next to a kept punctuation mark), so a random byte pair inside binary data is not taken
   for text unless it really decodes as a run. */
const sjisDecoder=new TextDecoder('shift_jis'),gbkDecoder=new TextDecoder('gbk');
function cpOf(decoder,bytes){const s=decoder.decode(bytes);if(!s||s.includes('�'))return -1;const cp=s.codePointAt(0);return s.length===(cp>0xffff?2:1)?cp:-1;}
const sjisLead=b=>b>=0x81&&b<=0x9f||b>=0xe0&&b<=0xfc,sjisTrail=b=>b>=0x40&&b<=0x7e||b>=0x80&&b<=0xfc;
const gbkLead=b=>b>=0x81&&b<=0xfe,gbkTrail=b=>b>=0x40&&b<=0x7e||b>=0x80&&b<=0xfe;
const memoSjis=new Map(),memoGbk=new Map();
function dbcs(buf,{lead,trail,decoder,memo,halfKana}){
 const chars=[];for(let i=0;i<buf.length;){const b=buf[i];
  if(lead(b)&&i+1<buf.length&&trail(buf[i+1])){const k=b<<8|buf[i+1];let cp=memo.get(k);if(cp===undefined){cp=cpOf(decoder,buf.subarray(i,i+2));memo.set(k,cp);}
   if(cp>0){chars.push({at:i,len:2,cp});i+=2;continue;}}
  if(halfKana&&b>=0xa1&&b<=0xdf){chars.push({at:i,len:1,cp:0xff61+b-0xa1});i++;continue;}
  chars.push(asciiMark(b));i++;}
 return runs(chars,buf,false);
}
function utf8(buf){const chars=[];for(let i=0;i<buf.length;){const b=buf[i];let len=0;if(b>=0xc2&&b<=0xdf)len=2;else if(b>=0xe0&&b<=0xef)len=3;else if(b>=0xf0&&b<=0xf4)len=4;
  if(len&&i+len<=buf.length){let ok=true;for(let k=1;k<len;k++)if((buf[i+k]&0xc0)!==0x80){ok=false;break;}
   if(ok){const s=buf.toString('utf8',i,i+len),cp=s.codePointAt(0);if(cp>=0x80&&!s.includes('�')){chars.push({at:i,len,cp});i+=len;continue;}}}
  chars.push(asciiMark(b));i++;}
 return runs(chars,buf,false);}
function utf16(buf,start){const chars=[];for(let i=start;i+1<buf.length;i+=2){const cp=buf[i]|buf[i+1]<<8;/* below U+2E80 a UTF-16 unit is far more often an integer (0x0400 = 1024) than Cyrillic or accented text */chars.push(cp>=0x2e80&&cp<0xd800||cp>=0xe000&&cp<=0xffef?{at:i,len:2,cp}:cp<0x80?asciiMark(cp):null);}return runs(chars,buf,true);}
/* printable ASCII (and tab / line breaks) next to a character: a lone character there is a word in a script line
   ("猫[r]"), a lone character between binary bytes is most likely not text */
const ASCII={ascii:true},WORD={word:true};
const ZERO={zero:true};
/* ASCII: punctuation and white space (a script's tags, quotes, line breaks); WORD: letters and digits */
const asciiMark=b=>b===9||b===10||b===13||b>=0x20&&b<0x7f?(/[A-Za-z0-9]/.test(String.fromCharCode(b))?WORD:ASCII):b===0?ZERO:null;
/* text runs: text characters (kept punctuation may sit between them) of at least two characters, or a single multi-byte
   character that is plainly a string of its own: next to kept punctuation or ASCII punctuation / white space ("猫[r]"),
   next to a NUL terminator (8-bit encodings), or right after a length equal to its size (a one-character name in
   bytecode). A lone UTF-16 unit next to ASCII letters is two ASCII bytes, not a kanji. */
function runs(chars,buf,wide){
 const out=[];let cur=[],texts=0,before=null;
 const alone=(c,after)=>{if(before===ASCII||after===ASCII)return true;if(!wide&&(before===ZERO||after===ZERO))return true;if(!buf)return false;
  if(wide)return c.at>=4&&buf.readUInt32LE(c.at-4)===1||c.at>=2&&buf.readUInt16LE(c.at-2)===1&&before!==null;
  return c.at>=1&&buf[c.at-1]===c.len||c.at>=2&&buf[c.at-2]===c.len&&buf[c.at-1]===0;};
 /* E596 a run made only of single-byte half-width kana (0xA1-0xDF) is text only when it is 3+ long and stands between
    ASCII / NUL / text on both sides: two such bytes between binary bytes are a number (0x03A6B010 = 10 B0 A6 03), and
    whole index tables go up now, so their numbers must stay as they are */
 const halfOnly=()=>cur.every(c=>!isText(c.cp)||c.len===1);
 const plain=m=>m===ASCII||m===WORD||m===ZERO||!!(m&&m.cp!==undefined);
 const flush=after=>{const one=cur.find(c=>isText(c.cp));const ok=texts>=2||texts===1&&one.len>=2&&(cur.length>=2||alone(one,after));
  const keep=ok&&(wide||!halfOnly()||texts>=3&&plain(before)&&plain(after));
  if(keep)for(const c of cur)if(isText(c.cp))out.push(c);cur=[];texts=0;};
 for(const c of chars){if(c&&c.cp!==undefined&&(isText(c.cp)||KEPT.has(String.fromCodePoint(c.cp)))){cur.push(c);if(isText(c.cp))texts++;}else{if(cur.length)flush(c);before=c;}}
 if(cur.length)flush(null);return out;}
const SJIS_PH={hira:[0x82,0xa0],kata:[0x83,0x41],han:[0x88,0x9f],alpha:[0x82,0x60],digit:[0x82,0x4f],other:[0x81,0xa0],hangul:[0x81,0xa0]};
const GBK_PH={han:[0xb0,0xa1],other:[0xa1,0xf5]};
const U16_PH={hira:0x3042,kata:0x30a2,han:0x4e9c,alpha:0xff21,digit:0xff10,other:0x25a1,hangul:0xac00,half:0xff71};
function utf8Ph(c,len){if(len===2)return [0xc4,0x80];if(len===4)return [0xf0,0xa0,0x80,0x80];return [...Buffer.from(String.fromCodePoint(U16_PH[cls(c)]||0x25a1),'utf8')];}
/* every placeholder, as the code points they decode to, so the verifier can tell a placeholder from text */
const PLACEHOLDER_CPS=new Set([0x3042,0x30a2,0x4e9c,0xff21,0xff10,0x25a1,0xac00,0xff71,0x100,0x20000,0x554a]);
for(const ph of Object.values(SJIS_PH)){const s=sjisDecoder.decode(Buffer.from(ph));PLACEHOLDER_CPS.add(s.codePointAt(0));}

/* prose, not a statement: four or more words with sentence punctuation or a capitalised word ("show megumin happy at
   left" is a Ren'Py command, "Hello there, this is ..." a line) */
const prose=(t,words)=>words.length>=4&&(t.match(/ /g)||[]).length>=3&&(/[,.!?;:'"]\s|[.!?]$|[.!?]"/.test(t.trim())||/(^|\s|")[A-Z][a-z]+\s/.test(t));
/* ASCII prose (English lines in a script): runs of printable ASCII with at least three words and spaces, that do not look
   like code (no =, (, {, <, @ first, \, ;, quotes around identifiers). Letters become x / X, digits and punctuation stay. */
function asciiProse(buf){const out=[];let s=-1;
 const check=(a,b)=>{const t=buf.toString('latin1',a,b);if(t.length<16)return;if(/[={}<>\\|]|^\s*[@*;#\[]|\(\s*\)|_[a-z]|[a-z][A-Z][a-z]/.test(t)||/\.(ks|tjs|png|ogg|wav|txt|dat|bin|exe)\b/i.test(t))return;
  const words=t.match(/[A-Za-z]{2,}/g)||[];if(!prose(t,words))return;out.push([a,b]);};
 for(let i=0;i<=buf.length;i++){const b=i<buf.length?buf[i]:0;if(b>=0x20&&b<0x7f){if(s<0)s=i;}else{if(s>=0)check(s,i);s=-1;}}
 return out;}
/* the same in UTF-16LE (ASCII code units with zero high bytes) */
function asciiProse16(buf,start){const out=[];let s=-1;
 const check=(a,b)=>{let t='';for(let i=a;i<b;i+=2)t+=String.fromCharCode(buf[i]);if(t.length<16||/[={}<>\\|]|^\s*[@*;#\[]/.test(t))return;const words=t.match(/[A-Za-z]{2,}/g)||[];if(prose(t,words))out.push([a,b]);};
 for(let i=start;i+1<buf.length+1;i+=2){const ok=i+1<buf.length&&buf[i+1]===0&&buf[i]>=0x20&&buf[i]<0x7f;if(ok){if(s<0)s=i;}else{if(s>=0)check(s,i);s=-1;}}
 return out;}

/* every detector over the buffer: [{enc,at,len,cp}] (raw: an ASCII pair read as UTF-16 is a "kanji" here) */
function detect(buf){
 const all=[];
 for(const c of dbcs(buf,{lead:sjisLead,trail:sjisTrail,decoder:sjisDecoder,memo:memoSjis,halfKana:true}))all.push({enc:'sjis',...c});
 for(const c of dbcs(buf,{lead:gbkLead,trail:gbkTrail,decoder:gbkDecoder,memo:memoGbk,halfKana:false}))all.push({enc:'gbk',...c});
 for(const c of utf8(buf))all.push({enc:'utf8',...c});
 for(const start of [0,1])for(const c of utf16(buf,start))all.push({enc:'utf16le',...c,align:start});
 return all;}
function bom(buf){if(buf[0]===0xff&&buf[1]===0xfe)return 'utf16le';if(buf[0]===0xef&&buf[1]===0xbb&&buf[2]===0xbf)return 'utf8';return '';}
const isKana=c=>isHira(c)||isKata(c);
/* the encoding the file's text is in. Scores only what is distinctive for each: double-byte kana in Shift-JIS, GB2312
   hanzi (lead B0-F7, trail A1-FE) in GBK, valid multi-byte sequences in UTF-8, kana and zero-high-byte ASCII in UTF-16LE */
function primary(buf,found=detect(buf)){const b=bom(buf);if(b)return b;const n={sjis:0,gbk:0,utf8:0,utf16le:0};
 for(const c of found){
  if(c.enc==='sjis'){if(c.len===2&&isKana(c.cp))n.sjis+=2;else if(c.len===2&&isHan(c.cp))n.sjis+=.4;}
  else if(c.enc==='gbk'){const l=buf[c.at],t=buf[c.at+1];if(l>=0xb0&&l<=0xf7&&t>=0xa1&&t<=0xfe)n.gbk+=1;}
  else if(c.enc==='utf8')n.utf8+=3;
  else if(c.enc==='utf16le'&&isKana(c.cp))n.utf16le+=2;}
 let z=0;for(let i=0;i+1<buf.length&&i<1<<20;i+=2)if(buf[i+1]===0&&buf[i]>=0x20&&buf[i]<0x7f)z++;n.utf16le+=z*.3;
 const best=Object.entries(n).sort((x,y)=>y[1]-x[1])[0];return best[1]>0?best[0]:'sjis';}
/* What is replaced: every character the primary encoding reads as text; in other encodings only long runs with kana
   (four or more characters, two or more kana) on bytes the primary did not already take, so the ASCII of a script is
   never mistaken for UTF-16 "kanji". The same rule decides what verify() checks. */
function targets(buf,found=detect(buf)){
 const enc=primary(buf,found),taken=new Uint32Array(buf.length),out=[];
 /* UTF-16 without a BOM: the alignment whose reading has more kana and kanji */
 let align=0;if(enc==='utf16le'&&!bom(buf)){const n=[0,0];for(const c of found)if(c.enc==='utf16le'&&(isKana(c.cp)||isHan(c.cp)))n[c.align]+=isKana(c.cp)?2:1;align=n[1]>n[0]?1:0;}
 for(const c of found)if(c.enc===enc&&(enc!=='utf16le'||c.align===align)){out.push(c);for(let k=0;k<c.len;k++)taken[c.at+k]=out.length;}
 for(const e of ['sjis','utf8','gbk','utf16le']){if(e===enc)continue;
  const list=found.filter(c=>c.enc===e);let run=[];
  /* E596 (memory mixes encodings: a UTF-16 line next to Shift-JIS bytecode): a run that is plainly text in its own
     encoding (4+ characters, 2+ kana) wins over the primary encoding's characters on the same bytes, which were a
     misreading of it; those are dropped from the list, so every byte belongs to one target */
  const flush=()=>{if(run.length>=4&&run.filter(c=>isKana(c.cp)).length>=2){const kana=run.filter(c=>isKana(c.cp)).length;let clash=0,theirs=0;
    for(const c of run)for(let k=0;k<c.len;k++){const t=taken[c.at+k];if(t){clash++;if(out[t-1]&&isKana(out[t-1].cp))theirs++;}}
    /* the bytes already read as kana by another encoding stay with it unless this run has more kana */
    if(!clash||kana*2>theirs){for(const c of run)for(let k=0;k<c.len;k++){const t=taken[c.at+k];if(t&&out[t-1]){const o=out[t-1];out[t-1]=null;for(let j=0;j<o.len;j++)if(taken[o.at+j]===t)taken[o.at+j]=0;}}
     for(const c of run){out.push(c);for(let k=0;k<c.len;k++)taken[c.at+k]=out.length;}}}run=[];};
  for(const c of list){const prev=run[run.length-1];if(prev&&c.at-(prev.at+prev.len)>6)flush();run.push(c);}flush();}
 return {enc,list:out.filter(Boolean)};}

function placeholder(c){const k=cls(c.cp);
 if(c.enc==='sjis')return c.len===1?[0xb1]:SJIS_PH[k]||SJIS_PH.other;
 if(c.enc==='gbk')return k==='han'?GBK_PH.han:GBK_PH.other;
 if(c.enc==='utf8')return utf8Ph(c.cp,c.len);
 const u=U16_PH[k]||U16_PH.other;return [u&255,u>>8];}

/* desensitize(buffer) → {bytes,encoding,replaced} — same length as the input */
function desensitize(input){
 const buf=Buffer.from(input),out=Buffer.from(buf),done=new Uint8Array(buf.length),{enc,list}=targets(buf);let replaced=0;
 for(const c of list){const ph=placeholder(c);for(let k=0;k<c.len;k++){out[c.at+k]=ph[k];done[c.at+k]=1;}replaced++;}
 for(const [a,b] of asciiProse(buf))for(let i=a;i<b;i++){if(done[i])continue;const x=buf[i];if(x>=0x61&&x<=0x7a)out[i]=0x78;else if(x>=0x41&&x<=0x5a)out[i]=0x58;done[i]=1;}
 if(enc==='utf16le')for(const s of [0,1])for(const [a,b] of asciiProse16(buf,s))for(let i=a;i<b;i+=2){if(done[i])continue;const x=buf[i];if(x>=0x61&&x<=0x7a)out[i]=0x78;else if(x>=0x41&&x<=0x5a)out[i]=0x58;done[i]=1;}
 /* E596 mixed encodings: where a run in one encoding replaced part of a character in another, the bytes left over can
    read as text again; such remainders are replaced too (a few passes at most) */
 for(let pass=0;pass<3;pass++){const rest=textRuns(out);if(!rest.length)break;for(const c of rest){const ph=placeholder(c);for(let k=0;k<c.len;k++)out[c.at+k]=ph[k];replaced++;}}
 return {bytes:out,encoding:enc,replaced};
}

/* A JS string (a file name inside an archive index): ASCII stays, every other letter becomes its class placeholder. */
function maskString(s){let out='';for(const ch of String(s)){const c=ch.codePointAt(0);out+=c<0x80||KEPT.has(ch)?ch:String.fromCodePoint(U16_PH[cls(c)]||0x25a1);}return out;}

/* ---- verification ---------------------------------------------------------------------------------------------- */
/* the text characters of buf (by the targets() rule) that are not placeholders */
function textRuns(buf){const b=Buffer.from(buf);return targets(b).list.filter(c=>!PLACEHOLDER_CPS.has(c.cp));}
/* verify(original, output) → {ok, leaks:[{at,enc}], foreign:n}
   leak: a text character of the original that is still there, byte for byte, in the output (or ASCII prose left as is).
   foreign: text characters the output itself still reads as (by the same rule) that are not placeholders. */
function verify(original,output){
 const a=Buffer.from(original),b=Buffer.from(output),leaks=[];
 if(a.length!==b.length)return {ok:false,leaks:[],foreign:0,error:'LENGTH_CHANGED'};
 for(const c of targets(a).list){if(PLACEHOLDER_CPS.has(c.cp))continue;let same=true;for(let k=0;k<c.len;k++)if(a[c.at+k]!==b[c.at+k]){same=false;break;}if(same)leaks.push({at:c.at,enc:c.enc});if(leaks.length>=20)break;}
 for(const [s,e] of asciiProse(a)){if(a.subarray(s,e).equals(b.subarray(s,e))){leaks.push({at:s,enc:'ascii'});break;}}
 const foreign=textRuns(b).length;
 return {ok:!leaks.length&&!foreign,leaks,foreign};
}

/* ---- structure / entropy --------------------------------------------------------------------------------------- */
function entropy(buf){if(!buf.length)return 0;const n=new Uint32Array(256);for(const x of buf)n[x]++;let h=0;for(const c of n)if(c){const p=c/buf.length;h-=p*Math.log2(p);}return h;}
const BLOCK=4096,OPAQUE=7.2;
/* sample(buffer,{max,tail,compress}) → {size,parts:[{at,len,encoding,base64|gzip,packed?}],opaque:[{at,len,entropy}],entropy}
   The plaintext part of the file up to `max` bytes (and the last `tail` bytes), desensitized; opaque blocks inside that
   window are zero-filled (their place and entropy are listed). Returns null when the result does not pass verify().
   Opaque runs split the window: each plaintext stretch is desensitized and verified on its own (text never spans a
   high-entropy block), so a large window that is mostly encrypted costs little.
   compress (E596, 2026-11-14 user: send whole scripts and indexes, placeholders compress to almost nothing): the part
   bytes are gzip-compressed (gzip: base64 of the gzip stream, packed: its size, len: the size it inflates to; read with
   partBytes()). Width is kept: every offset in the sample is the offset in the file. */
function sample(input,{max=64*1024,tail=0,compress=false}={}){
 const buf=Buffer.from(input),take=r=>buf.subarray(r[0],r[1]);
 const ranges=[[0,Math.min(buf.length,max)]];if(tail&&buf.length>max)ranges.push([Math.max(max,buf.length-tail),buf.length]);
 const parts=[],opaque=[];
 for(const r of ranges){const src=Buffer.from(take(r));const out=Buffer.alloc(src.length),dark=new Uint8Array(Math.ceil(src.length/BLOCK));
  for(let at=0,i=0;at<src.length;at+=BLOCK,i++){const blk=src.subarray(at,Math.min(src.length,at+BLOCK)),h=entropy(blk);if(blk.length>=256&&h>OPAQUE){opaque.push({at:r[0]+at,len:blk.length,entropy:Math.round(h*100)/100});dark[i]=1;}}
  let encoding='',best=0;
  for(let i=0;i<dark.length;){if(dark[i]){i++;continue;}let j=i;while(j<dark.length&&!dark[j])j++;const a=i*BLOCK,b=Math.min(src.length,j*BLOCK),seg=src.subarray(a,b);
   const d=desensitize(seg),v=verify(seg,d.bytes);if(!v.ok)return null;d.bytes.copy(out,a);if(b-a>best){best=b-a;encoding=d.encoding;}i=j;}
  parts.push({at:r[0],bytes:out,encoding:encoding||'sjis'});}
 const pack=p=>{if(!compress)return {at:p.at,len:p.bytes.length,encoding:p.encoding,base64:p.bytes.toString('base64')};const z=zlib.gzipSync(p.bytes,{level:9});return {at:p.at,len:p.bytes.length,encoding:p.encoding,packed:z.length,gzip:z.toString('base64')};};
 return {size:buf.length,parts:parts.map(pack),opaque,entropy:Math.round(entropy(buf.subarray(0,Math.min(buf.length,1<<20)))*100)/100};
}
/* the bytes of a sample part, plain or compressed (never inflates past the part's declared length) */
function partBytes(p){if(!p)return Buffer.alloc(0);if(typeof p.gzip==='string'){try{return zlib.gunzipSync(Buffer.from(p.gzip,'base64'),{maxOutputLength:Math.max(1,Number(p.len)||1)});}catch{return Buffer.alloc(0);}}return Buffer.from(String(p.base64||''),'base64');}
/* raw (inflated) and sent (compressed or base64) sizes of a sample */
function sampleSizes(s){let raw=0,packed=0;for(const p of s?.parts||[]){raw+=p.len|0;packed+=typeof p.gzip==='string'?p.packed|0:p.len|0;}return {raw,packed};}

/* ---- key / parameter candidates -------------------------------------------------------------------------------- */
/* Known plaintext: what the start of a file of that kind holds. */
const MAGICS=[['png',Buffer.from('89504e470d0a1a0a','hex')],['ogg',Buffer.from('OggS\0','latin1')],['riff',Buffer.from('RIFF','latin1')],['utf16bom',Buffer.from([0xff,0xfe])],['utf8bom',Buffer.from([0xef,0xbb,0xbf])],['tjs2',Buffer.from('TJS2100\0','latin1')],['psb',Buffer.from('PSB\0','latin1')],['zip',Buffer.from('PK\x03\x04','latin1')],['jpeg',Buffer.from([0xff,0xd8,0xff])],['ks',Buffer.from([0xff,0xfe,0x2a,0x00])],['bmp',Buffer.from('BM','latin1')]];
const EXT_MAGIC={png:['png'],ogg:['ogg'],wav:['riff'],ks:['ks','utf16bom','utf8bom'],tjs:['tjs2','utf16bom','utf8bom'],txt:['utf16bom','utf8bom'],psb:['psb'],scn:['psb'],jpg:['jpeg'],bmp:['bmp'],zip:['zip']};
function printableScore(b){if(!b.length)return 0;let ok=0;for(const x of b)if(x===9||x===10||x===13||x>=0x20&&x<0x7f)ok++;
 const t=sjisDecoder.decode(b),kana=(t.match(/[ぁ-ゖァ-ヺ]/g)||[]).length,bad=(t.match(/�/g)||[]).length;return Math.max(0,(ok+kana*2-bad*2)/b.length);}
function zlibAfter(b){if(b.length<2||(b[0]&0x0f)!==8||((b[0]<<8)|b[1])%31)return false;try{zlib.inflateSync(b.subarray(0,Math.min(b.length,8192)),{finishFlush:zlib.constants.Z_SYNC_FLUSH});return true;}catch{return false;}}
/* keyCandidates(entries) — entries: [{data:Buffer (the first bytes of an encrypted entry or file), ext:'png'|...}]
   → [{algo,key?,base?,step?,value?,period?,confidence,evidence}] best first. Nothing of the data itself is returned. */
function keyCandidates(entries,{limit=8}={}){
 const list=(Array.isArray(entries)?entries:[entries]).map(e=>Buffer.isBuffer(e)?{data:e,ext:''}:{data:Buffer.from(e.data||[]),ext:String(e.ext||'').toLowerCase()}).filter(e=>e.data.length>=8).slice(0,64);
 const out=[],add=c=>{if(!out.some(o=>o.algo===c.algo&&o.key===c.key&&o.base===c.base&&o.step===c.step&&o.value===c.value))out.push(c);};
 /* known plaintext per entry → key prefix; keys that agree across entries are the strong candidates */
 const prefixes=new Map();
 for(const e of list){const magics=(EXT_MAGIC[e.ext]||[]).map(n=>MAGICS.find(m=>m[0]===n)).filter(Boolean);const tries=magics.length?magics:MAGICS;
  for(const [name,m] of tries){if(e.data.length<m.length)continue;const k=Buffer.alloc(m.length);for(let i=0;i<m.length;i++)k[i]=e.data[i]^m[i];
   const key=k.toString('hex');const p=prefixes.get(key)||{key,name,n:0,ext:new Set()};p.n++;p.ext.add(e.ext);prefixes.set(key,p);
   /* index-xor: c[i]=p[i]^(base+i*step) */
   if(m.length>=4){const step=(k[1]-k[0])&255;let lin=true;for(let i=2;i<m.length;i++)if(((k[i]-k[i-1])&255)!==step){lin=false;break;}if(lin&&step)add({algo:'xor-index',base:k[0],step,confidence:.5,evidence:'known-plaintext:'+name});}
   /* add/sub constant */
   const d=(e.data[0]-m[0])&255;let same=d!==0;for(let i=1;i<m.length&&same;i++)if(((e.data[i]-m[i])&255)!==d)same=false;if(same)add({algo:'sub',value:d,confidence:.45,evidence:'known-plaintext:'+name});}}
 for(const p of [...prefixes.values()].sort((a,b)=>b.n-a.n)){
  const k=Buffer.from(p.key,'hex'),single=k.every(x=>x===k[0]);
  if(single&&k[0])add({algo:'xor',key:k.subarray(0,1).toString('hex'),confidence:Math.min(.95,.5+p.n*.1),evidence:`known-plaintext:${p.name}×${p.n}`});
  else if(p.n>=2&&k.some(Boolean))add({algo:'xor',key:p.key,period:k.length,partial:true,confidence:Math.min(.9,.3+p.n*.1),evidence:`known-plaintext:${p.name}×${p.n}`});}
 /* single-byte xor by text score / zlib after decrypt */
 const pool=Buffer.concat(list.map(e=>e.data.subarray(0,2048))).subarray(0,16384);
 if(pool.length){const scored=[];for(let k=1;k<256;k++){const b=Buffer.from(pool.subarray(0,4096));for(let i=0;i<b.length;i++)b[i]^=k;scored.push({k,s:printableScore(b),z:list.some(e=>{const x=Buffer.from(e.data.subarray(0,64));for(let i=0;i<x.length;i++)x[i]^=k;return zlibAfter(x);})});}
  const base=printableScore(pool.subarray(0,4096));scored.sort((a,b)=>b.s-a.s);
  for(const s of scored.slice(0,3))if(s.s>.85&&s.s>base+.2)add({algo:'xor',key:s.k.toString(16).padStart(2,'0'),confidence:Math.round(Math.min(.9,s.s)*100)/100,evidence:'text-score'});
  for(const s of scored)if(s.z)add({algo:'xor',key:s.k.toString(16).padStart(2,'0'),then:'zlib',confidence:.7,evidence:'zlib-header'});}
 /* repeating key: per column the most frequent byte is taken as plaintext 0x00 (binary) or 0x20 (text) */
 const body=pool.length>=1024?pool:null;
 if(body)for(let period=2;period<=32;period++){if(body.length<period*24)break;const key=Buffer.alloc(period);let strength=0;
  for(let c=0;c<period;c++){const n=new Uint32Array(256);let total=0;for(let i=c;i<body.length;i+=period){n[body[i]]++;total++;}let best=0;for(let x=1;x<256;x++)if(n[x]>n[best])best=x;key[c]=best;strength+=n[best]/total;}
  strength/=period;if(strength>.35&&key.some(Boolean)&&!key.every(x=>x===key[0])){const b=Buffer.from(body.subarray(0,4096));for(let i=0;i<b.length;i++)b[i]^=key[i%period];const s=printableScore(b);
   add({algo:'xor',key:key.toString('hex'),period,confidence:Math.round(Math.min(.8,strength*.6+(s>.7?.3:0))*100)/100,evidence:'column-frequency'});}}
 for(const e of list)if(zlibAfter(e.data)){add({algo:'zlib',confidence:.9,evidence:'zlib-header'});break;}
 return out.sort((a,b)=>b.confidence-a.confidence).slice(0,limit);
}

module.exports={desensitize,verify,sample,partBytes,sampleSizes,keyCandidates,maskString,textRuns,detect,targets,entropy,primary,PLACEHOLDER_CPS,KEPT};
