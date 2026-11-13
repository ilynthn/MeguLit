// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E584 Marble engine (Marine / Succubus / Bitters / Paradise …: 124 releases, the last in 2016, so back catalogue).
   Format references (read, not copied): GARbro ArcFormats/Marble/ArcMBL.cs (morkt, MIT) for the archive and the script
   cipher, HOKORISAMA MARBLE-ENGINE-TOOL-KIT (MIT) for the 0x40 index variant, SExtractor's "BIN Marble" preset (satan53x,
   GPL-3.0) for what the decrypted script holds.
     *.mbl         count (u32), then either a name length (u32, ≤ 0xFF) and entries {name[len], offset, size}, or fixed
                   entries of 0x10 / 0x38-byte names. Names may be "base\0ext". Scripts are the .s entries of
                   mg_data*.mbl (any *_data.mbl; later numbers are patches that override).
     .s scripts    XOR with a per-title passphrase (cp932 bytes, repeating: "女教師ゆうこ1968", "MAYURI" …); without one,
                   every byte is negated. Decrypted they are NUL-separated strings: @ * \ start commands and labels,
                   ">name" is the speaker, every other string with Japanese is a shown line.
   The passphrase is not needed in advance: the plaintext is mostly Shift-JIS text and NUL separators, so the key falls
   out of the ciphertext column by column (kit.xorKeyByColumns), checked by how much Japanese the scripts then read. A
   known key list and probe-supplied keys (params "marble-key": {key} cp932 text or {hex}) are tried first. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');

/* entries of an .mbl: [{name, offset, size}] or null */
function list(file){const fsz=kit.size(file);if(fsz<16)return null;const h=kit.head(file,8),count=h.readInt32LE(0);if(count<=0||count>200000)return null;
 const n=h.readUInt32LE(4);const tries=[];if(n>0&&n<=0xff)tries.push([n,8]);tries.push([0x10,4],[0x38,4]);
 for(const [nl,at] of tries){const isz=(8+nl)*count;if(at+isz>fsz)continue;const idx=kit.readAt(file,at,isz),out=[];let ok=true;
  for(let i=0;i<count;i++){const p=i*(nl+8),nb=idx.subarray(p,p+nl),z=nb.indexOf(0),base=z>=0?nb.subarray(0,z):nb;if(!base.length)break;
   let name=kit.SJIS.decode(base);if(z>=0&&nl-z>1){const r=nb.subarray(z+1),z2=r.indexOf(0),ext=(z2>=0?r.subarray(0,z2):r).toString('latin1');if(/^[A-Za-z0-9]{1,8}$/.test(ext))name=name.replace(/\.[^.]*$/,'')+'.'+ext;}
   const offset=idx.readUInt32LE(p+nl),size=idx.readUInt32LE(p+nl+4);if(offset<isz||offset+size>fsz||/[\0-\x1f]/.test(name)){ok=false;break;}out.push({name:name.toLowerCase(),offset,size});}
  if(ok&&out.length&&!(out.length===1&&count>1))return out;}
 return null;}

const negate=b=>{const o=Buffer.allocUnsafe(b.length);for(let i=0;i<b.length;i++)o[i]=(-b[i])&255;return o;};
/* per-title passphrases (marble-schemes.json, like cx-schemes.json / paz-schemes.json) */
const SCHEMES=require('./marble-schemes.json'),KNOWN=Object.entries(SCHEMES).filter(([k])=>k[0]!=='_').map(([,v])=>v);
const sjisBytes=s=>kit.encodeSjis(s);
const keyOf=v=>v?.hex&&/^([0-9a-f]{2})+$/i.test(v.hex)?Buffer.from(v.hex,'hex'):typeof v?.key==='string'?sjisBytes(v.key):null;
function packKeys(){let extra=[];try{extra=require('../adapter-packs.cjs').params('marble-key').map(p=>p.value);}catch{}return [...extra,...KNOWN].map(keyOf).filter(Boolean);}
/* how much a decrypted script looks like Marble's: NUL-separated strings (one every ~100 bytes at least) that decode
   cleanly, with CJK text among them. GBK patches decode almost any byte pair, so the separators carry the check */
function plausible(b){const t=b.subarray(0,32768),dec=new TextDecoder(kit.codepage(t)),parts=t.toString('latin1').split('\0').filter(Boolean);if(parts.length<t.length/120)return 0;
 let clean=0;for(const p of parts){const s=dec.decode(Buffer.from(p,'latin1'));if(!/[�\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))clean++;}return kit.textScore(t)>0.05?clean/parts.length:0;}
/* the transform that opens this archive's scripts: {key: Buffer} | {negate: true} | null */
function cipherFor(file,entries){const sample=entries.filter(e=>/\.s$/i.test(e.name)).sort((a,b)=>b.size-a.size).slice(0,2).map(e=>kit.readAt(file,e.offset,Math.min(e.size,65536)));
 if(!sample.length)return null;const score=fn=>sample.reduce((s,b)=>s+plausible(fn(b)),0)/sample.length,good=0.75;
 for(const k of packKeys())if(score(b=>kit.xor(b,k))>=good)return {key:k};
 if(score(negate)>=good)return {negate:true};
 if(score(b=>b)>=good)return {plain:true};
 const big=sample[0];for(const weights of [kit.sjisWeights(),kit.gbkWeights()])for(const c of kit.xorKeyByColumns(big,{maxPeriod:64,weights}).slice(0,3)){if(score(b=>kit.xor(b,c.key))>=good)return {key:c.key};}
 return null;}
const memo=new Map();
function opened(file){const st=kit.size(file)+':'+(fs.statSync(file).mtimeMs|0),m=memo.get(file);if(m&&m.st===st)return m.v;const l=list(file);const v=l?{list:l,cipher:cipherFor(file,l)}:null;memo.set(file,{st,v});return v;}
function decode(file,e){const b=kit.readAt(file,e.offset,e.size),c=opened(file)?.cipher;if(!c)return negate(b);if(c.key)return kit.xor(b,c.key);if(c.negate)return negate(b);return b;}

function parse(buf){const lines=[],anchors=[];const dec=kit.decoder([buf]);
 for(const part of buf.toString('latin1').split('\0')){if(!part)continue;const b=Buffer.from(part,'latin1');const t=kit.trimBoth(dec.decode(b));if(!t||t.includes('�'))continue;
  if(/^[*\\@]/.test(t)){anchors.push(t);continue;}if(t.startsWith('>')){anchors.push(t);continue;}
  if(kit.ascii(t)||!kit.hasKana(t)&&!/[一-龯]{2,}/.test(t)){anchors.push(t);continue;}lines.push(t.replace(/\r\n|\r/g,'\n'));}
 return {lines,anchors};}

const DATA=/_data\d*\.mbl$/i;
const engine=kit.engine({id:'marble',hint:'mg_data.mbl',
 archives:{name:DATA,list:file=>{const o=opened(file);return o&&o.cipher?o.list:null;},entry:/\.s$/i,read:decode},
 loose:{name:/\.s$/i,subs:['script','data']},parse});
module.exports={engine,parse,list,decode,negate,cipherFor,KNOWN};
