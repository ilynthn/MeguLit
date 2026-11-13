// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E596 runtime findings → adapter pack draft (tools/adapter-pack.cjs from-runtime). The maintainer gets a desensitized
   bundle; this turns a game's runtime findings into the pack that reads it offline: the recovered index as the source
   (container "index"), the verified key as the transform, the scripts' layout as the grammar guess. The draft is
   unsigned and marked x-origin "runtime"; the maintainer checks the grammar against the script samples, signs and
   publishes it. Nothing here touches a game.

   draft(findings,{id,version,minApp,grammar,title}) → {pack, notes:[...]} | {error} */
const KIND_SCRIPT=new Set(['t','d','u','8']);
const glob=name=>String(name||'').replace(/\\/g,'/').replace(/[^\x21-\x7e]/g,'?').replace(/[*]/g,'?').slice(0,120);
/* a transform for a key finding; null when the finding cannot be expressed in a pack */
function transformOf(k){
 if(k.algo==='blowfish')return k.form==='key'?{op:'blowfish',key:k.key}:k.state?{op:'blowfish',state:k.state}:null;
 if(k.algo==='camellia')return {op:'camellia',key:k.key};
 if(k.algo==='tea'||k.algo==='xtea')return {op:k.algo,key:k.key,rounds:k.rounds||32,words:k.words||'le'};
 if(k.algo==='xor'&&k.key)return {op:'xor',key:k.key};
 if(k.algo==='sub')return {op:'sub',value:k.value};
 if(k.algo==='xor-index')return {op:'xor-index',base:k.base,step:k.step};
 return null;}
/* the grammar the script layout suggests: strings after one opcode with a length prefix, or text lines */
function grammarOf(scripts){const s=(scripts||[]).find(x=>(x.opcodes||x.before)?.[0]?.share>=.4&&(x.lengthPrefix||x.terminator));
 const encoding=s?.encoding==='utf16le'?'utf-16le':s?.encoding==='utf8'?'utf-8':s?.encoding==='gbk'?'gbk':'shift_jis';
 if(s)return {mode:'strings',encoding,opcode:(s.opcodes||s.before)[0].byte,length:s.lengthPrefix||'zero'};
 return {mode:'lines',encoding:'auto',skip:'^[@;*#\\[]',strip:['\\[[^\\]]*\\]']};}
function draft(findings,{id,version=1,minApp='1.0.0',grammar=null,title=''}={}){
 if(!findings||findings.schema!=='megulit.runtime-findings')return {error:'NOT_RUNTIME_FINDINGS'};
 if(!/^[a-z0-9][a-z0-9-]{2,63}$/.test(String(id||'')))return {error:'ID'};
 const notes=[],ix=(findings.indexes||[]).slice().sort((a,b)=>b.count-a.count)[0];
 if(!ix)return {error:'NO_INDEX',notes:['no archive index was recovered; a key alone fits an existing reader as params, not a new source']};
 /* the key that opened the entries (index via), else the strongest verified one */
 const order=k=>(String(k.verified).includes('known-plaintext')?0:String(k.verified).includes('oracle')?1:2);
 const keys=(findings.keys||[]).filter(k=>transformOf(k)).sort((a,b)=>order(a)-order(b));
 const via=(ix.via||[]).find(v=>v!=='plain');const key=via?keys.find(k=>k.algo===via)||keys[0]:null;
 if(via&&!key)notes.push('entries open with '+via+' but no key of that kind survived the privacy gate');
 if(!via&&keys.length)notes.push('entries looked plain in memory; keys found: '+keys.map(k=>k.algo).join(', ')+' (not used)');
 if(key?.algo==='camellia'&&key.alternates?.length)notes.push('camellia: '+key.alternates.length+' alternate key(s) in the same schedule; check with a script sample');
 const sel=[];if(ix.kinds)for(let i=0;i<ix.kinds.length;i++)if(KIND_SCRIPT.has(ix.kinds[i]))sel.push(i);
 const select=sel.length&&sel.length<ix.count?(()=>{const b=Buffer.alloc(sel.length*4);sel.forEach((v,i)=>b.writeUInt32LE(v,i*4));return b.toString('base64');})():undefined;
 if(!ix.kinds)notes.push('entry kinds unknown: every entry is read; add a select list if the archive holds media');
 const archive=glob(ix.archive.name),magic=String(ix.archive.magic||'').match(/^(?:(?!3f)[0-9a-f]{2})*/)[0].slice(0,16);
 const g=grammar||grammarOf(findings.scripts);if(!grammar)notes.push('grammar is a guess from the script layout ('+g.mode+'); compare with the samples before signing');
 const t=key?transformOf(key):null;
 const pack={schema:'megulit.adapter-pack',format:1,id,version,minApp,
  title:title||('Runtime findings: '+(ix.archive.name||'archive')).slice(0,200),engine:'runtime',note:'built from runtime findings (index '+ix.count+' entries'+(key?', '+key.algo+' '+key.verified:'')+')',
  match:{files:[{path:archive,minSize:ix.archive.size,...(magic.length>=4?{magic:{offset:0,hex:magic}}:{})}]},
  source:{container:'index',archives:[archive],index:{size:ix.archive.size,count:ix.count,words:3,entries:ix.entries,...(select?{select}:{}),...(ix.fields?.unpacked?{trim:'unpacked'}:{})}},
  ...(t?{transforms:[t]}:{}),grammar:g,pairing:{by:'order',dropNames:true,minChars:1},'x-origin':'runtime'};
 pack.requires=require('./adapter-packs.cjs').needs(pack);
 const v=require('./adapter-packs.cjs').validate(pack);if(!v.ok)return {error:'INVALID:'+v.error,pack,notes};
 return {pack,notes};}
module.exports={draft,transformOf,grammarOf};
