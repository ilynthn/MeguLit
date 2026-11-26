// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #1099 personal dictionaries. The player imports a Yomitan / Yomichan dictionary zip (term_bank_*.json) or a plain
   TSV / CSV table (word, reading, meaning); lookups ask them next to the built-in dictionary. Everything lives in the
   user's data folder (data/user-dictionaries: index.json with name / on-off / order, one <id>.json per dictionary with
   compact rows [term, reading, [definitions]]), never in the seed. A dictionary's rows are read on its first lookup and
   kept in memory; index.json is re-read when another process (bridge / reader) changed it. */
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');

const MAX_FILE=512*1024*1024,MAX_BANK=64*1024*1024,MAX_ROWS=600000,MAX_DEF=2000,MAX_NAME=60;
const folder=root=>path.join(root,'data','user-dictionaries');
const indexFile=root=>path.join(folder(root),'index.json');
const clean=(v,max=200)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const lines=(v,max=MAX_DEF)=>String(v??'').replace(/\r\n?/g,'\n').split('\n').map(s=>s.replace(/[ \t　]+/g,' ').trim()).filter(Boolean).join('\n').slice(0,max);
const toHiragana=s=>String(s||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const key=s=>String(s||'').normalize('NFKC').trim();

function atomicWrite(file,text){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,text);fs.renameSync(tmp,file);}

/* ---------- Yomitan structured content → plain text ---------- */
const BLOCK=new Set(['div','li','ol','ul','tr','table','details','summary','br','p']);
function flatten(node,out){
 if(node==null)return;
 if(typeof node==='string'){out.push(node);return;}
 if(Array.isArray(node)){for(const n of node)flatten(n,out);return;}
 if(typeof node!=='object')return;
 if(node.type==='image'||node.tag==='img'||node.tag==='rt'||node.tag==='rp')return;
 if(node.tag==='br'){out.push('\n');return;}
 const block=BLOCK.has(node.tag);if(block)out.push('\n');
 if(node.tag==='li')out.push('・');
 flatten(node.content,out);
 if(block)out.push('\n');
}
function glossText(item){
 if(typeof item==='string')return lines(item);
 if(Array.isArray(item))return lines(item.map(glossText).join('\n'));
 if(!item||typeof item!=='object')return '';
 if(item.type==='text')return lines(item.text);
 if(item.type==='structured-content'){const out=[];flatten(item.content,out);return lines(out.join(''));}
 if(item.type==='image')return '';
 return '';
}

/* ---------- parsers ---------- */
/* Yomitan term_bank_N.json row: [term, reading, definitionTags, rules, score, glossary[], sequence, termTags] (v3);
   v1 rows carry the glossary from index 5 as plain strings. */
function parseTermBank(json){
 const rows=[];if(!Array.isArray(json))throw Error('USER_DICT_BAD_FORMAT');
 for(const row of json){if(!Array.isArray(row))continue;const term=clean(row[0],100),reading=clean(row[1],100);if(!term)continue;
  const glossary=Array.isArray(row[5])?row[5]:row.slice(5).filter(x=>typeof x==='string');
  const defs=glossary.map(glossText).filter(Boolean);const tags=clean(row[2],60);
  if(!defs.length)continue;rows.push([term,reading&&reading!==term?reading:'',tags?[`［${tags}］`+defs[0],...defs.slice(1)]:defs]);}
 return rows;
}
function splitDelimited(text,sep){
 const out=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;continue;}
  if(c==='"'&&cell==='')quoted=true;
  else if(c===sep){row.push(cell);cell='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);out.push(row);row=[];cell='';}
  else cell+=c;}
 if(cell!==''||row.length){row.push(cell);out.push(row);}
 return out;
}
const HEADER=/^(word|term|expression|headword|spelling|词|單?词|単語|見出し|語|表記|词条|詞條)$/i;
/* Columns: word, reading, meaning (more columns are joined into the meaning). Two columns: word, meaning. A first row that
   names the columns is skipped. */
function parseTable(text,ext){
 const body=text.replace(/^﻿/,'');const sep=ext==='.csv'?',':ext==='.tsv'?'\t':body.split('\n',5).some(l=>l.includes('\t'))?'\t':',';
 const table=splitDelimited(body,sep).map(r=>r.map(c=>c.trim()));
 if(table.length&&HEADER.test(table[0][0]||''))table.shift();
 const rows=[];
 for(const r of table){if(!r[0]||r[0].startsWith('#'))continue;const term=clean(r[0],100);
  const [reading,defs]=r.length>=3?[clean(r[1],100),r.slice(2).filter(Boolean)]:['',r.slice(1).filter(Boolean)];
  const definition=defs.map(d=>lines(d.replace(/\\n|<br\s*\/?>/gi,'\n'))).filter(Boolean);
  if(term&&definition.length)rows.push([term,reading&&reading!==term?reading:'',definition]);}
 return rows;
}
/* Not UTF-8: Shift-JIS and GB18030 both decode most legacy tables without an error, so decoding is not identification.
   Japanese read as GB18030 turns its kana into rare ideographs (猫 ねこ → 擫 偹偙); Chinese read as Shift-JIS turns
   its lead bytes into half-width katakana. So Shift-JIS wins when it yields more full-width kana than GB18030 and
   more of them than half-width katakana; otherwise GB18030. */
const fullKana=s=>(s.match(/[ぁ-ゖァ-ヺー]/g)||[]).length,halfKana=s=>(s.match(/[ｦ-ﾟ]/g)||[]).length;
function decodeText(buffer){
 try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{}
 const tryDecode=enc=>{try{return new TextDecoder(enc,{fatal:true}).decode(buffer);}catch{return null;}};
 const gb=tryDecode('gb18030'),sj=tryDecode('shift_jis');
 if(gb!=null&&sj!=null)return fullKana(sj)>fullKana(gb)&&fullKana(sj)>halfKana(sj)?sj:gb;
 if(gb!=null)return gb;if(sj!=null)return sj;
 throw Error('USER_DICT_BAD_ENCODING');
}
async function readYomitan(file){
 const zip=require('../core/zip-extract.cjs');let list;try{list=await zip.entries(file,{maxIndex:32*1024*1024,maxEntries:20000});}catch{throw Error('USER_DICT_BAD_ZIP');}
 const byName=name=>list.find(e=>e.name.replace(/\\/g,'/').split('/').pop()===name);
 let meta={};const index=byName('index.json');
 if(index){try{meta=JSON.parse(decodeText(await zip.readMember(file,index,4*1024*1024)));}catch{meta={};}}
 const banks=list.filter(e=>/(^|\/)term_bank_\d+\.json$/i.test(e.name.replace(/\\/g,'/'))).sort((a,b)=>Number(a.name.match(/(\d+)\.json$/i)[1])-Number(b.name.match(/(\d+)\.json$/i)[1]));
 if(!banks.length)throw Error('USER_DICT_NO_TERMS');
 const rows=[];
 for(const bank of banks){let json;try{json=JSON.parse(decodeText(await zip.readMember(file,bank,MAX_BANK)));}catch(e){throw Error(e.message==='IMPORT_NPA_LIMIT'?'USER_DICT_TOO_LARGE':'USER_DICT_BAD_FORMAT');}
  for(const row of parseTermBank(json)){rows.push(row);if(rows.length>MAX_ROWS)throw Error('USER_DICT_TOO_LARGE');}}
 return {name:clean(meta.title,MAX_NAME),revision:clean(meta.revision,40),rows,format:'yomitan'};
}
async function readFile(file){
 const stat=await fsp.stat(file).catch(()=>null);if(!stat?.isFile())throw Error('USER_DICT_FILE_MISSING');if(stat.size>MAX_FILE)throw Error('USER_DICT_TOO_LARGE');
 const ext=path.extname(file).toLowerCase();
 if(ext==='.zip')return readYomitan(file);
 if(['.tsv','.csv','.txt'].includes(ext)){if(stat.size>MAX_BANK*2)throw Error('USER_DICT_TOO_LARGE');const rows=parseTable(decodeText(await fsp.readFile(file)),ext);if(rows.length>MAX_ROWS)throw Error('USER_DICT_TOO_LARGE');return {name:'',rows,format:ext.slice(1)};}
 if(ext==='.json'){const rows=parseTermBank(JSON.parse(decodeText(await fsp.readFile(file))));return {name:'',rows,format:'yomitan'};}
 throw Error('USER_DICT_UNSUPPORTED');
}

/* ---------- storage ---------- */
let state={root:'',mtime:-1,list:[]};const loaded=new Map();
function readIndex(root){
 const file=indexFile(root);let mtime=0;try{mtime=fs.statSync(file).mtimeMs;}catch{mtime=0;}
 if(state.root===root&&state.mtime===mtime)return state.list;
 let list=[];try{const v=JSON.parse(fs.readFileSync(file,'utf8'));if(Array.isArray(v?.dictionaries))list=v.dictionaries;}catch{}
 list=list.filter(d=>d&&/^[a-f0-9]{16}$/.test(d.id)).map(d=>({id:d.id,name:clean(d.name,MAX_NAME)||'未命名辞典',format:clean(d.format,20),enabled:d.enabled!==false,count:Number(d.count)||0,revision:clean(d.revision,40),importedAt:Number(d.importedAt)||0}));
 state={root,mtime,list};return list;
}
function writeIndex(root,list){atomicWrite(indexFile(root),JSON.stringify({version:1,dictionaries:list},null,1));state={root:'',mtime:-1,list:[]};}
const publicList=root=>readIndex(root).map((d,i)=>({...d,priority:i+1}));

async function importDictionary(root,file,options={}){
 if(typeof file!=='string'||!path.isAbsolute(file))throw Error('USER_DICT_FILE_MISSING');
 const data=await readFile(file);if(!data.rows.length)throw Error('USER_DICT_NO_TERMS');
 const id=crypto.randomBytes(8).toString('hex'),name=clean(options.name,MAX_NAME)||data.name||clean(path.basename(file,path.extname(file)),MAX_NAME)||'我的辞典';
 atomicWrite(path.join(folder(root),id+'.json'),JSON.stringify(data.rows));
 const list=readIndex(root).slice();list.push({id,name,format:data.format,enabled:true,count:data.rows.length,revision:data.revision||'',importedAt:Date.now()});writeIndex(root,list);
 return {id,name,count:data.rows.length,format:data.format,dictionaries:publicList(root)};
}
function update(root,id,change){const list=readIndex(root).slice(),i=list.findIndex(d=>d.id===id);if(i<0)throw Error('USER_DICT_NOT_FOUND');change(list,i);writeIndex(root,list);return publicList(root);}
const setEnabled=(root,id,enabled)=>update(root,id,(list,i)=>{list[i]={...list[i],enabled:enabled!==false};});
const rename=(root,id,name)=>update(root,id,(list,i)=>{const n=clean(name,MAX_NAME);if(!n)throw Error('USER_DICT_BAD_NAME');list[i]={...list[i],name:n};});
const move=(root,id,delta)=>update(root,id,(list,i)=>{const j=Math.max(0,Math.min(list.length-1,i+(Number(delta)<0?-1:1)));const [d]=list.splice(i,1);list.splice(j,0,d);});
function remove(root,id){const list=update(root,id,(list,i)=>{list.splice(i,1);});loaded.delete(path.join(folder(root),id+'.json'));try{fs.rmSync(path.join(folder(root),id+'.json'),{force:true});}catch{}return list;}

/* rows + two maps (written form, reading in hiragana) → row numbers */
function rowsOf(root,id){
 const file=path.join(folder(root),id+'.json');let mtime=0;try{mtime=fs.statSync(file).mtimeMs;}catch{return null;}
 const hit=loaded.get(file);if(hit&&hit.mtime===mtime)return hit;
 let rows=[];try{rows=JSON.parse(fs.readFileSync(file,'utf8'));}catch{rows=[];}
 const byTerm=new Map(),byReading=new Map(),add=(map,k,n)=>{if(!k)return;const a=map.get(k);if(a){if(a.length<30)a.push(n);}else map.set(k,[n]);};
 rows.forEach((r,n)=>{add(byTerm,key(r[0]),n);if(r[1])add(byReading,toHiragana(key(r[1])),n);});
 const value={mtime,rows,byTerm,byReading};loaded.set(file,value);while(loaded.size>12)loaded.delete(loaded.keys().next().value);return value;
}
/* Every enabled dictionary in the player's order: exact written forms first, then (for kana queries) readings. */
function lookup(root,words,options={}){
 const wanted=[...new Set((Array.isArray(words)?words:[words]).map(key).filter(w=>w&&[...w].length<=60))];if(!wanted.length||!root)return [];
 const perDict=options.perDict||4,limit=options.limit||12,out=[];
 for(const d of readIndex(root)){if(!d.enabled)continue;const data=rowsOf(root,d.id);if(!data)continue;const seen=new Set();
  const take=list=>{for(const n of list||[]){if(seen.has(n)||seen.size>=perDict)continue;seen.add(n);const [term,reading,defs]=data.rows[n]||[];if(term)out.push({dictionary:{id:d.id,name:d.name},term,reading:reading||'',definitions:Array.isArray(defs)?defs.slice(0,8):[]});}};
  for(const w of wanted)take(data.byTerm.get(w));
  for(const w of wanted)if(/^[぀-ヿー]+$/.test(w))take(data.byReading.get(toHiragana(w)));
  if(out.length>=limit)break;}
 return out.slice(0,limit);
}
/* The 学习 › 词典 result row shape (spelling / reading / definition) with the dictionary's name as its source. */
const rows=(root,words)=>lookup(root,words).map(h=>({spelling:h.term,reading:h.reading,pron:h.reading,definition:h.definitions.join('\n'),source:'user',dictionary:h.dictionary.name}));
function _reset(){state={root:'',mtime:-1,list:[]};loaded.clear();}

module.exports={importDictionary,list:publicList,setEnabled,rename,move,remove,lookup,rows,parseTermBank,parseTable,glossText,readFile,decodeText,_reset,folder};
