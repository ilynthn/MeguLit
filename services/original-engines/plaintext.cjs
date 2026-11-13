// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E620 the F2 "plain-text script" family: one reader for every engine whose scenario is a text file, driven by a
   per-engine grammar profile (plaintext-profiles.json). A profile is data only, so a new engine (or a fix) can also
   ship as an adapter pack (services/adapter-packs.cjs grammar:lines, see packGrammar below).

   profile fields (regular expressions are strings; all optional unless said)
     id, engine        profile id and the VNDB engine name (the registry entry's name)
     match             fingerprint of a game folder: {all:[cond], any:[cond]}; cond {has:re} | {sub:[dir,re]} |
                       {magic:[re,head]} | {peek:[file,re]} | {table:name} (one of the files opens as that table)
     files             loose scripts {name:re, subs:[sub folder …], depth}; a file found here overrides an archived one
     zips              scripts inside zip files {name:re (the zip), entry:re}
     table             scripts in a kit.table archive {name:re, spec:{kit.table spec}, entry:re}
     encoding          'auto' (kit.decodeText) | 'shift_jis' | 'utf-8' | 'gbk'
     comment, anchor   lines skipped / kept as anchors (commands, labels)
     blocks            [[open, close]] code or comment blocks skipped whole
     say               [{re, text, name, args:{split, name, text}, choices:{split, start, every}, follow}] lines that
                       carry text inside a command: group numbers for text / speaker; args: split the group text by
                       split and take positions (name / text: index, negative from the end, text 'last'); choices: the
                       group split into options start, start+every, …; follow: group holding how many of the next
                       lines are options (PyMO #sel)
     bare              true (default): any other line is text; false: any other line is an anchor
     name              re with group 1: a speaker line of its own ("【name】", "#name")
     strip             inline tags removed from text; ruby: [re] whose group 1 (the base text) is kept
     escapes           {"\\n": "\n"} literal sequences turned into characters
     scan              true: no grammar known, the files are read by the generic kana scan (kit.decodeRuns)
     status            '完整' | '半成品' | '需实物' (what MeguLit can do without a real game)
   A buffer read through scenes() remembers its profile; any other buffer is matched by content (sniff). */
const fs=require('node:fs'),path=require('node:path');
const kit=require('./kit.cjs');
const RAW=require('./plaintext-profiles.json');

const rx=(s,f='')=>s?new RegExp(s,f):null;
function compile(p){const c={...p,comment:rx(p.comment),anchor:rx(p.anchor),name:rx(p.name),blocks:(p.blocks||[]).map(([o,e])=>[rx(o),rx(e)]),
  strip:(p.strip||[]).map(s=>rx(s,'g')),ruby:(p.ruby||[]).map(s=>rx(s,'g')),say:(p.say||[]).map(s=>({...s,re:rx(s.re,s.all?'g':''),args:s.args&&{...s.args,split:rx(s.args.split)},choices:s.choices&&{...s.choices,split:rx(s.choices.split)}})),bare:p.bare!==false,
  files:p.files&&{...p.files,name:rx(p.files.name,'i')},zips:p.zips&&{...p.zips,name:rx(p.zips.name,'i'),entry:rx(p.zips.entry,'i')},
  table:p.table&&{...p.table,name:rx(p.table.name,'i'),entry:rx(p.table.entry||'.','i')}};return c;}
const PROFILES=Object.fromEntries(RAW.profiles.map(p=>[p.id,compile(p)]));

/* ---- detection ------------------------------------------------------------------------------------------------- */
/* f: the registry's listing (has / sub / magicAny / peek / probe); a plain folder path is listed here */
function cond(f,c){if(c.all)return c.all.every(x=>cond(f,x));if(c.any)return c.any.some(x=>cond(f,x));
 if(c.find)return kit.walk(path.join(f.dir,c.find[0]),c.find[2]??3,n=>rx(c.find[1],'i').test(n)).length>0;
 if(c.has)return f.has(rx(c.has,'i'));if(c.sub)return f.sub(c.sub[0],rx(c.sub[1],'i'));if(c.magic)return f.magicAny(rx(c.magic[0],'i'),c.magic[1]);
 if(c.peek)return f.peek(c.peek[0],rx(c.peek[1]),4096);if(c.table){const p=PROFILES[c.table];return f.probe(p.table.name,file=>!!tableList(p,file));}return false;}
function matches(f,id){const p=PROFILES[id];if(!p?.match)return false;if(typeof f==='string')f=require('./registry.cjs').listing(f);
 const m=p.match;return (!m.all||m.all.every(c=>cond(f,c)))&&(!m.any||m.any.some(c=>cond(f,c)));}
function profileOf(dir){let f;try{f=require('./registry.cjs').listing(dir);}catch{return null;}for(const id of Object.keys(PROFILES))if(matches(f,id))return PROFILES[id];return null;}

/* ---- containers ------------------------------------------------------------------------------------------------ */
/* E621 Suika 2 since 2.x (and its successors OpenNovel / Polaris Engine, MIT, src/file.c) obfuscate data01.arc: every
   entry name (256 bytes) and every entry body is XORed with a byte stream seeded by the entry index. K is the build's
   64-bit key (key.h; default 0xcafef00dabadbeef), all arithmetic mod 2^64:
     seed(i):  n = K; i times { n ^= 0xafcb8f2ff4fff33f; n = rotl(n, 1) }
     next():   byte = n & 0xff; n = (((K & 0xff00) * n + (K & 0xff)) % K) ^ 0xfcbfaff8f2f4f3f0
   A game built with its own key is recognised and not read (the key is compiled into the exe, shuffled). */
const M64=(1n<<64n)-1n,MASK1=0xafcb8f2ff4fff33fn,MASK2=0xfcbfaff8f2f4f3f0n;
const suikaSeedNext=n=>{n^=MASK1;return ((n<<1n)|(n>>63n))&M64;};
function suikaSeed(key,index){let n=BigInt('0x'+key)&M64;for(let i=0;i<index;i++)n=suikaSeedNext(n);return n;}
/* XOR buf with the stream that starts at seed (a BigInt from suikaSeed) */
function suikaXor(buf,key,seed){const K=BigInt('0x'+key)&M64,a=K&0xff00n,c=K&0xffn,o=Buffer.from(buf);let n=seed;for(let i=0;i<o.length;i++){o[i]^=Number(n&0xffn);n=(((a*n+c)&M64)%K)^MASK2;}return o;}
const printable=n=>/^[\x20-\x7e]+$/.test(n);
function suikaList(file,keys){const sz=kit.size(file);if(sz<8)return null;const h=kit.readAt(file,0,8);const count=Number(h.readBigUInt64LE(0));if(!count||count>65536||8+count*272>sz)return null;
 const idx=kit.readAt(file,8,count*272);
 for(const key of keys||[]){const out=[];let ok=true;
  let seed=BigInt('0x'+key)&M64;
  for(let i=0;i<count&&ok;i++,seed=suikaSeedNext(seed)){const at=seed,r=idx.subarray(i*272,i*272+272),nb=suikaXor(r.subarray(0,256),key,at),z=nb.indexOf(0),name=nb.toString('utf8',0,z<0?256:z);
   const size=Number(r.readBigUInt64LE(256)),offset=Number(r.readBigUInt64LE(264));if(!printable(name)||offset+size>sz||offset<8+count*272){ok=false;break;}
   out.push({name,offset,size,read:()=>suikaXor(kit.readAt(file,offset,size),key,at)});}
  if(ok&&out.length)return out;}
 return null;}
function tableList(p,file){const l=kit.table(file,p.table.spec);
 /* a real index names files with printable paths; an obfuscated one does not */
 if(l&&l.length&&l.every(e=>printable(e.name)))return l;
 if(p.table.cipher?.suika)return suikaList(file,p.table.cipher.suika);return null;}
const base=n=>path.posix.basename(String(n).replace(/\\/g,'/'));
function scenesOf(p,dir){const out=new Map(),tag=(buf)=>{if(Buffer.isBuffer(buf))owner.set(buf,p.id);return buf;};
 if(p.table)for(const a of kit.files(dir,{name:p.table.name,subs:p.table.subs||['']})){const l=tableList(p,a);for(const e of l||[]){if(!p.table.entry.test(e.name))continue;out.set(base(e.name).toLowerCase(),{name:base(e.name),read:()=>tag(e.read?e.read():kit.entryRead(a,e))});}}
 if(p.zips)for(const z of kit.files(dir,{name:p.zips.name,subs:p.zips.subs||['']})){let l=null;try{l=kit.zipList(z);}catch{}for(const e of l||[]){if(e.encrypted||!p.zips.entry.test(e.name)||/\/$/.test(e.name))continue;out.set(base(e.name).toLowerCase(),{name:base(e.name),read:()=>tag(kit.zipRead(z,e))});}}
 if(p.files)for(const s of p.files.subs||['']){const d=s?path.join(dir,s):dir;for(const f of kit.walk(d,p.files.depth??0,n=>p.files.name.test(n))){const rel=path.relative(dir,f).replace(/\\/g,'/');const key=(p.files.keepPath?rel:path.basename(f)).toLowerCase();
  out.set(key,{name:p.files.keepPath?rel:path.basename(f),read:()=>tag(fs.readFileSync(f)),file:f});}}
 return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));}
function sourcesOf(p,dir){const out=[];if(p.table)out.push(...kit.files(dir,{name:p.table.name,subs:p.table.subs||['']}).filter(a=>tableList(p,a)));
 if(p.zips)out.push(...kit.files(dir,{name:p.zips.name,subs:p.zips.subs||['']}));
 if(p.files)for(const s of p.files.subs||[''])out.push(...kit.walk(s?path.join(dir,s):dir,p.files.depth??0,n=>p.files.name.test(n)));return out;}

/* ---- grammar --------------------------------------------------------------------------------------------------- */
const owner=new WeakMap();
function decode(p,buf){if(!p.encoding||p.encoding==='auto')return kit.decodeText(buf);if(buf[0]===0xef&&buf[1]===0xbb&&buf[2]===0xbf)return buf.toString('utf8',3);return new TextDecoder(p.encoding).decode(buf);}
function clean(p,s){for(const r of p.ruby){r.lastIndex=0;s=s.replace(r,'$1');}for(const [k,v] of Object.entries(p.escapes||{}))s=s.split(k).join(v);for(const r of p.strip){r.lastIndex=0;s=s.replace(r,'');}return kit.trimBoth(s).replace(/\r?\n/g,NL);}
const at=(list,i)=>i==='last'?list[list.length-1]:i<0?list[list.length+i]:list[i];
/* lines in, kit.lineGrammar does the final cut: say-lines are rewritten into marked text (\u0002) and speaker (\u0001)
   lines, everything the profile does not show into anchor lines (\u0003) */
const NAME='\u0001',TEXT='\u0002',ANCH='\u0003',NL='\u0005';
function rewrite(p,text){const out=[];let block=null,follow=0;
 for(const raw of text.split(/\r?\n/)){const t=raw.trim();if(!t)continue;
  if(block){if(block.test(t))block=null;continue;}const b=p.blocks.find(([o])=>o.test(t));if(b){block=b[1];continue;}
  if(follow>0){follow--;const s=clean(p,t);if(s)out.push(TEXT+s);continue;}
  if(p.comment&&p.comment.test(t))continue;
  let said=false;for(const r of p.say){if(r.all){r.re.lastIndex=0;const ms=[...t.matchAll(r.re)];if(!ms.length)continue;said=true;out.push(ANCH+t);for(const m of ms){const s=clean(p,r.text==='any'?m.slice(1).find(x=>x!==undefined)||'':m[r.text||1]);if(s)out.push(TEXT+s);}break;}
   const m=r.re.exec(t);if(!m)continue;said=true;out.push(ANCH+t);
   if(r.follow){follow=Math.max(0,Math.min(64,parseInt(m[r.follow],10)||0));break;}
   if(r.choices){const parts=String(m[r.choices.group??1]).split(r.choices.split),end=r.choices.count!==undefined?Math.min(parts.length,(r.choices.start||0)+(parseInt(parts[r.choices.count],10)||0)):parts.length;for(let i=r.choices.start||0;i<end;i+=r.choices.every||1){const s=clean(p,parts[i]);if(s)out.push(TEXT+s);}break;}
   let name=r.name?m[r.name]:null,say=r.text?m[r.text]:null;
   if(r.args){const parts=String(m[r.args.group??1]).split(r.args.split);if(parts.length>=2&&r.args.name!==undefined)name=at(parts,r.args.name);say=parts.length<2?parts[0]:r.args.text==='rest'?parts.slice(1).join(r.args.join??','):at(parts,r.args.text??'last');}
   if(name){const n=clean(p,name);if(n)out.push(NAME+n);}if(say!=null){const s=clean(p,say);if(s)out.push(TEXT+s);}break;}
  if(said)continue;
  if(p.anchor&&p.anchor.test(t)){out.push(ANCH+t);continue;}
  if(p.name){const m=p.name.exec(t);if(m){if(m[1])out.push(NAME+clean(p,m[1]));continue;}}
  if(!p.bare){out.push(ANCH+t);continue;}
  const s=clean(p,t);out.push(s?TEXT+s:ANCH+t);}
 return out.join('\n');}
function parseWith(p,buf){if(p.scan)return {lines:kit.decodeRuns(buf),anchors:[]};
 const g=kit.lineGrammar(rewrite(p,decode(p,buf)),{comment:/^\u0004/,blocks:[],anchor:/^\u0003/,name:/^\u0001(.*)$/s,strip:[/^\u0002/]});
 return {lines:g.lines.filter(s=>s&&!s.startsWith(ANCH)).map(s=>s.split(NL).join('\n')),anchors:g.anchors.map(a=>a.replace(/^\u0003/,''))};}
/* a buffer of no known profile: the profile whose grammar finds the most text and the fewest bare lines wins */
function sniff(buf){let best=null,score=0;const text=kit.decodeText(buf);
 for(const p of Object.values(PROFILES)){if(p.scan||!p.say.length)continue;let hits=0;for(const l of text.split(/\r?\n/,4000))if(p.say.some(r=>r.re.test(l.trim())))hits++;if(hits>score){score=hits;best=p;}}
 return best;}
function parse(buf,id){const p=PROFILES[id||owner.get(buf)]||sniff(buf);if(!p)return {lines:kit.decodeRuns(buf),anchors:[]};return parseWith(p,buf);}

/* the profile as an adapter-pack grammar (grammar:lines): what a pack can say of it (one text rule, no choice
   splitting), or null when the profile needs more than a pack grammar has */
function packGrammar(id){const p=typeof id==='object'?id:RAW.profiles.find(x=>x.id===id);if(!p||p.scan||p.detectOnly)return null;const say=p.say||[];
 if(say.length>1||say.some(s=>s.args||s.choices||s.follow||s.name||s.all||(s.text??1)!==1)||p.blocks?.length||p.ruby?.length||p.escapes||p.name||p.bare===false&&!say.length)return null;
 const g={mode:'lines',encoding:p.encoding||'auto'};if(p.comment)g.skip=p.comment;if(p.anchor)g.anchor=p.anchor;if(p.strip?.length)g.strip=p.strip;if(say.length)g.text=say[0].re;
 return g;}

const engine={id:'plaintext',hint:'纯文本脚本',
 scenes(dir){const p=profileOf(dir);if(!p||p.detectOnly)return [];try{return scenesOf(p,dir);}catch{return [];}},
 archives(dir){const p=profileOf(dir);if(p)try{return scenesOf(p,dir);}catch{return [];}
  /* a patch folder holds only the scripts: every profile that finds files of its own there */
  for(const q of Object.values(PROFILES)){if(q.scan||q.detectOnly)continue;let l=[];try{l=scenesOf(q,dir);}catch{}if(l.length)return l;}return [];},
 sources(dir){const p=profileOf(dir);return p?sourcesOf(p,dir):[];},
 parse:buf=>{try{return parse(Buffer.isBuffer(buf)?buf:Buffer.from(buf));}catch{return {lines:[],anchors:[]};}},
 test:n=>/\.(txt|scr|lvn|ks|sce|scn|lua)$/i.test(n)};
module.exports={suikaSeed,suikaXor,suikaList,PROFILES,RAW,compile,matches,profileOf,scenesOf,parse,parseWith,rewrite,packGrammar,tableList,engine};
