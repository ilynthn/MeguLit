// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-27 MeguLit-Adapter auto, step 1: a finished download becomes an installed game copy with no person and no LLM
   (owner: 「以后新游戏来了你让脚本自动跑 你自己不要消费token」). What sessions did by hand today, as one routine:

   - archives left in the download (DeepSeek normally unpacks; a nested .zip / .7z / .rar is unpacked here): 7-Zip when it is
     installed (MEGULIT_7Z, Program Files), password otoame like the download queue, else Windows' own tar (libarchive, no password)
   - disc images (アイキス3 sexy iso+mds, 制服カノジョ3 mdf+mds): bonus discs / soundtracks skipped; the game disc is read out with
     core/disc-image.cjs (ISO 9660 / raw bin; an Alcohol .mdf with 2048- or 2352-byte sectors reads the same way, no mount)
       * the disc root holds the game itself (GIGA: the program, *.pac, Movie\ beside Setup.exe): copied, the installer's own files
         dropped (GIGA's Setup.exe asks for elevation and needs a registry key a copy never has; copying is what it does)
       * the disc root is an Inno Setup installer (制服カノジョ3: Launcher.exe + Launcher-1..3.bin, nothing else): the game's own
         installer is run, silent and per-user (/VERYSILENT /CURRENTUSER /DIR=<copy>); Inno refuses a /DIR under a junction
       * anything else (InstallShield, an msi, several game discs): a person decides, nothing is run
   - official updates: GIGA's Update Ver.x folder (UpdateInf.dat + Data\, each file checked against the size and CRC-32 written
     there, oldest version first); an update of another kind is reported for a person
   - a Chinese overlay package (OZMAFIA!! 夜鸮汉化: ozmafia_cn.exe + mai.dll + mai\ysbin beside the untouched ozmafia.exe): the
     Japanese exe is the one adapted and started, never the translated launcher
   - an installed folder (exe present): an own copy through tools/game-copies.cjs
   Nothing from the download is run except the game's own Inno installer. The copy is <copies root>\<short name>-auto (game-copies
   naming), never on C: or E:, 15 GB kept free.

   install(src, {short, root, log, deps}) -> {ok, dir, exe, how, steps[], updates[], notes[], why} */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{spawnSync}=require('node:child_process');
const Copies=require('../game-copies.cjs');

const GB=2**30,MIN_FREE=15*GB;
/* game-copies' own naming: <root>\<name>-<owner> */
const safeName=s=>String(s).replace(/[<>:"/\\|?*\x00-\x1f\s]+/g,'_').replace(/[._]+$/,'').slice(0,60)||'game';
const list=d=>{try{return fs.readdirSync(d,{withFileTypes:true});}catch{return [];}};
const walk=(dir,depth,out=[])=>{for(const e of list(dir)){const f=path.join(dir,e.name);if(e.isDirectory()){if(depth>0)walk(f,depth-1,out);}else out.push(f);}return out;};

/* ---- archives ------------------------------------------------------------------------------------------------------------ */
const ARCHIVE=/\.(zip|7z|rar)$|\.7z\.001$|\.part0*1\.rar$/i,LATER_PART=/\.part0*([2-9]|\d{2,})\.rar$|\.7z\.(?!001)\d{3}$/i;
function archives(dir,depth=2){return walk(dir,depth).filter(f=>ARCHIVE.test(f)&&!LATER_PART.test(f));}
function sevenZip(env=process.env,exists=fs.existsSync){for(const f of [env.MEGULIT_7Z,'C:\\Program Files\\7-Zip\\7z.exe','C:\\Program Files (x86)\\7-Zip\\7z.exe',env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs','7-Zip','7z.exe')])if(f&&exists(f))return f;return '';}
/* -> {ok, how, why} */
function unpack(file,dest,{run=spawnSync,seven=sevenZip()}={}){fs.mkdirSync(dest,{recursive:true});
 if(seven){for(const pw of ['','otoame']){const r=run(seven,['x','-y','-p'+pw,'-o'+dest,file],{encoding:'utf8',windowsHide:true,timeout:3600000});if(r.status===0)return {ok:true,how:'7z'+(pw?' -p'+pw:'')};}
  return {ok:false,why:'7z 解不开 '+path.basename(file)+'（密码不是 otoame 或包坏了）'};}
 if(/\.(part\d+\.rar|7z\.\d{3})$/i.test(file))return {ok:false,why:'分卷包 '+path.basename(file)+' 要 7-Zip（没装，设 MEGULIT_7Z）'};
 /* Windows' own bsdtar (System32), never a GNU tar earlier on PATH (Git Bash), which reads no zip / 7z / rar */
 const r=run(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',file,'-C',dest],{encoding:'utf8',windowsHide:true,timeout:3600000});
 return r.status===0?{ok:true,how:'tar'}:{ok:false,why:'tar 解不开 '+path.basename(file)+'（有密码或格式不支持；装 7-Zip 或设 MEGULIT_7Z）：'+String(r.stderr||'').trim().slice(0,160)};}

/* ---- disc images --------------------------------------------------------------------------------------------------------- */
const IMAGE=/\.(iso|mds|mdf|cue|bin|ccd|img|nrg|cdi|chd|b5t|b6t|isz)$/i,READABLE=/\.(iso|mdf|img|bin)$/i;
const BONUS=/(特典|サウンドトラック|サントラ|soundtrack|\bOST\b|ドラマCD|drama ?cd|主題歌|ソング|アルバム|album|追加\s*H|おまけ|bonus|特典CD|SPCD|CD\d?$)/i;
/* the main image of a folder: .iso, .mdf (its .mds is a sidecar), the .bin a .cue names, .img */
function mainImage(files){const by=x=>files.find(f=>x.test(f));const cue=by(/\.cue$/i);
 if(cue){const Disc=require('../../core/disc-image.cjs');const bin=Disc.imageOf(cue);if(bin!==cue&&fs.existsSync(bin))return {image:bin,kind:'bin+cue'};}
 const iso=by(/\.iso$/i);if(iso)return {image:iso,kind:files.some(f=>/\.mds$/i.test(f))?'iso+mds':'iso'};
 const mdf=by(/\.mdf$/i);if(mdf)return {image:mdf,kind:'mdf'};const img=by(/\.img$/i);if(img)return {image:img,kind:'img'};
 return null;}
/* -> {game:[{image, kind, folder}], bonus:[file], unreadable:[file]}; a folder of .cue + .wav/.flac is music; images whose own name
   says bonus (SEIFUKU3_SPCD1.mdf beside SEIFUKU3.mdf) are bonus too */
function discSets(dir,depth=4){const found=walk(dir,depth).filter(f=>IMAGE.test(f));const by=new Map();
 for(const f of found){const k=path.dirname(f);if(!by.has(k))by.set(k,[]);by.get(k).push(f);}
 const out={game:[],bonus:[],unreadable:[]};
 for(const [folder,files] of by){const names=list(folder).map(e=>e.name);
  if(files.every(f=>/\.cue$/i.test(f))&&names.some(n=>/\.(wav|flac|ape)$/i.test(n))){out.bonus.push(...files);continue;}
  if(BONUS.test(path.basename(folder))){out.bonus.push(...files);continue;}
  /* several discs in one folder: group by stem; the stems that read as bonus go aside */
  const stems=new Map();for(const f of files){const s=path.basename(f).replace(/\.[^.]+$/,'');if(!stems.has(s))stems.set(s,[]);stems.get(s).push(f);}
  let groups=[...stems.entries()].filter(([s])=>!(stems.size>1&&BONUS.test(s)));
  /* still several: the largest is the game when it is at least three times the next (a mini album beside a DVD) */
  if(groups.length>1){const size=g=>{const m=mainImage(g[1]);try{return m?fs.statSync(m.image).size:0;}catch{return 0;}};groups.sort((a,b)=>size(b)-size(a));if(size(groups[0])>=3*size(groups[1]))groups=[groups[0]];}
  for(const [s,fs_] of stems)if(!groups.some(g=>g[0]===s))out.bonus.push(...fs_);
  for(const [,g] of groups){const m=mainImage(g);if(m)out.game.push({...m,folder});else out.unreadable.push(...g);}}
 return out;}

/* an Inno Setup installer: its data header names itself in the first megabytes */
const INNO=/Inno Setup Setup Data \(\d/;
function isInno(exe,{readHead}={}){try{const b=readHead?readHead(exe):(()=>{const fd=fs.openSync(exe,'r');try{const x=Buffer.alloc(4<<20);const n=fs.readSync(fd,x,0,x.length,0);return x.subarray(0,n);}finally{fs.closeSync(fd);}})();
  return INNO.test(Buffer.from(b).toString('latin1'));}catch{return false;}}
function innoArgs(target,log=''){return ['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOICONS','/CURRENTUSER','/MERGETASKS=!desktopicon','/DIR='+target].concat(log?['/LOG='+log]:[]);}
/* Inno refuses a /DIR under a junction or symlink (エラー 448 untrusted mount point): the first linked folder, or '' */
function linkInPath(target,{lstat=fs.lstatSync}={}){let p=path.resolve(String(target||''));const chain=[];
 for(;;){chain.unshift(p);const up=path.dirname(p);if(up===p)break;p=up;}
 for(const d of chain){let st;try{st=lstat(d);}catch{return '';}if(st.isSymbolicLink())return d;}return '';}

/* the installer's own files at the top of a disc */
const INSTALLER_FILE=/^(setup\.exe|setupinf\.dat|uninstall\.exe|autorun\.inf|autorun\.exe|desktop\.ini|unins\d*\.(exe|dat))$/i;
const INSTALLER_DIR=/^(directx|dx\w*redist|vcredist|redist|マニュアル|manual|\$recycle\.bin|system volume information)$/i;
const INSTALLER_EXE=/^(setup|install|installer|autorun|uninst|unins\d*|uninstall|dxsetup|vcredist.*|dotnet.*|update|updater|config|setting|launcher_?setup)\.exe$/i;
/* the disc root (or one folder down) holds a program that is not an installer -> the game is plain files on the disc */
function discGameExe(root){for(const f of walk(root,1))if(/\.exe$/i.test(f)&&!INSTALLER_EXE.test(path.basename(f))&&!isInno(f))return f;return '';}
function innoOnDisc(root){for(const f of walk(root,1))if(/\.exe$/i.test(f)&&isInno(f))return f;return '';}
/* the data parts an Inno installer looks for beside itself (Launcher.exe -> Launcher-1.bin …): when the disc was read with 8.3 names
   (LAUNCHER.BIN, LAUNCHE2.BIN) they are missing and the installer stops on a 「次のディスクを挿入」 prompt nobody answers (制服カノジョ3
   replay: 24 minutes) -> '' when it has parts or needs none, else the reason */
function innoPartsMissing(exe){const stem=path.basename(exe).replace(/\.exe$/i,''),names=list(path.dirname(exe)).map(e=>e.name);
 const parts=names.filter(n=>new RegExp('^'+stem.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'-\\d+\\.bin$','i').test(n));
 const bins=names.filter(n=>/\.bin$/i.test(n));return !parts.length&&bins.length?'安装程序要的 '+stem+'-1.bin 等分卷不在（只读到 '+bins.slice(0,3).join('、')+'）':'';}
/* a UDF disc (DVD: BEA01 / NSR02-03 after the ISO descriptors): its ISO 9660 side may carry only 8.3 names, so it is copied out
   through Windows' own mount (an .mdf is reached under an .iso name: a hard link beside it, or a copy on another volume) */
function isUdf(image,{open=fs.openSync,read=fs.readSync,close=fs.closeSync}={}){let fd;try{fd=open(image,'r');const b=Buffer.alloc(5);
  for(let lba=16;lba<40;lba++){if(read(fd,b,0,5,lba*2048+1)!==5)break;const s=b.toString('latin1');if(s==='NSR02'||s==='NSR03')return true;}return false;}catch{return false;}finally{if(fd!==undefined)try{close(fd);}catch{}}}
async function mountCopy(image,dest,{run=spawnSync,work=path.dirname(dest)}={}){let iso=image,made='';
 if(!/\.iso$/i.test(image)){iso=path.join(work,path.basename(image).replace(/\.[^.]+$/,'')+'.mount.iso');try{fs.rmSync(iso,{force:true});fs.linkSync(image,iso);}catch{fs.copyFileSync(image,iso);}made=iso;}
 const ps=s=>run('powershell.exe',['-NoProfile','-NonInteractive','-Command',s],{encoding:'utf8',windowsHide:true,timeout:600000});
 const q=s=>"'"+String(s).replace(/'/g,"''")+"'";
 try{const m=ps('$d=Mount-DiskImage -ImagePath '+q(iso)+' -PassThru; ($d|Get-Volume).DriveLetter');const letter=String(m.stdout||'').trim().slice(-1);
  if(m.status!==0||!/^[A-Z]$/i.test(letter))throw Error('挂载失败：'+String(m.stderr||m.stdout||'').trim().slice(0,160));
  try{const r=run('robocopy',[letter+':\\',dest,'/E','/NFL','/NDL','/NJH','/NJS','/NP','/R:1','/W:1'],{windowsHide:true,timeout:3600000});if(r.status===null||r.status>=8)throw Error('robocopy 从光盘复制失败（'+r.status+'）');}
  finally{ps('Dismount-DiskImage -ImagePath '+q(iso));}}
 finally{if(made)try{fs.rmSync(made,{force:true});}catch{}}}
function dropInstaller(target){for(const e of list(target)){const f=path.join(target,e.name);if(e.isDirectory()?INSTALLER_DIR.test(e.name):INSTALLER_FILE.test(e.name))fs.rmSync(f,{recursive:true,force:true});}
 for(const f of walk(target,32))try{fs.chmodSync(f,0o666);}catch{}}

/* ---- GIGA updates: UpdateInf.dat title[0x80] about[0x100] version[0x80] regKey[0x80] regValue[0x80], then file entries
   {name[0x100] … size@+0x108 … crc32@+0x110}, found by name so a build with another gap still parses (アイキス3 Update Ver.1.03) */
const SJIS=new TextDecoder('shift_jis');
const cstr=(b,at,len)=>{const s=b.subarray(at,Math.min(b.length,at+len)),z=s.indexOf(0);return SJIS.decode(z<0?s:s.subarray(0,z));};
function parseUpdateInf(buf){if(!buf||buf.length<0x300)return null;const out={title:cstr(buf,0,0x80),about:cstr(buf,0x80,0x100),version:cstr(buf,0x180,0x80),regKey:cstr(buf,0x200,0x80),regValue:cstr(buf,0x280,0x80),files:[]};
 if(!/^Software\\/i.test(out.regKey))return null;
 for(let at=0x300;at+0x118<=buf.length;at+=8){const c=buf[at];if(c<0x21||c===0x7f)continue;const name=cstr(buf,at,0x100);
  if(!/^[^\\/:*?"<>|\x00-\x1f]+\.[A-Za-z0-9]{1,5}$/.test(name))continue;
  const size=buf.readUInt32LE(at+0x108),crc=buf.readUInt32LE(at+0x110);if(!size)continue;out.files.push({name,size,crc});at+=0x110;}
 return out.files.length?out:null;}
const verNum=s=>{const m=/(\d+)\.(\d+)/.exec(String(s||''));return m?Number(m[1])+Number(m[2])/1000:0;};
/* -> {giga:[{dir, data, inf}] oldest first, other:[folder]} : an update-looking folder that is not GIGA's goes to a person */
function updates(dir,depth=4){const giga=[],other=[];const seen=d=>{const ents=list(d);
  const inf=ents.find(e=>e.isFile()&&/^updateinf\.dat$/i.test(e.name)),data=ents.find(e=>e.isDirectory()&&/^data$/i.test(e.name));
  if(inf&&data){const p=parseUpdateInf(fs.readFileSync(path.join(d,inf.name)));if(p){giga.push({dir:d,data:path.join(d,data.name),inf:p});return true;}}
  if(/(update|アップデート|patch|パッチ|修正)/i.test(path.basename(d))&&ents.some(e=>e.isFile()&&/\.(exe|msi)$/i.test(e.name)))other.push(d);return false;};
 const go=(d,n)=>{if(seen(d))return;if(n>0)for(const e of list(d))if(e.isDirectory())go(path.join(d,e.name),n-1);};go(dir,depth);
 return {giga:giga.sort((a,b)=>verNum(a.inf.version)-verNum(b.inf.version)),other};}
const crcOf=f=>zlib.crc32(fs.readFileSync(f))>>>0;
function applyUpdate(u,target){for(const e of u.inf.files){const src=path.join(u.data,e.name);
  if(!fs.existsSync(src))return {ok:false,why:'更新 '+u.inf.version+' 缺 '+e.name};
  if(fs.statSync(src).size!==e.size||crcOf(src)!==e.crc)return {ok:false,why:'更新 '+u.inf.version+' 的 '+e.name+' 和 UpdateInf.dat 记的大小/CRC 对不上'};}
 const files=[];for(const e of u.inf.files){const dst=path.join(target,e.name);
  if(fs.existsSync(dst)&&fs.statSync(dst).size===e.size&&crcOf(dst)===e.crc){files.push(e.name);continue;}
  try{fs.chmodSync(dst,0o666);}catch{}fs.copyFileSync(path.join(u.data,e.name),dst);if(crcOf(dst)!==e.crc)return {ok:false,why:'复制后 '+e.name+' 的 CRC 不对'};files.push(e.name);}
 return {ok:true,files};}

/* ---- which exe: never a translated launcher beside the Japanese program (OZMAFIA!!: ozmafia_cn.exe) ---------------------- */
const OVERLAY_EXE=/(汉化|漢化|中文|简体|簡體|繁体|繁體|(?:^|[-_ .])(chs|cht|cn|sc|tc|zh|chinese)(?=$|[-_ .]))/i;
const plainExe=n=>/\.exe$/i.test(n)&&!INSTALLER_EXE.test(n)&&!/^unins/i.test(n)&&!/^(UnityCrashHandler|crashpad|notification_helper)/i.test(n);
function pickExe(dir,{find=d=>require('../../core/library.cjs').findGame(d,4)}={}){const g=find(dir);let exe=g?.exe||'';
 /* findGame knew the engine but not which of two programs (OZMAFIA!!: ozmafia.exe + ozmafia_cn.exe): the plain ones in its folder */
 if(!exe&&g?.dir){const c=list(g.dir).filter(e=>e.isFile()&&plainExe(e.name)).map(e=>e.name);const ja=c.filter(n=>!OVERLAY_EXE.test(n.replace(/\.exe$/i,'')));
  const pick=ja.length===1?ja[0]:c.length===1?c[0]:'';if(pick){exe=path.join(g.dir,pick);if(ja.length===1&&c.length>1)return {exe,note:'外挂汉化整包：用日文原版 '+pick+'，不用汉化启动器 '+c.filter(n=>n!==pick).join('、')};}}
 if(!exe)return {exe:'',note:''};
 const stem=path.basename(exe).replace(/\.exe$/i,'');
 if(OVERLAY_EXE.test(stem)){const ja=list(path.dirname(exe)).filter(e=>e.isFile()&&/\.exe$/i.test(e.name)&&!OVERLAY_EXE.test(e.name.replace(/\.exe$/i,''))&&!INSTALLER_EXE.test(e.name)&&!/^unins/i.test(e.name));
  const pick=ja.find(e=>stem.toLowerCase().startsWith(e.name.replace(/\.exe$/i,'').toLowerCase()))||ja[0];
  if(pick)return {exe:path.join(path.dirname(exe),pick.name),note:'外挂汉化整包：用日文原版 '+pick.name+'，不用汉化启动器 '+path.basename(exe)};}
 return {exe,note:''};}

const freeOn=(dir,statfs=fs.statfsSync)=>{const st=statfs(dir);return Number(st.bavail)*Number(st.bsize);};
const noDrive=(dir,noDrives=process.env.MEGULIT_COPIES_NO_DRIVES??'C,E')=>{const d=(/^([A-Za-z]):/.exec(path.resolve(dir))||[])[1]||'';return d&&String(noDrives).toUpperCase().split(/[,\s]+/).includes(d.toUpperCase())?d.toUpperCase():'';};
const done=(dir)=>{try{return JSON.parse(fs.readFileSync(path.join(dir,'.megulit-auto-install.json'),'utf8')).complete===true;}catch{return false;}};

/* -> {ok, dir, exe, how, steps, updates, notes, why} */
async function install(src,{short,root=Copies.copiesRoot()||'H:\\MeguLit-Copies',log=()=>{},deps={},noDrives=process.env.MEGULIT_COPIES_NO_DRIVES??'C,E'}={}){
 const D={extract:(img,dest)=>require('../../core/disc-image.cjs').extract(img,dest),run:spawnSync,statfs:fs.statfsSync,copy:Copies.prepareCopy,find:undefined,isUdf,mount:mountCopy,seven:sevenZip(),...deps};
 const steps=[],notes=[],fail=why=>({ok:false,why,steps,notes});src=path.resolve(src);
 if(!fs.existsSync(src))return fail('下载目录不存在：'+src);
 if(noDrive(root,noDrives))return fail('副本不往 '+noDrive(root,noDrives)+': 放（'+root+'）；设 MEGULIT_COPIES_ROOT');
 const files=walk(src,4);
 if(/\[[0-9A-F]{16}\]/i.test(path.basename(src))||files.some(f=>/\.(nsp|xci|nsz|xcz)$/i.test(f))&&!files.some(f=>/\.exe$/i.test(f)))return fail('Switch 版（nsp/xci），PC 适配器不处理');
 const target=path.join(root,safeName(short)+'-auto');fs.mkdirSync(root,{recursive:true});
 const mark=(how,extra={})=>fs.writeFileSync(path.join(target,'.megulit-auto-install.json'),JSON.stringify({source:src,how,complete:true,at:new Date().toISOString(),...extra},null,1));
 let from=src,how='';
 /* 1. nested archives with nothing playable beside them */
 const exes=()=>walk(from,4).filter(f=>/\.exe$/i.test(f));
 const arcs=archives(from);
 if(arcs.length&&!exes().length&&!discSets(from).game.length){const dest=target+'.unpack';
  if(!done(dest)){for(const a of arcs){log('# 解压 '+path.basename(a));const r=unpack(a,dest,{run:D.run,seven:D.seven});if(!r.ok)return fail(r.why);steps.push('解压 '+path.basename(a)+'（'+r.how+'）');}
   fs.writeFileSync(path.join(dest,'.megulit-auto-install.json'),JSON.stringify({complete:true}));}else steps.push('解压过了（'+dest+'）');
  from=dest;}
 /* 2. disc images and no installed program */
 const sets=discSets(from),ups=updates(src);
 /* a program already installed: not in a disc's folder, not in an update folder (アイキス3: Update Ver.1.03\Data\Aikiss3.exe) */
 const under=(f,d)=>f.toLowerCase().startsWith(d.toLowerCase()+path.sep);
 const installed=f=>/\.exe$/i.test(f)&&!INSTALLER_EXE.test(path.basename(f))&&!sets.game.some(g=>under(f,g.folder))&&!ups.giga.some(u=>under(f,u.dir))&&!ups.other.some(d=>under(f,d))&&!isInno(f);
 if(done(target)){steps.push('副本已在（'+target+'）');how='kept';}
 else if(sets.game.length&&!walk(from,4).some(installed))
 {if(sets.game.length>1)return fail('有 '+sets.game.length+' 张游戏光盘，不知道装哪张：'+sets.game.map(g=>path.basename(g.image)).join(' / '));
  if(sets.bonus.length)steps.push('跳过特典/音乐盘 '+sets.bonus.length+' 个文件');
  const g=sets.game[0],disc=target+'.disc',need=fs.statSync(g.image).size*2;
  if(freeOn(root,D.statfs)-need<MIN_FREE)return fail('空间不够：'+root+' 剩 '+Math.round(freeOn(root,D.statfs)/GB)+' GB，装要约 '+Math.round(need/GB)+' GB，还得留 15 GB');
  if(!done(disc)){fs.rmSync(disc,{recursive:true,force:true});fs.mkdirSync(disc,{recursive:true});log('# 读光盘镜像 '+path.basename(g.image));
   try{if(D.isUdf(g.image)){steps.push('UDF 光盘：用 Windows 挂载读出（ISO 9660 那面只有 8.3 文件名）');await D.mount(g.image,disc,{run:D.run,work:root});}else await D.extract(g.image,disc);}catch(e){return fail('读光盘镜像失败（'+g.kind+' '+path.basename(g.image)+'）：'+String(e.message||e).slice(0,160)+'；要人挂载/安装');}
   fs.writeFileSync(path.join(disc,'.megulit-auto-install.json'),JSON.stringify({complete:true,image:g.image}));}
  steps.push('读出光盘 '+path.basename(g.image)+'（'+g.kind+'）');
  const plain=discGameExe(disc),inno=plain?'':innoOnDisc(disc);
  if(plain){fs.rmSync(target,{recursive:true,force:true});fs.renameSync(disc,target);fs.rmSync(path.join(target,'.megulit-auto-install.json'),{force:true});dropInstaller(target);how='disc-files';steps.push('光盘上就是游戏文件：直接用，去掉安装程序自己的文件');}
  else if(inno){const miss=innoPartsMissing(inno);if(miss){fs.rmSync(disc,{recursive:true,force:true});return fail(miss+'：光盘没读全，不运行安装程序（会卡在换盘提示）；要人挂载安装');}
   const link=linkInPath(target);if(link)return fail('副本路径经过联接/链接 '+link+'，Inno 安装程序不接受；换 MEGULIT_COPIES_ROOT');
   const logf=target+'.install.log';log('# 运行游戏自带的 Inno 安装程序 '+path.basename(inno)+'（静默、当前用户）');
   const r=D.run(inno,innoArgs(target,logf),{windowsHide:true,timeout:1800000,cwd:path.dirname(inno)});
   if(r.status!==0||!walk(target,3).some(f=>/\.exe$/i.test(f)&&!/^unins/i.test(path.basename(f))))return fail('Inno 安装程序 '+path.basename(inno)+' 没装成（退出码 '+r.status+(r.error?'，'+r.error.message:'')+'），日志 '+logf+'；可能要管理员权限，要人装');
   fs.rmSync(disc,{recursive:true,force:true});how='inno';steps.push('运行游戏自带的 Inno 安装程序 '+path.basename(inno)+'：/VERYSILENT /CURRENTUSER 装到副本');}
  else return fail('光盘上既不是游戏文件也不是 Inno 安装程序（'+list(disc).map(e=>e.name).slice(0,6).join('、')+'），要人装');}
 else if(sets.unreadable.length&&!exes().length)return fail('光盘镜像读不了：'+sets.unreadable.map(f=>path.basename(f)).slice(0,3).join('、'));
 /* 3. an installed folder: an own copy */
 else{const g=pickExe(from,D.find?{find:D.find}:{});if(!g.exe)return fail('目录里找不到游戏主程序（也没有光盘镜像/压缩包）');
  const gameRoot=path.dirname(g.exe);const c=D.copy(gameRoot,{owner:'auto',name:short,root,log});
  if(path.resolve(c.dir)!==path.resolve(target))return fail('副本目录不对：'+c.dir);how='copy';steps.push((c.reused?'副本已在':'复制成自己的副本')+'（'+c.dir+'）');}
 /* 4. official updates found in the download */
 const applied=[];
 for(const u of ups.giga){const r=applyUpdate(u,target);if(!r.ok)return fail(r.why);applied.push(u.inf.version);steps.push('打官方更新 '+u.inf.version+'（UpdateInf.dat 校验 '+r.files.length+' 个文件）');}
 if(ups.other.length)return fail('有官方更新但不是认得的格式：'+ups.other.map(d=>path.basename(d)).join('、')+'；要人打（只认 GIGA UpdateInf.dat）');
 const g=pickExe(target,D.find?{find:D.find}:{});if(!g.exe)return fail('装完找不到游戏主程序（'+target+'）');if(g.note)notes.push(g.note);
 if(how!=='kept'&&how!=='copy')mark(how,{updates:applied});
 return {ok:true,dir:target,exe:g.exe,how,steps,updates:applied,notes,why:''};}

module.exports={innoPartsMissing,isUdf,mountCopy,install,archives,unpack,sevenZip,discSets,isInno,innoArgs,linkInPath,discGameExe,innoOnDisc,dropInstaller,parseUpdateInf,updates,applyUpdate,pickExe,OVERLAY_EXE,BONUS};
