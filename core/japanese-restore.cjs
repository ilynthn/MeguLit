// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E237 Japanese restore: a game that ships its Japanese text can be switched back to it, per engine adapter.
// Only an explicit user action from the Tools page writes game files; every write keeps a backup and a manifest
// (original and patched SHA-256), and restore only puts back files that still hold our patched bytes.
// Adapters:
//   siglus-dbs  Siglus multi-language tables (dat/*.dbs, one string column per language). The Japanese column is
//               copied into every other filled language column; X_xx.dbs locale twins take the base table's strings.
// detect() also reports locale file sets (Scene*.pck / Gameexe*.dat, *_jp archives) that other adapters will use.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

const DBS_KEY=Buffer.from([0x2D,0x62,0xF4,0x89]);
const D3_KEYS=[Buffer.from([0x0E,0xC7,0x90,0x71]),Buffer.from([0x35,0xF1,0x9B,0x49])];
// Which of the two keys each 4-byte group uses; an 80-step cycle from the engine's table cipher.
const D3_ROUTE=[0,1,1,0,0,0,1,1,0,0,0,1,1,0,0,0,1,1,0,0,1,1,1,0,0,1,1,1,0,0,1,1,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,1,1,0,1,1,1,1,0,1,1,1,1,0,1,1,1,1,1,1,0,0,1,1,1,0,0,1,1,1,0,0,1];
const BACKUP_DIR='.megulit-japanese',KANA=/[぀-ヿ]/,HAN_ONLY_CN=/[一-鿿]/;

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function xorKey(buf,offset){const out=Buffer.alloc(buf.length-offset);for(let i=0;i<out.length;i++)out[i]=buf[i+offset]^DBS_KEY[i%4];return out;}
function route(data){const out=Buffer.alloc(data.length);for(let i=0;i<data.length;i++)out[i]=data[i]^D3_KEYS[D3_ROUTE[(i>>2)%D3_ROUTE.length]][i%4];return out;}
function lzss(src){
 const end=src.readUInt32LE(0),size=src.readUInt32LE(4);if(end<8||end>src.length||size<=0)throw Error('DBS_COMPRESSION');
 const out=Buffer.alloc(size);let o=0,s=8;
 while(o<size){if(s>=end)throw Error('DBS_TRUNCATED');const flags=src[s++];
  for(let bit=0;bit<8&&o<size;bit++){
   if(flags&(1<<bit))out[o++]=src[s++];
   else{const v=src[s]|(src[s+1]<<8);s+=2;const len=(v&15)+2,dist=v>>4;if(!dist||dist>o)throw Error('DBS_LZ');for(let k=0;k<len&&o<size;k++){out[o]=out[o-dist];o++;}}}}
 return out;}
function literal(data){ // stored as literal runs; the engine reads it with the same decoder
 const flagBytes=Math.ceil(data.length/8),out=Buffer.alloc(8+data.length+flagBytes);out.writeUInt32LE(out.length,0);out.writeUInt32LE(data.length,4);
 let s=0,d=8;while(s<data.length){const n=Math.min(8,data.length-s);out[d++]=(1<<n)-1;data.copy(out,d,s,s+n);s+=n;d+=n;}return out;}
function decrypt(file){if(file.length<12)throw Error('DBS_SHORT');return {marker:file.readUInt32LE(0),raw:route(lzss(xorKey(file,4)))};}
function encrypt(marker,raw){const packed=literal(route(raw)),out=Buffer.alloc(packed.length+4);out.writeUInt32LE(marker,0);for(let i=0;i<packed.length;i++)out[i+4]=packed[i]^DBS_KEY[i%4];return out;}

function parse(raw,marker){
 const u=o=>raw.readUInt32LE(o),[size,rows,cols,,fmt,data,text]=[0,4,8,12,16,20,24].map(u);
 if(text<28||text>size||size>raw.length||data+rows*cols*4>text)throw Error('DBS_LAYOUT');
 const columns=[...Array(cols)].map((_,i)=>({id:u(fmt+i*8),type:u(fmt+i*8+4)})),unicode=marker!==0;
 const str=off=>{let s=text+off,e=s;if(unicode){while(e+1<raw.length&&!(raw[e]===0&&raw[e+1]===0))e+=2;return raw.subarray(s,e).toString('utf16le');}while(e<raw.length&&raw[e])e++;return new TextDecoder('shift_jis').decode(raw.subarray(s,e));};
 const cells=[...Array(rows)].map((_,r)=>columns.map((c,ci)=>{const v=u(data+(r*cols+ci)*4);return c.type===0x53?str(v):v;}));
 return {rows,cols,columns,cells,data,text,unicode};
}
function rebuild(raw,marker,table,cells){ // keep the header, index and column table; rewrite the string pool
 if(!table.unicode)throw Error('DBS_NOT_UNICODE');
 const head=Buffer.from(raw.subarray(0,table.text)),pool=[],offsets=new Map();let size=0;
 const put=s=>{if(offsets.has(s))return offsets.get(s);const b=Buffer.from(s+'\0','utf16le');offsets.set(s,size);pool.push(b);size+=b.length;return offsets.get(s);};
 cells.forEach((row,r)=>row.forEach((v,c)=>{if(table.columns[c].type===0x53)head.writeUInt32LE(put(v),table.data+(r*table.cols+c)*4);}));
 const out=Buffer.concat([head,...pool]);out.writeUInt32LE(out.length,0);return out;
}

function languageColumns(table){ // per string column: share of non-empty cells holding kana / CJK
 return table.columns.map((c,i)=>{if(c.type!==0x53)return null;let filled=0,kana=0,han=0;for(const row of table.cells){const v=row[i];if(!v)continue;filled++;if(KANA.test(v))kana++;else if(HAN_ONLY_CN.test(v))han++;}return {index:i,filled,kana:filled?kana/filled:0,han:filled?han/filled:0};}).filter(Boolean);
}
// A target must read as a translation of the Japanese column: filled on most rows where Japanese is filled, not
// identifiers or file names (letters/digits without spaces), and with no kana of its own (a reading column is not one).
const IDENT=/^[A-Za-z0-9_.\\/:#@-]*$/;
function translationColumns(table,langs,jp){
 const rowsJp=table.cells.filter(r=>r[jp]);if(!rowsJp.length)return [];
 return langs.filter(c=>{if(c.index===jp||!c.filled||c.kana>.1)return false;
  let paired=0,ident=0,distinct=new Set();for(const r of rowsJp){const v=r[c.index];if(!v)continue;paired++;distinct.add(v);if(IDENT.test(v))ident++;}
  return paired/rowsJp.length>=.6&&ident/Math.max(1,paired)<.3&&distinct.size>=Math.min(5,rowsJp.length*.5);});
}
function datDir(gameDir){const d=path.join(gameDir,'dat');return fs.existsSync(d)&&fs.readdirSync(d).some(f=>/\.dbs$/i.test(f))?d:'';}

function siglusPlan(gameDir){
 const dir=datDir(gameDir);if(!dir)return null;
 const files=fs.readdirSync(dir).filter(f=>/\.dbs$/i.test(f)),changes=[];let japanese=null,targets=new Set(),cells=0;
 for(const name of files){
  const twin=name.match(/^(.*)_(en|zh|cn|tw|ko|ru)\.dbs$/i);
  let file,decoded,table;try{file=fs.readFileSync(path.join(dir,name));decoded=decrypt(file);table=parse(decoded.raw,decoded.marker);}catch{continue;}
  if(twin){const base=files.find(f=>f.toLowerCase()===(twin[1]+'.dbs').toLowerCase());if(!base)continue;
   try{const b=decrypt(fs.readFileSync(path.join(dir,base))),bt=parse(b.raw,b.marker);if(bt.rows!==table.rows||bt.cols!==table.cols)continue;
    if(!languageColumns(bt).some(c=>c.kana>.3))continue;
    const next=table.cells.map((row,r)=>row.map((v,c)=>table.columns[c].type===0x53&&bt.cells[r][c]?bt.cells[r][c]:v));
    let n=0;next.forEach((row,r)=>row.forEach((v,c)=>{if(v!==table.cells[r][c])n++;}));if(n)changes.push({name,file,decoded,table,next,changed:n,kind:'twin',from:base});cells+=n;}catch{}continue;}
  const langs=languageColumns(table),jp=langs.filter(c=>c.filled).sort((a,b)=>b.kana-a.kana)[0];
  if(!jp||jp.kana<.3||langs.filter(c=>c.filled).length<2)continue;
  if(japanese==null)japanese=jp.index;
  const tgt=translationColumns(table,langs,jp.index);tgt.forEach(c=>targets.add(c.index));
  const next=table.cells.map(row=>row.map((v,c)=>tgt.some(t=>t.index===c)&&row[jp.index]?row[jp.index]:v));
  let n=0;next.forEach((row,r)=>row.forEach((v,c)=>{if(v!==table.cells[r][c])n++;}));
  if(n)changes.push({name,file,decoded,table,next,changed:n,kind:'column',from:jp.index,to:tgt.map(t=>t.index)});cells+=n;
 }
 return {adapter:'siglus-dbs',dir,japaneseColumn:japanese,targetColumns:[...targets],changes,cells};
}

function manifestPath(gameDir){return path.join(gameDir,BACKUP_DIR,'manifest.json');}
function readManifest(gameDir){try{return JSON.parse(fs.readFileSync(manifestPath(gameDir),'utf8'));}catch{return null;}}

function detect(gameDir){
 gameDir=path.resolve(String(gameDir||''));if(!fs.existsSync(gameDir))return {state:'missing'};
 const manifest=readManifest(gameDir),siglus=siglusPlan(gameDir);
 if(siglus&&(siglus.changes.length||manifest))return {state:manifest?'applied':'restorable',adapter:'siglus-dbs',files:siglus.changes.length,cells:siglus.cells,japaneseColumn:siglus.japaneseColumn,targetColumns:siglus.targetColumns,pending:siglus.changes.length,manifest:manifest&&{at:manifest.at,files:manifest.files.length}};
 if(siglus)return {state:'already',adapter:'siglus-dbs'};
 const names=fs.readdirSync(gameDir);
 const localeSets=names.filter(n=>/^(scene|gameexe)(jp|ja|en|zh|cn|tw)?\.(pck|dat)$/i.test(n)||/_(jp|ja)\.(xp3|pck|arc|dat)$/i.test(n));
 if(localeSets.length)return {state:'unsupported',reason:'LOCALE_FILE_SET',files:localeSets};
 return {state:'none'};
}

function gameRunning(gameDir){
 // PowerShell prints in the console code page unless told otherwise; Japanese and Chinese paths must come back as UTF-8.
 // A cold PowerShell start can take well over 15 s on a busy machine; a timeout used to read as "not running",
 // so the check now waits longer and asks a second time before giving up.
 const dir=path.resolve(gameDir).toLowerCase()+path.sep;
 for(let attempt=0;attempt<2;attempt++){
  try{const out=require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-Command',"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Process | Where-Object { $_.Path } | ForEach-Object { $_.Path }"],{encoding:'utf8',windowsHide:true,timeout:40000});
   return out.replace(/^﻿/,'').split(/\r?\n/).some(p=>p.toLowerCase().startsWith(dir));}catch{}
 }
 return false;
}
function writeAtomic(file,data){const tmp=file+'.megulit-tmp';fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);}

function apply(gameDir){
 gameDir=path.resolve(String(gameDir||''));if(gameRunning(gameDir))throw Error('GAME_RUNNING');
 const plan=siglusPlan(gameDir);if(!plan||!plan.changes.length)throw Error('NOTHING_TO_RESTORE');
 const backup=path.join(gameDir,BACKUP_DIR,'dat');fs.mkdirSync(backup,{recursive:true});
 const prior=readManifest(gameDir),entries=prior?prior.files:[],built=[];
 for(const c of plan.changes){ // build and verify every file before any write
  const raw=rebuild(c.decoded.raw,c.decoded.marker,c.table,c.next),enc=encrypt(c.decoded.marker,raw),back=decrypt(enc),check=parse(back.raw,back.marker);
  if(back.marker!==c.decoded.marker||!back.raw.equals(raw)||check.rows!==c.table.rows||check.cols!==c.table.cols)throw Error('ROUNDTRIP_FAILED '+c.name);
  built.push({c,enc});}
 for(const {c,enc} of built){
  const keep=path.join(backup,c.name),old=entries.find(e=>e.file===c.name);
  if(!old&&!fs.existsSync(keep))fs.writeFileSync(keep,c.file);
  writeAtomic(path.join(plan.dir,c.name),enc);
  const entry={file:c.name,originalSha256:old?old.originalSha256:sha(c.file),patchedSha256:sha(enc),kind:c.kind,changed:c.changed};
  if(old)Object.assign(old,entry);else entries.push(entry);}
 const manifest={version:1,adapter:'siglus-dbs',at:new Date().toISOString(),japaneseColumn:plan.japaneseColumn,targetColumns:plan.targetColumns,files:entries};
 writeAtomic(manifestPath(gameDir),Buffer.from(JSON.stringify(manifest,null,1)));
 return {applied:built.length,cells:plan.cells};
}

function restore(gameDir){
 gameDir=path.resolve(String(gameDir||''));if(gameRunning(gameDir))throw Error('GAME_RUNNING');
 const manifest=readManifest(gameDir);if(!manifest)throw Error('NOT_APPLIED');
 const dat=path.join(gameDir,'dat'),backup=path.join(gameDir,BACKUP_DIR,'dat'),skipped=[];let restored=0;
 for(const e of manifest.files){const target=path.join(dat,e.file),keep=path.join(backup,e.file);
  if(!fs.existsSync(keep)){skipped.push(e.file);continue;}
  const now=fs.existsSync(target)?sha(fs.readFileSync(target)):'';
  if(now===e.originalSha256){restored++;continue;}
  if(now!==e.patchedSha256){skipped.push(e.file);continue;} // changed by a game update or another tool: leave it
  writeAtomic(target,fs.readFileSync(keep));restored++;}
 if(!skipped.length)fs.rmSync(path.join(gameDir,BACKUP_DIR),{recursive:true,force:true});
 return {restored,skipped};
}

module.exports={detect,apply,restore,_internal:{decrypt,encrypt,parse,rebuild,lzss,literal,languageColumns}};
