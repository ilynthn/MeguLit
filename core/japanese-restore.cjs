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
 // Like the engine's own tables: one string per cell in row order (no shared offsets) and the
 // decoded table zero-padded to 32 bytes; a deduplicated pool crashed CLANNAD (0xC0000005).
 const head=Buffer.from(raw.subarray(0,table.text)),pool=[];let size=0;
 cells.forEach((row,r)=>row.forEach((v,c)=>{if(table.columns[c].type!==0x53)return;const b=Buffer.from(v+'\0','utf16le');head.writeUInt32LE(size,table.data+(r*table.cols+c)*4);pool.push(b);size+=b.length;}));
 const body=Buffer.concat([head,...pool]),out=Buffer.alloc(Math.ceil(body.length/32)*32);body.copy(out);out.writeUInt32LE(body.length,0);return out;
}

function languageColumns(table){ // per string column: share of non-empty cells holding kana / CJK
 return table.columns.map((c,i)=>{if(c.type!==0x53)return null;let filled=0,kana=0,han=0;for(const row of table.cells){const v=row[i];if(!v)continue;filled++;if(KANA.test(v))kana++;else if(HAN_ONLY_CN.test(v))han++;}return {index:i,filled,kana:filled?kana/filled:0,han:filled?han/filled:0};}).filter(Boolean);
}
// A target must read as a translation of the Japanese column: filled on most rows where Japanese is filled, not
// identifiers or file names (letters/digits without spaces), and with no kana of its own (a reading column is not one).
// E373 (Summer Pockets chara_name/namae_all, 2026-11-13): a one-word English name (Shiroha, Umi) is a translation,
// not an identifier; only a token with a digit or a path/key character (BGM01, bg_01.png, a:b) counts as one.
const IDENT=/^[A-Za-z0-9_.\\/:#@-]*$/,IDENT_MARK=/[0-9_.\\/:#@]/;
const isIdent=v=>IDENT.test(v)&&IDENT_MARK.test(v);
function translationColumns(table,langs,jp){
 const rowsJp=table.cells.filter(r=>r[jp]);if(!rowsJp.length)return [];
 return langs.filter(c=>{if(c.index===jp||!c.filled||c.kana>.1)return false;
  let paired=0,ident=0,distinct=new Set();for(const r of rowsJp){const v=r[c.index];if(!v)continue;paired++;distinct.add(v);if(isIdent(v))ident++;}
  return paired/rowsJp.length>=.6&&ident/Math.max(1,paired)<.3&&distinct.size>=Math.min(5,rowsJp.length*.5);});
}
// E373: name tables key a speaker as 「うみ／うみ４歳」 (shown name／variant note) and the translations hold the shown
// name only. When the translated cell has no slash of its own, only the part before 「／」 is what the game shows.
function shownJapanese(jp,old){const i=jp.indexOf('／');return i>0&&!/[\/／]/.test(String(old||''))?jp.slice(0,i):jp;}
function datDir(gameDir){const d=path.join(gameDir,'dat');return fs.existsSync(d)&&fs.readdirSync(d).some(f=>/\.dbs$/i.test(f))?d:'';}

function siglusPlan(gameDir){
 const dir=datDir(gameDir);if(!dir)return null;
 const files=fs.readdirSync(dir).filter(f=>/\.dbs$/i.test(f)),changes=[];let japanese=null,targets=new Set(),cells=0,japaneseTables=0;
 for(const name of files){
  const twin=name.match(/^(.*)_(en|eng|zh|cn|ch|chs|cht|sc|tc|tw|ko|kr|ru)\.dbs$/i); /* E373: Summer Pockets ships sfight_*_ch.dbs */
  let file,decoded,table;try{file=fs.readFileSync(path.join(dir,name));decoded=decrypt(file);table=parse(decoded.raw,decoded.marker);}catch{continue;}
  if(twin){const base=files.find(f=>f.toLowerCase()===(twin[1]+'.dbs').toLowerCase());if(!base)continue;
   try{const b=decrypt(fs.readFileSync(path.join(dir,base))),bt=parse(b.raw,b.marker);if(bt.rows!==table.rows||bt.cols!==table.cols)continue;
    if(!languageColumns(bt).some(c=>c.kana>.3))continue;
    const next=table.cells.map((row,r)=>row.map((v,c)=>table.columns[c].type===0x53&&bt.cells[r][c]?bt.cells[r][c]:v));
    let n=0;next.forEach((row,r)=>row.forEach((v,c)=>{if(v!==table.cells[r][c])n++;}));if(n)changes.push({name,file,decoded,table,next,changed:n,kind:'twin',from:base});cells+=n;}catch{}continue;}
  /* E373: a table with locale twins (X_en.dbs, X_ch.dbs) is the Japanese base itself, never a multi-language table */
  {const stem=name.replace(/\.dbs$/i,'').toLowerCase();if(files.some(f=>f.toLowerCase().startsWith(stem+'_')&&/^(.*)_(en|eng|zh|cn|ch|chs|cht|sc|tc|tw|ko|kr|ru)\.dbs$/i.test(f)))continue;}
  const langs=languageColumns(table),jp=langs.filter(c=>c.filled).sort((a,b)=>b.kana-a.kana)[0];
  if(jp&&jp.kana>=.3)japaneseTables++;
  if(!jp||jp.kana<.3||langs.filter(c=>c.filled).length<2)continue;
  if(japanese==null)japanese=jp.index;
  const tgt=translationColumns(table,langs,jp.index);tgt.forEach(c=>targets.add(c.index));
  const next=table.cells.map(row=>row.map((v,c)=>tgt.some(t=>t.index===c)&&row[jp.index]?shownJapanese(row[jp.index],v):v));
  let n=0;next.forEach((row,r)=>row.forEach((v,c)=>{if(v!==table.cells[r][c])n++;}));
  if(n)changes.push({name,file,decoded,table,next,changed:n,kind:'column',from:jp.index,to:tgt.map(t=>t.index)});cells+=n;
 }
 return {adapter:'siglus-dbs',dir,japaneseColumn:japanese,targetColumns:[...targets],changes,cells,japaneseTables};
}

/* E326 YU-RIS (user 2026-11-10, 女装山脈 with the 1.1 Chinese patch had no Japanese): the Japanese scripts stay in
   ysbin.ypf; a Chinese patch adds update*.ypf next to the exe, which the engine loads over ysbin. Restoring moves the
   script-carrying update archives into the backup folder; undo moves them back. Only when the folder shows a Chinese
   patch (an exe or folder named cn/chs/汉化/中文), so an official update archive is never touched. */
function yurisPlan(gameDir){
 const names=fs.readdirSync(gameDir),ysbin=[path.join(gameDir,'ysbin.ypf'),path.join(gameDir,'pac','ysbin.ypf')].find(f=>fs.existsSync(f));if(!ysbin)return null;
 const chinese=names.some(n=>/(cn\d|chs|汉化|中文|簡體|简体)/i.test(n));
 const updates=names.filter(n=>/^update\d*\.ypf$/i.test(n)).filter(n=>{try{const fd=fs.openSync(path.join(gameDir,n),'r'),b=Buffer.alloc(Math.min(fs.fstatSync(fd).size,1<<20));fs.readSync(fd,b,0,b.length,0);fs.closeSync(fd);return b.slice(0,3).toString('latin1')==='YPF'&&(b.includes(Buffer.from('ysbin\\','latin1'))||b.includes(Buffer.from('ysbin\\','latin1').map(x=>x^0xFF)));}catch{return false;}});
 return {adapter:'yuris-update',ysbin,chinese,updates:chinese?updates:[]};
}
function yurisApply(gameDir,plan){
 const backup=path.join(gameDir,BACKUP_DIR,'yuris');fs.mkdirSync(backup,{recursive:true});const files=[];
 for(const n of plan.updates){const from=path.join(gameDir,n),buf=fs.readFileSync(from);fs.renameSync(from,path.join(backup,n));files.push({file:n,originalSha256:sha(buf),kind:'moved'});}
 writeAtomic(manifestPath(gameDir),Buffer.from(JSON.stringify({version:1,adapter:'yuris-update',at:new Date().toISOString(),files},null,1)));
 return {applied:files.length,cells:0};
}
function yurisRestore(gameDir,manifest){
 const backup=path.join(gameDir,BACKUP_DIR,'yuris'),skipped=[];let restored=0;
 for(const e of manifest.files){const keep=path.join(backup,e.file),target=path.join(gameDir,e.file);
  if(!fs.existsSync(keep)||fs.existsSync(target)){skipped.push(e.file);continue;}fs.renameSync(keep,target);restored++;}
 if(!skipped.length)fs.rmSync(path.join(gameDir,BACKUP_DIR),{recursive:true,force:true});
 return {restored,skipped};
}

function manifestPath(gameDir){return path.join(gameDir,BACKUP_DIR,'manifest.json');}
function readManifest(gameDir){try{return JSON.parse(fs.readFileSync(manifestPath(gameDir),'utf8'));}catch{return null;}}

function detect(gameDir){
 gameDir=path.resolve(String(gameDir||''));if(!fs.existsSync(gameDir))return {state:'missing'};
 const manifest=readManifest(gameDir);
 if(manifest?.adapter==='yuris-update')return {state:'applied',adapter:'yuris-update',files:manifest.files.length,cells:0,pending:0,manifest:{at:manifest.at,files:manifest.files.length}};
 const yuris=yurisPlan(gameDir);if(yuris&&yuris.updates.length)return {state:'restorable',adapter:'yuris-update',files:yuris.updates.length,cells:0,pending:yuris.updates.length,manifest:null};
 const siglus=siglusPlan(gameDir);
 /* E373: a third-party Japanese patch (a JapanesePatch folder with its own backups) may already have rewritten some
    tables; MeguLit then backs up those patched files, so undo returns to that patch, not to the Steam original. */
 const externalPatch=['JapanesePatch'].find(n=>fs.existsSync(path.join(gameDir,n,'backup')))||'';
 if(siglus&&(siglus.changes.length||manifest))return {state:manifest?'applied':'restorable',adapter:'siglus-dbs',externalPatch,files:siglus.changes.length,cells:siglus.cells,japaneseColumn:siglus.japaneseColumn,targetColumns:siglus.targetColumns,pending:siglus.changes.length,manifest:manifest&&{at:manifest.at,files:manifest.files.length}};
 /* E294 (user report 2026-11-10: a friend's Steam CLANNAD stayed Chinese after the restore): the Steam release's tables hold
    English and Chinese only; the Japanese text comes from a separate Japanese patch. No Japanese column anywhere means
    there is nothing to restore, not "already Japanese". */
 if(siglus&&!siglus.japaneseTables)return {state:'none',adapter:'siglus-dbs',reason:'NO_JAPANESE_TEXT'};
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
 /* both checks failed: writing over files the game may hold open is not safe, so say so instead of "not running" */
 throw Error('PROCESS_QUERY_FAILED');
}
function writeAtomic(file,data){const tmp=file+'.megulit-tmp';fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);}

function apply(gameDir){
 gameDir=path.resolve(String(gameDir||''));if(gameRunning(gameDir))throw Error('GAME_RUNNING');
 {const y=readManifest(gameDir)?null:yurisPlan(gameDir);if(y&&y.updates.length)return yurisApply(gameDir,y);}
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
 const manifest=readManifest(gameDir);if(!manifest)throw Error('NOT_APPLIED');if(manifest.adapter==='yuris-update')return yurisRestore(gameDir,manifest);
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

// Files written by versions before 1.2.2 shared one string between equal cells, which Siglus cannot read: CLANNAD and
// Summer Pockets crashed on start (0xC0000005, user 2026-11-09). Before a launch, a table MeguLit itself wrote that
// still has shared strings is rewritten: restore the kept original, then apply again with the current writer.
function sharedPool(file){const {marker,raw}=decrypt(fs.readFileSync(file)),t=parse(raw,marker),offs=[];for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++)if(t.columns[c].type===0x53)offs.push(raw.readUInt32LE(t.data+(r*t.cols+c)*4));return new Set(offs).size<offs.length;}
function repairShared(gameDir){
 gameDir=path.resolve(String(gameDir||''));const manifest=readManifest(gameDir);if(!manifest||manifest.adapter!=='siglus-dbs')return {repaired:false};
 const dat=path.join(gameDir,'dat'),ours=manifest.files.find(e=>{try{return sha(fs.readFileSync(path.join(dat,e.file)))===e.patchedSha256;}catch{return false;}});
 if(!ours||!sharedPool(path.join(dat,ours.file)))return {repaired:false};
 const undone=restore(gameDir);if(undone.skipped.length)return {repaired:false,skipped:undone.skipped};
 const done=apply(gameDir);return {repaired:true,applied:done.applied};
}
module.exports={repairShared,detect,apply,restore,_internal:{siglusPlan,shownJapanese,isIdent,yurisPlan,gameRunning,decrypt,encrypt,parse,rebuild,lzss,literal,languageColumns}};
