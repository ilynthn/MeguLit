// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 「传火不能只靠 exe 哈希」) the fingerprints a game diff is matched by, from the most exact to the loosest:
     version layer (one exe build)   exe     SHA-256 of the whole program file
                                     head    SHA-256 of its first and last 64 KB + its size (a re-signed or patched build)
                                     pe      PE file/product version + link time stamp ('1.2.0.0@5f3a1b2c')
     game layer (every build)        pack    SHA-256 of the first and last 1 MB + size of the game's biggest archive
                                     script  a script fingerprint given by the caller (original-text provider), 64 hex
                                     steam   Steam app id
                                     vndb    VNDB id ('v1234')
                                     title   SHA-256 of the folded title (NFKC, lower case, no spaces or punctuation)
     engine                                  the engine id (the repository's engine diff; no shared document)
   prints(executable,{title,steamAppId,vndb,script,engine}) reads files synchronously (the probe worker, the diff maker);
   check(p) keeps only well-formed values: the relay (relay/src/auto-profile.js) and the app use the same rules. Nothing here is
   a path or a name: every print is a hash, an id or a version. */
const {LEVELS,VERSION_KINDS,GAME_KINDS,RULES,check}=require('./game-print-schema.cjs');
const fold=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s　・*＊\-_:：!！?？~〜「」『』【】()（）\[\]'"`.,、。]/g,'');
/* Node-only parts below: required lazily so the relay can import check/LEVELS without node:fs */
function sha(...bufs){const h=require('node:crypto').createHash('sha256');for(const b of bufs)h.update(b);return h.digest('hex');}
function titleHash(title){const t=fold(title);return t?sha(Buffer.from(t,'utf8')):'';}
function headTail(file,span){const fs=require('node:fs');const st=fs.statSync(file);const fd=fs.openSync(file,'r');try{const n=Math.min(span,st.size),a=Buffer.alloc(n),b=Buffer.alloc(n);fs.readSync(fd,a,0,n,0);fs.readSync(fd,b,0,n,Math.max(0,st.size-n));return sha(a,b,Buffer.from(String(st.size)));}finally{fs.closeSync(fd);}}
function exeHash(file){const fs=require('node:fs');const h=require('node:crypto').createHash('sha256');const fd=fs.openSync(file,'r'),buf=Buffer.alloc(4<<20);try{let at=0,n;while((n=fs.readSync(fd,buf,0,buf.length,at))>0){h.update(buf.subarray(0,n));at+=n;}}finally{fs.closeSync(fd);}return h.digest('hex');}
/* file version + PE link time stamp from the head of the file */
function peVersion(file){const fs=require('node:fs');let buf;try{const st=fs.statSync(file);const n=Math.min(st.size,32<<20);buf=Buffer.alloc(n);const fd=fs.openSync(file,'r');try{fs.readSync(fd,buf,0,n,0);}finally{fs.closeSync(fd);}}catch{return '';}
 if(buf.length<0x40||buf[0]!==0x4d||buf[1]!==0x5a)return '';const pe=buf.readUInt32LE(0x3c);if(pe+12>buf.length||buf.readUInt32LE(pe)!==0x4550)return '';const ts=buf.readUInt32LE(pe+8).toString(16).padStart(8,'0');
 const sig=buf.indexOf(Buffer.from([0xbd,0x04,0xef,0xfe]));const v=sig>=0&&sig+16<=buf.length?[buf.readUInt32LE(sig+8)>>>16,buf.readUInt32LE(sig+8)&0xffff,buf.readUInt32LE(sig+12)>>>16,buf.readUInt32LE(sig+12)&0xffff].join('.'):'0.0.0.0';return v+'@'+ts;}
const ARCHIVE=/\.(xp3|arc|pak|pck|npa|ypf|dat|int|bin|cpk|pac|nsa|sar|bsa|mpk|afs|gxp|ain)$/i;
/* the biggest archive next to the exe (one folder deep) */
function mainPack(dir){const fs=require('node:fs'),path=require('node:path');let best=null;const look=(d,depth)=>{let list=[];try{list=fs.readdirSync(d,{withFileTypes:true});}catch{return;}
 for(const e of list){const p=path.join(d,e.name);if(e.isDirectory()){if(depth<1)look(p,depth+1);continue;}if(!ARCHIVE.test(e.name))continue;let st;try{st=fs.statSync(p);}catch{continue;}if(st.size>=1<<20&&(!best||st.size>best.size))best={file:p,size:st.size};}};look(dir,0);return best?.file||'';}
function prints(executable,{title='',steamAppId='',vndb='',script='',engine='',exe=''}={}){const path=require('node:path'),fs=require('node:fs');const out={};
 try{out.exe=exe||exeHash(executable);}catch{}try{out.head=headTail(executable,64<<10);}catch{}const pv=peVersion(executable);if(pv)out.pe=pv;
 const dir=path.dirname(executable);const pack=mainPack(dir);if(pack)try{out.pack=headTail(pack,1<<20);}catch{}
 let steam=String(steamAppId||'');if(!steam)try{steam=fs.readFileSync(path.join(dir,'steam_appid.txt'),'utf8').trim();}catch{}
 Object.assign(out,{script,steam,vndb:String(vndb||'').toLowerCase(),title:titleHash(title),engine:String(engine||'').toLowerCase()});return check(out);}
/* 2026-11-27 MeguLit-Adapter (owner: 版本层要能扛住补丁和汉化): the content print of an engine's script sources, the files the script
   reader of services/original-engines names (sources()), each lower-case name | SHA-256 of its first and last 64 KB + size, sorted,
   with the reader id first. A no-DVD exe, an exe update or a renamed Chinese-patch exe leaves it as it was. '' when no reader names
   a file. readers: reader ids to try in order (the first that names files wins) */
function dataPrint(dir,readers){let scenes;try{scenes=require('../services/original-engines/scenes.cjs');}catch{return '';}const fs=require('node:fs'),path=require('node:path');
 for(const id of readers||[]){const e=scenes.ENGINES[id];if(!e||typeof e.sources!=='function')continue;let files=[];try{files=e.sources(dir)||[];}catch{continue;}
  files=files.filter(f=>{try{return fs.statSync(f).isFile();}catch{return false;}}).sort((a,b)=>path.basename(a).toLowerCase()<path.basename(b).toLowerCase()?-1:1);if(!files.length)continue;
  const parts=[];for(const f of files.slice(0,256)){try{parts.push(path.basename(f).toLowerCase()+'|'+headTail(f,64<<10));}catch{}}if(!parts.length)continue;return sha(Buffer.from(id+'\n'+parts.join('\n'),'utf8'));}
 return '';}
module.exports={LEVELS,VERSION_KINDS,GAME_KINDS,RULES,check,fold,titleHash,prints,peVersion,mainPack,dataPrint,headTail};
