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
/* 2026-11-27 VNDB (services/game-enrichment.cjs vndbReleases, the one owner of VNDB queries): the work id, its releases, the release
   this copy most likely is, the Chinese title and the engine VNDB records. Only an unambiguous answer is taken; otherwise the
   candidates go into the question. vndb({title, gameDir, vnid, chineseBuild, engine}, {lookup}) -> {vndb, how, cn, release, releaseHow,
   candidates:[label], releases, vndbEngine, engineDiffers, error} */
const RELEASE_LABEL=[[/download|ダウンロード|dl版|dl edition/i,'DL 版'],[/package|パッケージ/i,'パッケージ版'],[/steam/i,'Steam 版'],[/renewal|hd|remaster|リマスター/i,'HD / リニューアル版']];
const labelOf=r=>{for(const [re,l] of RELEASE_LABEL)if(re.test(r.title))return l+'（'+r.rid+'）';return r.title+'（'+r.rid+'）';};
async function vndb({title='',gameDir='',vnid='',chineseBuild=false,engine=''}={},{lookup=null,timeoutMs=8000}={}){
 const E=require('../../services/game-enrichment.cjs');lookup=lookup||E.vndbReleases;const appid=steamOf(gameDir);const out={steamAppId:'',vndb:'',how:'',cn:'',release:'',releaseHow:'',candidates:[],releases:[],vndbEngine:'',engineDiffers:false,error:''};
 let r;try{r=await lookup({titles:[...new Set([title,E.cleanTitle(title),E.jpForm(E.cleanTitle(title))].filter(Boolean))],appid,vnid},undefined,{timeoutMs});}catch(e){out.error=String(e.message||e).slice(0,120);return out;}
 if(!r)return out;out.vndb=r.vnid;out.how=r.how;out.cn=r.zh||'';
 const win=r.releases.filter(x=>!x.platforms.length||x.platforms.includes('win')),trial=x=>/trial|体験版|demo/i.test(x.title);out.releases=win;
 const steam=appid&&win.find(x=>x.ext.steam===appid);
 const zh=chineseBuild?win.filter(x=>x.patch&&x.langs.some(l=>/^zh/.test(l))):[];
 const ja=win.filter(x=>x.official&&!x.patch&&!trial(x)&&x.langs.includes('ja'));
 if(steam){out.release='Steam 版（'+steam.rid+'）';out.releaseHow='steam appid';}
 else if(chineseBuild&&zh.length===1){out.release='汉化版（'+zh[0].rid+'）';out.releaseHow='zh patch';}
 else if(!chineseBuild&&ja.length===1){out.release=labelOf(ja[0]);out.releaseHow='only Japanese Windows release';}
 else out.candidates=(chineseBuild?zh:ja).slice(0,8).map(labelOf);
 /* the Steam appid VNDB links, when exactly one release has one (the cold test needs it for a Steam build without steam_appid.txt) */
 const steamIds=[...new Set(win.map(x=>x.ext.steam).filter(Boolean))];out.steamAppId=appid||(steamIds.length===1?steamIds[0]:'');out.steamCandidates=steamIds;
 const engines=[...new Set(win.map(x=>x.engine).filter(Boolean))];out.vndbEngine=engines.join(' / ');
 if(engine&&engines.length){const En=require('./engines.cjs'),fold=n=>String(n||'').toLowerCase().replace(/engine|[^a-z0-9]/g,''),id=En.ruleId(engine)||engine,mine=[fold(id),fold(En.RULES[id]?.label),...(En.RULES[id]?.registry||[]).map(fold)].filter(Boolean);
  out.engineDiffers=!engines.some(n=>{const f=fold(n),r=En.ruleId(n);return r===id||mine.some(m=>f&&(f.startsWith(m)||m.startsWith(f)));});}
 return out;}
module.exports.vndb=vndb;module.exports.labelOf=labelOf;
