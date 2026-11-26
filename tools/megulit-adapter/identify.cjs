// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter, who the game is: VNDB work id + release (HANDOFF.md rule 9), never the exe hash alone.
   identify({gameDir, exe, engine, title, vndb, release, chineseBuild}) -> {
     title, engine, vndb ('v123' | ''), release ('' when nobody said), releaseGuess ('Steam 版' / '汉化版' / ''),
     prints {exe, head, pe, pack, data}   exe/head/pe: core/game-print.cjs; pack: the biggest archive's first/last MiB;
                                          data: the engine's script sources (RRFZ reader sources(), each name|size|first+last 64 KiB),
                                          so a no-DVD exe, an exe update or a renamed Chinese-patch exe still finds its build
     seed {key, status, matched} | null    the repository seed core/profiles already matches
     adapted [{game, vndb, release, engine, status, who, ref}]   rows of HANDOFF.md 「已适配的游戏」 with this VNDB id }
   Reads files only; the HANDOFF table comes from origin/main when git has it (the table everyone writes to), else the checkout. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const REPO=path.join(__dirname,'..','..');
const VNDB=/^v[1-9]\d{0,7}$/;
function handoffText(repo=REPO){const r=spawnSync('git',['-C',repo,'show','origin/main:HANDOFF.md'],{encoding:'utf8',windowsHide:true,timeout:15000});
 if(r.status===0&&r.stdout)return r.stdout;try{return fs.readFileSync(path.join(repo,'HANDOFF.md'),'utf8');}catch{return '';}}
/* the rows of 「已适配的游戏」: | 游戏 | VNDB | 发行版 | 引擎 | 状态 | 谁 | PR / seed | */
function adaptedRows(text){const out=[];let on=false;for(const line of String(text).split(/\r?\n/)){
  if(/^##\s/.test(line)){on=/已适配的游戏/.test(line);continue;}if(!on||!/^\|/.test(line))continue;
  const c=line.split('|').slice(1,-1).map(s=>s.trim());if(c.length<7||c[0]==='游戏'||/^-+$/.test(c[0]))continue;
  out.push({game:c[0],vndb:c[1].toLowerCase(),release:c[2],engine:c[3],status:c[4],who:c[5],ref:c[6]});}
 return out;}
const foldRelease=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s（）()]/g,'').replace(/待核实|待补/g,'');
/* the rows that mean "this build is done already": same VNDB id and the same release (an unknown release on either side only warns) */
function sameRelease(rows,vndb,release){const v=String(vndb||'').toLowerCase();return rows.filter(r=>r.vndb===v).map(r=>({...r,same:!!release&&!!foldRelease(r.release)&&foldRelease(r.release)===foldRelease(release)}));}
function sha(...b){const h=crypto.createHash('sha256');for(const x of b)h.update(x);return h.digest('hex');}
function headTail(file,span){const st=fs.statSync(file),fd=fs.openSync(file,'r');try{const n=Math.min(span,st.size),a=Buffer.alloc(n),b=Buffer.alloc(n);fs.readSync(fd,a,0,n,0);fs.readSync(fd,b,0,n,Math.max(0,st.size-n));return sha(a,b,Buffer.from(String(st.size)));}finally{fs.closeSync(fd);}}
/* the content print of the engine's script sources (RRFZ's readers know which files they are); '' when no reader names any */
function dataPrint(gameDir,readers){let scenes;try{scenes=require('../../services/original-engines/scenes.cjs');}catch{return '';}
 for(const id of readers||[]){const e=scenes.ENGINES[id];if(!e?.sources)continue;let files=[];try{files=e.sources(gameDir)||[];}catch{continue;}
  files=files.filter(f=>{try{return fs.statSync(f).isFile();}catch{return false;}}).sort((a,b)=>path.basename(a).localeCompare(path.basename(b)));if(!files.length)continue;
  const parts=files.slice(0,256).map(f=>path.basename(f).toLowerCase()+'|'+headTail(f,64<<10));return sha(id+'\n'+parts.join('\n'));}
 return '';}
function steamOf(gameDir){try{return fs.readFileSync(path.join(gameDir,'steam_appid.txt'),'utf8').trim();}catch{return '';}}
function identify({gameDir,exe,engine='',title='',vndb='',release='',chineseBuild=false,readers=[]}={},{handoff=handoffText}={}){
 const GP=require('../../core/game-print.cjs');let prints={};try{prints=GP.prints(exe,{title,engine});}catch{}
 const out={title,engine,vndb:VNDB.test(String(vndb).toLowerCase())?String(vndb).toLowerCase():'',release:String(release||'').trim(),releaseGuess:'',prints:{exe:prints.exe||'',head:prints.head||'',pe:prints.pe||'',pack:prints.pack||'',data:dataPrint(gameDir,readers)},seed:null,adapted:[]};
 const steam=steamOf(gameDir);out.releaseGuess=chineseBuild?'汉化版':steam?'Steam 版':'';
 try{const P=require('../../core/profiles/index.cjs');const p=P.profileFor({engine,exe,title,folder:gameDir,exeSha256:out.prints.exe||undefined,steamAppId:steam||undefined,prints:{pack:out.prints.pack,title:prints.title}});
  if(p.seedStatus)out.seed={key:p.gameKey,status:p.seedStatus,matched:p.matched};
  if(!out.vndb&&p.seedStatus){const g=require('../../core/profiles/seed.cjs').seeds().games.find(x=>x.key===p.gameKey);const v=g?.prints?.vndb||g?.ext?.adapter?.vndb;if(VNDB.test(String(v||'')))out.vndb=v;}}catch{}
 const rows=adaptedRows(handoff());
 if(!out.vndb&&title){const t=GP.fold(title);const hit=rows.filter(r=>GP.fold(r.game)===t);if(hit.length===1&&VNDB.test(hit[0].vndb))out.vndb=hit[0].vndb;}
 if(out.vndb)out.adapted=sameRelease(rows,out.vndb,out.release||out.releaseGuess);
 return out;}
module.exports={identify,adaptedRows,sameRelease,dataPrint,handoffText,VNDB};
