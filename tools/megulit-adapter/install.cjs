// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 (アイキス3 sexy, GIGA/NeXAS package edition: iso+mds, an Update Ver.1.03 folder, bonus discs) the install step of
   MeguLit-Adapter: a game that ships only as disc images is installed into the agent's own folder with no person's step.

   Why not the game's own Setup.exe / Update.exe: GIGA's both carry requestedExecutionLevel highestAvailable, so on an admin account
   they start elevated and every PostMessage from our (medium) process is dropped by UIPI, and we cannot close them either. Update.exe
   finds the game through HKLM\Software\GIGA\<game> DIRECTORY, which a copied install never has. A GIGA disc keeps the game as plain
   files in the image root (the *.pac, the program, Movie\), so installing = copying those files, leaving the installer's own ones;
   the update = the files its UpdateInf.dat lists, each checked against the size and CRC-32 written there (what Update.exe checks).

   discSets(dir)        the game disc among the images (bonus discs / soundtracks are skipped): an .iso (an .mds beside it is the
                        same disc) or a .cue / .bin; .mdf / .nrg / ... alone are reported, not read
   updates(dir)         update folders: UpdateInf.dat + Data\ (GIGA); oldest version first
   parseUpdateInf(buf)  {title, about, version, regKey, regValue, files:[{name, size, crc}]}
   install(dir,{target}) the image's files read out with core/disc-image.cjs (ISO 9660 / raw bin, no mount, nothing on the disc
                        run), the installer's own files dropped, the updates applied -> {ok, dir, why, image, copied, updates}
   (A first version mounted the ISO through PowerShell; core/disc-image.cjs already owns reading disc images.) */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const Disc=require('../../core/disc-image.cjs');

const IMAGE=/\.(iso|mds|mdf|cue|ccd|img|nrg|cdi|chd|b5t|b6t|isz)$/i;
/* bonus discs and music: not the game (特典 alone is not enough: a bonus scenario disc is a second image to report, not the game) */
const BONUS=/(特典|サウンドトラック|サントラ|soundtrack|\bOST\b|ドラマCD|drama ?cd|主題歌|ソング|アルバム|album|追加\s*H|おまけ|bonus)/i;
/* the installer's own files in a disc root, never copied into the game */
const INSTALLER_FILE=/^(setup\.exe|setupinf\.dat|uninstall\.exe|autorun\.inf|autorun\.exe|desktop\.ini)$/i;
const INSTALLER_DIR=/^(directx|dx\w*redist|vcredist|redist|マニュアル|manual|\$recycle\.bin|system volume information)$/i;
/* the release words a folder name carries: the release guess, then dropped from the game's name */
const RELEASE=/(パッケージ版|通常版|初回版|初回限定版|豪華版|限定版|DL版|ダウンロード版|DVD版|DVD-ROM版|CD-ROM版)/;

const list=d=>{try{return fs.readdirSync(d,{withFileTypes:true});}catch{return [];}};

/* the game's name and release guess from an image's folder: [220325][戯画] アイキス3 sexy パッケージ版 (iso+mds) -> アイキス3 sexy, パッケージ版 */
function nameOf(folder){const raw=path.basename(folder).replace(/\[[^\]]*\]/g,' ').replace(/\((iso|mds|mdf|bin|cue|ccd|img|nrg)[^)]*\)/ig,' ');
 const m=RELEASE.exec(raw);return {name:raw.replace(RELEASE,' ').replace(/\s+/g,' ').trim(),release:m?m[1]:''};}

/* -> {game:[{image, kind, folder}], bonus:[image], unmountable:[image]} over four levels */
function discSets(dir,depth=4){const found=[];const walk=(d,n)=>{for(const e of list(d)){const f=path.join(d,e.name);if(e.isDirectory()){if(n>0)walk(f,n-1);}else if(IMAGE.test(e.name))found.push(f);}};walk(dir,depth);
 const out={game:[],bonus:[],unmountable:[]};const byFolder=new Map();for(const f of found){const k=path.dirname(f);if(!byFolder.has(k))byFolder.set(k,[]);byFolder.get(k).push(f);}
 for(const [folder,files] of byFolder){const names=list(folder).map(e=>e.name);
  /* a .cue beside .wav / .flac / .ape is a music disc */
  if(files.every(f=>/\.cue$/i.test(f))&&names.some(n=>/\.(wav|flac|ape)$/i.test(n))){out.bonus.push(...files);continue;}
  if(BONUS.test(path.basename(folder))){out.bonus.push(...files);continue;}
  const iso=files.find(f=>/\.iso$/i.test(f)),cue=files.find(f=>/\.cue$/i.test(f));
  if(iso)out.game.push({image:iso,kind:files.some(f=>/\.mds$/i.test(f))?'iso+mds':'iso',folder});
  else if(cue&&fs.existsSync(Disc.imageOf(cue))&&Disc.imageOf(cue)!==cue)out.game.push({image:Disc.imageOf(cue),kind:'bin+cue',folder});
  else out.unmountable.push(...files);}
 return out;}

/* ---- GIGA UpdateInf.dat: title[0x80] about[0x100] version[0x80] regKey[0x80] regValue[0x80] u32 count u32 …, then the file
   entries {name[0x100] u32 u32 u32 size u32 u32 crc32 u32}. The entries are found by name (NUL-terminated cp932 at an 8-aligned
   offset, size and CRC after it) so a build with a different gap before them still parses */
const SJIS=new TextDecoder('shift_jis');
const cstr=(b,at,len)=>{const s=b.subarray(at,Math.min(b.length,at+len)),z=s.indexOf(0);return SJIS.decode(z<0?s:s.subarray(0,z));};
function parseUpdateInf(buf){if(!buf||buf.length<0x300)return null;const out={title:cstr(buf,0,0x80),about:cstr(buf,0x80,0x100),version:cstr(buf,0x180,0x80),regKey:cstr(buf,0x200,0x80),regValue:cstr(buf,0x280,0x80),files:[]};
 if(!/^Software\\/i.test(out.regKey))return null;
 for(let at=0x300;at+0x118<=buf.length;at+=8){const c=buf[at];if(c<0x21||c===0x7f)continue;const name=cstr(buf,at,0x100);
  if(!/^[^\\/:*?"<>|\x00-\x1f]+\.[A-Za-z0-9]{1,5}$/.test(name))continue;
  const size=buf.readUInt32LE(at+0x108),crc=buf.readUInt32LE(at+0x110);if(!size)continue;out.files.push({name,size,crc});at+=0x110;}
 return out.files.length?out:null;}

/* the version number of an update for ordering: ver1.03 -> 1.03 */
const verNum=s=>{const m=/(\d+)\.(\d+)/.exec(String(s||''));return m?Number(m[1])+Number(m[2])/1000:0;};
/* -> [{dir, data, inf}] oldest first */
function updates(dir,depth=4){const out=[];const walk=(d,n)=>{const ents=list(d);if(ents.some(e=>e.isFile()&&/^updateinf\.dat$/i.test(e.name))&&ents.some(e=>e.isDirectory()&&/^data$/i.test(e.name))){
   const f=ents.find(e=>/^updateinf\.dat$/i.test(e.name)).name,inf=parseUpdateInf(fs.readFileSync(path.join(d,f)));if(inf)out.push({dir:d,data:path.join(d,ents.find(e=>/^data$/i.test(e.name)).name),inf});}
  if(n>0)for(const e of ents)if(e.isDirectory()&&!/^data$/i.test(e.name))walk(path.join(d,e.name),n-1);};walk(dir,depth);
 return out.sort((a,b)=>verNum(a.inf.version)-verNum(b.inf.version));}

const crcOf=f=>zlib.crc32(fs.readFileSync(f))>>>0;
/* copies the update's files into the game after checking each against UpdateInf.dat; -> {ok, files, why} (nothing copied on a mismatch) */
function applyUpdate(u,target){const files=[];for(const e of u.inf.files){const src=path.join(u.data,e.name);
  if(!fs.existsSync(src))return {ok:false,files,why:'更新 '+u.inf.version+' 缺 '+e.name};const st=fs.statSync(src);
  if(st.size!==e.size||crcOf(src)!==e.crc)return {ok:false,files,why:'更新 '+u.inf.version+' 的 '+e.name+' 和 UpdateInf.dat 记的大小/CRC 对不上'};}
 for(const e of u.inf.files){const dst=path.join(target,e.name);try{fs.chmodSync(dst,0o666);}catch{}fs.copyFileSync(path.join(u.data,e.name),dst);
  if(crcOf(dst)!==e.crc)return {ok:false,files,why:'复制后 '+e.name+' 的 CRC 不对'};files.push(e.name);}
 return {ok:true,files,why:''};}

/* the installer's own files at the top of the read-out disc are dropped; -> files left */
function dropInstaller(target){for(const e of list(target)){const f=path.join(target,e.name);if(e.isDirectory()?INSTALLER_DIR.test(e.name):INSTALLER_FILE.test(e.name))fs.rmSync(f,{recursive:true,force:true});}
 let n=0;const walk=d=>{for(const e of list(d)){const f=path.join(d,e.name);if(e.isDirectory())walk(f);else{n++;try{fs.chmodSync(f,0o666);}catch{}}}};walk(target);return n;}

/* -> {ok, dir, why, image, copied, updates, bonus, unmountable, name, release} */
async function install(dir,{target='',root='',extract=Disc.extract,statfs=fs.statfsSync,minFree=15*2**30,noDrives=process.env.MEGULIT_ADAPTER_NO_DRIVES??'C,E'}={}){
 const sets=discSets(dir),base={bonus:sets.bonus,unmountable:sets.unmountable};
 if(!sets.game.length)return {ok:false,...base,why:sets.unmountable.length?'光盘镜像读不了（'+sets.unmountable.map(f=>path.basename(f)).slice(0,2).join('、')+'，只读得了 .iso / bin+cue）':'没有游戏光盘镜像'};
 if(sets.game.length>1)return {ok:false,...base,why:'有 '+sets.game.length+' 张游戏光盘，不知道装哪张：'+sets.game.map(g=>path.basename(g.folder)).join(' / ')};
 const g=sets.game[0],nm=nameOf(g.folder),dest=target||path.join(root,nm.name||'game');
 const drive=(/^([A-Za-z]):/.exec(path.resolve(dest))||[])[1]||'';
 if(drive&&String(noDrives).toUpperCase().split(/[,\s]+/).includes(drive.toUpperCase()))return {ok:false,...base,why:'不往 '+drive+': 装游戏（'+dest+'）；设 MEGULIT_ADAPTER_GAMES'};
 const ups=updates(dir);
 const done=fs.existsSync(dest)&&list(dest).some(e=>e.isFile()&&/\.exe$/i.test(e.name));
 let copied=0;
 if(!done){const need=fs.statSync(g.image).size;fs.mkdirSync(path.dirname(dest),{recursive:true});const st=statfs(path.dirname(dest)),free=Number(st.bavail)*Number(st.bsize);
  if(free-need<minFree)return {ok:false,...base,why:'空间不够：'+path.dirname(dest)+' 剩 '+Math.round(free/2**30)+' GB，装要 '+Math.round(need/2**30)+' GB，还得留 15 GB'};
  try{fs.mkdirSync(dest,{recursive:true});await extract(g.image,dest);copied=dropInstaller(dest);}catch(e){return {ok:false,...base,image:g.image,why:'读光盘镜像失败：'+String(e.message||e).slice(0,160)};}}
 const applied=[];for(const u of ups){const r=applyUpdate(u,dest);if(!r.ok)return {ok:false,...base,dir:dest,image:g.image,copied,updates:applied,why:r.why};applied.push({version:u.inf.version,files:r.files,regKey:u.inf.regKey});}
 return {ok:true,...base,dir:dest,image:g.image,kind:g.kind,copied,reused:done,updates:applied,name:nm.name,release:nm.release,why:''};}

module.exports={discSets,updates,parseUpdateInf,applyUpdate,dropInstaller,install,nameOf,BONUS,INSTALLER_FILE};
